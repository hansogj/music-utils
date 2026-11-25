import fs from 'node:fs/promises';
import path from 'node:path';

import { exists, guardedRename } from './folder-move.js';
import { readTags } from './tags.js';
import type { AlbumLayout } from './types.js';
import { HOLDING_DIR, listMusicFiles } from './walk.js';

// An album rename or move whose target folder is there already ("1999 The Complete Studio
// Recordings - Demos And Live" → "1999 Essential Rarities", which held the same audio):
// one of the two can be set aside in a holding folder at the library root, keeping its
// path. The scan skips it; the user empties it.

// The library root: above the letter or group folder, else above the artist folder.
export function libraryRootOf(layout: AlbumLayout): string {
  const artistDir = path.dirname(layout.albumPath);
  return layout.letterDir || layout.groupDir ? path.dirname(path.dirname(artistDir)) : path.dirname(artistDir);
}

// Where a folder goes when set aside: the same path under _duplicates, with " (2)", " (3)" …
// when an earlier one is there already.
export async function holdingPath(libraryRoot: string, folder: string): Promise<string> {
  const target = path.join(libraryRoot, HOLDING_DIR, path.relative(libraryRoot, folder));
  for (let n = 2, candidate = target; ; candidate = `${target} (${n++})`) {
    if (!(await exists(candidate))) return candidate;
  }
}

/** Moves a folder into the holding folder; returns where it went. */
export async function setAside(libraryRoot: string, folder: string): Promise<string> {
  const target = await holdingPath(libraryRoot, folder);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await guardedRename(folder, target);
  return target;
}

export interface FolderSummary {
  releaseId?: string;
  masterId?: string;
  tracks: number;
  bytes: number;
}

// What tells two album folders apart: the Discogs release and master (info.txt, else the
// first track's tags), the track count and the size of the audio.
export async function folderSummary(albumPath: string): Promise<FolderSummary> {
  const files = await listMusicFiles(albumPath).catch(() => []);
  const sizes = await Promise.all(files.map((f) => fs.stat(path.join(albumPath, f.name)).then((s) => s.size)));
  const info = await fs.readFile(path.join(albumPath, 'info.txt'), 'utf8').catch(() => '');
  const fromInfo = (key: string) => info.match(new RegExp(`^Discogs-${key}:\\s*(\\d+)\\s*$`, 'm'))?.[1];
  const first = files[0] && (await readTags(path.join(albumPath, files[0].name), files[0].ext)).tags;
  return {
    releaseId: fromInfo('Release') ?? (first?.discogsReleaseId?.trim() || undefined),
    masterId: fromInfo('Master') ?? (first?.discogsMasterId?.trim() || undefined),
    tracks: files.length,
    bytes: sizes.reduce((a, b) => a + b, 0),
  };
}

// The same album in two folders: one Discogs master (or release) and as many tracks.
export function sameAlbum(a: FolderSummary, b: FolderSummary): boolean {
  const sameWork = (!!a.masterId && a.masterId === b.masterId) || (!!a.releaseId && a.releaseId === b.releaseId);
  return sameWork && a.tracks === b.tracks;
}
