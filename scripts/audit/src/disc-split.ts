import type { NumberedTrack } from './discogs.js';
import { scoreTracklist } from './similarity.js';

// Which part of a Discogs release one "(Disc n∕m)" folder holds.

export interface FolderDisc {
  disc: number;
  noOfDiscs: number;
}

const DISC_IN_FOLDER = /\(\s*disc\s+(\d+)\s*[∕/-]\s*(\d+)\s*\)/i;

export function discOfFolder(folder: string): FolderDisc {
  const m = folder.match(DISC_IN_FOLDER);
  return m ? { disc: parseInt(m[1], 10), noOfDiscs: parseInt(m[2], 10) } : { disc: 1, noOfDiscs: 1 };
}

// The album folder name without its year prefix and disc part: the same for every
// disc folder of one album, even when one of them has had its year changed.
export function albumBaseOfFolder(folder: string): string {
  return folder
    .replace(/^\d{4}\s+/, '')
    .replace(DISC_IN_FOLDER, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export interface DiscSliceContext extends FolderDisc {
  localNames: string[]; // titles or parsed file names, in track order ('' when unknown)
  localCount: number;
  // Where this disc starts in the release (0-based), from the track counts of the
  // earlier disc folders. Undefined when one of them is missing.
  expectedFirst?: number;
}

export interface DiscSlice {
  // This disc's tracks. disc/no are the local folder's: no = 1..n within the disc.
  tracks: NumberedTrack[];
  first: number; // 0-based index into the release's tracklist
  total: number; // tracks on the whole release
  // whole: not a disc folder; positions: the release numbers its discs the same way;
  // expected: placed after the earlier disc folders; titles: placed by title match;
  // unknown: no way to tell — ask.
  method: 'whole' | 'positions' | 'expected' | 'titles' | 'unknown';
  score?: number; // title match of the chosen tracks (0..1)
}

// A title match must reach this to place a disc on its own…
export const MIN_TITLE_SCORE = 0.35;
// …and must beat the expected position by more than this to move the disc.
const PREFER_EXPECTED = 0.05;

const usableNames = (names: string[]) => names.some((n) => n.trim());

function scoreOf(names: string[], tracks: NumberedTrack[]): number | undefined {
  return usableNames(names) && tracks.length > 0
    ? scoreTracklist(
        names,
        tracks.map((t) => t.title),
      )
    : undefined;
}

// The localCount tracks from `first`, numbered as this disc's 1..n.
export function windowAt(numbered: NumberedTrack[], first: number, ctx: DiscSliceContext): DiscSlice {
  const tracks = numbered.slice(first, first + ctx.localCount).map((t, i) => ({ ...t, disc: ctx.disc, no: i + 1 }));
  return { tracks, first, total: numbered.length, method: 'expected', score: scoreOf(ctx.localNames, tracks) };
}

export function sliceForDisc(numbered: NumberedTrack[], ctx: DiscSliceContext): DiscSlice {
  const total = numbered.length;
  if (ctx.noOfDiscs <= 1) {
    return { tracks: numbered, first: 0, total, method: 'whole', score: scoreOf(ctx.localNames, numbered) };
  }

  // The release splits into as many discs as there are folders (CD positions 1-1 / 2-1,
  // or numbering that starts again at 1): take this disc's tracks as they are.
  const releaseDiscs = new Set(numbered.map((t) => t.disc)).size;
  if (releaseDiscs === ctx.noOfDiscs) {
    const tracks = numbered.filter((t) => t.disc === ctx.disc);
    const first = Math.max(
      0,
      numbered.findIndex((t) => t.disc === ctx.disc),
    );
    return { tracks, first, total, method: 'positions', score: scoreOf(ctx.localNames, tracks) };
  }

  // No usable disc split (vinyl sides, 1..N straight through, a 3-disc release for two
  // folders): slide a window of this disc's size along the release.
  const lastFirst = Math.max(0, total - ctx.localCount);
  const expected = ctx.expectedFirst !== undefined && ctx.expectedFirst <= lastFirst ? ctx.expectedFirst : undefined;

  let best: DiscSlice | undefined;
  if (usableNames(ctx.localNames)) {
    for (let first = 0; first <= lastFirst; first++) {
      const w = windowAt(numbered, first, ctx);
      if ((w.score ?? 0) > (best?.score ?? -1)) best = w;
    }
  }

  if (best && (best.score ?? 0) >= MIN_TITLE_SCORE) {
    if (expected !== undefined) {
      const atExpected = windowAt(numbered, expected, ctx);
      if ((atExpected.score ?? 0) >= (best.score ?? 0) - PREFER_EXPECTED) return atExpected;
    }
    return { ...best, method: 'titles' };
  }
  if (expected !== undefined) return windowAt(numbered, expected, ctx);
  return { ...windowAt(numbered, 0, ctx), method: 'unknown' };
}

// "tracks 9–13 of 13 (C1 Mood For A Day … Starship Trooper)"
export function describeSlice(slice: DiscSlice): string {
  const { tracks, first, total } = slice;
  if (tracks.length === 0) return `no tracks (release has ${total})`;
  const label = (t: NumberedTrack) => `${t.position ? `${t.position} ` : ''}${t.title}`;
  const range = tracks.length === 1 ? `track ${first + 1}` : `tracks ${first + 1}–${first + tracks.length}`;
  const ends = tracks.length === 1 ? label(tracks[0]) : `${label(tracks[0])} … ${tracks[tracks.length - 1].title}`;
  return `${range} of ${total} (${ends})`;
}
