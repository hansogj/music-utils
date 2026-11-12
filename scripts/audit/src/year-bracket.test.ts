import { describe, expect, it } from 'vitest';

import {
  albumSetKey,
  applyOldYear,
  auxPartOf,
  customAux,
  describeOldYear,
  oldYearBracket,
  withAuxBracket,
} from './year-bracket.js';

describe('oldYearBracket', () => {
  it('l → live, r → rec., lower case, added after the other brackets', () => {
    expect(oldYearBracket('l', '1978')).toEqual({ mode: 'append', text: 'live 1978' });
    expect(oldYearBracket('R', '1976')).toEqual({ mode: 'append', text: 'rec. 1976' });
  });

  it('Enter (or anything else) → no bracket', () => {
    expect(oldYearBracket('', '1978')).toBeUndefined();
    expect(oldYearBracket('x', '1978')).toBeUndefined();
  });
});

describe('c: editing the folder’s brackets', () => {
  it('auxPartOf gives the brackets as they are', () => {
    expect(auxPartOf('1979 Tourmato (Disc 1∕2) [FLAC] [Bonus Disc]')).toBe('[FLAC] [Bonus Disc]');
    expect(auxPartOf('1979 Tourmato')).toBe('');
  });

  it('customAux keeps brackets, wraps plain text, cleans what SMB can’t hold', () => {
    expect(customAux('[FLAC] [live 1979]')).toBe('[FLAC] [live 1979]');
    expect(customAux('Dome University: 11.11.1972')).toBe('[Dome University 11.11.1972]');
    expect(customAux('[FLAC] [live 1979')).toBe('[FLAC] [live 1979]'); // unclosed
    expect(customAux('[FLAC] []')).toBe('[FLAC]');
    expect(customAux('  ')).toBe('');
  });

  it('applyOldYear replaces the brackets with the edited ones, or drops them', () => {
    const folder = '1992 Tourmato (Disc 1∕2) [FLAC]';
    expect(applyOldYear(folder, { mode: 'replace', aux: '[FLAC] [live 1979]' })).toBe(
      '1992 Tourmato (Disc 1∕2) [FLAC] [live 1979]',
    );
    expect(applyOldYear(folder, { mode: 'replace', aux: '' })).toBe('1992 Tourmato (Disc 1∕2)');
    expect(applyOldYear(folder, { mode: 'append', text: 'live 1979' })).toBe(
      '1992 Tourmato (Disc 1∕2) [FLAC] [live 1979]',
    );
    expect(applyOldYear(folder, undefined)).toBe(folder);
  });

  it('describeOldYear', () => {
    expect(describeOldYear(undefined)).toBe('no bracket');
    expect(describeOldYear({ mode: 'append', text: 'live 1979' })).toBe('[live 1979]');
    expect(describeOldYear({ mode: 'replace', aux: '[FLAC]' })).toBe('brackets [FLAC]');
    expect(describeOldYear({ mode: 'replace', aux: '' })).toBe('no brackets');
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
