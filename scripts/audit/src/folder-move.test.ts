import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { guardedRename, moveAlbumToArtist } from './folder-move.js';

let root: string;

async function make(...paths: string[]): Promise<void> {
  for (const p of paths) {
    const full = path.join(root, p);
    if (p.endsWith('/')) await fs.mkdir(full, { recursive: true });
    else {
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, p);
    }
  }
}

async function tree(dir = root): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const rel = path.relative(root, path.join(dir, e.name));
    out.push(e.isDirectory() ? `${rel}/` : rel);
    if (e.isDirectory()) out.push(...(await tree(path.join(dir, e.name))));
  }
  return out.sort();
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'folder-move-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('guardedRename', () => {
  it('renames, and refuses to overwrite another folder', async () => {
    await make('D/A/', 'D/B/');
    await guardedRename(path.join(root, 'D/A'), path.join(root, 'D/C'));
    await expect(guardedRename(path.join(root, 'D/C'), path.join(root, 'D/B'))).rejects.toThrow(
      /Target already exists: .*D\/B$/,
    );
    expect(await tree()).toEqual(['D/', 'D/B/', 'D/C/']);
  });

  it('renames a folder onto itself under another spelling (a case-insensitive share) via a temporary name', async () => {
    await make('D/1976 Transformation (The Speed of Love)/01.flac');
    // Same entry, other path: what a case-insensitive share reports for "Speed Of Love".
    const from = path.join(root, 'D/1976 Transformation (The Speed of Love)');
    const sameEntryOtherPath = `${root}/D/../D/1976 Transformation (The Speed of Love)`; // not normalised
    await guardedRename(from, sameEntryOtherPath);
    expect(await tree()).toEqual([
      'D/',
      'D/1976 Transformation (The Speed of Love)/',
      'D/1976 Transformation (The Speed of Love)/01.flac',
    ]);
  });
});

describe('moveAlbumToArtist', () => {
  it('moves only this album when the old artist folder has other albums', async () => {
    await make(
      'D/David Sancious/1975 Forest of Feelings/01.flac',
      'D/David Sancious/1976 Transformation/01.flac',
      'D/David Sancious/cover.jpg',
    );
    const move = await moveAlbumToArtist(path.join(root, 'D/David Sancious/1976 Transformation'), 'David Sancious And Tone');
    expect(move).toMatchObject({
      albumPath: path.join(root, 'D/David Sancious And Tone/1976 Transformation'),
      oldArtistDir: 'kept',
      albumsLeft: ['1975 Forest of Feelings'],
      filesMoved: [],
    });
    expect(await tree()).toEqual([
      'D/',
      'D/David Sancious And Tone/',
      'D/David Sancious And Tone/1976 Transformation/',
      'D/David Sancious And Tone/1976 Transformation/01.flac',
      'D/David Sancious/',
      'D/David Sancious/1975 Forest of Feelings/',
      'D/David Sancious/1975 Forest of Feelings/01.flac',
      'D/David Sancious/cover.jpg',
    ]);
  });

  it('takes the cover along and removes the old folder, @eaDir and all, when no album is left', async () => {
    await make(
      'D/Yezda Urfa/1976 Sacred Baboon/01.mp3',
      'D/Yezda Urfa/cover.jpg',
      'D/Yezda Urfa/@eaDir/cover.jpg@SynoEAStream',
      'D/Yezda Urfa/.DS_Store',
    );
    const move = await moveAlbumToArtist(path.join(root, 'D/Yezda Urfa/1976 Sacred Baboon'), 'Yezda Urfa Band');
    expect(move).toMatchObject({ oldArtistDir: 'removed', albumsLeft: [], filesMoved: ['cover.jpg'] });
    expect(await tree()).toEqual([
      'D/',
      'D/Yezda Urfa Band/',
      'D/Yezda Urfa Band/1976 Sacred Baboon/',
      'D/Yezda Urfa Band/1976 Sacred Baboon/01.mp3',
      'D/Yezda Urfa Band/cover.jpg',
    ]);
  });

  it('joins an artist folder that exists, keeping its cover and the old one', async () => {
    await make(
      'D/Wolf/1973 Saturation Point/01.flac',
      'D/Wolf/cover.jpg',
      "D/Darryl Way's Wolf/1973 Canis Lupus/01.flac",
      "D/Darryl Way's Wolf/cover.jpg",
    );
    const move = await moveAlbumToArtist(path.join(root, 'D/Wolf/1973 Saturation Point'), "Darryl Way's Wolf");
    expect(move).toMatchObject({ oldArtistDir: 'kept', albumsLeft: [], filesKept: ['cover.jpg'] });
    expect(await tree()).toEqual([
      'D/',
      "D/Darryl Way's Wolf/",
      "D/Darryl Way's Wolf/1973 Canis Lupus/",
      "D/Darryl Way's Wolf/1973 Canis Lupus/01.flac",
      "D/Darryl Way's Wolf/1973 Saturation Point/",
      "D/Darryl Way's Wolf/1973 Saturation Point/01.flac",
      "D/Darryl Way's Wolf/cover.jpg",
      'D/Wolf/',
      'D/Wolf/cover.jpg',
    ]);
  });

  it('refuses to move onto an album the new artist folder already has', async () => {
    await make('D/Wolf/1973 Saturation Point/01.flac', "D/Darryl Way's Wolf/1973 Saturation Point/01.flac");
    await expect(moveAlbumToArtist(path.join(root, 'D/Wolf/1973 Saturation Point'), "Darryl Way's Wolf")).rejects.toThrow(
      /Target already exists/,
    );
    expect(await tree()).toContain('D/Wolf/1973 Saturation Point/01.flac');
  });

  it('renames the whole folder when only the case changes: the same artist', async () => {
    await make('D/david sancious/1975 Forest of Feelings/01.flac', 'D/david sancious/1976 Transformation/01.flac');
    const move = await moveAlbumToArtist(path.join(root, 'D/david sancious/1976 Transformation'), 'David Sancious');
    expect(move).toMatchObject({
      oldArtistDir: 'renamed',
      albumPath: path.join(root, 'D/David Sancious/1976 Transformation'),
    });
    expect(await tree()).toEqual([
      'D/',
      'D/David Sancious/',
      'D/David Sancious/1975 Forest of Feelings/',
      'D/David Sancious/1975 Forest of Feelings/01.flac',
      'D/David Sancious/1976 Transformation/',
      'D/David Sancious/1976 Transformation/01.flac',
    ]);
  });
});
