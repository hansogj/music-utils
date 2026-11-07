import { describe, it, expect } from 'vitest';
import { parseTxxx } from './tags.js';

describe('parseTxxx', () => {
  it('reads described TXXX frames', () => {
    expect(parseTxxx(['TXXX (User defined text information): (DISCOGS_RELEASE_ID): 3422683'])).toEqual({
      DISCOGS_RELEASE_ID: '3422683',
    });
  });

  it('reads the legacy empty-description KEY=value form', () => {
    expect(parseTxxx(['TXXX (User defined text information): (): DISCOGS_RELEASE_ID=3422683'])).toEqual({
      DISCOGS_RELEASE_ID: '3422683',
    });
  });

  it('prefers a described frame over a legacy one regardless of order', () => {
    const legacy = 'TXXX (User defined text information): (): DISCOGS_RELEASE_ID=111';
    const described = 'TXXX (User defined text information): (DISCOGS_RELEASE_ID): 222';
    expect(parseTxxx([described, legacy]).DISCOGS_RELEASE_ID).toBe('222');
    expect(parseTxxx([legacy, described]).DISCOGS_RELEASE_ID).toBe('222');
  });

  it('ignores other frames', () => {
    expect(
      parseTxxx(['TIT2 (Title/songname/content description): Speed King', 'TORY (Original release year): 1970']),
    ).toEqual({});
  });
});
