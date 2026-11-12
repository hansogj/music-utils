import { describe, expect, it } from 'vitest';

import { albumSetKey, oldYearBracket, withAuxBracket } from './year-bracket.js';

describe('oldYearBracket', () => {
  it('l → live, r → rec., lower case', () => {
    expect(oldYearBracket('l', '1978')).toBe('live 1978');
    expect(oldYearBracket('R', '1976')).toBe('rec. 1976');
  });

  it('c → the user’s text, without what a folder name on SMB can’t hold', () => {
    expect(oldYearBracket('c', '1972', 'Dome University: 11.11.1972')).toBe('Dome University 11.11.1972');
    expect(oldYearBracket('c', '1972', '  [x] ')).toBe('x');
    expect(oldYearBracket('c', '1972', ' : ')).toBeUndefined();
  });

  it('Enter (or anything else) → no bracket', () => {
    expect(oldYearBracket('', '1978')).toBeUndefined();
    expect(oldYearBracket('x', '1978')).toBeUndefined();
  });
});

describe('withAuxBracket', () => {
  it('adds the bracket last, after the disc part and existing brackets', () => {
    expect(withAuxBracket('1997 Madrigal Mystery Tour', 'live 1978')).toBe('1997 Madrigal Mystery Tour [live 1978]');
    expect(withAuxBracket('1992 Tourmato (Disc 1∕2) [FLAC]', 'live 1979')).toBe(
      '1992 Tourmato (Disc 1∕2) [FLAC] [live 1979]',
    );
  });

  it('does not add a bracket the folder already has, or none', () => {
    expect(withAuxBracket('1992 Tourmato [Live 1979]', 'live 1979')).toBe('1992 Tourmato [Live 1979]');
    expect(withAuxBracket('1992 Tourmato', undefined)).toBe('1992 Tourmato');
  });
});

describe('albumSetKey', () => {
  it('is the same for all discs of a set, whatever their year', () => {
    expect(albumSetKey('Yes', '1979 Tourmato (Disc 1∕2)')).toBe(albumSetKey('yes', '1992 Tourmato (Disc 2∕2)'));
    expect(albumSetKey('Yes', '1979 Tourmato')).not.toBe(albumSetKey('Yes', '1979 Yessongs'));
  });
});
