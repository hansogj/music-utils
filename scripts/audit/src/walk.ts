import fs from 'node:fs/promises';
import path from 'node:path';
import type { AlbumLayout } from './types.js';

// Matches single-character letter/digit/symbol directories used in the [A-Z] layer
const LETTER_DIR_RE = /^[A-Z0-9#!@]$/i;
const MUSIC_EXTENSIONS = new Set(['.flac', '.mp3']);

// Deepest album level searched below --root; generous so --root can sit high above the library.
const MAX_DEPTH = 10;

interface Crawl {
  albums: string[];
  music: boolean; // this dir or anything below it holds music
}

// Post-order crawl, one readdir per directory. A dir with music is an album unless
// its subdirs hold music too — then it's an artist folder with stray loose tracks.
async function crawl(dir: string, depth: number): Promise<Crawl> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const ownMusic = entries.some((e) => e.isFile() && MUSIC_EXTENSIONS.has(path.extname(e.name).toLowerCase()));
  const subDirs =
    depth < MAX_DEPTH
      ? entries
          .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
          .map((e) => e.name)
          .sort()
      : [];
  // Sibling readdirs run in parallel; libuv's threadpool bounds actual concurrency.
  const children = await Promise.all(subDirs.map((d) => crawl(path.join(dir, d), depth + 1)));
  const childMusic = children.some((c) => c.music);
  return {
    albums: ownMusic && !childMusic ? [dir] : children.flatMap((c) => c.albums),
    music: ownMusic || childMusic,
  };
}

// Album = folder with tracks, artist = its parent. The folder above the artist is a
// letter dir when single-char (even above --root, so WRONG_LETTER_DIR still works when
// --root is an artist or album), otherwise a group dir (e.g. country) if inside --root.
function toLayout(root: string, albumPath: string): AlbumLayout {
  const artistPath = path.dirname(albumPath);
  const groupPath = path.dirname(artistPath);
  const groupName = path.basename(groupPath);
  const groupInsideRoot = !path.relative(root, groupPath).startsWith('..') && groupPath !== root;
  return {
    ...(LETTER_DIR_RE.test(groupName) ? { letterDir: groupName } : groupInsideRoot ? { groupDir: groupName } : {}),
    artistName: path.basename(artistPath),
    albumFolder: path.basename(albumPath),
    albumPath,
  };
}

// Works whether --root is an album, an artist, a library root, or a library root with
// a letter/country/other grouping layer above the artists.
export async function walkLibrary(root: string): Promise<AlbumLayout[]> {
  const { albums } = await crawl(root, 0);
  return albums.map((albumPath) => toLayout(root, albumPath));
}

export function albumLocation({ letterDir, groupDir, artistName, albumFolder }: AlbumLayout): string {
  return [letterDir ?? groupDir, artistName, albumFolder].filter(Boolean).join('/');
}

export async function listMusicFiles(dir: string): Promise<{ name: string; ext: 'mp3' | 'flac' }[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && MUSIC_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
    .map((e) => ({ name: e.name, ext: path.extname(e.name).slice(1).toLowerCase() as 'mp3' | 'flac' }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
