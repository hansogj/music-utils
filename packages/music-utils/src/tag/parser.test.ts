import { applyMatch, Parser, regExp, singleSpace } from './parser';

describe('singleSpace', () => {
  it('collapses multiple spaces', () => expect(singleSpace('hello   world')).toBe('hello world'));
  it('collapses tabs and newlines', () => expect(singleSpace('hello\t\nworld')).toBe('hello world'));
  it('trims leading/trailing whitespace', () => expect(singleSpace('  hello  ')).toBe('hello'));
  it('defaults to empty string', () => expect(singleSpace()).toBe(''));
  it('handles empty string', () => expect(singleSpace('')).toBe(''));
  it('handles single word', () => expect(singleSpace('hello')).toBe('hello'));
});

describe('regExp', () => {
  it('combines two regexps', () => {
    const combined = regExp(/hello/, /\s+world/);
    expect(combined.source).toBe('hello\\s+world');
    expect('hello world').toMatch(combined);
  });

  it('combines three regexps', () => {
    const combined = regExp(/(\d+)/, /\s*-\s*/, /(.*)/);
    expect(combined.source).toBe('(\\d+)\\s*-\\s*(.*)');
    expect('01 - Track Name').toMatch(combined);
  });
});

describe('applyMatch', () => {
  const trackNoParser: Parser = {
    matcher: /(\d+)\s*-\s*(.*)/,
    select: [1, 2],
  };

  const discParser: Parser = {
    matcher: /d(\d+)t(\d+)\s*-?\s*(.*)/,
    select: [2, 3, 1],
  };

  it('extracts groups from a matching parser', () => {
    const result = applyMatch('01 - My Track', [trackNoParser]);
    expect(result).toEqual(['01', 'My Track']);
  });

  it('returns empty array for no match', () => {
    const result = applyMatch('no match here', [trackNoParser]);
    expect(result).toEqual([]);
  });

  it('uses the last matching parser when multiple match', () => {
    const result = applyMatch('d2t05 - Some Song', [trackNoParser, discParser]);
    // discParser is last and matches, so its select order applies
    expect(result).toEqual(['05', 'Some Song', '2']);
  });

  it('falls through to earlier parser when last does not match', () => {
    const result = applyMatch('07 - Regular Track', [trackNoParser, discParser]);
    // discParser doesn't match, trackNoParser does
    expect(result).toEqual(['07', 'Regular Track']);
  });

  it('returns empty array for null/undefined input', () => {
    expect(applyMatch(null as unknown as string, [trackNoParser])).toEqual([]);
    expect(applyMatch(undefined as unknown as string, [trackNoParser])).toEqual([]);
  });

  it('collapses whitespace in matched groups via singleSpace', () => {
    const parser: Parser = { matcher: /(.*)/, select: [1] };
    const result = applyMatch('hello   world', [parser]);
    expect(result).toEqual(['hello world']);
  });
});
