import { describe, expect, it } from 'vitest';

import type { TrackInfo, TrackTags } from '../types.js';
import { checkDiscNumbers, checkSetReleases, discOfTags } from './discs.js';

const track = (fileName: string, tags: TrackTags): TrackInfo => ({
  filePath: `/x/${fileName}`,
  fileName,
  ext: 'flac',
  tags,
  parsedName: undefined,
});

describe('discOfTags', () => {
  it('reads "n/m", or n with the total in its own tag', () => {
    expect(discOfTags(track('a', { discNumber: '2/1' }))).toEqual({ disc: 2, of: 1 });
    expect(discOfTags(track('a', { discNumber: '2', noOfDiscs: '3' }))).toEqual({ disc: 2, of: 3 });
    expect(discOfTags(track('a', { discNumber: '2' }))).toBeUndefined();
    expect(discOfTags(track('a', {}))).toBeUndefined();
  });
});

describe('checkDiscNumbers', () => {
  it('reports a disc number above the disc count once for the album (Dexter Calling: 2/1)', () => {
    const tracks = [
      track('01 - Soul Sister.flac', { discNumber: '2/1' }),
      track('02 - Modal Mood.flac', { discNumber: '2/1' }),
    ];
    expect(checkDiscNumbers(tracks).map((i) => [i.code, i.message])).toEqual([
      ['DISC_ABOVE_TOTAL', '2 track(s) have a disc number above the disc count (01 - Soul Sister.flac: 2/1)'],
    ]);
  });

  it('is quiet for n ≤ m and for tracks without a disc count', () => {
    expect(checkDiscNumbers([track('a', { discNumber: '2/2' }), track('b', { discNumber: '3' })])).toEqual([]);
  });
});

describe('checkSetReleases', () => {
  const disc = (n: number, releaseId?: string) => ({ disc: n, albumPath: `/x/${n}`, trackCount: 5, releaseId });

  it('reports a disc tagged from another release than the rest of the set', () => {
    // Live In Detroit: disc 1 from r1370987, disc 2 from another release.
    expect(checkSetReleases(2, '999', [disc(1, '1370987')]).map((i) => i.message)).toEqual([
      'This disc is tagged from Discogs release r999, Disc 1 of the set from r1370987',
    ]);
    // Disc 1 itself is right: on a tie the lowest disc's release is the set's.
    expect(checkSetReleases(1, '1370987', [disc(2, '999')])).toEqual([]);
  });

  it('takes the release most of the set has', () => {
    expect(checkSetReleases(1, '5', [disc(2, '7'), disc(3, '7')]).map((i) => i.suggestion)).toEqual([
      'Tag this disc from r7 too',
    ]);
    expect(checkSetReleases(2, '7', [disc(1, '5'), disc(3, '7')])).toEqual([]);
  });

  it('is quiet when the set agrees, or a disc has no release ID', () => {
    expect(checkSetReleases(2, '7', [disc(1, '7')])).toEqual([]);
    expect(checkSetReleases(2, undefined, [disc(1, '7')])).toEqual([]);
    expect(checkSetReleases(2, '7', [disc(1)])).toEqual([]);
  });
});
