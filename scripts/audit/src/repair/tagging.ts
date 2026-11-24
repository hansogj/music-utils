import fs from 'node:fs/promises';
import path from 'node:path';

import chalk from 'chalk';

import { sortArtist } from '../articles.js';
import { matchNames } from '../checks/names.js';
import { type NumberedTrack } from '../discogs.js';
import { appendChangeset, writeInfoTxtFromPaste } from '../info-txt.js';
import { parsePastedTracklist } from '../paste.js';
import { checkRenames, discNumbers, pairingProblem, planPairing, sanitizeTitle } from '../rename-plan.js';
import { writeTags } from '../tag-write.js';
import { type AlbumAudit } from '../types.js';
import { albumMetaFromLayout, musicFilesIn } from './folder.js';
import { ask, askLines } from './prompt.js';

// Tags files from a tracklist (Discogs or pasted) and offers the matching file renames.

type LocalFile = { name: string; ext: 'flac' | 'mp3' };
interface TaggedFiles {
  local: Array<{ disc: number; no: number }>;
  titles: Array<string | undefined>;
}

// Pairs the files with a tracklist (Discogs or pasted) and tags them; undefined when the
// user stops at a warning. `names` are the local titles, for placing unnumbered files.
export async function tagFromTracklist(
  audit: AlbumAudit,
  files: LocalFile[],
  names: Map<string, string>,
  tracks: NumberedTrack[],
  opts: {
    folderDisc: number;
    countWarning: (extra: number) => string;
    // discNumber: the DISCNUMBER tag (discNumbers()).
    tags: (t: { no: number; discNumber: string; total: number; title?: string }) => Record<string, string>;
    // Show every file's new title and ask before tagging (a pasted list).
    confirm?: boolean;
  },
): Promise<TaggedFiles | undefined> {
  const pairing = planPairing(
    files.map((f) => f.name),
    files.map((f) => names.get(f.name) ?? ''),
    tracks,
    opts.folderDisc,
  );
  const local = pairing.map(({ disc, no }) => ({ disc, no }));
  const paired = pairing.map((p) => p.track);
  const titles = paired.map((t) => t?.title?.trim() || undefined);
  const isExtra = (i: number) => pairing[i].extraOf !== undefined;
  const extras = files.filter((_, i) => isExtra(i));
  for (const [i, f] of files.entries()) {
    if (isExtra(i))
      console.log(
        chalk.yellow(
          `  ⚠ ${f.name} looks like an extra copy of ${files[pairing[i].extraOf!].name}: not tagged — move it out of the album`,
        ),
      );
  }
  const localCount = files.length - extras.length;

  if (tracks.length !== localCount) {
    console.log(
      chalk.yellow(`  ⚠ ${opts.countWarning(tracks.length - localCount)} (${tracks.length} vs ${localCount} local)`),
    );
    const ok = await ask('  Continue anyway? [y/N] ');
    if (ok.toLowerCase() !== 'y') {
      console.log(chalk.dim('  Skipped.'));
      return undefined;
    }
  }

  const showPairing = () =>
    files.forEach((f, i) =>
      console.log(
        chalk.dim(
          `    ${f.name}  →  ${paired[i] ? `${paired[i]!.position ? `${paired[i]!.position} ` : ''}${paired[i]!.title}` : isExtra(i) ? '(extra copy)' : '?'}`,
        ),
      ),
    );
  const problem = pairingProblem(titles.filter((_, i) => !isExtra(i)));
  if (problem) {
    console.log(chalk.yellow(`  ⚠ The titles don't line up: ${problem}`));
    showPairing();
    const ok = await ask('  Tag anyway? [y/N] ');
    if (ok.toLowerCase() !== 'y') {
      console.log(chalk.dim('  Skipped.'));
      return undefined;
    }
  } else if (opts.confirm) {
    showPairing();
    const ok = await ask(`  Tag ${localCount} file(s) like this? [Y/n] `);
    if (ok.toLowerCase() === 'n') {
      console.log(chalk.dim('  Skipped.'));
      return undefined;
    }
  }

  // The release's own count when stray copies are left out (15, not 17).
  const total = localCount;
  const meta = albumMetaFromLayout(audit.layout);
  const discs = discNumbers(
    local.map((l) => l.disc),
    { disc: parseInt(meta.discNumber, 10), of: parseInt(meta.noOfDiscs, 10) },
  );
  for (const [i, { name, ext }] of files.entries()) {
    if (isExtra(i)) continue;
    const { no } = local[i];
    const title = titles[i];
    await writeTags(
      path.join(audit.layout.albumPath, name),
      ext,
      opts.tags({ no, discNumber: discs[i], total, title }),
    );
    console.log(chalk.green(`  ✓ Tagged ${name}${title ? ` → "${title}"` : ' (no title match)'}`));
  }
  return { local, titles };
}

// Offers to rename the files to "01 - Title", also in a "(Disc n∕m)" folder; "d2t01 - Title"
// only when one folder holds the files of several discs.
export async function offerFileRenames(
  albumPath: string,
  files: LocalFile[],
  { local, titles }: TaggedFiles,
  source: string,
): Promise<void> {
  const isMultiDisc = new Set(local.map((l) => l.disc)).size > 1;
  const planned = files.flatMap(({ name, ext }, i) => {
    const { no, disc } = local[i];
    const title = titles[i];
    if (!title) return [];
    const safe = sanitizeTitle(title);
    const newName = isMultiDisc
      ? `d${disc}t${String(no).padStart(2, '0')} - ${safe}.${ext}`
      : `${String(no).padStart(2, '0')} - ${safe}.${ext}`;
    return newName !== name ? [{ old: name, new: newName }] : [];
  });
  const { ok: pending, clash } = checkRenames(
    planned,
    files.map((f) => f.name),
  );
  if (clash) {
    console.log(
      chalk.yellow(
        `  ⚠ No file renames: they would overwrite files (${clash.slice(0, 3).join(', ')}${clash.length > 3 ? ', …' : ''})`,
      ),
    );
  }
  if (pending.length === 0) return;
  console.log(chalk.dim(`\n  File renames to match ${source} (${pending.length} of ${files.length}):`));
  for (const p of pending) console.log(`    ${chalk.dim(p.old)}  →  ${p.new}`);
  // Enter applies them: they follow from the tags just written. Only Enter or "y" does; a typo declines.
  const doRename = await ask('  Apply renames? [Y/n] ');
  if (!['', 'y'].includes(doRename.toLowerCase())) return;
  for (const p of pending) {
    try {
      await fs.rename(path.join(albumPath, p.old), path.join(albumPath, p.new));
      console.log(chalk.green(`  ✓ ${p.new}`));
    } catch (err) {
      console.log(chalk.red(`  ✗ ${p.old}: ${err instanceof Error ? err.message : String(err)}`));
    }
  }
}

// Tags the album from a tracklist the user pastes, one line per track (parsePastedTracklist()):
// titles and numbers from the list; artist, album and year from the folder. True when tagged.
export async function tagFromPaste(audit: AlbumAudit): Promise<boolean> {
  const { layout } = audit;
  const meta = albumMetaFromLayout(layout);
  const files = await musicFilesIn(layout.albumPath);
  const folderDisc = parseInt(meta.discNumber, 10);
  console.log(
    chalk.dim(
      `  Paste the tracklist, one line per track (${files.length} file${files.length !== 1 ? 's' : ''}), then an empty line.\n` +
        '  "Title", "01 - Title", "A1 Title", "1-03 Title"; a duration at the end is dropped. An empty line alone cancels.',
    ),
  );
  const tracks = parsePastedTracklist(await askLines(), folderDisc);
  if (tracks.length === 0) {
    console.log(chalk.dim('  Cancelled — nothing pasted.'));
    return false;
  }
  const names = new Map(matchNames(audit.tracks).map((n, i) => [audit.tracks[i].fileName, n]));
  const tagged = await tagFromTracklist(audit, files, names, tracks, {
    folderDisc,
    confirm: true,
    countWarning: (extra) =>
      extra > 0 ? `The list has ${extra} more line(s) than there are files` : `The list has ${-extra} line(s) too few`,
    tags: ({ no, discNumber, total, title }) => ({
      ARTIST: sortArtist(meta.artist),
      ALBUMARTIST: sortArtist(meta.artist),
      ALBUM: meta.album,
      TRACKNUMBER: `${no}/${total}`,
      DISCNUMBER: discNumber,
      ...(meta.year ? { DATE: meta.year } : {}),
      ...(title ? { TITLE: title } : {}),
    }),
  });
  if (!tagged) return false;

  try {
    const info = await writeInfoTxtFromPaste(layout.albumPath, meta, tracks, audit.tracks);
    console.log(
      chalk.dim(
        info === 'kept'
          ? '  info.txt kept: it holds more than the old tags'
          : `  ✓ info.txt ${info === 'written' ? 'written' : 'unchanged'}`,
      ),
    );
    if (info !== 'kept') await appendChangeset(layout.albumPath, 'Tagged from a pasted tracklist');
  } catch {
    // Non-fatal — the tags are written
  }

  await offerFileRenames(layout.albumPath, files, tagged, 'the pasted titles');
  return true;
}
