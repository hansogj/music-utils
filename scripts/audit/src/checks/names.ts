import path from 'node:path';
import type { Issue, TrackInfo } from '../types.js';

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[''"`´]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseNameFromFilename(fileName: string): string | undefined {
  const base = path.basename(fileName, path.extname(fileName));

  // Multi-disc: "d1t02 - Track Name" or "d1t02.Track Name"
  const multiDisc = base.match(/^d\d+t\d+[-.\s]+(.+)$/i);
  if (multiDisc) return multiDisc[1].trim();

  // "01 - Track Name" or "1 - Track Name" or "01 – Track Name"
  const dashSep = base.match(/^\d+\s*[-–]\s*(.+)$/);
  if (dashSep) return dashSep[1].trim();

  // "01. Track Name"
  const dotted = base.match(/^\d+\.\s*(.+)$/);
  if (dotted) return dotted[1].trim();

  // "01 Track Name" (number then space then text, but only if clearly a number prefix)
  const spaced = base.match(/^(\d{1,3})\s+(.+)$/);
  if (spaced && spaced[2].length > 1) return spaced[2].trim();

  return undefined;
}

// Strip leading "Artist - " prefix that the multi-disc track format bakes into filenames.
// e.g. "d1t01. Juzz - Das Cabinet" → parsedName "Juzz - Das Cabinet", tag title "Das Cabinet"
function stripArtistPrefix(name: string, artist: string | undefined): string {
  if (!artist) return name;
  const prefix = new RegExp(`^${artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*-\\s*`, 'i');
  return name.replace(prefix, '').trim();
}

export function checkNameTagMatch(track: TrackInfo): Issue[] {
  const { parsedName, tags, fileName } = track;
  if (!parsedName || !tags.title) return [];

  const artist = tags.artist ?? tags.albumArtist;
  const effectiveParsed = stripArtistPrefix(parsedName, artist);

  const normParsed = normalize(effectiveParsed);
  const normTag = normalize(tags.title);

  if (normParsed === normTag) return [];

  return [
    {
      severity: 'MODERATE',
      code: 'NAME_TAG_MISMATCH',
      file: fileName,
      message: `Filename implies "${effectiveParsed}" but TITLE tag is "${tags.title}"`,
      suggestion: `Run music-utils-sync-tracks to rename files to match tags, or re-tag if the tag is wrong`,
    },
  ];
}
