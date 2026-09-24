import { describe, it, expect } from 'vitest';
import { checkTags } from './tags.js';
import type { TrackInfo } from '../types.js';

function track(overrides: Partial<TrackInfo> = {}): TrackInfo {
  return {
    filePath: '/music/B/Beck/1999 Album/01 - Loser.flac',
    fileName: '01 - Loser.flac',
    ext: 'flac',
    tags: {
      title: 'Loser',
      artist: 'Beck',
      album: 'Mellow Gold',
      year: '1994',
      trackNo: '1',
    },
    parsedName: 'Loser',
    ...overrides,
  };
}

describe('checkTags', () => {
  it('returns no issues when all required tags are present', () => {
    expect(checkTags(track())).toHaveLength(0);
  });

  it('returns TAG_READ_ERROR when tagReadError is set', () => {
    const issues = checkTags(track({ tagReadError: 'metaflac exited with code 1' }));
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('TAG_READ_ERROR');
    expect(issues[0].severity).toBe('HIGH');
    expect(issues[0].message).toContain('metaflac exited with code 1');
  });

  it('TAG_READ_ERROR short-circuits — no other issues returned', () => {
    const issues = checkTags(
      track({ tagReadError: 'error', tags: {} }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('TAG_READ_ERROR');
  });

  it('returns NO_TAGS when all required tags are missing', () => {
    const issues = checkTags(track({ tags: {} }));
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('NO_TAGS');
    expect(issues[0].severity).toBe('HIGH');
    expect(issues[0].file).toBe('01 - Loser.flac');
  });

  it('returns NO_TAGS when all of title/artist/album/year/trackNo are undefined', () => {
    const issues = checkTags(
      track({
        tags: { genre: 'Rock', comment: 'Some comment' },
      }),
    );
    expect(issues[0].code).toBe('NO_TAGS');
  });

  describe('MISSING_TAGS', () => {
    it('flags track missing only TRACKNUMBER', () => {
      const issues = checkTags(
        track({ tags: { title: 'Loser', artist: 'Beck', album: 'Mellow Gold', year: '1994' } }),
      );
      expect(issues[0].code).toBe('MISSING_TAGS');
      expect(issues[0].message).toContain('TRACKNUMBER');
    });

    it('flags track missing only TITLE', () => {
      const issues = checkTags(
        track({ tags: { artist: 'Beck', album: 'Mellow Gold', year: '1994', trackNo: '1' } }),
      );
      expect(issues[0].code).toBe('MISSING_TAGS');
      expect(issues[0].message).toContain('TITLE');
    });

    it('flags track missing ARTIST and DATE/YEAR', () => {
      const issues = checkTags(
        track({ tags: { title: 'Loser', album: 'Mellow Gold', trackNo: '1' } }),
      );
      expect(issues[0].code).toBe('MISSING_TAGS');
      expect(issues[0].message).toContain('ARTIST');
      expect(issues[0].message).toContain('DATE/YEAR');
    });

    it('includes filename in issue', () => {
      const issues = checkTags(
        track({ tags: { title: 'Loser', artist: 'Beck', album: 'Mellow Gold', year: '1994' } }),
      );
      expect(issues[0].file).toBe('01 - Loser.flac');
    });
  });
});
