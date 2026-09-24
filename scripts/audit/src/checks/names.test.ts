import { describe, it, expect } from 'vitest';
import { parseNameFromFilename, checkNameTagMatch } from './names.js';
import type { TrackInfo } from '../types.js';

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
