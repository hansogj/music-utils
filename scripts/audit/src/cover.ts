import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import { releaseIdFrom } from './checks/discogs-ids.js';
import { siblingDiscs } from './disc-siblings.js';
import type { AlbumAudit, AlbumLayout, Issue, TrackInfo } from './types.js';

// cover.jpg in album and artist folders: present, and the cover of the album's Discogs
// release (or its master). Images are compared by a perceptual hash, so a 600px Discogs
// image and a 1400px scan of the same cover match, and another cover doesn't.

export const COVER = 'cover.jpg';
// cover.jpg and folder.jpg both count as the folder's cover; an album folder should keep
// one, cover.jpg (tidyCoverFiles()).
const COVER_FILE = /^(cover|folder)\.jpe?g$/i;
const COVER_NAME = /^cover\.jpe?g$/i;
const FOLDER_NAME = /^folder\.jpe?g$/i;
const IMAGE_FILE = /\.(jpe?g|png|webp)$/i;

/** The folder's cover files (cover.jpg, folder.jpg, any case), cover.jpg first. */
export async function coversIn(dir: string): Promise<string[]> {
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  return names.filter((n) => COVER_FILE.test(n)).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

/** The folder's first cover file, if any. */
export async function coverIn(dir: string): Promise<string | undefined> {
  return (await coversIn(dir))[0];
}

/** The folder's first cover file that is a readable image (or can't be checked). */
export async function readableCoverIn(dir: string): Promise<string | undefined> {
  for (const n of await coversIn(dir)) if ((await isImage(path.join(dir, n))) !== false) return n;
  return undefined;
}

/** Other images that are readable (or can't be checked): candidates for cover.jpg. */
export async function readableImagesIn(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const n of await imagesIn(dir)) if ((await isImage(path.join(dir, n))) !== false) out.push(n);
  return out;
}

/** Other images in the folder (front.jpg, cover.png): candidates for cover.jpg. */
export async function imagesIn(dir: string): Promise<string[]> {
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  return names.filter((n) => IMAGE_FILE.test(n) && !COVER_FILE.test(n) && !n.startsWith('.')).sort();
}

// ── perceptual hash ───────────────────────────────────────────────────────────

function magick(args: string[], input?: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn('magick', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', (d: Buffer) => out.push(d));
    child.stderr.on('data', (d: Buffer) => err.push(d));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve(Buffer.concat(out))
        : reject(new Error(`magick: ${Buffer.concat(err).toString().trim() || `exit ${code}`}`)),
    );
    child.stdin.on('error', () => {}); // magick may exit before reading all input
    child.stdin.end(input);
  });
}

const SIDE = 32; // thumbnail size for the DCT
const LOW = 8; // the 8×8 lowest frequencies make the hash

/**
 * 64-bit perceptual hash (pHash) of a 32×32 grey thumbnail, as 16 hex digits: the 8×8
 * lowest DCT frequencies, each bit set when above their median. Robust to resizing,
 * JPEG noise and small colour changes; flat areas don't make it noisy.
 */
export function pHash(gray: Uint8Array): string {
  const cos = Array.from({ length: LOW }, (_, u) =>
    Array.from({ length: SIDE }, (_, x) => Math.cos(((2 * x + 1) * u * Math.PI) / (2 * SIDE))),
  );
  const coef: number[] = [];
  for (let u = 0; u < LOW; u++) {
    for (let v = 0; v < LOW; v++) {
      let sum = 0;
      for (let y = 0; y < SIDE; y++) for (let x = 0; x < SIDE; x++) sum += gray[y * SIDE + x] * cos[u][y] * cos[v][x];
      coef.push(Math.round(sum * 1e6) / 1e6); // float noise in a flat image is no frequency
    }
  }
  const ac = coef.slice(1); // without the average brightness
  const median = [...ac].sort((a, b) => a - b)[Math.floor(ac.length / 2)];
  let bits = 0n;
  for (const c of coef) bits = (bits << 1n) | (c > median ? 1n : 0n);
  return bits.toString(16).padStart(16, '0');
}

/**
 * The image's pHash. A plain white margin (a scan's border) is trimmed first; the 1px
 * white frame added before trimming keeps the trim from eating into a cover whose own
 * edge is a flat colour.
 */
export async function imageHash(image: string | Buffer): Promise<string> {
  const input = typeof image === 'string' ? `${image}[0]` : '-[0]';
  const gray = await magick(
    [
      input,
      '-auto-orient',
      '-bordercolor',
      'white',
      '-border',
      '1',
      '-fuzz',
      '8%',
      '-trim',
      '+repage',
      '-colorspace',
      'Gray',
      '-resize',
      `${SIDE}x${SIDE}!`,
      '-depth',
      '8',
      'gray:-',
    ],
    typeof image === 'string' ? undefined : image,
  );
  if (gray.length < SIDE * SIDE) throw new Error('magick: unexpected thumbnail size');
  return pHash(gray);
}

export function hashDistance(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  for (; x; x &= x - 1n) n++;
  return n;
}

/**
 * Bits (of 64) two hashes may differ by and still be the same cover. Measured on 23 albums
 * against their Discogs release: the same cover scored 2–16 (16: faded colours, or a scan
 * with the obi strip), different covers 20 and up (median 32).
 */
export const SAME_COVER = 16;

/** False when the file can't be read as an image (a saved web page named folder.jpg);
 *  undefined when there's no ImageMagick to tell. */
export async function isImage(file: string): Promise<boolean | undefined> {
  try {
    await magick([`${file}[0]`, '-format', '%m', 'info:']);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ENOENT' ? undefined : false;
  }
}

// ── checks ────────────────────────────────────────────────────────────────────

/** Discogs cover hashes, supplied by the caller (discogsCoverSource() in discogs.ts). */
export interface CoverSource {
  release(releaseId: string): Promise<{ hash?: string; masterId?: number }>;
  master(masterId: number): Promise<string | undefined>;
}

export interface AlbumRef {
  releaseId?: string;
  masterId?: number;
}

/** The release (and master) the album was tagged from: tags, else the comment URL or info.txt. */
export function albumRef(tracks: TrackInfo[], infoTxt?: string): AlbumRef {
  const releaseId =
    tracks.map((t) => t.tags.discogsReleaseId?.trim()).find(Boolean) ?? releaseIdFrom(tracks, infoTxt)?.id;
  const master = tracks.map((t) => t.tags.discogsMasterId?.trim()).find(Boolean);
  return {
    ...(releaseId ? { releaseId } : {}),
    ...(master && /^\d+$/.test(master) ? { masterId: Number(master) } : {}),
  };
}

export const artistDirOf = (layout: AlbumLayout) => path.dirname(layout.albumPath);

/** True when the local cover is the release's cover or its master's. Undefined: nothing to compare with. */
export async function matchesDiscogs(file: string, ref: AlbumRef, source: CoverSource): Promise<boolean | undefined> {
  if (!ref.releaseId && !ref.masterId) return undefined;
  const local = await imageHash(file);
  const release = ref.releaseId ? await source.release(ref.releaseId) : {};
  if (release.hash && hashDistance(local, release.hash) <= SAME_COVER) return true;
  const masterId = ref.masterId ?? release.masterId;
  const master = masterId ? await source.master(masterId) : undefined;
  if (master && hashDistance(local, master) <= SAME_COVER) return true;
  return release.hash || master ? false : undefined;
}

/** True when two files are the same cover (same bytes, or perceptual hashes within SAME_COVER).
 *  Undefined when that can't be told (no ImageMagick, an unreadable file). */
export async function sameImage(a: string, b: string): Promise<boolean | undefined> {
  const [ba, bb] = await Promise.all([fs.readFile(a), fs.readFile(b)]);
  if (ba.equals(bb)) return true;
  try {
    return hashDistance(await imageHash(a), await imageHash(b)) <= SAME_COVER;
  } catch {
    return undefined;
  }
}

/** The album folder's cover.jpg and folder.jpg (any case, .jpeg too), when there. */
export async function coverAndFolderIn(dir: string): Promise<{ cover?: string; folder?: string }> {
  const names = await coversIn(dir);
  return { cover: names.find((n) => COVER_NAME.test(n)), folder: names.find((n) => FOLDER_NAME.test(n)) };
}

/**
 * One cover file per album folder (repair mode, before the checks): a folder.jpg on its own
 * is renamed to cover.jpg; one that is the same image as cover.jpg is removed. Two different
 * images are left for COVER_FILES_DIFFER to ask about. Returns what changed, for info.txt.
 */
export async function tidyCoverFiles(dir: string): Promise<string[]> {
  const { cover, folder } = await coverAndFolderIn(dir);
  if (!folder) return [];
  if (!cover) {
    await fs.rename(path.join(dir, folder), path.join(dir, COVER));
    return [`${folder} renamed to ${COVER}`];
  }
  if ((await sameImage(path.join(dir, cover), path.join(dir, folder)).catch(() => undefined)) !== true) return [];
  await fs.rm(path.join(dir, folder));
  return [`${folder} removed: the same image as ${cover}`];
}

/** A cover in another disc folder of the set (lowest disc first), with the release it was tagged from. */
export async function siblingDiscCovers(
  layout: AlbumLayout,
): Promise<Array<{ disc: number; file: string; ref: AlbumRef }>> {
  const out: Array<{ disc: number; file: string; ref: AlbumRef }> = [];
  for (const s of await siblingDiscs(layout)) {
    const name = await readableCoverIn(s.albumPath);
    if (name)
      out.push({
        disc: s.disc,
        file: path.join(s.albumPath, name),
        ref: s.releaseId ? { releaseId: s.releaseId } : {},
      });
  }
  return out;
}

/**
 * A disc folder with no readable cover gets the set's: another disc folder's cover.jpg,
 * copied unasked (repair mode, before the checks) when it is the Discogs cover of this
 * album's release (else the set's). One that isn't, or can't be told, is offered in the
 * MISSING_COVER / BAD_COVER menu instead. Returns what changed, for info.txt.
 */
export async function coverFromSiblingDisc(
  layout: AlbumLayout,
  tracks: TrackInfo[],
  source: CoverSource,
): Promise<string[]> {
  if (await readableCoverIn(layout.albumPath)) return [];
  const infoTxt = await fs.readFile(path.join(layout.albumPath, 'info.txt'), 'utf8').catch(() => undefined);
  const own = albumRef(tracks, infoTxt);
  for (const s of await siblingDiscCovers(layout)) {
    const ref = own.releaseId || own.masterId ? own : s.ref;
    if ((await matchesDiscogs(s.file, ref, source).catch(() => undefined)) !== true) continue;
    await writeCover(layout.albumPath, await asJpeg(s.file), [COVER]);
    return [`${COVER} copied from Disc ${s.disc} (the Discogs cover)`];
  }
  return [];
}

const refLabel = (ref: AlbumRef) =>
  [ref.releaseId && `release r${ref.releaseId}`, ref.masterId && `master m${ref.masterId}`]
    .filter(Boolean)
    .join(' or ');

/**
 * MISSING_COVER: neither cover.jpg nor folder.jpg in the album folder. BAD_COVER: one there
 * isn't an image. FOLDER_JPG: a folder.jpg instead of cover.jpg, or next to the same image
 * as cover.jpg (repair tidies both away before the checks: tidyCoverFiles()).
 * COVER_FILES_DIFFER: cover.jpg and folder.jpg are different images. COVER_MISMATCH: the
 * cover (cover.jpg, else folder.jpg) isn't the cover of the album's Discogs release or
 * master (only with a source; not while the two differ). ARTIST_COVER_MISSING: the artist
 * folder has no readable cover.jpg or folder.jpg.
 */
export async function checkCovers(layout: AlbumLayout, tracks: TrackInfo[], source?: CoverSource): Promise<Issue[]> {
  const issues: Issue[] = [];
  const covers = await coversIn(layout.albumPath);
  if (covers.length === 0) {
    const others = await readableImagesIn(layout.albumPath);
    issues.push({
      severity: 'MODERATE',
      code: 'MISSING_COVER',
      message: 'No cover.jpg or folder.jpg in the album folder',
      ...(others.length ? { suggestion: `Other images: ${others.join(', ')}` } : {}),
    });
  }
  const readable: string[] = [];
  for (const cover of covers) {
    if ((await isImage(path.join(layout.albumPath, cover))) !== false) readable.push(cover);
    else
      issues.push({
        severity: 'MODERATE',
        code: 'BAD_COVER',
        file: cover,
        message: `${cover} can't be read as an image`,
      });
  }
  const { cover, folder } = await coverAndFolderIn(layout.albumPath);
  // The file compared with Discogs: cover.jpg, else folder.jpg.
  let checked: string | undefined = readable[0];
  if (folder && !cover) {
    issues.push({
      severity: 'MODERATE',
      code: 'FOLDER_JPG',
      file: folder,
      message: `${folder} instead of ${COVER}`,
      suggestion: `Repair renames it to ${COVER}`,
    });
  } else if (cover && folder && readable.includes(cover) && readable.includes(folder)) {
    const same = await sameImage(path.join(layout.albumPath, cover), path.join(layout.albumPath, folder));
    if (same === true)
      issues.push({
        severity: 'MODERATE',
        code: 'FOLDER_JPG',
        file: folder,
        message: `${folder} is the same image as ${cover}`,
        suggestion: `Repair removes ${folder}`,
      });
    else if (same === false) {
      issues.push({
        severity: 'MODERATE',
        code: 'COVER_FILES_DIFFER',
        file: folder,
        message: `${cover} and ${folder} are different images`,
      });
      checked = undefined; // the repair keeps one; the re-scan compares that one
    }
  }
  if (source && checked) {
    const infoTxt = await fs.readFile(path.join(layout.albumPath, 'info.txt'), 'utf8').catch(() => undefined);
    const ref = albumRef(tracks, infoTxt);
    try {
      if ((await matchesDiscogs(path.join(layout.albumPath, checked), ref, source)) === false) {
        issues.push({
          severity: 'MODERATE',
          code: 'COVER_MISMATCH',
          file: checked,
          message: `${checked} isn't the cover of Discogs ${refLabel(ref)}`,
        });
      }
    } catch {
      // No magick, Discogs down: nothing to say about the cover.
    }
  }
  if (layout.artistName && !(await readableCoverIn(artistDirOf(layout)))) {
    const bad = await coversIn(artistDirOf(layout));
    issues.push({
      severity: 'MODERATE',
      code: 'ARTIST_COVER_MISSING',
      message: bad.length
        ? `${bad.join(' and ')} in the artist folder "${layout.artistName}" can't be read as an image`
        : `No cover.jpg or folder.jpg in the artist folder "${layout.artistName}"`,
    });
  }
  return issues;
}

/** Drops cover issues another album's repair has solved since the scan (the artist's cover). */
export async function withoutSolvedCoverIssues(audit: AlbumAudit): Promise<Issue[]> {
  const keep: Issue[] = [];
  for (const i of audit.issues) {
    if (i.code === 'ARTIST_COVER_MISSING' && (await readableCoverIn(artistDirOf(audit.layout)))) continue;
    if (i.code === 'MISSING_COVER' && (await coverIn(audit.layout.albumPath))) continue;
    keep.push(i);
  }
  return keep;
}

// ── writes ────────────────────────────────────────────────────────────────────

/**
 * Writes the image (via a temporary file) to `names`; by default to the folder's cover
 * files as they are named (folder.jpg stays folder.jpg), or cover.jpg when it has none.
 * Returns the names written.
 */
export async function writeCover(dir: string, image: Buffer, names?: string[]): Promise<string[]> {
  const targets = names?.length ? names : (await coversIn(dir)).length ? await coversIn(dir) : [COVER];
  for (const name of targets) {
    const tmp = path.join(dir, `.${name}.music-audit-${process.pid}`);
    await fs.writeFile(tmp, image);
    try {
      await fs.rename(tmp, path.join(dir, name));
    } catch (err) {
      await fs.rm(tmp, { force: true });
      throw err;
    }
  }
  return targets;
}

/** Covers in the artist's album folders, this album's first: candidates for the artist's cover.jpg. */
export async function artistCoverCandidates(layout: AlbumLayout, max = 4): Promise<string[]> {
  const artistDir = artistDirOf(layout);
  const own = await readableCoverIn(layout.albumPath);
  const out = own ? [path.join(layout.albumPath, own)] : [];
  const entries = await fs.readdir(artistDir, { withFileTypes: true }).catch(() => []);
  for (const e of entries
    .filter((d) => d.isDirectory() && d.name !== layout.albumFolder)
    .sort((a, b) => a.name.localeCompare(b.name))) {
    if (out.length >= max) break;
    const c = await readableCoverIn(path.join(artistDir, e.name));
    if (c) out.push(path.join(artistDir, e.name, c));
  }
  return out;
}

/** Converts a non-JPEG image to JPEG; a JPEG is returned as it is. */
export async function asJpeg(file: string): Promise<Buffer> {
  return /\.jpe?g$/i.test(file) ? fs.readFile(file) : magick([`${file}[0]`, '-quality', '92', 'jpg:-']);
}
