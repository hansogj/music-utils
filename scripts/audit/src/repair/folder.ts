import fs from 'node:fs/promises';
import path from 'node:path';

import chalk from 'chalk';

import { unsortArtist } from '../articles.js';
import { commonAlbumArtist, sameName } from '../checks/artist.js';
import { folderYear, withFolderYear } from '../checks/year.js';
import { type SiblingDisc, siblingDiscs } from '../disc-siblings.js';
import { guardedRename as renameSafely, moveAlbumToArtist } from '../folder-move.js';
import { appendChangeset } from '../info-txt.js';
import { sanitizeFilename } from '../rename-plan.js';
import { type AlbumAudit, type AlbumLayout } from '../types.js';
import {
  albumSetKey,
  applyOldYear,
  auxPartOf,
  customAux,
  describeOldYear,
  type OldYearAnswer,
  oldYearBracket,
  withAuxPart,
} from '../year-bracket.js';
import { ask } from './prompt.js';

// Album and artist folder renames: brackets, old-year bracket, the artist name to use,
// pending renames applied last, moves to another artist folder.

// The disc comes from a dNtNN file name, else from the folder ("(Disc 2∕2)" → 2).
export function albumMetaFromLayout(layout: AlbumLayout): {
  artist: string;
  album: string;
  year?: string;
  discNumber: string;
  noOfDiscs: string;
} {
  const { artistName, albumFolder } = layout;
  const year = albumFolder.match(/^(\d{4})\s+/)?.[1];
  const discMatch = albumFolder.match(/\(\s*[Dd]isc\s+(\d+)[∕/-](\d+)\s*\)/);
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

// The album title as the folder has it: without year prefix, disc part and brackets, but
// with any other parentheses ("1976 Transformation (The Speed of Love) [FLAC]").
export function folderTitle(folder: string): string {
  return folder
    .replace(/^\d{4}\s+/, '')
    .replace(/\s*\(\s*[Dd]isc\s+\d+\s*[∕/-]\s*\d+\s*\)/, '')
    .replace(/\s*\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function musicFilesIn(dir: string): Promise<{ name: string; ext: 'flac' | 'mp3' }[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && /\.(flac|mp3)$/i.test(e.name))
    .map((e) => ({ name: e.name, ext: path.extname(e.name).slice(1).toLowerCase() as 'flac' | 'mp3' }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Case and punctuation aside ("Give'em" = "Give 'Em"); letters of any script count, "ø" and
// "é" included ("Hønene" ≠ "Hnene").
export function normName(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

// "Dionysos [Canada]" → { name: "Dionysos", brackets: " [Canada]" }: the trailing [...] parts.
export function splitArtistBrackets(artist: string): { name: string; brackets: string } {
  const brackets = artist.match(/(\s*\[[^\]]*\])+\s*$/)?.[0] ?? '';
  return { name: artist.slice(0, artist.length - brackets.length).trim(), brackets: brackets.trimEnd() };
}

// The answers to a folder-rename prompt, applied once the album's other fixes are done.
// Only the targets are stored; the new names are built from the folder as it is then.
interface FolderRenamePlan {
  artist?: string;
  album?: string;
  year?: string;
  oldYear?: OldYearAnswer; // the old year kept as an aux bracket: "live 1978"
  aux?: string; // the folder's brackets, edited after a skip: "[FLAC] [bootleg]"
}

// Adds to the album's pending folder rename (a skip's brackets and a Discogs rename combine).
export function planFolderRename(layout: AlbumLayout, plan: FolderRenamePlan): void {
  pendingFolderRenames.set(layout, { ...pendingFolderRenames.get(layout), ...plan });
}

// After a skip: lets the user note what the album is in the folder name, e.g. a bootleg
// Discogs doesn't list: "Artist/1978 Live in Paris [bootleg]". Starts from the folder's
// brackets; Enter leaves them. Returns the new bracket part, or undefined for no change.
// In a disc set whose first other disc has other brackets, offers those instead (askSetAux).
export async function askSkipAux(layout: AlbumLayout): Promise<string | undefined> {
  const other = (await siblingDiscs(layout))[0];
  if (other) {
    const fromSet = await askSetAux(layout, other);
    if (fromSet !== 'same') return fromSet;
  }
  const current = auxPartOf(pendingFolderRenames.get(layout)?.aux ?? layout.albumFolder);
  console.log(chalk.dim('  Add to the folder name (e.g. bootleg)? Edit the brackets; Enter leaves them.'));
  const aux = customAux(await ask('    Brackets: ', current));
  if (aux === current) return undefined;
  console.log(chalk.dim(`  → folder becomes "${withAuxPart(layout.albumFolder, aux)}" after this album's other fixes`));
  return aux;
}

// A disc folder whose brackets differ from another disc's of its set ("[FLAC]" vs
// "[FLAC] [bootleg]"): keep its own, take the other disc's, or type new ones. Returns the
// new bracket part, undefined for no change, or 'same' when there is nothing to choose.
export async function askSetAux(layout: AlbumLayout, other: SiblingDisc): Promise<string | undefined | 'same'> {
  const current = auxPartOf(pendingFolderRenames.get(layout)?.aux ?? layout.albumFolder);
  let theirs = auxPartOf(path.basename(other.albumPath));
  // The old-year bracket the other disc got is added to this one too, when its year changes.
  const oldYear = oldYearAnswers.get(albumSetKey(layout.artistName, layout.albumFolder));
  if (oldYear?.mode === 'replace') return 'same';
  if (oldYear?.mode === 'append') {
    const text = oldYear.text.toLowerCase();
    theirs = auxPartOf(theirs.replace(/\[[^\]]*\]/g, (b) => (b.slice(1, -1).trim().toLowerCase() === text ? '' : b)));
  }
  if (theirs.toLowerCase() === current.toLowerCase()) return 'same';

  const disc = `Disc ${other.disc}`;
  const show = (aux: string) => withAuxPart(layout.albumFolder, aux);
  console.log(`\n  Brackets differ from ${disc}'s:`);
  console.log(`    [Enter] keep         → ${show(current)}`);
  console.log(`    d  as ${disc.padEnd(15)}→ ${show(theirs)}`);
  console.log(`    c  type new`);
  const choice = (await ask('  Brackets [Enter/d/c]: ')).trim().toLowerCase();
  const aux = choice === 'd' ? theirs : choice === 'c' ? customAux(await ask('    Brackets: ', current)) : current;
  if (aux === current) return undefined;
  console.log(chalk.dim(`  → folder becomes "${show(aux)}" after this album's other fixes`));
  return aux;
}

// ── old year as an aux bracket ────────────────────────────────────────────────

// One answer per album set for the whole run, so all discs of a set get the same bracket.
const oldYearAnswers = new Map<string, OldYearAnswer | undefined>();
// The artist name chosen for an album set (its disc folders): asked once.
const artistAnswers = new Map<string, string>();

// Starts a run (and each test) without answers from an earlier one.
export function resetRepairSession(): void {
  oldYearAnswers.clear();
  artistAnswers.clear();
}

// One artist name for the album's folder, its ARTIST/ALBUMARTIST tags and info.txt's
// header. Asked when the folder, Discogs' first credited artist and the tags don't all
// agree: Enter takes Discogs' (as Discogs is the source of the tags), k the folder's, a every
// credited artist (only when there are several). Returns the name without the folder's own
// brackets ("Dionysos" for "Dionysos [Canada]"); the folder and the tags add them back.
export async function chooseArtist(
  layout: AlbumLayout,
  tracks: AlbumAudit['tracks'],
  release: Pick<import('../discogs.js').ReleaseInfo, 'artists' | 'artistCredit'>,
): Promise<string> {
  const { name: folder, brackets } = splitArtistBrackets(layout.artistName);
  const discogs = release.artists?.[0];
  // The tags carry the folder's brackets ("Dionysos [Canada]"): compared without them.
  // With artist.sortArticles on they hold "Beatles, The": compared as "The Beatles".
  const fullTag = commonAlbumArtist(tracks);
  const bare = brackets && fullTag?.endsWith(brackets) ? fullTag.slice(0, -brackets.length).trim() : fullTag;
  const tagged = bare && unsortArtist(bare);
  if (!discogs) return folder;
  const names = [folder, discogs, ...(tagged ? [tagged] : [])];
  if (new Set(names.map(normName)).size === 1) return folder;

  const key = albumSetKey(layout.artistName, layout.albumFolder);
  const kept = artistAnswers.get(key);
  if (kept !== undefined) {
    console.log(chalk.dim(`  Artist: "${kept}" (as for the other disc of this set)`));
    return kept;
  }

  const credit = release.artistCredit;
  console.log(chalk.yellow('\n  Artist names differ:'));
  console.log(`    Discogs : "${discogs}"${credit ? chalk.dim(`  (credits: "${credit}")`) : ''}`);
  console.log(`    folder  : "${layout.artistName}"`);
  if (tagged && normName(tagged) !== normName(folder) && normName(tagged) !== normName(discogs))
    console.log(`    tags    : "${fullTag}"`);
  console.log(chalk.dim('  One name for the artist folder, the ARTIST/ALBUMARTIST tags and info.txt:'));
  console.log(`    [Enter] Discogs: "${discogs}${brackets}"`);
  console.log(`    [k]     keep the folder's: "${layout.artistName}"`);
  if (credit) console.log(`    [a]     all credits: "${credit}${brackets}"`);
  let chosen: string | undefined;
  while (chosen === undefined) {
    const answer = (await ask(`  Artist [Enter/k${credit ? '/a' : ''}]: `)).toLowerCase();
    if (answer === '') chosen = discogs;
    else if (answer === 'k') chosen = folder;
    else if (answer === 'a' && credit) chosen = credit;
    else console.log(chalk.dim('  Invalid choice.'));
  }
  artistAnswers.set(key, chosen);
  return chosen;
}

// Asks what to do with the old year when a folder's year changes; the folder name only.
export async function askOldYearBracket(
  layout: AlbumLayout,
  oldYear: string,
  newYear: string,
): Promise<OldYearAnswer | undefined> {
  const key = albumSetKey(layout.artistName, layout.albumFolder);
  if (oldYearAnswers.has(key)) {
    const kept = oldYearAnswers.get(key);
    console.log(chalk.dim(`  Old year: ${describeOldYear(kept)} (as for the other disc of this set)`));
    return kept;
  }
  const renamed = withFolderYear(layout.albumFolder, newYear);
  const current = auxPartOf(layout.albumFolder);
  const preview = (choice: string) => applyOldYear(renamed, oldYearBracket(choice, oldYear));
  console.log(`\n  Year ${oldYear} → ${newYear}. Keep the old year in the folder name?`);
  console.log(`    [Enter] no bracket    → ${preview('')}`);
  console.log(`    l  live               → ${preview('l')}`);
  console.log(`    r  recorded           → ${preview('r')}`);
  console.log(`    c  custom text        → edit ${current ? `"${current}"` : 'a new bracket'}`);
  const choice = (await ask('  Old year [Enter/l/r/c]: ')).trim().toLowerCase();
  // c: the folder's brackets as they are (or the old year), to edit; the result replaces them.
  const answer: OldYearAnswer | undefined =
    choice === 'c'
      ? { mode: 'replace', aux: customAux(await ask('    Brackets: ', current || `[${oldYear}]`)) }
      : oldYearBracket(choice, oldYear);
  oldYearAnswers.set(key, answer);
  return answer;
}

// Renames the album folder and notes it in info.txt's changeset.
export async function renameAlbumFolder(layout: AlbumLayout, newName: string): Promise<void> {
  if (newName === layout.albumFolder) return;
  const oldName = layout.albumFolder;
  const newPath = path.join(path.dirname(layout.albumPath), newName);
  await guardedRename(layout.albumPath, newPath);
  layout.albumPath = newPath;
  layout.albumFolder = newName;
  await noteChange(layout, `folder name was changed from "${oldName}" to "${newName}"`);
}

export async function noteChange(layout: AlbumLayout, change: string): Promise<void> {
  try {
    await appendChangeset(layout.albumPath, change);
  } catch {
    // Non-fatal: the rename itself is done
  }
}

// Folder renames the user said yes to, per album, waiting to run last (see repairAlbum).
// Renaming mid-album would leave later fixes pointing at the old path.
export const pendingFolderRenames = new WeakMap<AlbumLayout, FolderRenamePlan>();

// After Discogs tagging, compare artist/album/year from the release against local
// folder names and ask whether to rename. Returns the plan, or undefined if nothing to do.
export async function askFolderRename(
  layout: AlbumLayout,
  meta: ReturnType<typeof albumMetaFromLayout>,
  release: import('../discogs.js').ReleaseInfo,
  // The artist chosen for folder and tags (chooseArtist()): the folder follows it unasked,
  // or folder and tags would differ.
  artist: string,
): Promise<FolderRenamePlan | undefined> {
  // The artist folder's own brackets ("Dionysos [Canada]") tell same-named artists apart:
  // they are kept, and not compared (Discogs' "Dionysos (3)" comes without its number).
  const { name: localArtist, brackets: artistBrackets } = splitArtistBrackets(layout.artistName);
  const newArtist = `${sanitizeFilename(artist)}${artistBrackets}`;
  const discogsAlbum = release.title;
  const localYear = folderYear(layout.albumFolder);

  // As ARTIST_FOLDER_MISMATCH compares (checks/artist.ts): punctuation counts, so "Kaada, Mike
  // Patton" chosen for folder "Kaada & Mike Patton" renames it, and folder and tags agree.
  const artistMismatch = !sameName(artist, localArtist);
  // The folder's title with its parentheses ("Transformation (The Speed of Love)"): only
  // the year, the disc part and the brackets are left out. Case and punctuation don't count.
  const localTitle = folderTitle(layout.albumFolder);
  const albumMismatch =
    discogsAlbum && normName(discogsAlbum) !== normName(localTitle) && normName(discogsAlbum) !== normName(meta.album);
  // Only correct an existing year prefix; a missing one is MISSING_YEAR_PREFIX's job.
  const yearMismatch = localYear && release.year && localYear !== release.year;

  const artistPlan = artistMismatch ? { artist: newArtist } : {};
  if (artistMismatch) console.log(chalk.dim(`  Artist folder: "${layout.artistName}"  →  "${newArtist}" (as chosen)`));
  if (!albumMismatch && !yearMismatch) return artistMismatch ? artistPlan : undefined;

  console.log(chalk.yellow('\n  Discogs name differs from local folder:'));
  if (albumMismatch) console.log(`    album  : "${localTitle}"  →  "${discogsAlbum}"`);
  if (yearMismatch) console.log(`    year   : ${localYear}  →  ${release.year} (original release)`);

  const answer = await ask('  Rename folder(s) to match Discogs? [y/N] ');
  if (answer.toLowerCase() !== 'y') {
    console.log(chalk.dim('  Skipped rename.'));
    return artistMismatch ? artistPlan : undefined;
  }
  const oldYear = yearMismatch ? await askOldYearBracket(layout, localYear, release.year!) : undefined;
  return {
    ...artistPlan,
    ...(albumMismatch ? { album: discogsAlbum } : {}),
    ...(yearMismatch ? { year: release.year } : {}),
    ...(oldYear ? { oldYear } : {}),
  };
}

// The album folder name a plan leads to: disc part first, then the brackets it had,
// then the old-year bracket.
function plannedAlbumFolder(original: string, plan: FolderRenamePlan): string {
  const folder = plan.aux !== undefined ? withAuxPart(original, plan.aux) : original;
  if (!plan.album && !plan.year) return applyOldYear(folder, plan.oldYear);
  const yearPrefix = plan.year ? `${plan.year} ` : (folder.match(/^(\d{4}\s+)/)?.[1] ?? '');
  const discPart = folder.match(/(\s*\([Dd]isc[^)]+\))/)?.[0] ?? '';
  const auxPart = (folder.match(/\s*\[[^\]]+\]/g) ?? []).join('');
  const renamed = plan.album
    ? `${yearPrefix}${plan.album}${discPart}${auxPart}`.trim()
    : withFolderYear(folder, plan.year!);
  return applyOldYear(renamed, plan.oldYear);
}

// Returns the album's folder after the rename ("Artist/YYYY Title [live 1978]"), for the log.
export async function applyFolderRename(layout: AlbumLayout, plan: FolderRenamePlan): Promise<string> {
  // Rename album folder first (artist rename changes its parent path).
  await renameAlbumFolder(layout, plannedAlbumFolder(layout.albumFolder, plan));

  if (plan.artist && plan.artist !== layout.artistName) await moveToArtist(layout, plan.artist);
  return `${layout.artistName}/${layout.albumFolder}`;
}

// Moves the album to another artist folder (see moveAlbumToArtist): only this album moves;
// the old artist folder goes when it has no albums left. With `letter`, the artist folder is
// under that letter folder ("T/The Beatles" → "B/The Beatles"), and names show the letter.
export async function moveToArtist(layout: AlbumLayout, newArtist: string, letter?: string): Promise<void> {
  const artistsDir = letter ? path.join(path.dirname(path.dirname(path.dirname(layout.albumPath))), letter) : undefined;
  const oldArtist = letter ? `${layout.letterDir}/${layout.artistName}` : layout.artistName;
  if (artistsDir) await fs.mkdir(artistsDir, { recursive: true });
  const move = await moveAlbumToArtist(layout.albumPath, newArtist, artistsDir);
  layout.artistName = path.basename(move.artistDir);
  layout.albumPath = move.albumPath;
  if (letter) layout.letterDir = letter;
  newArtist = letter ? `${letter}/${layout.artistName}` : layout.artistName;
  if (move.oldArtistDir === 'renamed') {
    console.log(chalk.green(`  ✓ Renamed artist folder to ${newArtist}`));
    await noteChange(layout, `artist folder was changed from "${oldArtist}" to "${newArtist}"`);
    return;
  }
  console.log(chalk.green(`  ✓ Moved to ${newArtist}/${layout.albumFolder}`));
  if (move.oldArtistDir === 'kept' && move.albumsLeft.length > 0) {
    const n = move.albumsLeft.length;
    console.log(chalk.dim(`  ${oldArtist}/ still has ${n} album${n !== 1 ? 's' : ''}: kept`));
  }
  if (move.filesMoved.length > 0) console.log(chalk.dim(`  Moved ${move.filesMoved.join(', ')} to ${newArtist}/`));
  if (move.filesKept.length > 0) {
    console.log(chalk.yellow(`  ${oldArtist}/ kept: ${newArtist}/ already has ${move.filesKept.join(', ')}`));
  }
  if (move.oldArtistDir === 'removed') console.log(chalk.dim(`  Removed the empty folder ${oldArtist}/`));
  await noteChange(layout, `album was moved from artist folder "${oldArtist}" to "${newArtist}"`);
}

// ── safe rename ───────────────────────────────────────────────────────────────

async function guardedRename(from: string, to: string): Promise<void> {
  await renameSafely(from, to); // refuses to overwrite; handles case-only renames
  console.log(chalk.green(`  ✓ Renamed to ${path.basename(to)}`));
}
