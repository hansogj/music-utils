import chalk from 'chalk';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AlbumAudit, AlbumLayout, Issue } from './types.js';

const execFileAsync = promisify(execFile);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// ── prompt ───────────────────────────────────────────────────────────────────

async function ask(q: string): Promise<string> {
  return (await rl.question(q)).trim();
}

// ── tag writing ──────────────────────────────────────────────────────────────

async function writeFlacTags(filePath: string, tags: Record<string, string>): Promise<void> {
  const removeArgs = Object.keys(tags).map((k) => `--remove-tag=${k}`);
  await execFileAsync('metaflac', [...removeArgs, filePath]);
  const setArgs = Object.entries(tags).map(([k, v]) => `--set-tag=${k}=${v}`);
  await execFileAsync('metaflac', [...setArgs, filePath]);
}

async function writeMp3Tags(filePath: string, tags: Record<string, string>): Promise<void> {
  const ID3: Record<string, string> = {
    TITLE: 'TIT2',
    ARTIST: 'TPE1',
    ALBUMARTIST: 'TPE2',
    ALBUM: 'TALB',
    DATE: 'TYER',
    TRACKNUMBER: 'TRCK',
    DISCNUMBER: 'TPOS',
  };
  const args = ['-2'];
  for (const [k, v] of Object.entries(tags)) {
    if (ID3[k]) args.push(`--${ID3[k]}`, v);
  }
  args.push(filePath);
  await execFileAsync('id3v2', args);
}

async function writeTags(filePath: string, ext: 'flac' | 'mp3', tags: Record<string, string>): Promise<void> {
  if (ext === 'flac') {
    // FLAC keeps TRACKNUMBER and TRACKTOTAL separate
    const { TRACKNUMBER, ...rest } = tags;
    if (TRACKNUMBER?.includes('/')) {
      const [no, total] = TRACKNUMBER.split('/');
      await writeFlacTags(filePath, { ...rest, TRACKNUMBER: no, TRACKTOTAL: total });
    } else {
      await writeFlacTags(filePath, tags);
    }
  } else {
    await writeMp3Tags(filePath, tags);
  }
}

// ── parse helpers ─────────────────────────────────────────────────────────────

function trackNoFromFilename(fileName: string): { no: number; disc: number } {
  const base = path.basename(fileName, path.extname(fileName));
  const multi = base.match(/^d(\d+)t(\d+)/i);
  if (multi) return { disc: parseInt(multi[1], 10), no: parseInt(multi[2], 10) };
  const std = base.match(/^(\d+)/);
  return { disc: 1, no: std ? parseInt(std[1], 10) : 1 };
}

function albumMetaFromLayout(layout: AlbumLayout): {
  artist: string;
  album: string;
  year?: string;
  discNumber: string;
  noOfDiscs: string;
} {
  const { artistName, albumFolder } = layout;
  const year = albumFolder.match(/^(\d{4})\s+/)?.[1];
  const discMatch = albumFolder.match(/\(\s*[Dd]isc\s+(\d+)[∕\/\-](\d+)\s*\)/);
  return {
    artist: artistName,
    album: albumFolder
      .replace(/^\d{4}\s+/, '')
      .replace(/\s*\([^)]*\)\s*/g, '')
      .replace(/\s*\[[^\]]*\]\s*/g, '')
      .trim(),
    year,
    discNumber: discMatch?.[1] ?? '1',
    noOfDiscs: discMatch?.[2] ?? '1',
  };
}

async function musicFilesIn(dir: string): Promise<{ name: string; ext: 'flac' | 'mp3' }[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && /\.(flac|mp3)$/i.test(e.name))
    .map((e) => ({ name: e.name, ext: path.extname(e.name).slice(1).toLowerCase() as 'flac' | 'mp3' }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── Discogs tracklist fetch ───────────────────────────────────────────────────

interface DiscogsTrack {
  position: string;
  title: string;
  type_: string;
}

async function fetchTracklist(releaseId: string, token: string): Promise<DiscogsTrack[]> {
  const res = await fetch(`https://api.discogs.com/releases/${releaseId}`, {
    headers: {
      'User-Agent': 'MusicLibraryAudit/1.0',
      Authorization: `Discogs token=${token}`,
    },
  });
  if (!res.ok) throw new Error(`Discogs ${res.status}: ${res.statusText}`);
  const data = (await res.json()) as { tracklist?: DiscogsTrack[] };
  return (data.tracklist ?? []).filter((t) => t.type_ === 'track');
}

// ── repair actions ────────────────────────────────────────────────────────────

interface RepairAction {
  label: string;
  run: () => Promise<void>;
}

async function repairActions(issue: Issue, audit: AlbumAudit, token?: string): Promise<RepairAction[]> {
  const { layout } = audit;

  switch (issue.code) {
    // ── SEVERE: rename folder ──────────────────────────────────────────────
    case 'MISSING_YEAR_PREFIX':
    case 'WRONG_DISC_SEPARATOR':
    case 'WRONG_AUX_BRACKETS': {
      const newNameMatch = issue.suggestion?.match(/Rename(?: to)?[: ]+"(.+)"/);
      if (!newNameMatch) return [];
      const newName = newNameMatch[1];
      const newPath = path.join(path.dirname(layout.albumPath), newName);
      return [
        {
          label: `Rename folder → "${newName}"`,
          run: async () => {
            await fs.rename(layout.albumPath, newPath);
            layout.albumPath = newPath;
            layout.albumFolder = newName;
            console.log(chalk.green(`  ✓ Renamed to ${newPath}`));
          },
        },
      ];
    }

    // ── SEVERE: move artist to correct letter dir ──────────────────────────
    case 'WRONG_LETTER_DIR': {
      const expected = layout.artistName.replace(/^(the|a|an|los|il|la|el|le)\s+/i, '').charAt(0).toUpperCase();
      const root = path.dirname(path.dirname(layout.albumPath)); // ROOT
      const targetArtist = path.join(root, expected, layout.artistName);
      const sourceArtist = path.join(root, layout.letterDir!, layout.artistName);
      return [
        {
          label: `Move ${layout.letterDir}/${layout.artistName} → ${expected}/${layout.artistName}`,
          run: async () => {
            await fs.mkdir(path.join(root, expected), { recursive: true });
            await fs.rename(sourceArtist, targetArtist);
            layout.letterDir = expected;
            layout.albumPath = path.join(targetArtist, layout.albumFolder);
            console.log(chalk.green(`  ✓ Moved to ${targetArtist}`));
          },
        },
      ];
    }

    // ── HIGH: no / missing tags → tag from folder or Discogs ──────────────
    case 'NO_TAGS':
    case 'MISSING_TAGS': {
      const meta = albumMetaFromLayout(layout);
      const files = await musicFilesIn(layout.albumPath);
      const total = files.length;

      const actions: RepairAction[] = [
        {
          label: `Tag from folder (${meta.artist} — ${meta.year ?? '?'} ${meta.album}) — title will be empty`,
          run: async () => {
            for (const { name, ext } of files) {
              const { no, disc } = trackNoFromFilename(name);
              const tags: Record<string, string> = {
                ARTIST: meta.artist,
                ALBUMARTIST: meta.artist,
                ALBUM: meta.album,
                TRACKNUMBER: `${no}/${total}`,
                DISCNUMBER: `${disc}/${meta.noOfDiscs}`,
                ...(meta.year ? { DATE: meta.year } : {}),
              };
              await writeTags(path.join(layout.albumPath, name), ext, tags);
              console.log(chalk.green(`  ✓ Tagged ${name}`));
            }
          },
        },
      ];

      // Offer Discogs-based full tagging if a search result is available
      const topResult = audit.discogsResults?.[0];
      if (topResult || token) {
        actions.push({
          label: `Tag from Discogs release ID${topResult ? ` (suggested: ${topResult.id} — ${topResult.title})` : ''}`,
          run: async () => {
            const tok = token ?? '';
            let releaseId = topResult ? String(topResult.id) : '';
            const input = await ask(`    Release ID [${releaseId || 'enter ID'}]: `);
            if (input) releaseId = input.replace(/\D/g, '');
            if (!releaseId) { console.log(chalk.yellow('  Skipped — no release ID')); return; }

            console.log(chalk.dim(`  Fetching tracklist for release ${releaseId}...`));
            const tracklist = await fetchTracklist(releaseId, tok);
            if (tracklist.length === 0) { console.log(chalk.yellow('  No tracks found')); return; }

            for (const { name, ext } of files) {
              const { no, disc } = trackNoFromFilename(name);
              // Match by disc+track position
              const discTrack = tracklist.find((t) => {
                const m = t.position.match(/^(?:(\d+)[-./:])?(\d+)$/);
                if (!m) return false;
                const tDisc = m[1] ? parseInt(m[1], 10) : 1;
                const tNo = parseInt(m[2], 10);
                return tDisc === disc && tNo === no;
              });

              const title = discTrack?.title;
              const tags: Record<string, string> = {
                ARTIST: meta.artist,
                ALBUMARTIST: meta.artist,
                ALBUM: meta.album,
                TRACKNUMBER: `${no}/${total}`,
                DISCNUMBER: `${disc}/${meta.noOfDiscs}`,
                ...(meta.year ? { DATE: meta.year } : {}),
                ...(title ? { TITLE: title } : {}),
              };
              await writeTags(path.join(layout.albumPath, name), ext, tags);
              console.log(chalk.green(`  ✓ Tagged ${name}${title ? ` → "${title}"` : ' (no title match)'}`));
            }
          },
        });
      }

      return actions;
    }

    // ── MODERATE: filename/tag mismatch ────────────────────────────────────
    case 'NAME_TAG_MISMATCH': {
      if (!issue.file) return [];
      const track = audit.tracks.find((t) => t.fileName === issue.file);
      if (!track) return [];

      const actions: RepairAction[] = [];

      // Option A: rename file to match tag
      if (track.tags.title) {
        const { no, disc } = trackNoFromFilename(track.fileName);
        const isMultiDisc = /^d\d+t\d+/i.test(track.fileName);
        const ext = path.extname(track.fileName);
        const artistPrefix = track.tags.artist ? ` ${track.tags.artist} - ` : ' ';
        const newName = isMultiDisc
          ? `d${disc}t${String(no).padStart(2, '0')}.${artistPrefix}${track.tags.title}${ext}`
          : `${String(no).padStart(2, '0')} -${artistPrefix}${track.tags.title}${ext}`;
        const oldPath = track.filePath;
        const newPath = path.join(path.dirname(oldPath), newName);
        actions.push({
          label: `Rename file to match tag → "${newName}"`,
          run: async () => {
            await fs.rename(oldPath, newPath);
            track.filePath = newPath;
            track.fileName = newName;
            console.log(chalk.green(`  ✓ Renamed to ${newName}`));
          },
        });
      }

      // Option B: update tag to match filename
      if (track.parsedName) {
        const title = track.parsedName;
        actions.push({
          label: `Update TITLE tag → "${title}"`,
          run: async () => {
            await writeTags(track.filePath, track.ext, { TITLE: title });
            track.tags.title = title;
            console.log(chalk.green(`  ✓ Updated TITLE tag to "${title}"`));
          },
        });
      }

      return actions;
    }

    // ── MODERATE: duplicates — manual only ────────────────────────────────
    case 'DUPLICATE_TRACKS':
      return [
        {
          label: `Open album folder for manual review (no auto-fix for duplicates)`,
          run: async () => {
            console.log(chalk.dim(`  Folder: ${layout.albumPath}`));
            console.log(chalk.dim(`  Files:  ${audit.tracks.map((t) => t.fileName).join(', ')}`));
          },
        },
      ];

    default:
      return [];
  }
}

// ── interactive repair loop ───────────────────────────────────────────────────

export async function runRepair(audits: AlbumAudit[], token?: string): Promise<void> {
  const withIssues = audits.filter((a) => a.issues.length > 0);

  if (withIssues.length === 0) {
    console.log(chalk.green('\n  ✓ Nothing to repair.'));
    rl.close();
    return;
  }

  console.log(chalk.bold.white('\n══════════════════════════════════════════════════════════'));
  console.log(chalk.bold.white('  REPAIR MODE'));
  console.log(chalk.bold.white('══════════════════════════════════════════════════════════'));
  console.log(chalk.dim(`  ${withIssues.length} album(s) have issues. Press Ctrl-C to abort at any time.\n`));

  outer: for (const audit of withIssues) {
    const { layout, tracks, issues } = audit;
    const loc = layout.letterDir
      ? `${layout.letterDir}/${layout.artistName}/${layout.albumFolder}`
      : `${layout.artistName}/${layout.albumFolder}`;

    console.log(chalk.bold(`\n${'─'.repeat(60)}`));
    console.log(chalk.bold(`📁 ${loc}`) + chalk.dim(`  (${tracks.length} track${tracks.length !== 1 ? 's' : ''})`));
    console.log(chalk.bold('─'.repeat(60)));

    for (const issue of issues) {
      const sevColor =
        issue.severity === 'SEVERE' ? chalk.red.bold : issue.severity === 'HIGH' ? chalk.yellow.bold : chalk.cyan;
      const file = issue.file ? chalk.dim(` [${issue.file}]`) : '';
      console.log(`\n  ${sevColor(`[${issue.severity}]`)}${file} ${issue.message}`);

      const actions = await repairActions(issue, audit, token);

      if (actions.length === 0) {
        console.log(chalk.dim('  No automated repair available — fix manually.'));
        continue;
      }

      actions.forEach((a, i) => console.log(`  [${i + 1}] ${a.label}`));
      console.log('  [s] Skip   [q] Quit repair');

      const choice = await ask('  Choice: ');

      if (choice === 'q') {
        console.log(chalk.dim('\n  Repair aborted.'));
        break outer;
      }

      if (choice === 's' || choice === '') continue;

      const idx = parseInt(choice, 10) - 1;
      if (idx >= 0 && idx < actions.length) {
        try {
          await actions[idx].run();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('EACCES') || msg.includes('EPERM')) {
            console.log(chalk.red(`  ✗ Permission denied — re-run with sudo:`));
            console.log(chalk.dim(`    sudo $(which pnpm) --filter @music/audit run audit -- --repair --root ...`));
          } else {
            console.log(chalk.red(`  ✗ Failed: ${msg}`));
          }
        }
      } else {
        console.log(chalk.dim('  Invalid choice — skipped.'));
      }
    }
  }

  console.log(chalk.bold.white('\n══════════════════════════════════════════════════════════'));
  console.log(chalk.bold.white('  Repair session complete. Re-run audit to verify fixes.'));
  console.log(chalk.bold.white('══════════════════════════════════════════════════════════\n'));
  rl.close();
}
