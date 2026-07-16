export const ACUTE = '´';
export const DISC_NO_SPLIT = '∕'; //  '::';
export const TRACKS_FILE_NAME = 'tracks.txt';
export const COVER_FILE_NAME = 'cover.jpg';
export const DISC_LABEL = 'Disc';
// Words stripped before fuzzy-matching artist names in `music-utils-similarities`.
// Historically shared its head with `config.artist.articles` (the sort-order transform),
// but the two are intentionally decoupled: a user can override the sort list without
// changing what the similarity engine ignores.
export const BLACK_LIST_SIMILAR_WORD = [
  'the',
  'los',
  'il',
  'la',
  'el',
  'le',
  '&',
  'a',
  'and',
  'band',
  'di',
  'de',
  'e',
  'group',
  'john',
  'och',
  'of',
  'og',
  'trio',
  'quartet',
  'quintet',
  'the band',
  'to',
];
