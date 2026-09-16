import chalk from 'chalk';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { emitKeypressEvents } from 'node:readline';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { termLink } from './term-link.js';
import { fetchRelease } from './discogs.js';
import type { AlbumAudit, AlbumLayout, Issue } from './types.js';

const execFileAsync = promisify(execFile);
function createRl() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}
let rl = createRl();

// ── prompt ───────────────────────────────────────────────────────────────────

async function ask(q: string): Promise<string> {
  return (await rl.question(q)).trim();
}

// ── interactive release picker ────────────────────────────────────────────────

import type { DiscogsSearchResult } from './types.js';

async function pickRelease(results: DiscogsSearchResult[]): Promise<string | undefined> {
  if (results.length === 0) return undefined;
  if (!process.stdin.isTTY) return undefined; // non-interactive — fall back to text input

  const bestScore = Math.max(...results.map((x) => x.matchScore ?? -1));

  const items = [
    ...results.map((r) => {
      const yr = r.year ? ` (${r.year})` : '';
      const isBest = r.matchScore !== undefined && r.matchScore === bestScore;
      const score = r.matchScore !== undefined
        ? ` ${Math.round(r.matchScore * 100)}%${r.trackCount ? ` · ${r.trackCount}tr` : ''}`
        : '';
      return { id: String(r.id), label: `[${r.id}] ${r.title}${yr}`, score, isBest };
    }),
    { id: '', label: 'Enter a different release ID…', score: '', isBest: false },
  ];

  let idx = 0;

  const renderItem = (item: (typeof items)[0], active: boolean): string => {
    const cursor = active ? chalk.cyan('▶') : ' ';
    const star = item.isBest ? chalk.yellow('★') : ' ';
    const label = active ? chalk.bold.white(item.label) : chalk.white(item.label);
    const score = item.score ? chalk.dim(item.score) : '';
    return `  ${cursor} ${star} ${label}${score}`;
  };

  rl.close(); // release readline's stdin listener so raw mode has exclusive access

  process.stdin.setRawMode(true);
  emitKeypressEvents(process.stdin); // assemble escape sequences into named key events
  process.stdout.write('\x1b[?25l'); // hide cursor
  process.stdout.write(chalk.dim('  Select release (↑↓  Enter  Esc to cancel):\n'));
  for (const [i, item] of items.entries()) process.stdout.write(renderItem(item, i === idx) + '\n');

  const redraw = () => {
    process.stdout.write(`\x1b[${items.length}A`);
    for (const [i, item] of items.entries())
      process.stdout.write(`\x1b[2K${renderItem(item, i === idx)}\n`);
  };

  return new Promise<string | undefined>((resolve) => {
    let done = false;
    // Ignore any keypress events that fire in the first event-loop tick —
    // they are buffered input from the previous readline prompt, not user intent.
    let ready = false;
    setImmediate(() => { ready = true; });

    const cleanup = (result: string | undefined) => {
      if (done) return;
      done = true;
      process.stdin.off('keypress', onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause(); // hand control back; createRl() will resume when needed
      process.stdout.write('\x1b[?25h'); // show cursor
      rl = createRl(); // recreate readline for subsequent ask() calls
      resolve(result);
    };

    const onKey = (_str: string | undefined, key: { name?: string; ctrl?: boolean }) => {
      if (!ready) return;
      try {
        if (key.name === 'up') {
          idx = (idx - 1 + items.length) % items.length;
          redraw();
        } else if (key.name === 'down') {
          idx = (idx + 1) % items.length;
          redraw();
        } else if (key.name === 'return') {
          process.stdout.write('\n');
          cleanup(items[idx].id || undefined); // undefined = "Enter different ID" row
        } else if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
          process.stdout.write('\n');
          cleanup(undefined);
        }
      } catch (err) {
        cleanup(undefined);
        console.error(chalk.red(`  picker error: ${err instanceof Error ? err.message : String(err)}`));
      }
    };

    process.stdin.on('keypress', onKey);
    process.stdin.resume(); // 'keypress' is a custom event — resume() is needed to keep stdin flowing
  });
}

// ── tag writing ──────────────────────────────────────────────────────────────

async function writeFlacTags(filePath: string, tags: Record<string, string>): Promise<void> {
  const removeArgs = Object.keys(tags).map((k) => `--remove-tag=${k}`);
  const { stderr: se1 } = await execFileAsync('metaflac', [...removeArgs, filePath]);
  if (se1?.trim()) throw new Error(`metaflac remove: ${se1.trim()}`);
  const setArgs = Object.entries(tags).map(([k, v]) => `--set-tag=${k}=${v}`);
  const { stderr: se2 } = await execFileAsync('metaflac', [...setArgs, filePath]);
  if (se2?.trim()) throw new Error(`metaflac set: ${se2.trim()}`);
  // Verify write actually landed (catches silent failures on NFS/root-squash mounts)
  if (tags['TITLE']) {
    const { stdout: verify } = await execFileAsync('metaflac', ['--show-tag=TITLE', filePath]);
    if (!verify.includes('=')) {
      throw new Error(`FLAC tags were not written — file may be on a read-only or root-squash NFS mount. Try running as the file owner instead of root.`);
    }
  }
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
    GENRE: 'TCON',
  };
  const args = ['-2'];
  for (const [k, v] of Object.entries(tags)) {
    if (ID3[k]) args.push(`--${ID3[k]}`, v);
    else if (k === 'COMMENT') args.push('--COMM', v);
    else if (k === 'DISCOGS_RELEASE_ID') args.push('--TXXX', `DISCOGS_RELEASE_ID=${v}`);
  }
  args.push(filePath);
  const { stderr } = await execFileAsync('id3v2', args);
  if (stderr?.trim()) throw new Error(`id3v2: ${stderr.trim()}`);

  // Verify the write actually landed (catches silent failures on NFS/root-squash mounts)
  const { stdout: verify } = await execFileAsync('id3v2', ['-l', filePath]);
  if (!verify.includes('TIT2') && tags['TITLE']) {
    throw new Error(`Tags were not written — file may be on a read-only or root-squash NFS mount. Try running as the file owner instead of root.`);
  }
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

// Accepts: plain digits, r<id>, [r<id>], full release URLs.
// Rejects master IDs (m<id> / /master/<id>) with a clear message.
function parseReleaseId(raw: string): string {
  const s = raw.trim();

  // Full Discogs master URL or bare master ID — not a release ID
  if (/discogs\.com\/master\//i.test(s) || /^m\d+$/i.test(s)) {
    console.log(chalk.yellow(`  ⚠ That looks like a master ID — paste a release URL or use a release ID (r<number> or plain number).`));
    return '';
  }

  // Full release URL: extract the trailing numeric ID
  const urlMatch = s.match(/discogs\.com\/(?:release\/[^/]*\/|release\/)(\d+)/i);
  if (urlMatch) return urlMatch[1];

  // r<id> or [r<id>] — strip the prefix/brackets
  const prefixed = s.match(/^\[?r(\d+)\]?$/i);
  if (prefixed) return prefixed[1];

  // Plain number
  if (/^\d+$/.test(s)) return s;

  console.log(chalk.yellow(`  ⚠ Unrecognised format. Enter a release ID (e.g. 4565937, r4565937) or paste a Discogs release URL.`));
  return '';
}

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


function sanitizeFilename(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
}

// ── folder rename helpers ─────────────────────────────────────────────────────

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// After Discogs tagging, compare artist/album from the release against local
// folder names and offer renames if they differ.
async function offerFolderRenames(
  layout: AlbumLayout,
  meta: ReturnType<typeof albumMetaFromLayout>,
  release: import('./discogs.js').ReleaseInfo,
): Promise<void> {
  const discogsArtist = release.artists?.[0];
  const discogsAlbum = release.title;

  const artistMismatch =
    discogsArtist && normName(discogsArtist) !== normName(layout.artistName);
  const albumMismatch =
    discogsAlbum && normName(discogsAlbum) !== normName(meta.album);

  if (!artistMismatch && !albumMismatch) return;

  console.log(chalk.yellow('\n  Discogs name differs from local folder:'));
  if (artistMismatch)
    console.log(`    artist : "${layout.artistName}"  →  "${discogsArtist}"`);
  if (albumMismatch)
    console.log(`    album  : "${meta.album}"  →  "${discogsAlbum}"`);

  const answer = await ask('  Rename folder(s) to match Discogs? [y/N] ');
  if (answer.toLowerCase() !== 'y') {
    console.log(chalk.dim('  Skipped rename.'));
    return;
  }

  // Rename album folder first (artist rename changes its parent path).
  if (albumMismatch && discogsAlbum) {
    const yearPrefix = layout.albumFolder.match(/^(\d{4}\s+)/)?.[1] ?? '';
    const discPart = layout.albumFolder.match(/(\s*\([Dd]isc[^)]+\))/)?.[0] ?? '';
    const auxPart = (layout.albumFolder.match(/\s*\[[^\]]+\]/g) ?? []).join('');
    const newAlbumFolder = `${yearPrefix}${discogsAlbum}${discPart}${auxPart}`.trim();
    const newAlbumPath = path.join(path.dirname(layout.albumPath), newAlbumFolder);
    try {
      await guardedRename(layout.albumPath, newAlbumPath);
      layout.albumPath = newAlbumPath;
      layout.albumFolder = newAlbumFolder;
    } catch (err) {
      console.log(chalk.red(`  ✗ Album folder rename failed: ${err instanceof Error ? err.message : String(err)}`));
    }
  }

  if (artistMismatch && discogsArtist) {
    const artistDir = path.dirname(layout.albumPath);
    const newArtistDir = path.join(path.dirname(artistDir), discogsArtist);
    try {
      await guardedRename(artistDir, newArtistDir);
      layout.artistName = discogsArtist;
      layout.albumPath = path.join(newArtistDir, layout.albumFolder);
    } catch (err) {
      console.log(chalk.red(`  ✗ Artist folder rename failed: ${err instanceof Error ? err.message : String(err)}`));
    }
  }
}

// ── safe rename ───────────────────────────────────────────────────────────────

async function guardedRename(from: string, to: string): Promise<void> {
  try {
    await fs.access(to);
    throw new Error(`Target already exists: ${to}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  await fs.rename(from, to);
  console.log(chalk.green(`  ✓ Renamed to ${path.basename(to)}`));
}

// ── repair actions ────────────────────────────────────────────────────────────

interface RepairAction {
  label: string;
  run: () => Promise<void>;
}

function buildDiscogsAction(
  audit: AlbumAudit,
  token: string,
  meta: ReturnType<typeof albumMetaFromLayout>,
  files: { name: string; ext: 'flac' | 'mp3' }[],
): RepairAction {
  const topResult = audit.discogsResults?.[0];
  const label = topResult
    ? `Tag from Discogs release ID (suggested: ${topResult.id} — ${topResult.title}${
        topResult.matchScore !== undefined ? `, ${Math.round(topResult.matchScore * 100)}% match` : ''
      })`
    : 'Tag from Discogs release ID';

  return {
    label,
    run: async () => {
      const results = audit.discogsResults ?? [];
      const topId = topResult ? String(topResult.id) : '';

      // Retry loop: re-prompt if the fetch fails (e.g. Discogs 500, bad ID).
      let release: Awaited<ReturnType<typeof fetchRelease>> | undefined;
      let releaseId = '';
      while (!release) {
        const browseHint = results.length > 0 ? ', or Enter to browse list' : '';
        const input = (await ask(`    Release ID [${releaseId || topId || 'enter ID'}${browseHint}]: `)).trim();

        if (input) {
          releaseId = parseReleaseId(input);
        } else if (!releaseId && results.length > 0) {
          const picked = await pickRelease(results);
          releaseId = picked ?? topId;
        } else if (!releaseId) {
          releaseId = topId;
        }
        // If user pressed Enter with no input and we already have an ID, keep it.

        if (!releaseId) { console.log(chalk.yellow('  Skipped — no release ID')); return; }

        console.log(chalk.dim(`  Fetching release ${releaseId}...`));
        try {
          release = await fetchRelease(releaseId, token);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(chalk.red(`  ✗ ${msg}`));
          const retry = await ask('  Try a different release ID? [y/N] ');
          if (retry.toLowerCase() !== 'y') return;
          releaseId = ''; // clear so prompt shows fresh
        }
      }

      const { tracklist } = release;
      if (tracklist.length === 0) { console.log(chalk.yellow('  No tracks found on this release')); return; }

      const year = meta.year ?? release.year;
      const genreValue = [...(release.genres ?? []), ...(release.styles ?? [])].slice(0, 4).join(', ');
      const releaseUrl = `https://www.discogs.com/release/${releaseId}`;
      const total = files.length;

      if (tracklist.length !== files.length) {
        const extra = tracklist.length - files.length;
        const msg = extra > 0
          ? `Discogs has ${extra} more track(s) — may be a bonus edition`
          : `Discogs has ${-extra} fewer track(s) — may be a different pressing`;
        console.log(chalk.yellow(`  ⚠ ${msg} (${tracklist.length} vs ${files.length} local)`));
        const ok = await ask('  Continue anyway? [y/N] ');
        if (ok.toLowerCase() !== 'y') { console.log(chalk.dim('  Skipped.')); return; }
      }

      const findDiscTrack = (_name: string, disc: number, no: number) =>
        tracklist.find((t) => {
          const m = t.position.match(/^(?:(\d+)[-./:])?(\d+)$/);
          if (!m) return false;
          return (m[1] ? parseInt(m[1], 10) : 1) === disc && parseInt(m[2], 10) === no;
        });

      for (const { name, ext } of files) {
        const { no, disc } = trackNoFromFilename(name);
        const title = findDiscTrack(name, disc, no)?.title;
        const tags: Record<string, string> = {
          ARTIST: meta.artist,
          ALBUMARTIST: meta.artist,
          ALBUM: meta.album,
          TRACKNUMBER: `${no}/${total}`,
          DISCNUMBER: `${disc}/${meta.noOfDiscs}`,
          ...(year ? { DATE: year } : {}),
          ...(title ? { TITLE: title } : {}),
          ...(genreValue ? { GENRE: genreValue } : {}),
          COMMENT: releaseUrl,
          DISCOGS_RELEASE_ID: releaseId,
        };
        await writeTags(path.join(audit.layout.albumPath, name), ext, tags);
        console.log(chalk.green(`  ✓ Tagged ${name}${title ? ` → "${title}"` : ' (no title match)'}`));
      }

      // ── offer file renames to match Discogs titles ──────────────────────
      const isMultiDisc = parseInt(meta.noOfDiscs, 10) > 1;
      const pending = files.flatMap(({ name, ext }) => {
        const { no, disc } = trackNoFromFilename(name);
        const title = findDiscTrack(name, disc, no)?.title;
        if (!title) return [];
        const safe = sanitizeFilename(title);
        const newName = isMultiDisc
          ? `d${disc}t${String(no).padStart(2, '0')} - ${safe}.${ext}`
          : `${String(no).padStart(2, '0')} - ${safe}.${ext}`;
        return newName !== name ? [{ old: name, new: newName }] : [];
      });

      if (pending.length > 0) {
        console.log(chalk.dim(`\n  File renames to match Discogs titles (${pending.length} of ${files.length}):`));
        for (const p of pending) console.log(`    ${chalk.dim(p.old)}  →  ${p.new}`);
        const doRename = await ask('  Apply renames? [y/N] ');
        if (doRename.toLowerCase() === 'y') {
          for (const p of pending) {
            try {
              await fs.rename(path.join(audit.layout.albumPath, p.old), path.join(audit.layout.albumPath, p.new));
              console.log(chalk.green(`  ✓ ${p.new}`));
            } catch (err) {
              console.log(chalk.red(`  ✗ ${p.old}: ${err instanceof Error ? err.message : String(err)}`));
            }
          }
        }
      }

      // ── offer folder renames if artist/album name differs ───────────────
      await offerFolderRenames(audit.layout, meta, release);
    },
  };
}

async function repairActions(issue: Issue, audit: AlbumAudit, token?: string): Promise<RepairAction[]> {
  const { layout } = audit;

  switch (issue.code) {
    // ── SEVERE: rename folder ──────────────────────────────────────────────
    case 'MISSING_YEAR_PREFIX': {
      // Prefer year embedded in folder name, fall back to best Discogs result
      const yearFromFolder = layout.albumFolder.match(/\b(19|20)\d{2}\b/)?.[0];
      const yearFromDiscogs = audit.discogsResults?.[0]?.year;
      const guessedYear = yearFromFolder ?? yearFromDiscogs;

      const yearActions: RepairAction[] = [];

      if (guessedYear) {
        const newName = `${guessedYear} ${layout.albumFolder}`;
        const newPath = path.join(path.dirname(layout.albumPath), newName);
        yearActions.push({
          label: `Rename folder → "${newName}"`,
          run: async () => {
            await guardedRename(layout.albumPath, newPath);
            layout.albumPath = newPath;
            layout.albumFolder = newName;
          },
        });
      }

      yearActions.push({
        label: `Enter release year manually and rename${guessedYear ? ` (default: ${guessedYear})` : ''}`,
        run: async () => {
          const input = (await ask(`    Year [${guessedYear ?? 'YYYY'}]: `)).trim();
          const year = input || guessedYear;
          if (!year?.match(/^\d{4}$/)) { console.log(chalk.yellow('  Skipped — invalid year')); return; }
          const newName = `${year} ${layout.albumFolder}`;
          const newPath = path.join(path.dirname(layout.albumPath), newName);
          await guardedRename(layout.albumPath, newPath);
          layout.albumPath = newPath;
          layout.albumFolder = newName;
        },
      });

      return yearActions;
    }

    case 'WRONG_DISC_SEPARATOR': {
      const newNameMatch = issue.suggestion?.match(/Rename(?: to)?[: ]+"(.+)"/);
      if (!newNameMatch) return [];
      const newName = newNameMatch[1];
      const newPath = path.join(path.dirname(layout.albumPath), newName);
      return [
        {
          label: `Rename folder → "${newName}"`,
          run: async () => {
            await guardedRename(layout.albumPath, newPath);
            layout.albumPath = newPath;
            layout.albumFolder = newName;
          },
        },
      ];
    }

    case 'WRONG_AUX_BRACKETS': {
      // Compute the rename directly — the suggestion string is human-readable and not parseable.
      const newName = layout.albumFolder.replace(/\{([^}]+)\}/g, '[$1]');
      const newPath = path.join(path.dirname(layout.albumPath), newName);
      return [
        {
          label: `Rename folder → "${newName}"`,
          run: async () => {
            await guardedRename(layout.albumPath, newPath);
            layout.albumPath = newPath;
            layout.albumFolder = newName;
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
            await guardedRename(sourceArtist, targetArtist);
            layout.letterDir = expected;
            layout.albumPath = path.join(targetArtist, layout.albumFolder);
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

      const actions: RepairAction[] = [];

      if (audit.discogsResults?.[0] || token) {
        actions.push(buildDiscogsAction(audit, token ?? '', meta, files));
      }

      // Folder tagging as fallback — no title, but fills artist/album/year/track
      actions.push({
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
      });

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

// ── album info table ──────────────────────────────────────────────────────────

function printAlbumTable(audit: AlbumAudit): void {
  const { layout, tracks, discogsResults } = audit;
  const meta = albumMetaFromLayout(layout);

  const taggedTracks = tracks.filter((t) => t.tags.title || t.tags.artist || t.tags.album);
  const missingTitle = tracks.filter((t) => !t.tags.title).length;
  const tagStatus =
    taggedTracks.length === tracks.length
      ? chalk.green(`${tracks.length} / ${tracks.length}`)
      : chalk.yellow(`${taggedTracks.length} / ${tracks.length}`) +
        chalk.dim(` (${missingTitle} missing title)`);

  const rows: [string, string][] = [
    ['Artist', chalk.white(meta.artist)],
    ['Album', chalk.white(meta.album || chalk.dim('(unknown)'))],
    ['Year', meta.year ? chalk.white(meta.year) : chalk.dim('(not in folder name)')],
    ['Disc', chalk.white(`${meta.discNumber} / ${meta.noOfDiscs}`)],
    ['Tracks', tagStatus],
    ['Path', chalk.dim(layout.albumPath)],
  ];

  if (discogsResults && discogsResults.length > 0) {
    rows.push(['', '']);
    rows.push([chalk.bold('Discogs'), '']);
    const bestScore = Math.max(...discogsResults.map((x) => x.matchScore ?? -1));
    for (const r of discogsResults) {
      const yr = r.year ? ` (${r.year})` : '';
      const star = r.matchScore !== undefined && r.matchScore === bestScore ? '★ ' : '  ';
      const score = r.matchScore !== undefined
        ? chalk.dim(` ${Math.round(r.matchScore * 100)}%${r.trackCount !== undefined ? ` · ${r.trackCount}tr` : ''}`)
        : '';
      const label = `${star}[${r.id}] ${r.title}${yr}`;
      rows.push(['  release', termLink(chalk.cyan(label), r.releaseUrl) + score]);
      if (r.masterUrl) rows.push(['  master', termLink(chalk.dim('open master'), r.masterUrl)]);
    }
  }

  const COL1 = 10;
  console.log(chalk.dim('  ┌' + '─'.repeat(COL1 + 2) + '┬' + '─'.repeat(45) + '┐'));
  for (const [label, value] of rows) {
    if (!label && !value) {
      console.log(chalk.dim('  ├' + '─'.repeat(COL1 + 2) + '┼' + '─'.repeat(45) + '┤'));
      continue;
    }
    const paddedLabel = label.padEnd(COL1);
    console.log(chalk.dim('  │ ') + chalk.dim(paddedLabel) + chalk.dim(' │ ') + value);
  }
  console.log(chalk.dim('  └' + '─'.repeat(COL1 + 2) + '┴' + '─'.repeat(45) + '┘'));
}

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

// ── repair log ───────────────────────────────────────────────────────────────

interface RepairEvent {
  ts: string;
  session: string;
  album: string;
  issue: string;
  severity: string;
  action: string;
  result: 'fixed' | 'skipped' | 'resumed' | 'failed' | 'no-action';
  error?: string;
}

// ── interactive repair loop ───────────────────────────────────────────────────

export async function runRepair(
  audits: AlbumAudit[],
  token?: string,
  opts?: { retag?: boolean },
): Promise<void> {
  const retag = opts?.retag ?? false;
  const withIssues = audits.filter((a) => a.issues.length > 0);
  const toRepair = retag ? audits : withIssues;

  if (toRepair.length === 0) {
    console.log(chalk.green('\n  ✓ Nothing to repair.'));
    rl.close();
    return;
  }

  const session = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const logPath = path.join(process.cwd(), '.music-audit-repair.log');
  const events: RepairEvent[] = [];

  // ── load prior fixes from log ──────────────────────────────────────────────
  // For each album+issue key, track the most recent result. Auto-skip issues
  // whose latest logged result is 'fixed'.
  const latestByKey = new Map<string, RepairEvent>();
  try {
    const raw = await fs.readFile(logPath, 'utf8');
    for (const line of raw.split('\n').filter(Boolean)) {
      try {
        const e = JSON.parse(line) as RepairEvent;
        if (e.result === 'fixed' || e.result === 'failed') {
          const key = `${e.album}:::${e.issue}`;
          const prev = latestByKey.get(key);
          if (!prev || e.ts > prev.ts) latestByKey.set(key, e);
        }
      } catch { /* skip malformed lines */ }
    }
  } catch { /* no log yet */ }

  const previousFixes = new Set(
    [...latestByKey.entries()].filter(([, e]) => e.result === 'fixed').map(([k]) => k),
  );

  const logEvent = async (e: Omit<RepairEvent, 'ts' | 'session'>) => {
    const event: RepairEvent = { ts: new Date().toISOString(), session, ...e };
    events.push(event);
    try { await fs.appendFile(logPath, JSON.stringify(event) + '\n', 'utf8'); } catch { /* non-fatal */ }
  };

  console.log(chalk.bold.white('\n══════════════════════════════════════════════════════════'));
  console.log(chalk.bold.white('  REPAIR MODE'));
  console.log(chalk.bold.white('══════════════════════════════════════════════════════════'));
  if (previousFixes.size > 0) {
    console.log(chalk.dim(`  ${previousFixes.size} issue(s) marked fixed in log — will auto-skip.`));
    console.log(chalk.dim(`  Delete ${logPath} to re-prompt everything.\n`));
  }
  const issueCount = withIssues.length;
  if (retag) {
    console.log(chalk.dim(`  ${issueCount} album(s) with issues + ${toRepair.length - issueCount} clean (retag mode). Press Ctrl-C to abort.\n`));
  } else {
    console.log(chalk.dim(`  ${issueCount} album(s) have issues. Press Ctrl-C to abort at any time.\n`));
  }

  outer: for (const audit of toRepair) {
    const { layout, tracks, issues } = audit;
    const loc = layout.letterDir
      ? `${layout.letterDir}/${layout.artistName}/${layout.albumFolder}`
      : `${layout.artistName}/${layout.albumFolder}`;

    console.log(chalk.bold(`\n${'─'.repeat(60)}`));
    console.log(chalk.bold(`📁 ${loc}`) + chalk.dim(`  (${tracks.length} track${tracks.length !== 1 ? 's' : ''})`));
    console.log(chalk.bold('─'.repeat(60)));
    printAlbumTable(audit);

    let remainingIssues = [...issues];

    albumLoop: while (remainingIssues.length > 0) {
      const skipped: Issue[] = [];
      let mismatchBulkIdx = -1;

      for (const issue of remainingIssues) {
        const logKey = `${loc}:::${issue.code}`;
        if (previousFixes.has(logKey)) {
          const prev = latestByKey.get(logKey)!;
          console.log(chalk.dim(`\n  ↩ [${issue.severity}] ${issue.code} — previously fixed on ${prev.ts.slice(0, 10)}, skipping`));
          await logEvent({ album: loc, issue: issue.code, severity: issue.severity, action: prev.action, result: 'resumed' });
          continue;
        }

        const sevColor =
          issue.severity === 'SEVERE' ? chalk.red.bold : issue.severity === 'HIGH' ? chalk.yellow.bold : chalk.cyan;
        const file = issue.file ? chalk.dim(` [${issue.file}]`) : '';
        console.log(`\n  ${sevColor(`[${issue.severity}]`)}${file} ${issue.message}`);

        const actions = await repairActions(issue, audit, token);

        if (actions.length === 0) {
          console.log(chalk.dim('  No automated repair available — fix manually.'));
          await logEvent({ album: loc, issue: issue.code, severity: issue.severity, action: 'none', result: 'no-action' });
          continue;
        }

        // Auto-apply per-album bulk strategy for name/tag mismatches.
        if (issue.code === 'NAME_TAG_MISMATCH' && mismatchBulkIdx >= 0) {
          const action = actions[mismatchBulkIdx];
          if (action) {
            console.log(chalk.dim(`  → bulk strategy: ${action.label}`));
            let result: RepairEvent['result'] = 'fixed';
            let error: string | undefined;
            try { await action.run(); } catch (err) {
              handleRepairError(err);
              result = 'failed';
              error = err instanceof Error ? err.message : String(err);
            }
            await logEvent({ album: loc, issue: issue.code, severity: issue.severity, action: action.label, result, error });
            continue;
          }
        }

        actions.forEach((a, i) => console.log(`  [${i + 1}] ${a.label}`));
        console.log('  [l] List files   [s] Skip   [q] Quit repair');

        let choice: string;
        while (true) {
          choice = await ask('  Choice: ');
          if (choice !== 'l') break;
          const files = await musicFilesIn(layout.albumPath);
          console.log(chalk.dim(`\n  Files in ${layout.albumPath}:`));
          for (const { name } of files) console.log(`    ${name}`);
          console.log();
        }

        if (choice === 'q') {
          console.log(chalk.dim('\n  Repair aborted.'));
          await logEvent({ album: loc, issue: issue.code, severity: issue.severity, action: 'quit', result: 'skipped' });
          break outer;
        }
        if (choice === 's' || choice === '') {
          skipped.push(issue);
          await logEvent({ album: loc, issue: issue.code, severity: issue.severity, action: 'skipped', result: 'skipped' });
          continue;
        }

        const idx = parseInt(choice, 10) - 1;

        if (idx >= 0 && idx < actions.length) {
          // Offer per-album bulk for name/tag mismatches.
          if (issue.code === 'NAME_TAG_MISMATCH' && mismatchBulkIdx < 0) {
            const hasMore = remainingIssues.slice(remainingIssues.indexOf(issue) + 1).some((i) => i.code === 'NAME_TAG_MISMATCH');
            if (hasMore) {
              const applyAll = await ask('  Apply this to all remaining name/tag mismatches in this album? [y/N] ');
              if (applyAll.toLowerCase() === 'y') {
                mismatchBulkIdx = idx;
                console.log(chalk.dim(`  → will apply "${actions[idx].label}" to remaining mismatches`));
              }
            }
          }
          let result: RepairEvent['result'] = 'fixed';
          let error: string | undefined;
          try { await actions[idx].run(); } catch (err) {
            handleRepairError(err);
            result = 'failed';
            error = err instanceof Error ? err.message : String(err);
          }
          await logEvent({ album: loc, issue: issue.code, severity: issue.severity, action: actions[idx].label, result, error });
        } else {
          console.log(chalk.dim('  Invalid choice — skipped.'));
          skipped.push(issue);
          await logEvent({ album: loc, issue: issue.code, severity: issue.severity, action: 'invalid-choice', result: 'skipped' });
        }
      }

      if (skipped.length === 0) break albumLoop;

      const sevCount = skipped.filter((i) => i.severity !== 'MODERATE').length;
      console.log(chalk.yellow(`\n  ${skipped.length} issue(s) not fixed${sevCount ? ` (${sevCount} high/severe)` : ''}.`));
      const go = await ask('  [Enter] Next album   [r] Retry skipped   [q] Quit: ');
      if (go === 'q') {
        console.log(chalk.dim('\n  Repair aborted.'));
        break outer;
      }
      if (go.toLowerCase() === 'r') {
        remainingIssues = skipped;
        continue albumLoop;
      }
      break albumLoop;
    }

    // ── retag enrichment (--retag only, for albums that passed tag checks) ──
    if (retag && token) {
      const hasTagIssue = issues.some((i) => i.code === 'NO_TAGS' || i.code === 'MISSING_TAGS');
      if (!hasTagIssue) {
        const retagKey = `${loc}:::RETAG`;
        if (previousFixes.has(retagKey)) {
          const prev = latestByKey.get(retagKey)!;
          console.log(chalk.dim(`\n  ↩ RETAG — Discogs-enriched on ${prev.ts.slice(0, 10)}, skipping`));
          await logEvent({ album: loc, issue: 'RETAG', severity: 'MODERATE', action: prev.action, result: 'resumed' });
        } else {
          console.log(chalk.dim('\n  [retag] Tags look good — offer Discogs enrichment'));
          const meta = albumMetaFromLayout(layout);
          const files = await musicFilesIn(layout.albumPath);
          const action = buildDiscogsAction(audit, token, meta, files);
          console.log(`  [1] ${action.label}`);
          console.log('  [s] Skip   [q] Quit repair');
          const choice = await ask('  Choice: ');
          if (choice === 'q') {
            console.log(chalk.dim('\n  Repair aborted.'));
            await logEvent({ album: loc, issue: 'RETAG', severity: 'MODERATE', action: 'quit', result: 'skipped' });
            break outer;
          }
          if (choice === '1') {
            let result: RepairEvent['result'] = 'fixed';
            let error: string | undefined;
            try { await action.run(); } catch (err) {
              handleRepairError(err);
              result = 'failed';
              error = err instanceof Error ? err.message : String(err);
            }
            await logEvent({ album: loc, issue: 'RETAG', severity: 'MODERATE', action: action.label, result, error });
          } else {
            await logEvent({ album: loc, issue: 'RETAG', severity: 'MODERATE', action: 'skipped', result: 'skipped' });
          }
        }
      }
    }
  }

  // ── session summary ────────────────────────────────────────────────────────
  const fixed        = events.filter((e) => e.result === 'fixed').length;
  const failed       = events.filter((e) => e.result === 'failed').length;
  const skippedCount = events.filter((e) => e.result === 'skipped').length;
  const resumed      = events.filter((e) => e.result === 'resumed').length;

  console.log(chalk.bold.white('\n══════════════════════════════════════════════════════════'));
  console.log(chalk.bold.white('  REPAIR SESSION SUMMARY'));
  console.log(chalk.bold.white('══════════════════════════════════════════════════════════'));
  console.log(`  ${chalk.green('✓ Fixed  ')} ${fixed}`);
  if (resumed)      console.log(`  ${chalk.dim('↩ Resumed')} ${resumed}  (auto-skipped from prior session)`);
  if (failed)       console.log(`  ${chalk.red('✗ Failed ')} ${failed}`);
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
  rl.close();
}
