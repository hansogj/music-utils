import { describe, it, expect } from 'vitest';
import { dice, normalizeTitle, scoreTracklist } from './similarity.js';

describe('normalizeTitle', () => {
  it('lowercases input', () => {
    expect(normalizeTitle('LOSER')).toBe('loser');
  });

  it('strips leading article "the"', () => {
    expect(normalizeTitle('the beatles')).toBe('beatles');
  });

  it('strips leading article "a"', () => {
    expect(normalizeTitle('a day in the life')).toBe('day in life');
  });

  it('strips article "an" mid-sentence', () => {
    const result = normalizeTitle('not an ordinary day');
    expect(result).not.toContain(' an ');
  });

  it('strips unicode punctuation like curly apostrophes', () => {
    // U+2019 RIGHT SINGLE QUOTATION MARK is not normalized, so it gets stripped as punctuation
    const curly = '\u2019';
    const withCurly = 'it' + curly + 's okay';
    const result = normalizeTitle(withCurly);
    expect(result).not.toContain(curly);
  });

  it('strips punctuation except straight apostrophes', () => {
    expect(normalizeTitle('hello, world!')).toBe('hello world');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeTitle('a   b')).not.toContain('  ');
  });
});

describe('dice', () => {
  it('returns 1.0 for identical strings', () => {
    expect(dice('Come Together', 'Come Together')).toBe(1);
  });

  it('returns 1.0 after normalization for same title differing only in articles', () => {
    expect(dice('The Loser', 'Loser')).toBe(1);
  });

  it('returns 0 for completely different short strings', () => {
    expect(dice('XQ', 'ZZ')).toBe(0);
  });

  it('returns a high score (> 0.7) for minor variation', () => {
    expect(dice('Come Together', 'Come Together!')).toBeGreaterThan(0.7);
  });

  it('returns a low score (< 0.4) for unrelated titles', () => {
    expect(dice('Come Together', 'Something Else Entirely Different')).toBeLessThan(0.4);
  });

  it('handles single-character strings', () => {
    expect(dice('A', 'B')).toBe(0);
  });
});

describe('scoreTracklist', () => {
  it('returns 1.0 for a perfect match', () => {
    const local = ['Come Together', 'Something', 'Maxwell'];
    const discogs = ['Come Together', 'Something', 'Maxwell'];
    expect(scoreTracklist(local, discogs)).toBeCloseTo(1, 1);
  });

  it('returns 0 for empty lists', () => {
    expect(scoreTracklist([], [])).toBe(0);
  });

  it('returns 0 when discogs list is empty', () => {
    expect(scoreTracklist(['Come Together'], [])).toBe(0);
  });

  it('returns 0 when local list is empty', () => {
    expect(scoreTracklist([], ['Come Together'])).toBe(0);
  });

  it('applies bonus track penalty when Discogs has extra tracks', () => {
    const local = ['Track 1', 'Track 2'];
    const discogs = ['Track 1', 'Track 2', 'Bonus Track', 'Bonus Track 2'];
    const score = scoreTracklist(local, discogs);
    expect(score).toBeLessThan(1.0);
    expect(score).toBeGreaterThan(0.5);
  });

  it('applies larger penalty when Discogs has fewer tracks than local', () => {
    const local = ['T1', 'T2', 'T3', 'T4', 'T5'];
    const discogs = ['T1', 'T2'];
    const score = scoreTracklist(local, discogs);
    expect(score).toBeLessThan(0.8);
  });

  it('returns a high score for near-perfect match with minor differences', () => {
    const local = ['Come Together', 'Here Comes The Sun'];
    const discogs = ['Come Together', 'Here Comes the Sun'];
    expect(scoreTracklist(local, discogs)).toBeGreaterThan(0.9);
  });

  it('score is clamped at 0 (not negative)', () => {
    const local = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'];
    const discogs = ['X1', 'X2'];
    expect(scoreTracklist(local, discogs)).toBeGreaterThanOrEqual(0);
  });
});
