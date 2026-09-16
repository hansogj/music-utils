import type { AlbumLayout, Issue } from '../types.js';

// U+2215 DIVISION SLASH — the required disc separator (not regular U+002F SOLIDUS)
const DISC_NO_SPLIT = '∕';

const ALBUM_STARTS_WITH_YEAR = /^\d{4}\s+\S/;
// Detects any (Disc X<sep>Y) where <sep> is NOT the required ∕ (U+2215).
// Catches: "Disc 1/2", "Disc 1-2", "Disc 1 of 2", "Disc 1.2", etc.
const DISC_ANY = /\(\s*[Dd]isc\s+(\d+)(.*?)(\d+)\s*\)/;
const DISC_CORRECT_SEP = /\(\s*[Dd]isc\s+\d+∕\d+\s*\)/;
const AUX_WRONG_BRACKETS = /\{[^}]+\}/;

// Articles stripped when determining expected initial letter for the [A-Z] dir
const SORT_ARTICLES = /^(the|a|an|los|il|la|el|le)\s+/i;

export function checkFolderFormat(layout: AlbumLayout): Issue[] {
  const issues: Issue[] = [];
  const { letterDir, artistName, albumFolder } = layout;

  // Check the [A-Z] letter directory matches the artist initial
  if (letterDir) {
    const effectiveName = artistName.replace(SORT_ARTICLES, '');
    const expected = effectiveName.charAt(0).toUpperCase();
    const actual = letterDir.toUpperCase();

    if (actual !== expected) {
      issues.push({
        severity: 'SEVERE',
        code: 'WRONG_LETTER_DIR',
        message: `Artist "${artistName}" sits under "${letterDir}" but should be under "${expected}"`,
        suggestion: `Move artist folder: ${letterDir}/${artistName} → ${expected}/${artistName}`,
      });
    }
  }

  // Album folder must start with 4-digit year
  if (!ALBUM_STARTS_WITH_YEAR.test(albumFolder)) {
    const yearGuess = albumFolder.match(/\b(19|20)\d{2}\b/)?.[0];
    issues.push({
      severity: 'SEVERE',
      code: 'MISSING_YEAR_PREFIX',
      message: `Album folder "${albumFolder}" does not start with a 4-digit year`,
      suggestion: yearGuess
        ? `Rename to "${yearGuess} ${albumFolder.replace(yearGuess, '').trim()}"`
        : `Rename to "YYYY ${albumFolder}" with the correct release year`,
    });
  }

  // Disc separator must be ∕ (U+2215); flag if a disc notation exists but uses wrong separator
  if (DISC_ANY.test(albumFolder) && !DISC_CORRECT_SEP.test(albumFolder)) {
    const fixed = albumFolder.replace(/(\(\s*[Dd]isc\s+\d+)[^∕\d]*(\d+\s*\))/g, `$1${DISC_NO_SPLIT}$2`);
    issues.push({
      severity: 'SEVERE',
      code: 'WRONG_DISC_SEPARATOR',
      message: `Disc notation in "${albumFolder}" uses wrong separator; required: "∕" (U+2215 DIVISION SLASH)`,
      suggestion: `Rename to: "${fixed}"`,
    });
  }

  // Aux info must use square brackets, not curly braces
  if (AUX_WRONG_BRACKETS.test(albumFolder)) {
    issues.push({
      severity: 'SEVERE',
      code: 'WRONG_AUX_BRACKETS',
      message: `Album folder uses "{}" for auxiliary info; must use "[]"`,
      suggestion: `Rename: replace { } with [ ] in "${albumFolder}"`,
    });
  }

  return issues;
}
