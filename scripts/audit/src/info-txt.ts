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

export async function writeInfoTxt(albumPath: string, release: ReleaseInfo, artistName: string): Promise<void> {
  const artist = release.artists?.[0] ?? artistName;
  const album = release.title ?? '';
  const year = release.year ?? '';

  const lines: string[] = [];
  lines.push([artist, album].filter(Boolean).join(' - ') + (year ? ` (${year})` : ''));
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

  await fs.writeFile(path.join(albumPath, 'info.txt'), lines.join('\n'), 'utf8');
}

export async function writeInfoTxtFromTags(albumPath: string, tracks: TrackInfo[]): Promise<void> {
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

  await fs.writeFile(path.join(albumPath, 'info.txt'), lines.join('\n'), 'utf8');
}
