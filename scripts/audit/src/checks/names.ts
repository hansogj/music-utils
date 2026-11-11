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

export interface ParsedTrackName {
  disc?: number; // from "d2t05"
  no?: number;
  title?: string;
}

// " - " / " – " between the parts of a name ("_" already turned into spaces).
const SEGMENT_SPLIT = /\s+[-–]\s+/;
// A track number part: "05", "d2t05", or one with the title glued on ("05. Title", "05-Title", "05 Title").
const NUMBER_SEGMENT = /^(?:d(\d+)t(\d+)|(\d{1,3}))(?:(?:\s*[-–.]\s*|\s+)(.+))?$/i;

const sameSegment = (a: string, b: string) => normalize(a) === normalize(b);

function segmentsOf(name: string): string[] {
  return name
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(SEGMENT_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);
}

// How many leading parts every name shares, leaving each name at least one part. A part
// is only ever dropped when all of the album's tracks have it: an album "Yes" by Yes may
// well hold a song "Yes". One name alone has nothing to compare with.
function commonLeading(lists: string[][]): number {
  if (lists.length < 2) return 0;
  const max = Math.min(...lists.map((l) => l.length)) - 1;
  let k = 0;
  while (k < max && lists.every((l) => sameSegment(l[k], lists[0][k]))) k++;
  return k;
}

function stripCommon(lists: string[][]): string[][] {
  const k = commonLeading(lists);
  return lists.map((l) => l.slice(k));
}

// Track number and title from each file name of one album, e.g.
// "Yes_-_Madrigal_Mystery_Tour_-_01_-_Opening_-_Siberian_Khatru.mp3" → 1, "Opening - Siberian Khatru"
// (artist and album are on every file, so they go; the title's own " - " stays).
export function parseTrackNames(fileNames: string[]): ParsedTrackName[] {
  const rest = stripCommon(fileNames.map((f) => segmentsOf(path.basename(f, path.extname(f)))));
  const parsed = rest.map((segs) => {
    const m = segs[0]?.match(NUMBER_SEGMENT);
    if (!m) return { titleSegs: segs };
    const titleSegs = [...(m[4] ? [m[4]] : []), ...segs.slice(1)];
    return m[1]
      ? { disc: parseInt(m[1], 10), no: parseInt(m[2], 10), titleSegs }
      : { no: parseInt(m[3], 10), titleSegs };
  });
  // Parts after the number that every track shares ("d1t01 - Beck - Loser").
  const titled = parsed.filter((p) => p.titleSegs.length > 0);
  const k = commonLeading(titled.map((p) => p.titleSegs));
  return parsed.map(({ titleSegs, ...p }) => {
    const title = (titleSegs.length > 0 ? titleSegs.slice(k) : []).join(' - ');
    return { ...p, ...(title ? { title } : {}) };
  });
}

// The title a file name implies, for a name with a track number ("01 - Title").
export function parseNameFromFilename(fileName: string, albumFileNames: string[] = [fileName]): string | undefined {
  const i = albumFileNames.indexOf(fileName);
  const p = parseTrackNames(i >= 0 ? albumFileNames : [fileName])[Math.max(i, 0)];
  return p.no !== undefined ? p.title : undefined;
}

// The disc and track number of each file. When a name has no number, or two names
// share one, every file is numbered by its place in the (sorted) list instead.
export function localNumbering(fileNames: string[], folderDisc = 1): Array<{ disc: number; no: number }> {
  const parsed = parseTrackNames(fileNames).map((p) => ({ disc: p.disc ?? folderDisc, no: p.no }));
  const keys = new Set(parsed.map((p) => `${p.disc}:${p.no}`));
  if (parsed.every((p) => p.no !== undefined) && keys.size === parsed.length)
    return parsed as Array<{ disc: number; no: number }>;
  const order = fileNames
    .map((name, i) => ({ name, i }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const numbers: Array<{ disc: number; no: number }> = [];
  order.forEach(({ i }, rank) => (numbers[i] = { disc: folderDisc, no: rank + 1 }));
  return numbers;
}

// The local titles to compare with a Discogs tracklist, in track order: the TITLE tag
// without the parts every track's title shares, else the name from the file. Titles that
// are the same on every track (a bad earlier retag) say nothing, so the file names are used.
export function matchNames(tracks: Array<Pick<TrackInfo, 'tags' | 'parsedName'>>): string[] {
  const titles = tracks.map((t) => t.tags.title?.trim() ?? '');
  const allSame = tracks.length > 1 && titles.every((t) => t && sameSegment(t, titles[0]));
  const lists = titles.map((t) => (t && !allSame ? t.split(SEGMENT_SPLIT) : []));
  const withTitle = lists.filter((l) => l.length > 0);
  const k = commonLeading(withTitle);
  return tracks.map((t, i) => (lists[i].length > 0 ? lists[i].slice(k).join(' - ') : (t.parsedName ?? '')));
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
      suggestion: `Run "music-utils sync" to rename files to match tags, or re-tag if the tag is wrong`,
    },
  ];
}
