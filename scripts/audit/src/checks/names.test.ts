import { describe, expect, it } from 'vitest';

import type { TrackInfo } from '../types.js';
import { checkNameTagMatch, localNumbering, matchNames, parseNameFromFilename, parseTrackNames } from './names.js';

function track(overrides: Partial<TrackInfo> = {}): TrackInfo {
  return {
    filePath: '/music/01 - Loser.flac',
    fileName: '01 - Loser.flac',
    ext: 'flac',
    tags: { title: 'Loser', artist: 'Beck' },
    parsedName: 'Loser',
    ...overrides,
  };
}

describe('parseNameFromFilename', () => {
  it('parses "01 - Song Name.flac"', () => {
    expect(parseNameFromFilename('01 - Song Name.flac')).toBe('Song Name');
  });

  it('parses "1 - Song Name.mp3"', () => {
    expect(parseNameFromFilename('1 - Song Name.mp3')).toBe('Song Name');
  });

  it('parses "01. Song Name.flac"', () => {
    expect(parseNameFromFilename('01. Song Name.flac')).toBe('Song Name');
  });

  it('parses "01 Song Name.flac" (number space text)', () => {
    expect(parseNameFromFilename('01 Song Name.flac')).toBe('Song Name');
  });

  it('parses multi-disc "d1t02 - Artist - Song.flac"', () => {
    expect(parseNameFromFilename('d1t02 - Artist - Song.flac')).toBe('Artist - Song');
  });

  it('parses multi-disc "d2t03. Title.flac"', () => {
    expect(parseNameFromFilename('d2t03. Title.flac')).toBe('Title');
  });

  it('returns undefined when no recognizable prefix', () => {
    expect(parseNameFromFilename('cover.flac')).toBeUndefined();
  });

  it('handles em-dash separator "01 – Song Name.flac"', () => {
    expect(parseNameFromFilename('01 – Song Name.flac')).toBe('Song Name');
  });
});

describe('checkNameTagMatch', () => {
  it('returns no issue when filename name matches tag title', () => {
    expect(checkNameTagMatch(track())).toHaveLength(0);
  });

  it('returns NAME_TAG_MISMATCH when filename and tag differ', () => {
    const issues = checkNameTagMatch(
      track({
        fileName: '03 - Corvette Bummer.flac',
        parsedName: 'Corvette Bummer',
        tags: { title: 'Pay No Mind', artist: 'Beck' },
      }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('NAME_TAG_MISMATCH');
    expect(issues[0].severity).toBe('MODERATE');
    expect(issues[0].message).toContain('Corvette Bummer');
    expect(issues[0].message).toContain('Pay No Mind');
  });

  it('returns no issue when parsedName is undefined', () => {
    expect(checkNameTagMatch(track({ parsedName: undefined }))).toHaveLength(0);
  });

  it('returns no issue when title tag is missing', () => {
    expect(checkNameTagMatch(track({ tags: { artist: 'Beck' } }))).toHaveLength(0);
  });

  it('strips artist prefix in multi-disc format before comparing', () => {
    // File: "d1t01 - Beck - Loser.flac" → parsedName "Beck - Loser"
    // Tag: title "Loser", artist "Beck" → effectiveParsed becomes "Loser"
    const issues = checkNameTagMatch(
      track({
        fileName: 'd1t01 - Beck - Loser.flac',
        parsedName: 'Beck - Loser',
        tags: { title: 'Loser', artist: 'Beck' },
      }),
    );
    expect(issues).toHaveLength(0);
  });

  it('normalizes punctuation differences — apostrophes are ignored', () => {
    const issues = checkNameTagMatch(
      track({
        fileName: "01 - It's Okay.flac",
        parsedName: "It's Okay",
        tags: { title: 'Its Okay', artist: 'Beck' },
      }),
    );
    expect(issues).toHaveLength(0);
  });

  it('includes the filename in the issue', () => {
    const issues = checkNameTagMatch(
      track({
        fileName: '03 - Wrong.flac',
        parsedName: 'Wrong',
        tags: { title: 'Right', artist: 'Beck' },
      }),
    );
    expect(issues[0].file).toBe('03 - Wrong.flac');
  });
});

const MADRIGAL = [
  'Yes_-_Madrigal_Mystery_Tour_-_01_-_Opening_-_Siberian_Khatru.mp3',
  'Yes_-_Madrigal_Mystery_Tour_-_02_-_Heart_Of_The_Sunrise.mp3',
  'Yes_-_Madrigal_Mystery_Tour_-_11_-_Madrigal_-_Clap.mp3',
  'Yes_-_Madrigal_Mystery_Tour_-_17_-_Madrigal.mp3',
];

describe('parseTrackNames — parts every track shares', () => {
  it('drops the artist and album that are on every file, keeps the title’s own " - "', () => {
    expect(parseTrackNames(MADRIGAL)).toEqual([
      { no: 1, title: 'Opening - Siberian Khatru' },
      { no: 2, title: 'Heart Of The Sunrise' },
      { no: 11, title: 'Madrigal - Clap' },
      { no: 17, title: 'Madrigal' }, // part of the album name, but only this track's title
    ]);
  });

  it('Yes by Yes with the song "Yes": only the parts before the number are on every track', () => {
    expect(parseTrackNames(['Yes - Yes - 05 - Yes.mp3', 'Yes - Yes - 06 - Owner.mp3'])).toEqual([
      { no: 5, title: 'Yes' },
      { no: 6, title: 'Owner' },
    ]);
  });

  it('keeps a part only some tracks have', () => {
    expect(parseTrackNames(['01 - Yes - Intro.mp3', '02 - No.mp3'])).toEqual([
      { no: 1, title: 'Yes - Intro' },
      { no: 2, title: 'No' },
    ]);
  });

  it('drops a part after the number that every track has ("d1t01 - Beck - Loser")', () => {
    expect(parseTrackNames(['d1t01 - Beck - Loser.flac', 'd1t02 - Beck - Pay No Mind.flac'])).toEqual([
      { disc: 1, no: 1, title: 'Loser' },
      { disc: 1, no: 2, title: 'Pay No Mind' },
    ]);
  });

  it('strips nothing from a single file', () => {
    expect(parseTrackNames(['Yes - Yes - 05 - Yes.mp3'])).toEqual([{ title: 'Yes - Yes - 05 - Yes' }]);
    expect(parseTrackNames(['d1t02 - Artist - Song.flac'])).toEqual([{ disc: 1, no: 2, title: 'Artist - Song' }]);
  });

  it('never strips a title to nothing', () => {
    expect(parseTrackNames(['01 - Intro.mp3', '02 - Intro.mp3'])).toEqual([
      { no: 1, title: 'Intro' },
      { no: 2, title: 'Intro' },
    ]);
  });

  it('reads the old formats', () => {
    expect(parseTrackNames(['01. Song.flac', '02 Other Song.flac', '03-Third.flac', 'd2t04.Fourth.flac'])).toEqual([
      { no: 1, title: 'Song' },
      { no: 2, title: 'Other Song' },
      { no: 3, title: 'Third' },
      { disc: 2, no: 4, title: 'Fourth' },
    ]);
  });

  it('parseNameFromFilename uses the album’s other file names', () => {
    expect(parseNameFromFilename(MADRIGAL[0], MADRIGAL)).toBe('Opening - Siberian Khatru');
    expect(parseNameFromFilename(MADRIGAL[0])).toBeUndefined(); // alone: no number first
  });
});

describe('localNumbering', () => {
  it('uses the numbers in the names', () => {
    expect(localNumbering(MADRIGAL)).toEqual([
      { disc: 1, no: 1 },
      { disc: 1, no: 2 },
      { disc: 1, no: 11 },
      { disc: 1, no: 17 },
    ]);
  });

  it('numbers by natural order when a name has no number', () => {
    expect(localNumbering(['b.mp3', 'a 10.mp3', 'a 9.mp3'], 2)).toEqual([
      { disc: 2, no: 3 },
      { disc: 2, no: 2 },
      { disc: 2, no: 1 },
    ]);
  });

  it('numbers by order when two names share a number', () => {
    expect(localNumbering(['01 - A.mp3', '01 - B.mp3'])).toEqual([
      { disc: 1, no: 1 },
      { disc: 1, no: 2 },
    ]);
  });
});

describe('matchNames', () => {
  const t = (title: string | undefined, parsedName?: string) => ({ tags: { title }, parsedName });

  it('drops the title parts every track shares', () => {
    expect(matchNames([t('Yes - Madrigal Mystery Tour - Awaken'), t('Yes - Madrigal Mystery Tour - Soon')])).toEqual([
      'Awaken',
      'Soon',
    ]);
  });

  it('keeps a title that is also the album name', () => {
    expect(matchNames([t('Yes'), t('Owner')])).toEqual(['Yes', 'Owner']);
  });

  it('uses the file names when every title is the same', () => {
    expect(
      matchNames([t('Opening/Siberian Khatru', 'Opening - Siberian Khatru'), t('Opening/Siberian Khatru', 'Soon')]),
    ).toEqual(['Opening - Siberian Khatru', 'Soon']);
  });

  it('falls back to the file name for an untitled track', () => {
    expect(matchNames([t(undefined, 'Awaken'), t('Soon')])).toEqual(['Awaken', 'Soon']);
  });
});
