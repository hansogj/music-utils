import { describe, it, expect } from 'vitest';
import { parseDiscogsId } from '../../src/core/sanitizer';

describe('parseDiscogsId', () => {
  it.each([
    ['12345', { type: 'release', id: '12345' }],
    ['r249504', { type: 'release', id: '249504' }],
    ['[r249504]', { type: 'release', id: '249504' }],
    [' R249504 ', { type: 'release', id: '249504' }],
    ['m1439', { type: 'master', id: '1439' }],
    ['[m1439]', { type: 'master', id: '1439' }],
    ['https://www.discogs.com/release/3422683-Deep-Purple-In-Rock', { type: 'release', id: '3422683' }],
    ['https://www.discogs.com/master/1439-Deep-Purple-Deep-Purple-In-Rock', { type: 'master', id: '1439' }],
    ['https://www.discogs.com/Deep-Purple-In-Rock/release/3422683', { type: 'release', id: '3422683' }],
  ])('parses %s', (input, expected) => {
    expect(parseDiscogsId(input)).toEqual(expected);
  });

  it.each(['', 'abc-def', 'x123', 'r12a', 'https://www.discogs.com/artist/123-Foo'])(
    'returns undefined for %o',
    (input) => {
      expect(parseDiscogsId(input)).toBeUndefined();
    },
  );
});
