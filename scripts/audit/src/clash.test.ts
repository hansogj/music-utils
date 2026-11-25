import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AlbumLayout } from './types.js';

// Each fake track holds its tags as JSON.
vi.mock('./tags.js', () => ({
  readTags: async (filePath: string) => ({ tags: JSON.parse((await fs.readFile(filePath, 'utf8')) || '{}') }),
}));

const { folderSummary, holdingPath, libraryRootOf, sameAlbum, setAside } = await import('./clash.js');
const { walkLibrary } = await import('./walk.js');

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-clash-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function album(rel: string, files: Record<string, string> = {}): Promise<string> {
  const dir = path.join(root, rel);
  await fs.mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) await fs.writeFile(path.join(dir, name), content);
  return dir;
}

const layoutAt = (albumPath: string, extra: Partial<AlbumLayout> = {}): AlbumLayout => ({
  artistName: path.basename(path.dirname(albumPath)),
  albumFolder: path.basename(albumPath),
  albumPath,
  ...extra,
});

describe('libraryRootOf', () => {
  it('is above the letter or group folder, else above the artist folder', () => {
    const albumPath = path.join(root, 'D', 'The Doors', '1999 Essential Rarities');
    expect(libraryRootOf(layoutAt(albumPath, { letterDir: 'D' }))).toBe(root);
    expect(libraryRootOf(layoutAt(albumPath, { groupDir: 'D' }))).toBe(root);
    expect(libraryRootOf(layoutAt(path.join(root, 'The Doors', '1999 X')))).toBe(root);
  });
});

describe('setAside', () => {
  it('moves the folder to _duplicates under the same path, numbering a second one', async () => {
    const first = await album('D/The Doors/1999 Essential Rarities', { 'cover.jpg': '' });
    expect(await holdingPath(root, first)).toBe(path.join(root, '_duplicates/D/The Doors/1999 Essential Rarities'));
    expect(await setAside(root, first)).toBe(path.join(root, '_duplicates/D/The Doors/1999 Essential Rarities'));
    const second = await album('D/The Doors/1999 Essential Rarities');
    expect(await setAside(root, second)).toBe(path.join(root, '_duplicates/D/The Doors/1999 Essential Rarities (2)'));
    await expect(fs.access(first)).rejects.toThrow();
  });

  it('is not part of the library walk', async () => {
    await album('D/The Doors/1999 Essential Rarities', { '01 - Hello.mp3': '{}' });
    await album('_duplicates/D/The Doors/1999 Essential Rarities', { '01 - Hello.mp3': '{}' });
    expect((await walkLibrary(root)).map((l) => l.albumPath)).toEqual([
      path.join(root, 'D/The Doors/1999 Essential Rarities'),
    ]);
  });
});

describe('folderSummary / sameAlbum', () => {
  it('reads release and master from info.txt, else the tags; counts the tracks and their size', async () => {
    const a = await album('a', {
      'info.txt': 'The Doors\n\nDiscogs-Release: 6285267\nDiscogs-Master: 128480\n',
      '01 - Hello.flac': '{}',
      '02 - Moonlight.flac': '{}',
    });
    const b = await album('b', {
      '01 - Hello.flac': JSON.stringify({ discogsReleaseId: '18180730', discogsMasterId: '128480' }),
      '02 - Moonlight.flac': '{}',
    });
    const [sa, sb] = [await folderSummary(a), await folderSummary(b)];
    expect(sa).toEqual({ releaseId: '6285267', masterId: '128480', tracks: 2, bytes: 4 });
    expect(sb).toMatchObject({ releaseId: '18180730', masterId: '128480', tracks: 2 });
    // The Doors: same master, as many tracks, two releases.
    expect(sameAlbum(sa, sb)).toBe(true);
    expect(sameAlbum(sa, { ...sb, tracks: 3 })).toBe(false);
    expect(sameAlbum({ tracks: 2, bytes: 0 }, { tracks: 2, bytes: 0 })).toBe(false); // nothing known
    expect(sameAlbum({ releaseId: '1', tracks: 2, bytes: 0 }, { releaseId: '1', tracks: 2, bytes: 9 })).toBe(true);
  });
});
