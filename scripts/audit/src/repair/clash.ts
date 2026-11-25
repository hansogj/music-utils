import path from 'node:path';

import chalk from 'chalk';

import { type FolderSummary, folderSummary, libraryRootOf, sameAlbum, setAside } from '../clash.js';
import { guardedRename, TargetExistsError } from '../folder-move.js';
import { appendChangeset } from '../info-txt.js';
import type { AlbumLayout } from '../types.js';
import { HOLDING_DIR } from '../walk.js';
import { cleanBracketText, withAuxBracket } from '../year-bracket.js';
import { ask, SetAsideSignal } from './prompt.js';

// An album rename or move onto a folder that is there already: compare the two and keep
// the existing one (this album set aside), replace it (it is set aside), or tell them apart
// with a bracket. Nothing is deleted: set-aside folders go to <library>/_duplicates/….

type Clash = { choice: 'keep' | 'replace' | 'leave' } | { choice: 'bracket'; bracket: string };

const mb = (bytes: number) => `${Math.round(bytes / 1e6)} MB`;
const row = (label: string, a: string, b: string) => `    ${label.padEnd(9)}${a.padEnd(28)}${b}`;

function printClash(name: string, mine: FolderSummary, theirs: FolderSummary): void {
  console.log(chalk.yellow(`\n  ⚠ "${name}" is there already:`));
  console.log(chalk.dim(row('', 'this album', 'the existing one')));
  console.log(
    row('Release', mine.releaseId ? `r${mine.releaseId}` : '–', theirs.releaseId ? `r${theirs.releaseId}` : '–'),
  );
  console.log(row('Master', mine.masterId ? `m${mine.masterId}` : '–', theirs.masterId ? `m${theirs.masterId}` : '–'));
  console.log(row('Tracks', String(mine.tracks), String(theirs.tracks)));
  console.log(row('Size', mb(mine.bytes), mb(theirs.bytes)));
}

// The question. Enter keeps the existing folder when the two are the same album (one master,
// as many tracks), else adds a bracket.
export async function askClash(layout: AlbumLayout, from: string, to: string): Promise<Clash> {
  const [mine, theirs] = await Promise.all([folderSummary(from), folderSummary(to)]);
  const name = path.basename(to);
  const held = path.join(HOLDING_DIR, path.relative(libraryRootOf(layout), from));
  printClash(name, mine, theirs);
  if (sameAlbum(mine, theirs)) console.log(chalk.dim('  The same album, it seems.'));
  console.log(`  [1] Keep "${name}"; set this album aside in ${held}`);
  console.log(`  [2] Replace it: "${name}" is set aside, this album takes its name`);
  console.log(`  [3] Add a bracket to this album's name, to tell them apart`);
  console.log(`  [s] Leave both as they are   [o] Start album over`);
  const fallback = sameAlbum(mine, theirs) ? '1' : '3';
  while (true) {
    const choice = (await ask(`  Choice [${fallback}]: `)).toLowerCase() || fallback;
    if (choice === '1') return { choice: 'keep' };
    if (choice === '2') return { choice: 'replace' };
    if (choice === 's') return { choice: 'leave' };
    if (choice === '3') {
      const bracket = cleanBracketText(await ask('    Bracket: '));
      if (bracket) return { choice: 'bracket', bracket };
    }
    console.log(chalk.dim('  Invalid choice.'));
  }
}

// Sets this album aside: the existing folder stays. Ends the album's repair.
async function setThisAside(layout: AlbumLayout, from: string, existing: string): Promise<never> {
  const heldAt = await setAside(libraryRootOf(layout), from);
  await appendChangeset(heldAt, `set aside: "${existing}" was there already`).catch(() => {});
  console.log(chalk.green(`  ✓ Set aside in ${path.relative(libraryRootOf(layout), heldAt)}`));
  throw new SetAsideSignal(heldAt, existing);
}

// The existing folder goes to the holding folder; this album takes its name.
async function setExistingAside(layout: AlbumLayout, existing: string, from: string): Promise<void> {
  const heldAt = await setAside(libraryRootOf(layout), existing);
  await appendChangeset(heldAt, `set aside: replaced by "${path.basename(from)}"`).catch(() => {});
  console.log(
    chalk.green(`  ✓ "${path.basename(existing)}" set aside in ${path.relative(libraryRootOf(layout), heldAt)}`),
  );
}

/** Renames an album folder; on a clash asks what to do. Returns the path it ended at. */
export async function renameResolvingClash(layout: AlbumLayout, from: string, to: string): Promise<string> {
  let target = to;
  while (true) {
    try {
      await guardedRename(from, target);
      return target;
    } catch (err) {
      if (!(err instanceof TargetExistsError)) throw err;
      const clash = await askClash(layout, from, err.to);
      if (clash.choice === 'leave') throw err;
      if (clash.choice === 'keep') return setThisAside(layout, from, err.to);
      if (clash.choice === 'bracket')
        target = path.join(path.dirname(target), withAuxBracket(path.basename(target), clash.bracket));
      else await setExistingAside(layout, err.to, from);
    }
  }
}

/**
 * Runs an album move (to another artist folder); when the artist folder has an album of
 * that name already, asks as renameResolvingClash() does. A bracket renames this album in
 * place first (`renameInPlace`), then moves it.
 */
export async function moveResolvingClash<T>(
  layout: AlbumLayout,
  move: () => Promise<T>,
  renameInPlace: (newName: string) => Promise<void>,
): Promise<T> {
  while (true) {
    try {
      return await move();
    } catch (err) {
      if (!(err instanceof TargetExistsError) || err.from !== layout.albumPath) throw err;
      const clash = await askClash(layout, err.from, err.to);
      if (clash.choice === 'leave') throw err;
      if (clash.choice === 'keep') return setThisAside(layout, err.from, err.to);
      if (clash.choice === 'bracket') await renameInPlace(withAuxBracket(layout.albumFolder, clash.bracket));
      else await setExistingAside(layout, err.to, err.from);
    }
  }
}
