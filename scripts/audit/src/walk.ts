import fs from 'node:fs/promises';
import path from 'node:path';
import type { AlbumLayout } from './types.js';

// Matches single-character letter/digit/symbol directories used in the [A-Z] layer
const LETTER_DIR_RE = /^[A-Z0-9#!@]$/i;
const MUSIC_EXTENSIONS = new Set(['.flac', '.mp3']);

async function listDirs(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort();
}

async function hasMusic(dir: string): Promise<boolean> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.some((e) => e.isFile() && MUSIC_EXTENSIONS.has(path.extname(e.name).toLowerCase()));
}

// Heuristic: if ≥80% of top-level subdirectories are single characters, assume letter layer exists.
async function detectLetterLayer(root: string): Promise<boolean> {
  const dirs = await listDirs(root);
  if (dirs.length === 0) return false;
  const letterCount = dirs.filter((d) => LETTER_DIR_RE.test(d)).length;
  return letterCount / dirs.length >= 0.8;
}

export async function walkLibrary(root: string): Promise<AlbumLayout[]> {
  const layouts: AlbumLayout[] = [];
  const hasLetterLayer = await detectLetterLayer(root);

  if (hasLetterLayer) {
    const letterDirs = await listDirs(root);
    for (const letterDir of letterDirs) {
      if (!LETTER_DIR_RE.test(letterDir)) continue;
      const letterPath = path.join(root, letterDir);
      const artistDirs = await listDirs(letterPath);
      for (const artistName of artistDirs) {
        const artistPath = path.join(letterPath, artistName);
        const albumDirs = await listDirs(artistPath);
        for (const albumFolder of albumDirs) {
          const albumPath = path.join(artistPath, albumFolder);
          if (await hasMusic(albumPath)) {
            layouts.push({ letterDir, artistName, albumFolder, albumPath });
          }
        }
      }
    }
  } else {
    const artistDirs = await listDirs(root);
    for (const artistName of artistDirs) {
      const artistPath = path.join(root, artistName);
      const albumDirs = await listDirs(artistPath);
      for (const albumFolder of albumDirs) {
        const albumPath = path.join(artistPath, albumFolder);
        if (await hasMusic(albumPath)) {
          layouts.push({ artistName, albumFolder, albumPath });
        }
      }
    }
  }

  return layouts;
}

export async function listMusicFiles(dir: string): Promise<{ name: string; ext: 'mp3' | 'flac' }[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && MUSIC_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
    .map((e) => ({ name: e.name, ext: path.extname(e.name).slice(1).toLowerCase() as 'mp3' | 'flac' }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
