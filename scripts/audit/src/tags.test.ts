import { describe, it, expect } from 'vitest';
import { parseComment, parseTxxx } from './tags.js';

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

describe('parseComment', () => {
  const comm = (desc: string, lang: string, text: string) => `COMM (Comments): (${desc})[${lang}]: ${text}`;

  it('returns the full text of the comment without a description', () => {
    expect(parseComment([comm('', 'eng', 'https://www.discogs.com/release/4376665')])).toBe(
      'https://www.discogs.com/release/4376665',
    );
  });

  it('puts a URL split by old id3v2 writes back together', () => {
    expect(parseComment([comm('https', '', '//www.discogs.com/release/4376665')])).toBe(
      'https://www.discogs.com/release/4376665',
    );
  });

  it('prefers the plain comment over described ones', () => {
    expect(parseComment([comm('iTunNORM', 'eng', '0000'), comm('', 'eng', 'ripped by me')])).toBe('ripped by me');
    expect(parseComment([comm('iTunNORM', 'eng', '0000')])).toBe('0000');
  });

  it('returns undefined without a comment', () => {
    expect(parseComment(['TIT2 (Title/songname/content description): Speed King'])).toBeUndefined();
  });
});
