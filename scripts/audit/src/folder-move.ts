import fs from 'node:fs/promises';
import path from 'node:path';

// Folder renames and moves for repair. All of them refuse to overwrite anything.

// Entries that don't count as content: NAS and OS metadata, rebuilt by whoever made them.
const JUNK = new Set(['@eadir', '.ds_store', 'thumbs.db', 'desktop.ini']);
const isJunk = (name: string) => JUNK.has(name.toLowerCase());

/** True when `a` and `b` are one directory entry: same path, or the same inode reached
 *  under another case on a case-insensitive file system (SMB/CIFS, macOS). */
async function sameEntry(a: string, b: string): Promise<boolean> {
  if (a === b) return true;
  try {
    const [sa, sb] = await Promise.all([fs.stat(a), fs.stat(b)]);
    if (sa.ino !== 0 && sa.ino === sb.ino && sa.dev === sb.dev) return true;
  } catch {
    return false;
  }
  // Some shares report no stable inode: the same path but for case can only be the same entry.
  return path.dirname(a) === path.dirname(b) && path.basename(a).toLowerCase() === path.basename(b).toLowerCase();
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}

/**
 * Renames `from` to `to`, refusing to overwrite anything. A rename that only changes case
 * ("Speed of Love" → "Speed Of Love") goes through a temporary name: on a case-insensitive
 * share the target "exists" already (it is the folder itself) and a direct rename may do
 * nothing.
 */
export async function guardedRename(from: string, to: string): Promise<void> {
  if (from === to) return;
  if (await exists(to)) {
    if (!(await sameEntry(from, to))) throw new Error(`Target already exists: ${to}`);
    const tmp = `${from}.music-audit-${process.pid}`;
    await fs.rename(from, tmp);
    await fs.rename(tmp, to);
    return;
  }
  await fs.rename(from, to);
}

export interface ArtistMove {
  albumPath: string;
  artistDir: string;
  /** What happened to the old artist folder. */
  oldArtistDir: 'renamed' | 'kept' | 'removed';
  /** Other albums left in the old artist folder (when kept). */
  albumsLeft: string[];
  /** Files moved from the old artist folder (cover.jpg and the like). */
  filesMoved: string[];
  /** Files left behind because the new artist folder already has one with that name. */
  filesKept: string[];
}

/**
 * Puts the album under another artist folder. Only this album moves: the old artist folder
 * may hold albums by the artist under the old name (Discogs credits "David Sancious And
 * Tone" for one album, "David Sancious" for the others). The new artist folder is created,
 * or used as it is when it exists. When the old folder has no albums left, its other files
 * (cover.jpg, artist.jpg) follow the album and the old folder is removed, NAS metadata
 * (@eaDir) and all.
 *
 * A change of case only ("david sancious" → "David Sancious") is the same artist: the
 * whole folder is renamed.
 */
export async function moveAlbumToArtist(albumPath: string, newArtist: string): Promise<ArtistMove> {
  const oldArtistDir = path.dirname(albumPath);
  const newArtistDir = path.join(path.dirname(oldArtistDir), newArtist);
  const albumFolder = path.basename(albumPath);
  const result = { albumsLeft: [] as string[], filesMoved: [] as string[], filesKept: [] as string[] };

  if (path.basename(oldArtistDir).toLowerCase() === newArtist.toLowerCase()) {
    await guardedRename(oldArtistDir, newArtistDir);
    return { ...result, albumPath: path.join(newArtistDir, albumFolder), artistDir: newArtistDir, oldArtistDir: 'renamed' };
  }

  await fs.mkdir(newArtistDir, { recursive: true });
  const newAlbumPath = path.join(newArtistDir, albumFolder);
  await guardedRename(albumPath, newAlbumPath);

  const left = (await fs.readdir(oldArtistDir, { withFileTypes: true })).filter((e) => !isJunk(e.name));
  result.albumsLeft = left.filter((e) => e.isDirectory()).map((e) => e.name);
  if (result.albumsLeft.length > 0) {
    return { ...result, albumPath: newAlbumPath, artistDir: newArtistDir, oldArtistDir: 'kept' };
  }

  for (const e of left) {
    const target = path.join(newArtistDir, e.name);
    if (await exists(target)) {
      result.filesKept.push(e.name);
      continue;
    }
    await fs.rename(path.join(oldArtistDir, e.name), target);
    result.filesMoved.push(e.name);
  }
  if (result.filesKept.length > 0) {
    return { ...result, albumPath: newAlbumPath, artistDir: newArtistDir, oldArtistDir: 'kept' };
  }
  for (const name of await fs.readdir(oldArtistDir)) {
    if (isJunk(name)) await fs.rm(path.join(oldArtistDir, name), { recursive: true, force: true });
  }
  await fs.rmdir(oldArtistDir);
  return { ...result, albumPath: newAlbumPath, artistDir: newArtistDir, oldArtistDir: 'removed' };
}
