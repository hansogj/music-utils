import fs from 'node:fs/promises';
import path from 'node:path';

import type { ReleaseInfo } from './discogs.js';
import type { TrackInfo } from './types.js';

function cleanName(s: string): string {
  return s.replace(/\s*\(\d+\)\s*$/, '').trim();
}

function padCol(s: string, width: number): string {
  return s.length >= width ? s + '  ' : s.padEnd(width);
}

export async function writeInfoTxt(
  albumPath: string,
  release: ReleaseInfo,
  artistName: string,
  disc?: { discNumber: string; noOfDiscs: string },
): Promise<boolean> {
  const artist = release.artists?.[0] ?? artistName;
  const album = release.title ?? '';
  const year = release.year ?? '';

  const lines: string[] = [];
  lines.push([artist, album].filter(Boolean).join(' - ') + (year ? ` (${year})` : ''));
  if (release.releaseYear && release.releaseYear !== year) lines.push(`Reissue: ${release.releaseYear}`);
  if (release.country) lines.push(release.country.toUpperCase());
  lines.push('');

  if (release.tracklist.length > 0) {
    lines.push('Songs');
    for (const track of release.tracklist) {
      const posMatch = track.position.match(/^(?:\d+[-./:])?(\d+)$/);
      const num = posMatch ? parseInt(posMatch[1], 10) : 0;
      const numStr = num ? `${num}.` : `${track.position}.`;
      const composers = (track.extraartists ?? [])
        .filter((a) => /written|compos|music|lyric/i.test(a.role))
        .map((a) => cleanName(a.name))
        .join(', ');
      const parts: string[] = [padCol(numStr, 4), padCol(track.title, 40)];
      if (composers) parts.push(padCol(composers, 24));
      if (track.duration) parts.push(track.duration);
      lines.push(' ' + parts.join(' ').trimEnd());
    }
    lines.push('');
  }

  const personnel = (release.extraartists ?? []).filter((a) => a.name && a.role);
  if (personnel.length > 0) {
    for (const p of personnel) {
      lines.push(`        ${padCol(cleanName(p.name), 32)}${p.role}`);
    }
    lines.push('');
  }

  lines.push(...infoTxtIdLines(release, disc));

  return saveInfoTxt(albumPath, lines.join('\n'));
}

// Fixed `Key: value` lines at the end of info.txt, for scripts.
export function infoTxtIdLines(
  release: Pick<ReleaseInfo, 'releaseId' | 'masterId'>,
  disc?: { discNumber: string; noOfDiscs: string },
): string[] {
  return [
    `Discogs-Release: ${release.releaseId}`,
    ...(release.masterId ? [`Discogs-Master: ${release.masterId}`] : []),
    ...(disc ? [`Disc: ${disc.discNumber}/${disc.noOfDiscs}`] : []),
    '',
  ];
}

export async function writeInfoTxtFromTags(albumPath: string, tracks: TrackInfo[]): Promise<boolean> {
  const sorted = [...tracks].sort((a, b) => {
    const na = parseInt(a.tags.trackNo ?? '0', 10);
    const nb = parseInt(b.tags.trackNo ?? '0', 10);
    return na - nb;
  });

  const first = sorted.find((t) => t.tags.album || t.tags.artist);
  const artist = first?.tags.albumArtist ?? first?.tags.artist ?? '';
  const album = first?.tags.album ?? '';
  const year = first?.tags.year ?? '';

  const lines: string[] = [];
  lines.push([artist, album].filter(Boolean).join(' - ') + (year ? ` (${year})` : ''));
  lines.push('');
  lines.push('Songs');

  for (const t of sorted) {
    const no = t.tags.trackNo ?? '';
    const title = t.tags.title ?? t.parsedName ?? t.fileName;
    lines.push(` ${no ? `${no}. ` : ''}${title}`);
  }
  lines.push('');

  return saveInfoTxt(albumPath, lines.join('\n'));
}

// ── Changeset: what repair changed, at the bottom of info.txt ───────────────

export const CHANGESET_HEADER = '===============Changeset==============';

// The file's own text and its changeset lines.
export function splitChangeset(text: string): { body: string; entries: string[] } {
  const at = text.indexOf(CHANGESET_HEADER);
  if (at < 0) return { body: text, entries: [] };
  const entries = text
    .slice(at + CHANGESET_HEADER.length)
    .split('\n')
    .map((l) => l.trimEnd())
    .filter(Boolean);
  return { body: text.slice(0, at), entries };
}

export function joinChangeset(body: string, entries: string[]): string {
  if (entries.length === 0) return body;
  const text = body.trimEnd();
  return `${text ? `${text}\n\n` : ''}${CHANGESET_HEADER}\n${entries.join('\n')}\n`;
}

async function readInfoTxt(albumPath: string): Promise<string | undefined> {
  return fs.readFile(path.join(albumPath, 'info.txt'), 'utf8').catch(() => undefined);
}

// Writes info.txt only when its text changes: a library mirror copies the file
// again (and rereads the album) whenever its mtime moves. The changeset is kept.
async function saveInfoTxt(albumPath: string, body: string): Promise<boolean> {
  const old = await readInfoTxt(albumPath);
  const text = joinChangeset(body, old !== undefined ? splitChangeset(old).entries : []);
  if (text === old) return false;
  await fs.writeFile(path.join(albumPath, 'info.txt'), text, 'utf8');
  return true;
}

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Adds "[2026-11-12 10:45]: <change>" to the changeset; the rest of the file is left as it is.
export async function appendChangeset(albumPath: string, change: string, now = new Date()): Promise<void> {
  const old = (await readInfoTxt(albumPath)) ?? '';
  const { body, entries } = splitChangeset(old);
  const text = joinChangeset(body, [...entries, `[${stamp(now)}]: ${change}`]);
  await fs.writeFile(path.join(albumPath, 'info.txt'), text, 'utf8');
}
