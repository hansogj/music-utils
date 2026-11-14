import { describe, expect, it } from 'vitest';

import { albumBaseOfFolder, describeSlice, discOfFolder, sliceForDisc, windowAt } from './disc-split.js';
import { flattenTracklist, numberTracklist } from './discogs.js';

const track = (position: string, title: string) => ({ position, title, type_: 'track' });
const index = (title: string, subPositions: string[]) => ({
  position: '',
  title,
  type_: 'index',
  sub_tracks: subPositions.map((p, i) => track(p, `${title} part ${i + 1}`)),
});

// Yes – Yessongs, 3×LP r8270054 as on Discogs: sides A–F, three suites as index entries.
const VINYL = numberTracklist(
  flattenTracklist([
    track('A1', 'Opening (Excerpt From "Firebird Suite")'),
    track('A2', 'Siberian Khatru'),
    track('A3', 'Heart Of The Sunrise'),
    track('B1', 'Perpetual Change'),
    index('And You And I', ['B2a', 'B2b', 'B2c', 'B2d']),
    track('C1', 'Mood For A Day'),
    track('C2', 'Excerpts From The Six Wives Of Henry VIII'),
    track('C3', 'Roundabout'),
    track('D1', 'Your Move'),
    track('D2', "I've Seen All Good People"),
    track('D3', 'Long Distance Runaround'),
    track('D4', 'The Fish'),
    index('Close To The Edge', ['Ea', 'Eb', 'Ec', 'Ed']),
    track('F1', 'Yours Is No Disgrace'),
    index('Starship Trooper', ['F2a', 'F2b', 'F2c']),
  ]),
);
const DISC1 = VINYL.slice(0, 8).map((t) => t.title);
const DISC2 = VINYL.slice(8).map((t) => t.title);

// The 2×CD r3393168 layout, with the same titles.
const CD = numberTracklist(VINYL.map((t, i) => ({ position: i < 8 ? `1-${i + 1}` : `2-${i - 7}`, title: t.title })));

const ctx = (disc: number, localNames: string[], expectedFirst?: number) => ({
  disc,
  noOfDiscs: 2,
  localNames,
  localCount: localNames.length,
  expectedFirst,
});

describe('discOfFolder / albumBaseOfFolder', () => {
  it('reads the disc from the folder name', () => {
    expect(discOfFolder('1973 Yessongs (Disc 2∕2)')).toEqual({ disc: 2, noOfDiscs: 2 });
    expect(discOfFolder('1973 Yessongs (disc 1/3)')).toEqual({ disc: 1, noOfDiscs: 3 });
    expect(discOfFolder('1973 Yessongs')).toEqual({ disc: 1, noOfDiscs: 1 });
  });

  it('gives every disc folder of an album the same base, whatever its year', () => {
    expect(albumBaseOfFolder('1973 Yessongs (Disc 1∕2)')).toBe('yessongs');
    expect(albumBaseOfFolder('1987 Yessongs (Disc 2∕2)')).toBe('yessongs');
    expect(albumBaseOfFolder('1973 Yessongs [remaster] (Disc 2∕2)')).toBe('yessongs [remaster]');
  });
});

describe('sliceForDisc', () => {
  it('index entries count as one track, positioned from their first part', () => {
    expect(VINYL).toHaveLength(15);
    expect(VINYL[4]).toMatchObject({ title: 'And You And I', position: 'B2' });
    expect(VINYL[12]).toMatchObject({ title: 'Close To The Edge', position: 'E' });
  });

  it('uses the whole release for a folder that is not a disc', () => {
    const s = sliceForDisc(VINYL, { ...ctx(1, DISC1), noOfDiscs: 1 });
    expect(s).toMatchObject({ method: 'whole', first: 0, total: 15 });
    expect(s.tracks).toHaveLength(15);
  });

  it('takes the disc as numbered by a CD release (1-x / 2-x)', () => {
    const s = sliceForDisc(CD, ctx(2, DISC2));
    expect(s.method).toBe('positions');
    expect(s.tracks.map((t) => t.title)).toEqual(DISC2);
    expect(s.tracks[0]).toMatchObject({ disc: 2, no: 1, position: '2-1' });
    expect(s.score).toBeGreaterThan(0.9);
  });

  it('takes the disc when plain numbering starts again at 1 (CD1 / CD2 headings)', () => {
    const restarted = numberTracklist(
      VINYL.map((t, i) => ({ position: String(i < 8 ? i + 1 : i - 7), title: t.title })),
    );
    expect(sliceForDisc(restarted, ctx(2, DISC2)).tracks.map((t) => t.title)).toEqual(DISC2);
  });

  it('vinyl sides: disc 2 starts after disc 1 folder, confirmed by titles', () => {
    const s = sliceForDisc(VINYL, ctx(2, DISC2, 8));
    expect(s).toMatchObject({ method: 'expected', first: 8 });
    expect(s.tracks.map((t) => t.title)).toEqual(DISC2);
    expect(s.tracks[0]).toMatchObject({ disc: 2, no: 1, position: 'D1' });
  });

  it('vinyl sides without the other disc folder: placed by titles alone', () => {
    const s = sliceForDisc(VINYL, ctx(2, DISC2));
    expect(s).toMatchObject({ method: 'titles', first: 8 });
  });

  it('titles move a disc away from a wrong expected start', () => {
    const s = sliceForDisc(VINYL, ctx(2, DISC2, 5)); // disc 1 folder has 3 tracks too few
    expect(s).toMatchObject({ method: 'titles', first: 8 });
  });

  it('numbering straight through (1..15): the expected start is used without titles', () => {
    const straight = numberTracklist(VINYL.map((t, i) => ({ position: String(i + 1), title: t.title })));
    const s = sliceForDisc(straight, ctx(2, Array(7).fill(''), 8));
    expect(s).toMatchObject({ method: 'expected', first: 8 });
    expect(s.score).toBeUndefined();
  });

  it('no titles and no other disc folder: unknown', () => {
    expect(sliceForDisc(VINYL, ctx(2, Array(7).fill(''))).method).toBe('unknown');
  });

  it('windowAt renumbers from 1 and describeSlice names the range', () => {
    const s = windowAt(VINYL, 8, ctx(2, DISC2));
    expect(s.tracks.map((t) => t.no)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(describeSlice(s)).toBe('tracks 9–15 of 15 (D1 Your Move … Starship Trooper)');
    expect(describeSlice(windowAt(VINYL, 14, ctx(2, ['x'])))).toBe('track 15 of 15 (F2 Starship Trooper)');
    expect(describeSlice(windowAt(VINYL, 15, ctx(2, ['x'])))).toBe('no tracks (release has 15)');
  });
});
