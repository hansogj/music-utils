import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Dirent } from 'node:fs';

// Mock must be hoisted before importing the module under test
vi.mock('node:fs/promises');

import { walkLibrary, listMusicFiles } from './walk.js';
import * as fsPromises from 'node:fs/promises';

const mockReaddir = vi.mocked(fsPromises.readdir) as unknown as ReturnType<typeof vi.fn>;

function dirent(name: string, isDir: boolean, isFile: boolean): Dirent {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => isFile,
  } as unknown as Dirent;
}

function dir(name: string) {
  return dirent(name, true, false);
}

function file(name: string) {
  return dirent(name, false, true);
}

describe('walkLibrary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('detects letter layer and walks Artist/Album hierarchy', async () => {
    // root: mostly single-letter dirs → letter layer
    // root/B/ → Beck/
    // root/B/Beck/ → 1999 Midnite Vultures/
    // root/B/Beck/1999 Midnite Vultures/ → 01 - Loser.flac
    mockReaddir.mockImplementation((dirPath: string) => {
      const p = String(dirPath);
      if (p === '/root') return Promise.resolve([dir('A'), dir('B'), dir('C')]);
      if (p === '/root/A') return Promise.resolve([]);
      if (p === '/root/B') return Promise.resolve([dir('Beck')]);
      if (p === '/root/C') return Promise.resolve([]);
      if (p === '/root/B/Beck') return Promise.resolve([dir('1999 Midnite Vultures')]);
      if (p === '/root/B/Beck/1999 Midnite Vultures') return Promise.resolve([file('01 - Loser.flac')]);
      return Promise.resolve([]);
    });

    const layouts = await walkLibrary('/root');
    expect(layouts).toHaveLength(1);
    expect(layouts[0].letterDir).toBe('B');
    expect(layouts[0].artistName).toBe('Beck');
    expect(layouts[0].albumFolder).toBe('1999 Midnite Vultures');
  });

  it('detects flat (no letter layer) library structure', async () => {
    // root: artist directories (multi-char names → no letter layer)
    mockReaddir.mockImplementation((dirPath: string) => {
      const p = String(dirPath);
      if (p === '/root') return Promise.resolve([dir('Beatles'), dir('Beck')]);
      if (p === '/root/Beatles') return Promise.resolve([dir('1969 Abbey Road')]);
      if (p === '/root/Beck') return Promise.resolve([dir('1999 Midnite Vultures')]);
      if (p === '/root/Beatles/1969 Abbey Road') return Promise.resolve([file('01 - Come Together.flac')]);
      if (p === '/root/Beck/1999 Midnite Vultures') return Promise.resolve([file('01 - Loser.flac')]);
      return Promise.resolve([]);
    });

    const layouts = await walkLibrary('/root');
    expect(layouts).toHaveLength(2);
    expect(layouts.every((l) => l.letterDir === undefined)).toBe(true);
    expect(layouts.map((l) => l.artistName).sort()).toEqual(['Beatles', 'Beck']);
  });

  it('handles --root pointing directly at an album folder', async () => {
    // /root itself contains music files
    mockReaddir.mockImplementation((dirPath: string) => {
      const p = String(dirPath);
      if (p === '/library/B/Beck/1969 Album') return Promise.resolve([file('01 - Track.flac')]);
      return Promise.resolve([]);
    });

    const layouts = await walkLibrary('/library/B/Beck/1969 Album');
    expect(layouts).toHaveLength(1);
    expect(layouts[0].artistName).toBe('Beck');
    expect(layouts[0].albumFolder).toBe('1969 Album');
    expect(layouts[0].letterDir).toBe('B');
  });

  it('skips hidden directories (starting with .)', async () => {
    mockReaddir.mockImplementation((dirPath: string) => {
      const p = String(dirPath);
      if (p === '/root') return Promise.resolve([dir('A'), dir('.trash')]);
      if (p === '/root/A') return Promise.resolve([dir('Artist')]);
      if (p === '/root/A/Artist') return Promise.resolve([dir('2020 Album')]);
      if (p === '/root/A/Artist/2020 Album') return Promise.resolve([file('01 - Song.flac')]);
      return Promise.resolve([]);
    });

    const layouts = await walkLibrary('/root');
    const artistNames = layouts.map((l) => l.artistName);
    expect(artistNames).not.toContain('.trash');
  });

  it('skips album folders that contain no music files', async () => {
    mockReaddir.mockImplementation((dirPath: string) => {
      const p = String(dirPath);
      if (p === '/root') return Promise.resolve([dir('Artist1'), dir('Artist2')]);
      if (p === '/root/Artist1') return Promise.resolve([dir('2020 Album')]);
      if (p === '/root/Artist2') return Promise.resolve([dir('2021 Empty Album')]);
      if (p === '/root/Artist1/2020 Album') return Promise.resolve([file('01 - Song.flac')]);
      if (p === '/root/Artist2/2021 Empty Album') return Promise.resolve([file('cover.jpg')]);
      return Promise.resolve([]);
    });

    const layouts = await walkLibrary('/root');
    expect(layouts).toHaveLength(1);
    expect(layouts[0].artistName).toBe('Artist1');
  });

  it('returns empty array when library is empty', async () => {
    mockReaddir.mockResolvedValue([]);
    const layouts = await walkLibrary('/root');
    expect(layouts).toHaveLength(0);
  });
});

describe('listMusicFiles', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns only .flac and .mp3 files', async () => {
    mockReaddir.mockResolvedValue([
      file('01 - Track.flac'),
      file('02 - Track.mp3'),
      file('cover.jpg'),
      file('info.txt'),
    ]);

    const files = await listMusicFiles('/album');
    expect(files).toHaveLength(2);
    expect(files.map((f) => f.ext).sort()).toEqual(['flac', 'mp3']);
  });

  it('returns files with correct ext property', async () => {
    mockReaddir.mockResolvedValue([file('01 - Song.FLAC'), file('02 - Song.MP3')]);

    const files = await listMusicFiles('/album');
    expect(files.map((f) => f.ext).sort()).toEqual(['flac', 'mp3']);
  });

  it('returns empty array when no music files exist', async () => {
    mockReaddir.mockResolvedValue([file('cover.jpg'), file('info.txt')]);
    expect(await listMusicFiles('/album')).toHaveLength(0);
  });

  it('sorts files by name', async () => {
    mockReaddir.mockResolvedValue([file('03 - C.flac'), file('01 - A.flac'), file('02 - B.flac')]);

    const files = await listMusicFiles('/album');
    expect(files.map((f) => f.name)).toEqual(['01 - A.flac', '02 - B.flac', '03 - C.flac']);
  });
});
