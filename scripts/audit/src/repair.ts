import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { emitKeypressEvents } from 'node:readline';
import readline from 'node:readline/promises';

import chalk from 'chalk';

import { sortArtist, unsortArtist } from './articles.js';
import { albumArtistOf, commonAlbumArtist, expectedArtistTag } from './checks/artist.js';
import { releaseIdFrom, tracksMissingReleaseId } from './checks/discogs-ids.js';
import { expectedLetter } from './checks/folder.js';
import { localNumbering, matchNames } from './checks/names.js';
import { folderYear, withFolderYear } from './checks/year.js';
import {
  albumRef,
  artistCoverCandidates,
  artistDirOf,
  asJpeg,
  COVER,
  coversIn,
  isImage,
  matchesDiscogs,
  readableImagesIn,
  withoutSolvedCoverIssues,
  writeCover,
} from './cover.js';
import {
  expectedFirstTrack,
  type SiblingDisc,
  siblingDiscs,
  siblingReleaseId,
  siblingWithRelease,
} from './disc-siblings.js';
import { describeSlice, type DiscSlice, type DiscSliceContext, sliceForDisc, windowAt } from './disc-split.js';
import {
  discogsCoverSource,
  type DiscogsRef,
  downloadImage,
  fetchMasterCover,
  fetchRelease,
  fetchReleaseCover,
  type NumberedTrack,
  numberTracklist,
  parseDiscogsRef,
  pickMasterVersion,
  resolveReleaseId,
} from './discogs.js';
import { guardedRename as renameSafely, moveAlbumToArtist } from './folder-move.js';
import { appendChangeset, writeInfoTxt, writeInfoTxtFromPaste } from './info-txt.js';
import { parsePastedTracklist } from './paste.js';
import { LiveProgress, progressBar } from './progress.js';
import { interactive } from './rate-limit.js';
import { checkRenames, pairingProblem, planPairing, sanitizeFilename } from './rename-plan.js';
import { writeTags } from './tag-write.js';
import { termLink } from './term-link.js';
import type { AlbumAudit, AlbumLayout, Issue } from './types.js';
import { albumLocation } from './walk.js';
import {
  albumSetKey,
  applyOldYear,
  auxPartOf,
  customAux,
  describeOldYear,
  type OldYearAnswer,
  oldYearBracket,
  withAuxPart,
} from './year-bracket.js';

// Created lazily on first prompt: an eager readline at import time resumes stdin,
// which keeps non-interactive runs (--json, plain report) alive forever on a TTY.
let rl: readline.Interface | undefined;

function closeRl() {
  rl?.close();
  rl = undefined;
}

// ── prompt ───────────────────────────────────────────────────────────────────

// `prefill` is typed into the input line for the user to edit.
let prompt = async (q: string, prefill?: string): Promise<string> => {
  rl ??= readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = rl.question(q);
  if (prefill) rl.write(prefill);
  return answer;
};

// Lines until an empty one, as pasted: readline's question() would take the first line
// and drop the rest.
let promptLines = (): Promise<string[]> => {
  rl ??= readline.createInterface({ input: process.stdin, output: process.stdout });
  const input = rl;
  return new Promise((resolve) => {
    const lines: string[] = [];
    const onLine = (line: string) => {
      if (line.trim()) return void lines.push(line);
      input.off('line', onLine);
      resolve(lines);
    };
    input.on('line', onLine);
  });
};

// Tests answer prompts through this instead of stdin; pasted lines are answers too, one
// per prompt, ending with ''.
export function setPrompt(fn: (q: string, prefill?: string) => Promise<string>): void {
  prompt = fn;
  promptLines = async () => {
    const lines: string[] = [];
    for (let line = await fn(''); line.trim(); line = await fn('')) lines.push(line);
    return lines;
  };
}

function askLines(): Promise<string[]> {
  return promptLines();
}

// Answering "o" at any prompt while an album is being repaired starts that album over.
class RestartSignal extends Error {
  constructor() {
    super('restart album');
  }
}
let restartable = false;

async function ask(q: string, prefill?: string): Promise<string> {
  const answer = (await prompt(q, prefill)).trim();
  if (restartable && answer.toLowerCase() === 'o') throw new RestartSignal();
  return answer;
}

// ── interactive release picker ────────────────────────────────────────────────

import type { DiscogsSearchResult } from './types.js';

// " (1989, orig. 1970)" for a reissue, " (1970)" otherwise.
function yearLabel(r: DiscogsSearchResult): string {
  if (!r.year) return r.originalYear ? ` (orig. ${r.originalYear})` : '';
  return r.originalYear && r.originalYear !== r.year ? ` (${r.year}, orig. ${r.originalYear})` : ` (${r.year})`;
}

class BackSignal extends Error {
  constructor() {
    super('back');
  }
}

// Returns: selected release ID string, undefined = "enter different ID", null = Esc (go back)
async function pickRelease(results: DiscogsSearchResult[]): Promise<string | null | undefined> {
  if (results.length === 0) return undefined;
  if (!process.stdin.isTTY) return undefined; // non-interactive — fall back to text input

  const bestScore = Math.max(...results.map((x) => x.matchScore ?? -1));

  const items = [
    ...results.map((r) => {
      const yr = yearLabel(r);
      const isBest = r.matchScore !== undefined && r.matchScore === bestScore;
      const score =
        r.matchScore !== undefined
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

  closeRl(); // release readline's stdin listener so raw mode has exclusive access

  process.stdin.setRawMode(true);
  emitKeypressEvents(process.stdin); // assemble escape sequences into named key events
  process.stdout.write('\x1b[?25l'); // hide cursor
  for (const [i, item] of items.entries()) process.stdout.write(renderItem(item, i === idx) + '\n');

  const redraw = () => {
    process.stdout.write(`\x1b[${items.length}A`);
    for (const [i, item] of items.entries()) process.stdout.write(`\x1b[2K${renderItem(item, i === idx)}\n`);
  };

  process.stdout.write(chalk.dim('  Select release (↑↓  Enter  Esc = back to menu):\n'));

  return new Promise<string | null | undefined>((resolve) => {
    let done = false;
    // Ignore any keypress events that fire in the first event-loop tick —
    // they are buffered input from the previous readline prompt, not user intent.
    let ready = false;
    setImmediate(() => {
      ready = true;
    });

    const cleanup = (result: string | null | undefined) => {
      if (done) return;
      done = true;
      process.stdin.off('keypress', onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause(); // hand control back; ask() recreates readline when needed
      process.stdout.write('\x1b[?25h'); // show cursor
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
          cleanup(null); // null = go back to action menu
        }
      } catch (err) {
        cleanup(null);
        console.error(chalk.red(`  picker error: ${err instanceof Error ? err.message : String(err)}`));
      }
    };

    process.stdin.on('keypress', onKey);
    process.stdin.resume(); // 'keypress' is a custom event — resume() is needed to keep stdin flowing
  });
}

// ── parse helpers ─────────────────────────────────────────────────────────────

// Accepts: plain digits, r<id>, [r<id>], full release URLs.
// Rejects master IDs (m<id> / /master/<id>) with a clear message.
function parseReleaseRef(raw: string) {
  const ref = parseDiscogsRef(raw);
  if (!ref)
    console.log(
      chalk.yellow(
        `  ⚠ Unrecognised format. Enter a release ID (4565937, r4565937), a master ID (m1439) or a Discogs URL.`,
      ),
    );
  return ref;
}

// The disc comes from a dNtNN file name, else from the folder ("(Disc 2∕2)" → 2).
function albumMetaFromLayout(layout: AlbumLayout): {
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

async function musicFilesIn(dir: string): Promise<{ name: string; ext: 'flac' | 'mp3' }[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && /\.(flac|mp3)$/i.test(e.name))
    .map((e) => ({ name: e.name, ext: path.extname(e.name).slice(1).toLowerCase() as 'flac' | 'mp3' }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── folder rename helpers ─────────────────────────────────────────────────────

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
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
function planFolderRename(layout: AlbumLayout, plan: FolderRenamePlan): void {
  pendingFolderRenames.set(layout, { ...pendingFolderRenames.get(layout), ...plan });
}

// After a skip: lets the user note what the album is in the folder name, e.g. a bootleg
// Discogs doesn't list: "Artist/1978 Live in Paris [bootleg]". Starts from the folder's
// brackets; Enter leaves them. Returns the new bracket part, or undefined for no change.
// In a disc set whose first other disc has other brackets, offers those instead (askSetAux).
async function askSkipAux(layout: AlbumLayout): Promise<string | undefined> {
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
async function askSetAux(layout: AlbumLayout, other: SiblingDisc): Promise<string | undefined | 'same'> {
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
async function chooseArtist(
  layout: AlbumLayout,
  tracks: AlbumAudit['tracks'],
  release: Pick<import('./discogs.js').ReleaseInfo, 'artists' | 'artistCredit'>,
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
async function askOldYearBracket(
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
async function renameAlbumFolder(layout: AlbumLayout, newName: string): Promise<void> {
  if (newName === layout.albumFolder) return;
  const oldName = layout.albumFolder;
  const newPath = path.join(path.dirname(layout.albumPath), newName);
  await guardedRename(layout.albumPath, newPath);
  layout.albumPath = newPath;
  layout.albumFolder = newName;
  await noteChange(layout, `folder name was changed from "${oldName}" to "${newName}"`);
}

async function noteChange(layout: AlbumLayout, change: string): Promise<void> {
  try {
    await appendChangeset(layout.albumPath, change);
  } catch {
    // Non-fatal: the rename itself is done
  }
}

// Folder renames the user said yes to, per album, waiting to run last (see repairAlbum).
// Renaming mid-album would leave later fixes pointing at the old path.
const pendingFolderRenames = new WeakMap<AlbumLayout, FolderRenamePlan>();

// After Discogs tagging, compare artist/album/year from the release against local
// folder names and ask whether to rename. Returns the plan, or undefined if nothing to do.
async function askFolderRename(
  layout: AlbumLayout,
  meta: ReturnType<typeof albumMetaFromLayout>,
  release: import('./discogs.js').ReleaseInfo,
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

  const artistMismatch = normName(artist) !== normName(localArtist);
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
async function applyFolderRename(layout: AlbumLayout, plan: FolderRenamePlan): Promise<string> {
  // Rename album folder first (artist rename changes its parent path).
  await renameAlbumFolder(layout, plannedAlbumFolder(layout.albumFolder, plan));

  if (plan.artist && plan.artist !== layout.artistName) await moveToArtist(layout, plan.artist);
  return `${layout.artistName}/${layout.albumFolder}`;
}

// Moves the album to another artist folder (see moveAlbumToArtist): only this album moves;
// the old artist folder goes when it has no albums left. With `letter`, the artist folder is
// under that letter folder ("T/The Beatles" → "B/The Beatles"), and names show the letter.
async function moveToArtist(layout: AlbumLayout, newArtist: string, letter?: string): Promise<void> {
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

// ── repair actions ────────────────────────────────────────────────────────────

interface RepairAction {
  label: string;
  // May return what was done, for the repair log, when it differs from the label.
  run: () => Promise<string | void>;
  discogs?: boolean; // the Discogs release tagging action
}

interface SuggestedRelease {
  id: string;
  source: string;
}

// The release the album is already tagged with, when every tagged track agrees.
function taggedReleaseId(audit: AlbumAudit): SuggestedRelease | undefined {
  const ids = new Set(audit.tracks.map((t) => t.tags.discogsReleaseId?.trim()).filter(Boolean));
  return ids.size === 1 ? { id: [...ids][0] as string, source: 'tags' } : undefined;
}

async function discogsActionFor(audit: AlbumAudit, token: string, suggested?: SuggestedRelease): Promise<RepairAction> {
  const meta = albumMetaFromLayout(audit.layout);
  const files = await musicFilesIn(audit.layout.albumPath);
  const siblings = await siblingDiscs(audit.layout);
  return buildDiscogsAction(audit, token, meta, files, siblings, suggested);
}

// Which part of the release this folder is: all of it, or one disc of a split album.
// Asks when the release gives no disc split and the place can't be confirmed by titles.
async function chooseDiscSlice(
  numbered: ReturnType<typeof numberTracklist>,
  ctx: DiscSliceContext & { localTotal?: number },
): Promise<DiscSlice | undefined> {
  let slice = sliceForDisc(numbered, ctx);
  if (slice.method === 'whole') return slice;
  const disc = `Disc ${ctx.disc}∕${ctx.noOfDiscs}`;
  const show = () => {
    const score = slice.score !== undefined ? `, ${Math.round(slice.score * 100)}% title match` : '';
    const how = slice.method === 'positions' ? '' : slice.method === 'titles' ? ' — placed by titles' : '';
    console.log(chalk.cyan(`  ${disc} → release ${describeSlice(slice)}${score}${how}`));
    // Placed by position, not by the release's own disc numbering: show the pairing.
    if (slice.method !== 'positions') {
      slice.tracks.forEach((t, i) =>
        console.log(
          chalk.dim(
            `    ${String(i + 1).padStart(2, '0')} ${ctx.localNames[i] || '?'}  →  ${t.position ? `${t.position} ` : ''}${t.title}`,
          ),
        ),
      );
    }
  };
  if (slice.method === 'positions') {
    show();
    return slice;
  }
  if (ctx.localTotal !== undefined && ctx.localTotal !== slice.total) {
    console.log(
      chalk.yellow(
        `  ⚠ The release has ${slice.total} tracks, your ${ctx.noOfDiscs} disc folders ${ctx.localTotal}: it may split the songs differently`,
      ),
    );
  }
  if (slice.method === 'unknown') {
    console.log(
      chalk.yellow(
        `  ⚠ The release has no disc split, and neither the titles nor the other disc folders tell where ${disc} starts.`,
      ),
    );
  } else {
    show();
  }
  while (true) {
    const again =
      slice.method === 'unknown'
        ? 'n'
        : (await ask('  [Enter] OK   [n] Start at another track: ')).trim().toLowerCase();
    if (again !== 'n') return slice;
    const n = parseInt(await ask(`  ${disc} starts at release track (1–${slice.total}): `), 10);
    if (!(n >= 1 && n <= slice.total)) {
      if (slice.method === 'unknown') return undefined;
      continue;
    }
    slice = windowAt(numbered, n - 1, ctx);
    show();
  }
}

function buildDiscogsAction(
  audit: AlbumAudit,
  token: string,
  meta: ReturnType<typeof albumMetaFromLayout>,
  files: { name: string; ext: 'flac' | 'mp3' }[],
  siblings: SiblingDisc[],
  suggestedRelease?: SuggestedRelease,
): RepairAction {
  // A release the album is known to be (tags, comment, info.txt) beats a search hit:
  // a search can only find editions by title, not the one with these bonus tracks.
  // For a split album, the release the other disc folders were tagged from.
  const fromSiblings = siblingReleaseId(siblings);
  const suggested =
    suggestedRelease ??
    taggedReleaseId(audit) ??
    (fromSiblings ? { id: fromSiblings, source: 'the other disc folder' } : undefined);
  const folderDisc = parseInt(meta.discNumber, 10);
  const noOfDiscs = parseInt(meta.noOfDiscs, 10);
  const topResult = audit.discogsResults?.[0];
  const label = suggested
    ? `Tag from Discogs release ID (suggested: ${suggested.id}, from ${suggested.source})`
    : topResult
      ? `Tag from Discogs release ID (suggested: ${topResult.id} — ${topResult.title}${
          topResult.matchScore !== undefined ? `, ${Math.round(topResult.matchScore * 100)}% match` : ''
        })`
      : 'Tag from Discogs release ID';

  return {
    label,
    discogs: true,
    // interactive(): its Discogs requests go ahead of the background scan's.
    run: () =>
      interactive(async () => {
        const results = audit.discogsResults ?? [];
        // Another disc folder of the set was tagged already: its release first, then its brackets.
        const fromDisc = siblingWithRelease(siblings);
        const sameAsDisc =
          !!fromDisc &&
          (await ask(`    Use the same release ID [r${fromDisc.releaseId}] as Disc ${fromDisc.disc}? [Y/n] `))
            .trim()
            .toLowerCase() !== 'n';
        if (fromDisc && sameAsDisc) {
          const aux = await askSetAux(audit.layout, fromDisc);
          if (aux !== undefined && aux !== 'same') planFolderRename(audit.layout, { aux });
        }
        // After a no, the other disc's release isn't suggested again.
        const declined = fromDisc && !sameAsDisc ? fromDisc.releaseId : undefined;
        const ownId = suggested?.id !== declined ? suggested?.id : undefined;
        const topId = ownId ?? (topResult ? String(topResult.id) : '');

        // Retry loop: re-prompt if the fetch fails (e.g. Discogs 500, bad ID).
        let release: Awaited<ReturnType<typeof fetchRelease>> | undefined;
        let releaseId = sameAsDisc ? fromDisc!.releaseId! : '';
        let prompt = !sameAsDisc;
        while (!release) {
          if (!prompt) prompt = true;
          else {
            const browseHint = results.length > 0 ? '  (b to browse list)' : '';
            const input = (await ask(`    Release ID [${releaseId || topId || 'enter ID'}]${browseHint}: `)).trim();

            if (input === 'b' && results.length > 0) {
              const picked = await pickRelease(results);
              if (picked === null) throw new BackSignal(); // Esc → back to action menu
              if (picked !== undefined) releaseId = picked;
              // undefined = "enter different ID" row selected — fall through to re-prompt
            } else if (input) {
              const ref = parseReleaseRef(input);
              releaseId = ref?.id ?? '';
              if (ref?.type === 'master') {
                try {
                  if (noOfDiscs > 1) {
                    const picked = await pickMasterVersion(ref.id, token, {
                      disc: folderDisc,
                      noOfDiscs,
                      localCount: files.length,
                    });
                    releaseId = picked.releaseId;
                    console.log(chalk.dim(`  Master m${ref.id} → release r${releaseId} (${picked.why})`));
                  } else {
                    releaseId = await resolveReleaseId(ref, token);
                    console.log(chalk.dim(`  Master m${ref.id} → main release r${releaseId}`));
                  }
                } catch (err) {
                  console.log(chalk.red(`  ✗ ${err instanceof Error ? err.message : String(err)}`));
                  releaseId = '';
                  continue;
                }
              }
            } else if (!releaseId) {
              releaseId = topId; // Enter with no input → use suggested ID
            }
            // Enter with existing releaseId (retry after error) → keep it
          }

          if (!releaseId) {
            console.log(chalk.yellow('  Skipped — no release ID'));
            return;
          }

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
        if (tracklist.length === 0) {
          console.log(chalk.yellow('  No tracks found on this release'));
          return;
        }

        // Always the original (master) year and title — a 1989 reissue of a 1970 album is tagged 1970.
        const year = release.year ?? meta.year;
        const album = release.title?.trim() || meta.album;
        if (release.year && release.releaseYear && release.releaseYear !== release.year)
          console.log(
            chalk.dim(
              `  Year: ${release.year} (original, master m${release.masterId}) — this release ${release.releaseYear}`,
            ),
          );
        const genreValue = [...(release.genres ?? []), ...(release.styles ?? [])].slice(0, 4).join(', ');
        const releaseUrl = `https://www.discogs.com/release/${releaseId}`;

        // For a "(Disc n∕m)" folder only that disc's part of the release is used.
        const names = new Map(matchNames(audit.tracks).map((n, i) => [audit.tracks[i].fileName, n]));
        const slice = await chooseDiscSlice(numberTracklist(tracklist), {
          disc: folderDisc,
          noOfDiscs,
          localNames: files.map((f) => names.get(f.name) ?? ''),
          localCount: files.length,
          expectedFirst: expectedFirstTrack(folderDisc, siblings),
          // All disc folders present: their tracks together, to compare with the release.
          localTotal:
            siblings.length === noOfDiscs - 1 ? siblings.reduce((n, s) => n + s.trackCount, files.length) : undefined,
        });
        if (!slice) {
          console.log(chalk.dim('  Skipped.'));
          return;
        }
        const discTracks = slice.tracks;
        const artist = await chooseArtist(audit.layout, audit.tracks, release);
        // Tags and info.txt get the folder's brackets too ("Dionysos [Canada]"): same-named
        // artists stay apart in a player, as they do in the folders.
        const fullArtist = `${artist}${splitArtistBrackets(audit.layout.artistName).brackets}`;
        const tagged = await tagFromTracklist(audit, files, names, discTracks, {
          folderDisc,
          countWarning: (extra) => {
            const what = slice.method === 'whole' ? 'Discogs has' : `Disc ${folderDisc} on Discogs has`;
            return extra > 0
              ? `${what} ${extra} more track(s) — may be a bonus edition`
              : `${what} ${-extra} fewer track(s) — may be a different pressing`;
          },
          tags: ({ no, disc, total, title }) => ({
            // As music-utils tags it: "Beatles, The" with artist.sortArticles on.
            ARTIST: sortArtist(fullArtist),
            ALBUMARTIST: sortArtist(fullArtist),
            ALBUM: album,
            TRACKNUMBER: `${no}/${total}`,
            DISCNUMBER: `${disc}/${meta.noOfDiscs}`,
            ...(year ? { DATE: year, ORIGINALDATE: year } : {}),
            ...(title ? { TITLE: title } : {}),
            ...(genreValue ? { GENRE: genreValue } : {}),
            COMMENT: releaseUrl,
            DISCOGS_RELEASE_ID: releaseId,
            // Same across pressings (FLAC rip vs mp3 copy); empty clears a stale one.
            DISCOGS_MASTER_ID: release.masterId ? String(release.masterId) : '',
          }),
        });
        if (!tagged) return;
        // ── write info.txt ─────────────────────────────────────────────────
        try {
          const written = await writeInfoTxt(audit.layout.albumPath, release, fullArtist, {
            discNumber: meta.discNumber,
            noOfDiscs: meta.noOfDiscs,
          });
          console.log(chalk.dim(written ? '  ✓ info.txt written' : '  ✓ info.txt unchanged'));
        } catch {
          // Non-fatal — tag write already succeeded
        }

        await offerFileRenames(audit.layout.albumPath, files, tagged, 'Discogs titles');

        // ── ask about folder renames; they run after the album's other fixes ─
        const plan = await askFolderRename(audit.layout, meta, release, artist);
        if (plan) {
          planFolderRename(audit.layout, plan);
          console.log(chalk.dim("  → folder rename runs after this album's other fixes"));
        }
        return `Tagged from Discogs release ${releaseId}`;
      }),
  };
}

type LocalFile = { name: string; ext: 'flac' | 'mp3' };
interface TaggedFiles {
  local: Array<{ disc: number; no: number }>;
  titles: Array<string | undefined>;
}

// Pairs the files with a tracklist (Discogs or pasted) and tags them; undefined when the
// user stops at a warning. `names` are the local titles, for placing unnumbered files.
async function tagFromTracklist(
  audit: AlbumAudit,
  files: LocalFile[],
  names: Map<string, string>,
  tracks: NumberedTrack[],
  opts: {
    folderDisc: number;
    countWarning: (extra: number) => string;
    tags: (t: { no: number; disc: number; total: number; title?: string }) => Record<string, string>;
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
  for (const [i, { name, ext }] of files.entries()) {
    if (isExtra(i)) continue;
    const { no, disc } = local[i];
    const title = titles[i];
    await writeTags(path.join(audit.layout.albumPath, name), ext, opts.tags({ no, disc, total, title }));
    console.log(chalk.green(`  ✓ Tagged ${name}${title ? ` → "${title}"` : ' (no title match)'}`));
  }
  return { local, titles };
}

// Offers to rename the files to "01 - Title", also in a "(Disc n∕m)" folder; "d2t01 - Title"
// only when one folder holds the files of several discs.
async function offerFileRenames(
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
    const safe = sanitizeFilename(title);
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
  const doRename = await ask('  Apply renames? [y/N] ');
  if (doRename.toLowerCase() !== 'y') return;
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
async function tagFromPaste(audit: AlbumAudit): Promise<boolean> {
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
    tags: ({ no, disc, total, title }) => ({
      ARTIST: sortArtist(meta.artist),
      ALBUMARTIST: sortArtist(meta.artist),
      ALBUM: meta.album,
      TRACKNUMBER: `${no}/${total}`,
      DISCNUMBER: `${disc}/${meta.noOfDiscs}`,
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

async function repairActions(issue: Issue, audit: AlbumAudit, token?: string): Promise<RepairAction[]> {
  const { layout } = audit;

  switch (issue.code) {
    // ── SEVERE: rename folder ──────────────────────────────────────────────
    case 'MISSING_YEAR_PREFIX': {
      // Prefer year embedded in folder name, fall back to best Discogs result
      const yearFromFolder = layout.albumFolder.match(/\b(19|20)\d{2}\b/)?.[0];
      const yearFromDiscogs = audit.discogsResults?.[0]?.originalYear ?? audit.discogsResults?.[0]?.year;
      const guessedYear = yearFromFolder ?? yearFromDiscogs;

      const yearActions: RepairAction[] = [];

      if (guessedYear) {
        const newName = `${guessedYear} ${layout.albumFolder}`;
        yearActions.push({
          label: `Rename folder → "${newName}"`,
          run: () => renameAlbumFolder(layout, newName),
        });
      }

      yearActions.push({
        label: `Enter release year manually and rename${guessedYear ? ` (default: ${guessedYear})` : ''}`,
        run: async () => {
          const input = (await ask(`    Year [${guessedYear ?? 'YYYY'}]: `)).trim();
          const year = input || guessedYear;
          if (!year?.match(/^\d{4}$/)) {
            console.log(chalk.yellow('  Skipped — invalid year'));
            return;
          }
          await renameAlbumFolder(layout, `${year} ${layout.albumFolder}`);
        },
      });

      return yearActions;
    }

    case 'WRONG_DISC_SEPARATOR': {
      const newNameMatch = issue.suggestion?.match(/Rename(?: to)?[: ]+"(.+)"/);
      if (!newNameMatch) return [];
      const newName = newNameMatch[1];
      return [{ label: `Rename folder → "${newName}"`, run: () => renameAlbumFolder(layout, newName) }];
    }

    case 'WRONG_AUX_BRACKETS': {
      // Compute the rename directly — the suggestion string is human-readable and not parseable.
      const newName = layout.albumFolder.replace(/\{([^}]+)\}/g, '[$1]');
      return [{ label: `Rename folder → "${newName}"`, run: () => renameAlbumFolder(layout, newName) }];
    }

    // ── SEVERE: move artist to correct letter dir ──────────────────────────
    case 'WRONG_LETTER_DIR': {
      const expected = layout.artistName
        .replace(/^(the|a|an|los|il|la|el|le)\s+/i, '')
        .charAt(0)
        .toUpperCase();
      // Only this album moves, like a Discogs artist change: the artist's other albums are in
      // the scan queue under the old path, and each moves when its own turn comes. An artist
      // folder under the right letter is joined; the old one goes with its last album.
      const root = path.dirname(path.dirname(path.dirname(layout.albumPath))); // above the letter folder
      const letterDir = path.join(root, expected);
      const joins = (await fs.readdir(letterDir).catch(() => [] as string[])).find(
        (n) => n.toLowerCase() === layout.artistName.toLowerCase(),
      );
      const target = `${expected}/${joins ?? layout.artistName}`;
      return [
        {
          label: `Move "${layout.albumFolder}" to ${target}${joins ? ' (joins the folder there)' : ''}`,
          run: () => moveToArtist(layout, layout.artistName, expected),
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

      if (token) actions.push(await discogsActionFor(audit, token));

      // Folder tagging as fallback — no title, but fills artist/album/year/track
      actions.push({
        label: `Tag from folder (${meta.artist} — ${meta.year ?? '?'} ${meta.album}) — title will be empty`,
        run: async () => {
          const local = localNumbering(
            files.map((f) => f.name),
            parseInt(meta.discNumber, 10),
          );
          for (const [i, { name, ext }] of files.entries()) {
            const { no, disc } = local[i];
            const tags: Record<string, string> = {
              ARTIST: sortArtist(meta.artist),
              ALBUMARTIST: sortArtist(meta.artist),
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

    // ── HIGH: reissue year instead of the original (master) year ───────────
    case 'YEAR_NOT_ORIGINAL': {
      const year = audit.originalYear?.year;
      if (!year) return [];
      const files = await musicFilesIn(layout.albumPath);
      const retag = async () => {
        for (const { name, ext } of files) {
          await writeTags(path.join(layout.albumPath, name), ext, { DATE: year, ORIGINALDATE: year });
          console.log(chalk.green(`  ✓ ${name} → ${year}`));
        }
      };
      const local = folderYear(layout.albumFolder);
      if (!local || local === year) return [{ label: `Set DATE/ORIGINALDATE to ${year}`, run: retag }];
      const newName = withFolderYear(layout.albumFolder, year);
      return [
        {
          label: `Set DATE/ORIGINALDATE to ${year} and rename folder → "${newName}"`,
          run: async () => {
            const oldYear = await askOldYearBracket(layout, local, year);
            await retag();
            await renameAlbumFolder(layout, applyOldYear(newName, oldYear));
            return `Set DATE/ORIGINALDATE to ${year} and rename folder → "${layout.albumFolder}"`;
          },
        },
        { label: `Set DATE/ORIGINALDATE to ${year} (keep folder name)`, run: retag },
      ];
    }

    // ── MODERATE: filename/tag mismatch ────────────────────────────────────
    case 'NAME_TAG_MISMATCH': {
      if (!issue.file) return [];
      const track = audit.tracks.find((t) => t.fileName === issue.file);
      if (!track) return [];

      const actions: RepairAction[] = [];

      // Option A: rename file to match tag
      if (track.tags.title) {
        const { no, disc } = localNumbering(audit.tracks.map((t) => t.fileName))[audit.tracks.indexOf(track)];
        const isMultiDisc = /^d\d+t\d+/i.test(track.fileName);
        const ext = path.extname(track.fileName);
        const artistPrefix = track.tags.artist ? ` ${track.tags.artist} - ` : ' ';
        const safeTitle = sanitizeFilename(track.tags.title);
        const newName = isMultiDisc
          ? `d${disc}t${String(no).padStart(2, '0')}.${artistPrefix}${safeTitle}${ext}`
          : `${String(no).padStart(2, '0')} -${artistPrefix}${safeTitle}${ext}`;
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

    // ── HIGH: mp3s that lost DISCOGS_RELEASE_ID (id3v2 kept only one TXXX frame) ──
    case 'MISSING_RELEASE_ID': {
      const affected = tracksMissingReleaseId(audit.tracks);
      const infoTxt = await fs.readFile(path.join(layout.albumPath, 'info.txt'), 'utf8').catch(() => undefined);
      const found = releaseIdFrom(audit.tracks, infoTxt);
      const actions: RepairAction[] = [];
      if (found) {
        const url = `https://www.discogs.com/release/${found.id}`;
        actions.push({
          label: `Write release ID ${found.id} (from ${found.source}) and the Discogs URL comment to ${affected.length} track(s)`,
          run: async () => {
            for (const t of affected) {
              await writeTags(t.filePath, t.ext, { DISCOGS_RELEASE_ID: found.id, COMMENT: url });
              console.log(chalk.green(`  ✓ ${t.fileName}`));
            }
          },
        });
      }
      // Retag the whole album from a release of your choice (the found ID, or another).
      if (token) actions.push(await discogsActionFor(audit, token, found));
      return actions;
    }

    // ── MODERATE: artist folder vs the artist tags ────────────────────────
    case 'ARTIST_TAG_INVERTED':
    case 'ARTIST_FOLDER_MISMATCH': {
      // The folder's name, or "Beatles, The" for "The Beatles" with artist.sortArticles on.
      const folder = expectedArtistTag(layout.artistName);
      const tagged = commonAlbumArtist(audit.tracks);
      const actions: RepairAction[] = [
        {
          label: `Write "${folder}" to the artist tags (ALBUMARTIST; ARTIST where it is empty or the same)`,
          run: async () => {
            for (const t of audit.tracks) {
              const old = albumArtistOf(t);
              const artist = t.tags.artist?.trim();
              // A guest or featured artist on one track keeps its ARTIST.
              const sameArtist = !artist || artist === old || artist === tagged;
              await writeTags(t.filePath, t.ext, { ALBUMARTIST: folder, ...(sameArtist ? { ARTIST: folder } : {}) });
              console.log(chalk.green(`  ✓ ${t.fileName}`));
            }
            await noteChange(layout, `artist tags were changed from "${tagged}" to "${folder}"`);
          },
        },
      ];
      if (issue.code === 'ARTIST_FOLDER_MISMATCH' && tagged) {
        // "/" can't be in a folder name: "A / B" → "A, B", as a joined Discogs credit.
        // Folders keep the article first ("Beatles, The" tags → "The Beatles").
        const target = sanitizeFilename(unsortArtist(tagged).replace(/\s*\/\s*/g, ', '));
        const letterDir = layout.letterDir ?? '';
        const letter = /^[A-Z0-9]$/i.test(letterDir) ? expectedLetter(target) : undefined;
        const otherLetter = letter && letter !== letterDir.toUpperCase() ? letter : undefined;
        actions.push({
          label: `Move the album to artist folder "${otherLetter ? `${otherLetter}/` : ''}${target}" (the tags' name)`,
          run: () => moveToArtist(layout, target, otherLetter),
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

    // ── MODERATE: covers ──────────────────────────────────────────────────
    case 'MISSING_COVER':
    case 'BAD_COVER':
    case 'COVER_MISMATCH':
      return coverActions(issue, audit, token);

    case 'ARTIST_COVER_MISSING': {
      const artistDir = artistDirOf(layout);
      return (await artistCoverCandidates(layout)).map((file) => {
        const from = path.basename(path.dirname(file));
        return {
          label: `Copy ${path.basename(file)} from "${from}" to the artist folder "${path.basename(artistDir)}"`,
          run: async () => {
            const written = await writeCover(artistDir, await asJpeg(file));
            console.log(chalk.green(`  ✓ ${path.basename(artistDir)}/${written.join(', ')} (from "${from}")`));
          },
        };
      });
    }

    default:
      return [];
  }
}

// ── covers ────────────────────────────────────────────────────────────────────

const refName = (ref: DiscogsRef) => `${ref.type} ${ref.type === 'master' ? 'm' : 'r'}${ref.id}`;

// Downloads the Discogs cover (the release's front image, else its master's) into the album
// folder: as `target` (the cover file the issue is about, folder.jpg keeps its name), else cover.jpg.
async function downloadCover(layout: AlbumLayout, ref: DiscogsRef, token: string, target?: string): Promise<string> {
  const image = await interactive(async () =>
    ref.type === 'master' ? fetchMasterCover(Number(ref.id), token) : (await fetchReleaseCover(ref.id, token)).cover,
  );
  if (!image) throw new Error(`Discogs ${refName(ref)} has no images`);
  const name = target ?? COVER;
  await writeCover(layout.albumPath, await downloadImage(image.uri), [name]);
  console.log(chalk.green(`  ✓ ${name} from Discogs ${refName(ref)}`));
  await noteChange(layout, `${name} was ${target ? 'replaced with' : 'set to'} the cover of Discogs ${refName(ref)}`);
  return `${name} from Discogs ${refName(ref)}`;
}

async function coverActions(issue: Issue, audit: AlbumAudit, token?: string): Promise<RepairAction[]> {
  const { layout } = audit;
  const infoTxt = await fs.readFile(path.join(layout.albumPath, 'info.txt'), 'utf8').catch(() => undefined);
  const ref = albumRef(audit.tracks, infoTxt);
  const target = issue.file; // the cover.jpg / folder.jpg the issue is about; none when missing
  const name = target ?? COVER;
  const actions: RepairAction[] = [];
  if (token && ref.releaseId) {
    const r: DiscogsRef = { type: 'release', id: ref.releaseId };
    actions.push({
      label: `Download the cover of Discogs ${refName(r)} as ${name}`,
      run: () => downloadCover(layout, r, token, target),
    });
  }
  if (token && ref.masterId) {
    const m: DiscogsRef = { type: 'master', id: String(ref.masterId) };
    actions.push({
      label: `Download the cover of Discogs ${refName(m)} as ${name}`,
      run: () => downloadCover(layout, m, token, target),
    });
  }
  if (issue.code === 'BAD_COVER' && target) {
    // The folder's other cover file, when that one is a good image.
    for (const other of (await coversIn(layout.albumPath)).filter((c) => c !== target)) {
      const file = path.join(layout.albumPath, other);
      if ((await isImage(file)) === false) continue;
      actions.unshift({
        label: `Replace ${target} with a copy of ${other}`,
        run: async () => {
          await writeCover(layout.albumPath, await fs.readFile(file), [target]);
          console.log(chalk.green(`  ✓ ${target} (from ${other})`));
        },
      });
    }
  }
  if (issue.code !== 'COVER_MISMATCH') {
    // front.jpg and the like: one that is the Discogs cover goes first.
    for (const image of await readableImagesIn(layout.albumPath)) {
      const file = path.join(layout.albumPath, image);
      const isDiscogs = token
        ? await interactive(() => matchesDiscogs(file, ref, discogsCoverSource(token))).catch(() => undefined)
        : undefined;
      const action: RepairAction = {
        label: `Use ${image} as ${name} (a copy)${isDiscogs ? ' — it is the Discogs cover' : ''}`,
        run: async () => {
          await writeCover(layout.albumPath, await asJpeg(file), [name]);
          console.log(chalk.green(`  ✓ ${name} (from ${image})`));
        },
      };
      if (isDiscogs) actions.unshift(action);
      else actions.push(action);
    }
  }
  if (token) {
    const suggested = ref.releaseId
      ? `r${ref.releaseId}`
      : audit.discogsResults?.[0]
        ? `r${audit.discogsResults[0].id}`
        : undefined;
    actions.push({
      label: 'Download the cover of a Discogs release or master you enter',
      run: async () => {
        const input =
          (await ask(`    Release or master ID${suggested ? ` [${suggested}]` : ''}: `)).trim() || suggested || '';
        const entered = parseDiscogsRef(input);
        if (!entered) {
          console.log(chalk.yellow('  Skipped — not a release or master ID'));
          return 'skipped';
        }
        return downloadCover(layout, entered, token, target);
      },
    });
  }
  return actions;
}

// ── album info table ──────────────────────────────────────────────────────────

// Audio formats seen in album folders. Only mp3 and flac are read and checked.
const AUDIO_EXTS = [
  'flac',
  'mp3',
  'wav',
  'aiff',
  'aif',
  'm4a',
  'alac',
  'ape',
  'wv',
  'ogg',
  'opus',
  'dsf',
  'dff',
  'wma',
];
const CHECKED_EXTS = new Set(['flac', 'mp3']);

// The audio files in the folder by format, most first: "FLAC" · "FLAC 5 · MP3 2" ·
// "FLAC 7 · WAV 2 (not checked)". `other` lists formats the audit doesn't read.
export function formatSummary(fileNames: string[]): { checked: string; other: string } {
  const counts = new Map<string, number>();
  for (const name of fileNames) {
    const ext = path.extname(name).slice(1).toLowerCase();
    if (AUDIO_EXTS.includes(ext)) counts.set(ext, (counts.get(ext) ?? 0) + 1);
  }
  const formats = [...counts].sort((a, b) => b[1] - a[1] || AUDIO_EXTS.indexOf(a[0]) - AUDIO_EXTS.indexOf(b[0]));
  const label = ([ext, n]: [string, number]) => `${ext.toUpperCase()}${formats.length > 1 ? ` ${n}` : ''}`;
  const join = (list: Array<[string, number]>) => list.map(label).join(' · ');
  const other = join(formats.filter(([ext]) => !CHECKED_EXTS.has(ext)));
  return { checked: join(formats.filter(([ext]) => CHECKED_EXTS.has(ext))), other: other && `${other} (not checked)` };
}

async function folderFiles(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

function printAlbumTable(audit: AlbumAudit, fileNames: string[]): void {
  const { layout, tracks, discogsResults } = audit;
  const meta = albumMetaFromLayout(layout);

  const taggedTracks = tracks.filter((t) => t.tags.title || t.tags.artist || t.tags.album);
  const missingTitle = tracks.filter((t) => !t.tags.title).length;
  const tagStatus =
    taggedTracks.length === tracks.length
      ? chalk.green(`${tracks.length} / ${tracks.length}`)
      : chalk.yellow(`${taggedTracks.length} / ${tracks.length}`) + chalk.dim(` (${missingTitle} missing title)`);

  // Formats the audit doesn't read in yellow: those files aren't checked or tagged.
  const formats = formatSummary(fileNames);
  const formatCell =
    [formats.checked && chalk.white(formats.checked), formats.other && chalk.yellow(formats.other)]
      .filter(Boolean)
      .join(' · ') || chalk.dim('(no audio files)');
  const rows: [string, string][] = [
    ['Artist', chalk.white(meta.artist)],
    ['Album', chalk.white(meta.album || chalk.dim('(unknown)'))],
    ['Year', meta.year ? chalk.white(meta.year) : chalk.dim('(not in folder name)')],
    ['Disc', chalk.white(`${meta.discNumber} / ${meta.noOfDiscs}`)],
    ['Tracks', tagStatus],
    ['Format', formatCell],
    ['Path', chalk.dim(layout.albumPath)],
  ];

  if (discogsResults && discogsResults.length > 0) {
    rows.push(['', '']);
    rows.push([chalk.bold('Discogs'), '']);
    const bestScore = Math.max(...discogsResults.map((x) => x.matchScore ?? -1));
    for (const r of discogsResults) {
      const yr = yearLabel(r);
      const star = r.matchScore !== undefined && r.matchScore === bestScore ? '★ ' : '  ';
      const score =
        r.matchScore !== undefined
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

export interface RepairEvent {
  ts: string;
  session: string;
  album: string;
  issue: string;
  severity: string;
  action: string;
  result: 'fixed' | 'skipped' | 'failed' | 'no-action';
  error?: string;
}

// ── streaming audit queue ────────────────────────────────────────────────────

export class AuditStream {
  private buffer: AlbumAudit[] = [];
  private waiter?: () => void;
  private closed = false;
  /** Albums scanned so far (`done` of `total` found by the walk); albums to repair found so
   *  far (`found`) and handed out (`taken`, the number of the album being repaired). */
  progress: Required<ScanProgress> = { done: 0, total: 0, found: 0, taken: 0 };

  constructor(total = 0) {
    this.progress.total = total;
  }

  /** One more album scanned (whether or not it has issues). */
  scanned(): void {
    this.progress.done++;
  }

  /** True while nothing is ready and the scan is still running: next() will wait. */
  get waiting(): boolean {
    return this.buffer.length === 0 && !this.closed;
  }

  push(audit: AlbumAudit): void {
    this.progress.found++;
    this.buffer.push(audit);
    this.waiter?.();
    this.waiter = undefined;
  }

  close(): void {
    this.closed = true;
    this.waiter?.();
  }

  async next(): Promise<AlbumAudit | null> {
    while (this.buffer.length === 0 && !this.closed) {
      await new Promise<void>((r) => {
        this.waiter = r;
      });
    }
    const audit = this.buffer.shift();
    if (!audit) return null;
    this.progress.taken++;
    return audit;
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
  restartable = true;
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
    restartable = false;
  }
}

// One pass over the album from its opening table: its issues, then any folder rename
// the user agreed to, last.
// "Scan ▕████░░░░▏ 120/340  35%" while the background scan runs, then the total.
export interface ScanProgress {
  done: number;
  total: number;
  found?: number;
  taken?: number;
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
