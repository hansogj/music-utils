import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Dirent } from 'node:fs';

// Mock must be hoisted before importing the module under test
vi.mock('node:fs/promises');

import { albumLocation, listMusicFiles, walkLibrary } from './walk.js';
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

  it('detects artist-level root (subdirs are album folders with music)', async () => {
    // root = /Music/McCoy Tyner — direct subdirs contain music files
    mockReaddir.mockImplementation((dirPath: string) => {
      const p = String(dirPath);
      if (p === '/Music/McCoy Tyner') return Promise.resolve([dir('2004 Illuminations'), dir('1972 Sahara')]);
      if (p === '/Music/McCoy Tyner/2004 Illuminations') return Promise.resolve([file('01 - Track.flac')]);
      if (p === '/Music/McCoy Tyner/1972 Sahara') return Promise.resolve([file('01 - Sahara.flac')]);
      return Promise.resolve([]);
    });

    const layouts = await walkLibrary('/Music/McCoy Tyner');
    expect(layouts).toHaveLength(2);
    expect(layouts.every((l) => l.artistName === 'McCoy Tyner')).toBe(true);
    expect(layouts.map((l) => l.albumFolder).sort()).toEqual(['1972 Sahara', '2004 Illuminations']);
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

  it('detects group layer (e.g. Country/Artist/Album)', async () => {
    mockReaddir.mockImplementation((dirPath: string) => {
      const p = String(dirPath);
      if (p === '/root') return Promise.resolve([dir('Argentina'), dir('USA')]);
      if (p === '/root/Argentina') return Promise.resolve([dir('Agnus'), dir('Almendra')]);
      if (p === '/root/USA') return Promise.resolve([dir('Yezda Urfa')]);
      if (p === '/root/Argentina/Agnus') return Promise.resolve([dir('1980 Pinturas y Expresiones')]);
      if (p === '/root/Argentina/Almendra') return Promise.resolve([dir('Artwork')]);
      if (p === '/root/USA/Yezda Urfa') return Promise.resolve([dir('1975 Boris'), file('LA.mp3')]);
      if (p === '/root/Argentina/Agnus/1980 Pinturas y Expresiones') return Promise.resolve([file('01 - XXI.mp3')]);
      if (p === '/root/USA/Yezda Urfa/1975 Boris') return Promise.resolve([file('01 - Boris.mp3')]);
      return Promise.resolve([]);
    });

    const layouts = await walkLibrary('/root');
    expect(layouts.map(albumLocation)).toEqual([
      'Argentina/Agnus/1980 Pinturas y Expresiones',
      'USA/Yezda Urfa/1975 Boris',
    ]);
    expect(layouts.every((l) => l.letterDir === undefined)).toBe(true);
    expect(layouts[1]).toMatchObject({ groupDir: 'USA', artistName: 'Yezda Urfa', albumFolder: '1975 Boris' });
  });

  it('does not treat a flat Artist/Album library as grouped', async () => {
    mockReaddir.mockImplementation((dirPath: string) => {
      const p = String(dirPath);
      if (p === '/root') return Promise.resolve([dir('Beck')]);
      if (p === '/root/Beck') return Promise.resolve([dir('1999 Midnite Vultures')]);
      if (p === '/root/Beck/1999 Midnite Vultures') return Promise.resolve([file('01 - Loser.flac'), dir('Scans')]);
      return Promise.resolve([]);
    });

    const layouts = await walkLibrary('/root');
    expect(layouts).toHaveLength(1);
    expect(layouts[0]).toMatchObject({ artistName: 'Beck', albumFolder: '1999 Midnite Vultures' });
    expect(layouts[0].groupDir).toBeUndefined();
  });

  it('keeps the letter dir when --root is an artist folder inside a letter layer', async () => {
    mockReaddir.mockImplementation((dirPath: string) => {
      const p = String(dirPath);
      if (p === '/lib/B/Beck') return Promise.resolve([dir('1999 Midnite Vultures'), file('folder.jpg')]);
      if (p === '/lib/B/Beck/1999 Midnite Vultures') return Promise.resolve([file('01 - Loser.flac')]);
      return Promise.resolve([]);
    });

    const layouts = await walkLibrary('/lib/B/Beck');
    expect(layouts).toEqual([
      {
        letterDir: 'B',
        artistName: 'Beck',
        albumFolder: '1999 Midnite Vultures',
        albumPath: '/lib/B/Beck/1999 Midnite Vultures',
      },
    ]);
  });

  it('treats --root at a single group dir as an Artist/Album library', async () => {
    mockReaddir.mockImplementation((dirPath: string) => {
      const p = String(dirPath);
      if (p === '/music/Argentina') return Promise.resolve([dir('Agnus')]);
      if (p === '/music/Argentina/Agnus') return Promise.resolve([dir('1980 Pinturas')]);
      if (p === '/music/Argentina/Agnus/1980 Pinturas') return Promise.resolve([file('01 - XXI.mp3')]);
      return Promise.resolve([]);
    });

    const layouts = await walkLibrary('/music/Argentina');
    expect(layouts.map(albumLocation)).toEqual(['Agnus/1980 Pinturas']);
    expect(layouts[0].groupDir).toBeUndefined();
  });

  it('finds albums at mixed depths and ignores music-free subfolders like Artwork', async () => {
    mockReaddir.mockImplementation((dirPath: string) => {
      const p = String(dirPath);
      if (p === '/root') return Promise.resolve([dir('Beck'), dir('Norge')]);
      if (p === '/root/Beck') return Promise.resolve([dir('1996 Odelay')]);
      if (p === '/root/Beck/1996 Odelay') return Promise.resolve([file('01 - Devils Haircut.flac'), dir('Artwork')]);
      if (p === '/root/Beck/1996 Odelay/Artwork') return Promise.resolve([file('front.jpg')]);
      if (p === '/root/Norge') return Promise.resolve([dir('Popol Vuh')]);
      if (p === '/root/Norge/Popol Vuh') return Promise.resolve([dir('1973 Quiche Maya')]);
      if (p === '/root/Norge/Popol Vuh/1973 Quiche Maya') return Promise.resolve([file('01 - A.flac')]);
      return Promise.resolve([]);
    });

    const layouts = await walkLibrary('/root');
    expect(layouts.map(albumLocation)).toEqual(['Beck/1996 Odelay', 'Norge/Popol Vuh/1973 Quiche Maya']);
  });

  it('returns empty array when library is empty', async () => {
    mockReaddir.mockResolvedValue([]);
    const layouts = await walkLibrary('/root');
    expect(layouts).toHaveLength(0);
  });
});

describe('albumLocation', () => {
  it('prefixes letter or group dir when present', () => {
    expect(albumLocation({ letterDir: 'B', artistName: 'Beck', albumFolder: 'X', albumPath: '' })).toBe('B/Beck/X');
    expect(albumLocation({ groupDir: 'USA', artistName: 'Beck', albumFolder: 'X', albumPath: '' })).toBe('USA/Beck/X');
    expect(albumLocation({ artistName: 'Beck', albumFolder: 'X', albumPath: '' })).toBe('Beck/X');
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
