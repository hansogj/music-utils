import { describe, expect, it } from 'vitest';

import type { TrackInfo } from '../types.js';
import { checkDuplicates, likelyExtras } from './duplicates.js';

function track(title: string, fileName = `${title}.flac`): TrackInfo {
  return {
    filePath: `/music/${fileName}`,
    fileName,
    ext: 'flac',
    tags: { title },
    parsedName: title,
  };
}

describe('checkDuplicates', () => {
  it('returns no issues for unique track titles', () => {
    const tracks = [track('Come Together'), track('Something'), track('Octopus Garden')];
    expect(checkDuplicates(tracks)).toHaveLength(0);
  });

  it('returns DUPLICATE_TRACKS for two tracks with the same title', () => {
    const tracks = [track('Loser', '04 - Loser.flac'), track('Loser', '05 - Loser.flac')];
    const issues = checkDuplicates(tracks);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('DUPLICATE_TRACKS');
    expect(issues[0].severity).toBe('MODERATE');
    expect(issues[0].message).toContain('Loser');
  });

  it('does not flag [Live] variant as duplicate', () => {
    const tracks = [track('Loser'), track('Loser [Live]')];
    expect(checkDuplicates(tracks)).toHaveLength(0);
  });

  it('does not flag [Remix] variant as duplicate', () => {
    const tracks = [track('Loser'), track('Loser [Remix]')];
    expect(checkDuplicates(tracks)).toHaveLength(0);
  });

  it('does not flag [Demo] variant as duplicate', () => {
    const tracks = [track('Loser'), track('Loser [Demo]')];
    expect(checkDuplicates(tracks)).toHaveLength(0);
  });

  it('does not flag (Acoustic) variant as duplicate', () => {
    const tracks = [track('Loser'), track('Loser (Acoustic)')];
    expect(checkDuplicates(tracks)).toHaveLength(0);
  });

  it('does not flag (Alternate Take) as duplicate', () => {
    const tracks = [track('Soul Suckin Jerk'), track('Soul Suckin Jerk (Alternate Take)')];
    expect(checkDuplicates(tracks)).toHaveLength(0);
  });

  it('flags the same title with the same qualifier', () => {
    const tracks = [
      track('Soul Suckin Jerk (Live)', '04 - Soul Suckin Jerk.flac'),
      track('Soul Suckin Jerk (live)', '05 - Soul Suckin Jerk.flac'),
      track('Soul Suckin Jerk', '06 - Soul Suckin Jerk.flac'),
    ];
    const issues = checkDuplicates(tracks);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('2×');
  });

  it('Time And A Word: (Original Mix) and (Single Version) bonus tracks are different tracks', () => {
    const names = [
      '01 - No Opportunity Necessary, No Experience Needed.flac',
      '04 - Sweet Dreams.flac',
      '10 - No Opportunity Necessary, No Experience Needed (Original Mix).flac',
      '11 - Sweet Dreams (Original Mix).flac',
      '12 - The Prophet (Single Version).flac',
      '05 - The Prophet.flac',
    ];
    const tracks = names.map((n) => track(n.replace(/^\d+ - |\.flac$/g, ''), n));
    expect(checkDuplicates(tracks)).toEqual([]);
  });

  it('returns no issues for an empty track list', () => {
    expect(checkDuplicates([])).toHaveLength(0);
  });

  it('returns no issues when tracks have no title', () => {
    const tracksNoTitle: TrackInfo[] = [
      { filePath: '/a.flac', fileName: 'a.flac', ext: 'flac', tags: {}, parsedName: undefined },
      { filePath: '/b.flac', fileName: 'b.flac', ext: 'flac', tags: {}, parsedName: undefined },
    ];
    expect(checkDuplicates(tracksNoTitle)).toHaveLength(0);
  });

  it('lists filenames of true duplicates in the message', () => {
    const tracks = [track('Loser', '04 - Loser.flac'), track('Loser', '05 - Loser 2.flac')];
    const issues = checkDuplicates(tracks);
    expect(issues[0].message).toContain('04 - Loser.flac');
    expect(issues[0].message).toContain('05 - Loser 2.flac');
  });

  describe('Art Deco: a stray second rip of two tracks', () => {
    // Tagged from Discogs earlier: the strays got a TITLE tag; a fresh rip has none.
    const numbered = (no: number, title: string): TrackInfo => ({
      filePath: `/m/${no}`,
      fileName: `${String(no).padStart(2, '0')} - ${title}.mp3`,
      ext: 'mp3',
      tags: { title },
      parsedName: title,
    });
    const stray = (title: string, tagged: boolean): TrackInfo => ({
      filePath: `/m/${title}`,
      fileName: `${title}.mp3`,
      ext: 'mp3',
      tags: tagged ? { title } : {},
      parsedName: undefined,
    });
    const album = (tagged: boolean) => [
      numbered(1, 'The Frim-Fram Sauce'),
      numbered(2, 'Other Song'),
      numbered(3, 'April Showers'),
      stray('April Showers', tagged),
      stray('The Frim-Fram Sauce', tagged),
    ];

    it.each([false, true])('one issue per pair, naming the unnumbered file (title tag: %s)', (tagged) => {
      const issues = checkDuplicates(album(tagged));
      expect(issues.map((i) => i.message)).toEqual([
        'Duplicate track name "The Frim-Fram Sauce" appears 2×: 01 - The Frim-Fram Sauce.mp3, The Frim-Fram Sauce.mp3 — likely extra copy: The Frim-Fram Sauce.mp3',
        'Duplicate track name "April Showers" appears 2×: 03 - April Showers.mp3, April Showers.mp3 — likely extra copy: April Showers.mp3',
      ]);
      expect(issues[0].suggestion).toMatch(/Move the extra copy out of the album/);
    });
  });

  it('names no extra copy when both look the same', () => {
    const issues = checkDuplicates([track('Loser', '04 - Loser.flac'), track('Loser', '05 - Loser.flac')]);
    expect(issues[0].message).not.toMatch(/likely extra/);
  });

  it('likelyExtras ranks a missing number above a missing title tag', () => {
    const a = { ...track('X', '01 - X.flac'), tags: {} };
    const b = track('X', 'X.flac');
    expect(likelyExtras([a, b])).toEqual([b]);
  });
});
