import { describe, it, expect } from 'vitest';
import { checkFolderFormat } from './folder.js';
import type { AlbumLayout } from '../types.js';

function layout(overrides: Partial<AlbumLayout> = {}): AlbumLayout {
  return {
    letterDir: 'B',
    artistName: 'Beck',
    albumFolder: '1999 Midnite Vultures',
    albumPath: '/music/B/Beck/1999 Midnite Vultures',
    ...overrides,
  };
}

describe('checkFolderFormat', () => {
  it('returns no issues for a clean album', () => {
    expect(checkFolderFormat(layout())).toHaveLength(0);
  });

  it('returns no issues when letterDir is undefined', () => {
    const issues = checkFolderFormat(layout({ letterDir: undefined }));
    expect(issues.filter((i) => i.code === 'WRONG_LETTER_DIR')).toHaveLength(0);
  });

  describe('WRONG_LETTER_DIR', () => {
    it('flags "The Beatles" under T instead of B', () => {
      const issues = checkFolderFormat(
        layout({ letterDir: 'T', artistName: 'The Beatles', albumFolder: '1969 Abbey Road' }),
      );
      const issue = issues.find((i) => i.code === 'WRONG_LETTER_DIR');
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe('SEVERE');
      expect(issue!.message).toContain('"T"');
      expect(issue!.message).toContain('"B"');
    });

    it('strips article "A" from artist name', () => {
      const issues = checkFolderFormat(
        layout({ letterDir: 'A', artistName: 'A Tribe Called Quest', albumFolder: '1991 Low End Theory' }),
      );
      const issue = issues.find((i) => i.code === 'WRONG_LETTER_DIR');
      expect(issue).toBeDefined();
      expect(issue!.message).toContain('"T"');
    });

    it('strips article "An" from artist name — "An Artist" under A is correct', () => {
      const issues = checkFolderFormat(
        layout({ letterDir: 'A', artistName: 'An Artist', albumFolder: '2000 Album' }),
      );
      expect(issues.find((i) => i.code === 'WRONG_LETTER_DIR')).toBeUndefined();
    });

    it('flags "An Artist" incorrectly placed under Z (should be A)', () => {
      const issues = checkFolderFormat(
        layout({ letterDir: 'Z', artistName: 'An Artist', albumFolder: '2000 Album' }),
      );
      const issue = issues.find((i) => i.code === 'WRONG_LETTER_DIR');
      expect(issue).toBeDefined();
      expect(issue!.message).toContain('"A"');
    });

    it('strips article "Los" from artist name', () => {
      const issues = checkFolderFormat(
        layout({ letterDir: 'L', artistName: 'Los Fabulosos Cadillacs', albumFolder: '1992 El Leon' }),
      );
      const issue = issues.find((i) => i.code === 'WRONG_LETTER_DIR');
      expect(issue).toBeDefined();
      expect(issue!.message).toContain('"F"');
    });

    it('does not flag correct letter for non-article artist', () => {
      const issues = checkFolderFormat(
        layout({ letterDir: 'B', artistName: 'Beck', albumFolder: '1999 Midnite Vultures' }),
      );
      expect(issues.find((i) => i.code === 'WRONG_LETTER_DIR')).toBeUndefined();
    });

    it('does not flag The Beatles under B', () => {
      const issues = checkFolderFormat(
        layout({ letterDir: 'B', artistName: 'The Beatles', albumFolder: '1969 Abbey Road' }),
      );
      expect(issues.find((i) => i.code === 'WRONG_LETTER_DIR')).toBeUndefined();
    });
  });

  describe('MISSING_YEAR_PREFIX', () => {
    it('flags album folder with no year', () => {
      const issues = checkFolderFormat(layout({ albumFolder: 'Dark Side of the Moon' }));
      const issue = issues.find((i) => i.code === 'MISSING_YEAR_PREFIX');
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe('SEVERE');
    });

    it('flags album folder with year not at start', () => {
      const issues = checkFolderFormat(layout({ albumFolder: 'Album 1999' }));
      const issue = issues.find((i) => i.code === 'MISSING_YEAR_PREFIX');
      expect(issue).toBeDefined();
    });

    it('flags folder starting with year but no space after', () => {
      const issues = checkFolderFormat(layout({ albumFolder: '1999' }));
      expect(issues.find((i) => i.code === 'MISSING_YEAR_PREFIX')).toBeDefined();
    });

    it('does not flag folder starting with YYYY and a space', () => {
      expect(checkFolderFormat(layout({ albumFolder: '1999 Midnite Vultures' }))).toHaveLength(0);
    });

    it('includes a year suggestion when year appears elsewhere in name', () => {
      const issues = checkFolderFormat(layout({ albumFolder: 'Album 1999' }));
      const issue = issues.find((i) => i.code === 'MISSING_YEAR_PREFIX');
      expect(issue!.suggestion).toContain('1999');
    });
  });

  describe('WRONG_DISC_SEPARATOR', () => {
    it('flags (Disc 1/2) with regular slash', () => {
      const issues = checkFolderFormat(layout({ albumFolder: '1969 Abbey Road (Disc 1/2)' }));
      expect(issues.find((i) => i.code === 'WRONG_DISC_SEPARATOR')).toBeDefined();
    });

    it('flags (Disc 1-2) with hyphen', () => {
      const issues = checkFolderFormat(layout({ albumFolder: '1999 Album (Disc 1-2)' }));
      expect(issues.find((i) => i.code === 'WRONG_DISC_SEPARATOR')).toBeDefined();
    });

    it('flags (disc 1 of 2) lowercase with "of"', () => {
      const issues = checkFolderFormat(layout({ albumFolder: '1999 Album (disc 1 of 2)' }));
      expect(issues.find((i) => i.code === 'WRONG_DISC_SEPARATOR')).toBeDefined();
    });

    it('does not flag (Disc 1∕2) with U+2215 division slash', () => {
      const issues = checkFolderFormat(layout({ albumFolder: '1999 Album (Disc 1∕2)' }));
      expect(issues.find((i) => i.code === 'WRONG_DISC_SEPARATOR')).toBeUndefined();
    });

    it('includes corrected folder name in suggestion', () => {
      const issues = checkFolderFormat(layout({ albumFolder: '1969 Abbey Road (Disc 1/2)' }));
      const issue = issues.find((i) => i.code === 'WRONG_DISC_SEPARATOR');
      expect(issue!.suggestion).toContain('∕');
    });
  });

  describe('WRONG_AUX_BRACKETS', () => {
    it('flags {Bonus Disc} with curly braces', () => {
      const issues = checkFolderFormat(layout({ albumFolder: '2001 Album {Bonus Disc}' }));
      expect(issues.find((i) => i.code === 'WRONG_AUX_BRACKETS')).toBeDefined();
    });

    it('does not flag [Bonus Disc] with square brackets', () => {
      const issues = checkFolderFormat(layout({ albumFolder: '2001 Album [Bonus Disc]' }));
      expect(issues.find((i) => i.code === 'WRONG_AUX_BRACKETS')).toBeUndefined();
    });
  });

  describe('multiple issues in one call', () => {
    it('returns all issues when multiple problems exist', () => {
      const issues = checkFolderFormat(
        layout({
          letterDir: 'T',
          artistName: 'The Beatles',
          albumFolder: 'Abbey Road (Disc 1/2) {Bonus}',
        }),
      );
      const codes = issues.map((i) => i.code);
      expect(codes).toContain('WRONG_LETTER_DIR');
      expect(codes).toContain('MISSING_YEAR_PREFIX');
      expect(codes).toContain('WRONG_DISC_SEPARATOR');
      expect(codes).toContain('WRONG_AUX_BRACKETS');
    });
  });
});
