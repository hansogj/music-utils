import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import chalk from 'chalk';

import { withoutSolvedCoverIssues } from './cover.js';
import { LiveProgress, progressBar } from './progress.js';
import { folderFiles, printAlbumTable } from './repair/album-table.js';
import { discogsActionFor, taggedReleaseId } from './repair/discogs-action.js';
import {
  applyFolderRename,
  askSkipAux,
  musicFilesIn,
  pendingFolderRenames,
  planFolderRename,
  resetRepairSession,
} from './repair/folder.js';
import { repairActions } from './repair/issue-actions.js';
import { ask, BackSignal, closeRl, RestartSignal, setRestartable } from './repair/prompt.js';
import { AuditStream, type RepairEvent, type ScanProgress } from './repair/stream.js';
import { tagFromPaste } from './repair/tagging.js';
import { type AlbumAudit, type AlbumLayout, type Issue } from './types.js';
import { albumLocation } from './walk.js';

export { formatSummary } from './repair/album-table.js';
export { resetRepairSession, splitArtistBrackets } from './repair/folder.js';
export { setPrompt } from './repair/prompt.js';
export { AuditStream, type RepairEvent, type ScanProgress } from './repair/stream.js';

// ── error handler ────────────────────────────────────────────────────────────

function handleRepairError(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('EACCES') || msg.includes('EPERM')) {
    console.log(chalk.red(`  ✗ Permission denied — re-run with sudo:`));
    console.log(chalk.dim(`    sudo music-audit --repair --root ...`));
  } else {
    console.log(chalk.red(`  ✗ Failed: ${msg}`));
  }
}

// ── one album ─────────────────────────────────────────────────────────────────

export interface RepairAlbumContext {
  token?: string;
  retag?: boolean;
  // Tag from Discogs before the issues: albums without a release ID (with --retag, all).
  discogsFirst?: boolean;
  // Scans the album again from disk. Called after every fix, so the next issue shown
  // reflects the files as they are now (a Discogs retag can solve or change later issues).
  reaudit?: (layout: AlbumLayout) => Promise<AlbumAudit>;
  logEvent: (e: Omit<RepairEvent, 'ts' | 'session'>) => Promise<void>;
  /** Background scan progress, shown in the album header. */
  scanProgress?: ScanProgress;
}

// Re-reads the album from disk into `audit`. False when there's no re-scan or it failed.
async function rescanAlbum(audit: AlbumAudit, reaudit: RepairAlbumContext['reaudit']): Promise<boolean> {
  if (!reaudit) return false;
  try {
    const fresh = await reaudit(audit.layout);
    audit.tracks = fresh.tracks;
    // An artist folder rename waiting to run last will give the folder the tags' name.
    const renaming = !!pendingFolderRenames.get(audit.layout)?.artist;
    audit.issues = renaming ? fresh.issues.filter((i) => !i.code.startsWith('ARTIST_')) : fresh.issues;
    if (fresh.originalYear) audit.originalYear = fresh.originalYear;
    return true;
  } catch (err) {
    console.log(chalk.yellow(`  ⚠ Re-scan failed: ${err instanceof Error ? err.message : String(err)}`));
    return false;
  }
}

// Steps through one album's issues. Answering "o" at any prompt starts the album over:
// decisions not yet carried out (a folder rename) are dropped, the album is re-scanned
// and shown from the top. Changes already written to the files stay.
export async function repairAlbum(audit: AlbumAudit, ctx: RepairAlbumContext): Promise<'next' | 'quit'> {
  const initialIssues = [...audit.issues];
  setRestartable(true);
  try {
    while (true) {
      try {
        return await repairAlbumPass(audit, ctx);
      } catch (err) {
        if (!(err instanceof RestartSignal)) throw err;
        pendingFolderRenames.delete(audit.layout);
        const loc = albumLocation(audit.layout);
        await ctx.logEvent({
          album: loc,
          issue: 'RESTART',
          severity: 'MODERATE',
          action: 'Start album over',
          result: 'no-action',
        });
        console.log(
          chalk.cyan(
            '\n  ↺ Starting this album over. Changes already written to the files stay; a pending folder rename is dropped.',
          ),
        );
        if (!(await rescanAlbum(audit, ctx.reaudit))) audit.issues = [...initialIssues];
      }
    }
  } finally {
    setRestartable(false);
  }
}

// "Album 3 of 17 so far · Scan ▕████░░░░▏ 120/340  35%" while the background scan runs —
// the album count grows as the scan finds more — then "Album 18 of 41 · Scan done: 340 albums".
export function scanLine({ done, total, found, taken }: ScanProgress): string {
  const scanning = done < total;
  const album = taken ? `Album ${taken} of ${found ?? taken}${scanning ? ' so far' : ''} · ` : '';
  const scan = scanning ? `Scan ${progressBar(done, total)}` : `Scan done: ${total} album${total !== 1 ? 's' : ''}`;
  return `   ${album}${scan}`;
}

// The Discogs step that opens an album without a release ID: tag from a release, paste the
// tracklist, go on to the issues one by one, or skip the album. 'tagged' and 'issues' go
// on to the album's issues (after a re-scan).
async function discogsFirstStep(
  audit: AlbumAudit,
  token: string,
  ctx: RepairAlbumContext,
): Promise<'tagged' | 'issues' | 'skip' | 'quit'> {
  const loc = albumLocation(audit.layout);
  const log = (action: string, result: RepairEvent['result'], error?: string) =>
    ctx.logEvent({ album: loc, issue: 'DISCOGS', severity: 'MODERATE', action, result, error });
  const known = audit.releaseId;
  const suggested = known && !taggedReleaseId(audit) ? { id: known, source: 'comment / info.txt' } : undefined;
  const found = !!known || (audit.discogsResults?.length ?? 0) > 0;

  while (true) {
    const discogs = await discogsActionFor(audit, token, suggested);
    console.log(
      chalk.cyan(
        known
          ? `\n  [retag] Tagged from Discogs release ${known} — tag from Discogs again?`
          : found
            ? '\n  No Discogs release ID yet — tag from Discogs first:'
            : `\n  No Discogs release ID, and Discogs search found no match for "${audit.layout.artistName} – ${audit.layout.albumFolder}".`,
      ),
    );
    const paste = 'Paste the tracklist (one line per track; artist, album and year from the folder)';
    // Discogs first ([1], Enter) also without a search hit: the release ID is often known.
    const choices: Array<[string, 'discogs' | 'paste']> = [
      [found ? discogs.label : 'Enter a Discogs release ID', 'discogs'],
      [paste, 'paste'],
    ];
    choices.forEach(([label], i) => console.log(`  [${i + 1}] ${label}`));
    const fixOne = audit.issues.length > 0;
    console.log(
      `  ${fixOne ? `[f] Fix the ${audit.issues.length} issue(s) one by one   ` : ''}[s] Skip album   [o] Start album over   [q] Quit repair`,
    );
    const choice = (await ask('  Choice [1]: ')).toLowerCase() || '1';
    if (choice === 'q') {
      console.log(chalk.dim('\n  Repair aborted.'));
      await log('quit', 'skipped');
      return 'quit';
    }
    if (choice === 's') {
      await log('skipped album', 'skipped');
      return 'skip';
    }
    if (choice === 'f' && fixOne) return 'issues';
    const picked = choices[parseInt(choice, 10) - 1]?.[1];
    if (!picked) {
      console.log(chalk.dim('  Invalid choice.'));
      continue;
    }

    try {
      const done =
        picked === 'discogs'
          ? await discogs.run()
          : (await tagFromPaste(audit))
            ? 'Tagged from a pasted tracklist'
            : undefined;
      if (!done) continue; // nothing written (no ID, a warning declined): ask again
      await log(done, 'fixed');
    } catch (err) {
      if (err instanceof BackSignal) continue; // picker Esc → this menu again
      if (err instanceof RestartSignal) throw err;
      handleRepairError(err);
      await log(
        picked === 'discogs' ? discogs.label : paste,
        'failed',
        err instanceof Error ? err.message : String(err),
      );
    }
    await rescanAlbum(audit, ctx.reaudit);
    return 'tagged';
  }
}

// One pass over the album from its opening table: its issues, then any folder rename
// the user agreed to, last.
async function repairAlbumPass(audit: AlbumAudit, ctx: RepairAlbumContext): Promise<'next' | 'quit'> {
  const { token, retag = false, reaudit, logEvent } = ctx;
  const { layout } = audit;
  const loc = albumLocation(layout);

  console.log(chalk.bold(`\n${'─'.repeat(60)}`));
  console.log(
    chalk.bold(`📁 ${loc}`) + chalk.dim(`  (${audit.tracks.length} track${audit.tracks.length !== 1 ? 's' : ''})`),
  );
  if (ctx.scanProgress) console.log(chalk.dim(scanLine(ctx.scanProgress)));
  console.log(chalk.bold('─'.repeat(60)));
  printAlbumTable(audit, await folderFiles(layout.albumPath));
  console.log(chalk.dim('  Answer o at any prompt to start this album over.'));

  const refresh = async (fixed: Issue, ok: boolean) => {
    if (!reaudit) {
      if (ok) audit.issues = audit.issues.filter((i) => i !== fixed);
      return;
    }
    await rescanAlbum(audit, reaudit);
  };

  // An issue is shown once per pass. A fix that leaves it unchanged (or a skip) doesn't
  // bring it back; one whose message changed (e.g. fewer tracks missing tags) is shown again.
  const issueKey = (i: Issue) => `${i.code}|${i.file ?? ''}|${i.message}`;
  const handled = new Set<string>();
  let mismatchBulkIdx = -1;
  let quit = false;
  // The first skip in an album offers to add a bracket to its folder name; once per album.
  let auxOffered = false;
  // Enter at the "issue(s) not fixed" prompt: no second prompt before the next album.
  let movingOn = false;
  const offerSkipAux = async () => {
    if (auxOffered) return;
    auxOffered = true;
    const aux = await askSkipAux(layout);
    if (aux !== undefined) planFolderRename(layout, { aux });
  };

  // ── Discogs first: an album without a release ID (with --retag, every album) ──
  if (token && ctx.discogsFirst && (retag || !audit.releaseId)) {
    const step = await discogsFirstStep(audit, token, ctx);
    if (step === 'quit') quit = true;
    if (step === 'skip') {
      await offerSkipAux();
      movingOn = true;
    }
  }

  albumLoop: while (!quit && !movingOn) {
    let issue: Issue | undefined;
    while ((issue = audit.issues.find((i) => !handled.has(issueKey(i))))) {
      handled.add(issueKey(issue));
      const sevColor =
        issue.severity === 'SEVERE' ? chalk.red.bold : issue.severity === 'HIGH' ? chalk.yellow.bold : chalk.cyan;
      const file = issue.file ? chalk.dim(` [${issue.file}]`) : '';
      console.log(`\n  ${sevColor(`[${issue.severity}]`)}${file} ${issue.message}`);

      const actions = await repairActions(issue, audit, token);

      if (actions.length === 0) {
        console.log(chalk.dim('  No automated repair available — fix manually.'));
        await logEvent({
          album: loc,
          issue: issue.code,
          severity: issue.severity,
          action: 'none',
          result: 'no-action',
        });
        continue;
      }

      let idx: number | undefined;
      // Per-album bulk strategy for name/tag mismatches.
      if (issue.code === 'NAME_TAG_MISMATCH' && mismatchBulkIdx >= 0 && actions[mismatchBulkIdx]) {
        idx = mismatchBulkIdx;
        console.log(chalk.dim(`  → bulk strategy: ${actions[idx].label}`));
      }

      issueMenuLoop: while (true) {
        if (idx === undefined) {
          // [d] retags the album from a Discogs release whatever the issue (e.g. pick the
          // exact edition with bonus tracks), unless the menu already offers it.
          const offerDiscogs = !!token && !actions.some((a) => a.discogs);
          actions.forEach((a, i) => console.log(`  [${i + 1}] ${a.label}`));
          console.log(
            `  [l] List files${offerDiscogs ? '   [d] Tag from Discogs release' : ''}   [o] Start album over   [s] Skip   [q] Quit repair`,
          );

          let choice: string;
          while (true) {
            choice = await ask('  Choice [1]: ');
            if (choice !== 'l') break;
            const files = await musicFilesIn(layout.albumPath);
            console.log(chalk.dim(`\n  Files in ${layout.albumPath}:`));
            for (const { name } of files) console.log(`    ${name}`);
            console.log();
          }

          if (choice === 'q') {
            console.log(chalk.dim('\n  Repair aborted.'));
            await logEvent({
              album: loc,
              issue: issue.code,
              severity: issue.severity,
              action: 'quit',
              result: 'skipped',
            });
            quit = true;
            break albumLoop;
          }
          if (choice === 's') {
            await logEvent({
              album: loc,
              issue: issue.code,
              severity: issue.severity,
              action: 'skipped',
              result: 'skipped',
            });
            await offerSkipAux();
            break issueMenuLoop;
          }
          if (choice === 'd' && offerDiscogs && token) {
            actions.push(await discogsActionFor(audit, token));
            choice = String(actions.length);
          }
          if (choice === '') choice = '1'; // default to first action

          const picked = parseInt(choice, 10) - 1;
          if (!(picked >= 0 && picked < actions.length)) {
            console.log(chalk.dim('  Invalid choice.'));
            continue issueMenuLoop;
          }
          idx = picked;

          // Offer per-album bulk for name/tag mismatches.
          // Not for a Discogs retag: it covers the whole album at once.
          if (issue.code === 'NAME_TAG_MISMATCH' && mismatchBulkIdx < 0 && !actions[idx].discogs) {
            const current = issue;
            const hasMore = audit.issues.some(
              (i) => i.code === 'NAME_TAG_MISMATCH' && i !== current && !handled.has(issueKey(i)),
            );
            if (hasMore) {
              const applyAll = await ask('  Apply this to all remaining name/tag mismatches in this album? [y/N] ');
              if (applyAll.toLowerCase() === 'y') {
                mismatchBulkIdx = idx;
                console.log(chalk.dim(`  → will apply "${actions[idx].label}" to remaining mismatches`));
              }
            }
          }
        }

        let result: RepairEvent['result'] = 'fixed';
        let error: string | undefined;
        let done: string | void = undefined;
        try {
          done = await actions[idx].run();
        } catch (err) {
          if (err instanceof BackSignal) {
            idx = undefined;
            continue issueMenuLoop;
          } // picker Esc → re-show menu
          if (err instanceof RestartSignal) throw err;
          handleRepairError(err);
          result = 'failed';
          error = err instanceof Error ? err.message : String(err);
        }
        await logEvent({
          album: loc,
          issue: issue.code,
          severity: issue.severity,
          action: done || actions[idx].label,
          result,
          error,
        });
        await refresh(issue, result === 'fixed'); // re-scan even after a failure: a partial fix may have changed files
        break issueMenuLoop;
      }
    }

    // Every issue still present has been shown this pass: skipped, failed or not solved.
    const left = audit.issues;
    if (left.length === 0) {
      console.log(chalk.green(`\n  ✓ All issues addressed.`));
      break albumLoop;
    }
    const sevCount = left.filter((i) => i.severity !== 'MODERATE').length;
    console.log(chalk.yellow(`\n  ${left.length} issue(s) not fixed${sevCount ? ` (${sevCount} high/severe)` : ''}.`));
    // One prompt for both "go on" and "next album".
    const go = await ask('  [Enter] Next album   [r] Retry   [q] Quit: ');
    if (go === 'q') {
      console.log(chalk.dim('\n  Repair aborted.'));
      quit = true;
      break albumLoop;
    }
    if (go.toLowerCase() === 'r') {
      handled.clear();
      continue albumLoop;
    }
    movingOn = true;
    break albumLoop;
  }

  // ── folder rename last: nothing after it still points at the old path ──
  // Runs on quit too: the user already said yes to it.
  const plan = pendingFolderRenames.get(layout);
  if (plan) {
    pendingFolderRenames.delete(layout);
    let result: RepairEvent['result'] = 'fixed';
    let error: string | undefined;
    let renamedTo: string | undefined;
    try {
      renamedTo = await applyFolderRename(layout, plan);
    } catch (err) {
      handleRepairError(err);
      result = 'failed';
      error = err instanceof Error ? err.message : String(err);
    }
    const what = plan.artist || plan.album || plan.year ? 'Rename folder(s) to match Discogs' : 'Set folder brackets';
    const action = `${what}${renamedTo ? ` → "${renamedTo}"` : ''}`;
    await logEvent({ album: loc, issue: 'FOLDER_RENAME', severity: 'MODERATE', action, result, error });
  }

  if (quit) return 'quit';
  if (movingOn) return 'next'; // already answered at the "issue(s) not fixed" prompt
  const go = await ask('  [Enter] Next album   [q] Quit: ');
  if (go === 'q') {
    console.log(chalk.dim('\n  Repair aborted.'));
    return 'quit';
  }
  return 'next';
}

// ── interactive repair loop ───────────────────────────────────────────────────

export async function runRepair(
  stream: AuditStream,
  token?: string,
  opts?: { retag?: boolean; reaudit?: (layout: AlbumLayout) => Promise<AlbumAudit> },
): Promise<void> {
  const retag = opts?.retag ?? false;
  resetRepairSession();

  const session = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const logDir = path.join(os.homedir(), '.local', 'share', 'music-audit');
  const logPath = path.join(logDir, `${yyyy}.${mm}.${dd}.${hh}.${min}-repair.log`);
  await fs.mkdir(logDir, { recursive: true });
  const events: RepairEvent[] = [];

  const logEvent = async (e: Omit<RepairEvent, 'ts' | 'session'>) => {
    const event: RepairEvent = { ts: new Date().toISOString(), session, ...e };
    events.push(event);
    try {
      await fs.appendFile(logPath, JSON.stringify(event) + '\n', 'utf8');
    } catch {
      /* non-fatal */
    }
  };

  console.log(chalk.bold.white('\n══════════════════════════════════════════════════════════'));
  console.log(chalk.bold.white(retag ? '  RETAG MODE' : '  REPAIR MODE'));
  console.log(chalk.bold.white('══════════════════════════════════════════════════════════'));
  console.log(chalk.dim(`  Scanning in background — albums appear as they're found. Press Ctrl-C to abort.\n`));

  while (true) {
    // Everything found so far is handled: show the scan until it finds the next album.
    const live = stream.waiting ? new LiveProgress('albums scanned…', () => stream.progress).start() : undefined;
    const audit = await stream.next();
    live?.stop();
    if (!audit) break;
    // Another album of the artist may have given the artist folder its cover.jpg since the scan.
    audit.issues = await withoutSolvedCoverIssues(audit);
    // With a token, an album without a release ID is tagged from Discogs first.
    if (audit.issues.length === 0 && !retag && !(token && !audit.releaseId)) continue;
    const ctx = {
      token,
      retag,
      discogsFirst: !!token,
      reaudit: opts?.reaudit,
      logEvent,
      scanProgress: stream.progress,
    };
    if ((await repairAlbum(audit, ctx)) === 'quit') break;
  }

  // ── session summary ────────────────────────────────────────────────────────
  const fixed = events.filter((e) => e.result === 'fixed').length;
  const failed = events.filter((e) => e.result === 'failed').length;
  const skippedCount = events.filter((e) => e.result === 'skipped').length;
  console.log(chalk.bold.white('\n══════════════════════════════════════════════════════════'));
  console.log(chalk.bold.white('  REPAIR SESSION SUMMARY'));
  console.log(chalk.bold.white('══════════════════════════════════════════════════════════'));
  console.log(`  ${chalk.green('✓ Fixed  ')} ${fixed}`);
  if (failed) console.log(`  ${chalk.red('✗ Failed ')} ${failed}`);
  if (skippedCount) console.log(`  ${chalk.dim('○ Skipped')} ${skippedCount}`);

  if (fixed > 0) {
    // Group fixed actions by label (truncated)
    const groups = new Map<string, number>();
    for (const e of events.filter((e) => e.result === 'fixed')) {
      const key = e.action.length > 55 ? e.action.slice(0, 52) + '…' : e.action;
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    console.log(chalk.dim('\n  Actions:'));
    for (const [label, n] of groups) {
      console.log(`    ${chalk.dim('×' + String(n).padStart(2))}  ${label}`);
    }
  }

  if (failed > 0) {
    console.log(chalk.dim('\n  Failures:'));
    for (const e of events.filter((e) => e.result === 'failed')) {
      console.log(`    ${chalk.red('✗')} ${e.album}  [${e.issue}]`);
      if (e.error) console.log(`       ${chalk.dim(e.error.split('\n')[0])}`);
    }
  }

  if (events.length > 0) {
    console.log(chalk.dim(`\n  Log → ${logPath}`));
  }

  console.log(chalk.bold.white('══════════════════════════════════════════════════════════\n'));
  closeRl();
}
