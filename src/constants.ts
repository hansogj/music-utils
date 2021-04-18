import { getTrailingCommentRanges } from 'typescript';

export const ACUTE = '´';
export const DISC_NO_SPLIT = '∕'; //  '::';
export const TRACKS_FILE_NAME = 'tracks.txt';
export const COVER_FILE_NAME = 'cover.jpg';
export const COVER_FILE_RESOLUTION = 600;
export const DISC_LABEL = 'Disc';
export const DEFINITE_ARTICLES = ['the', 'los', 'il', 'la', 'el', 'le'];
export const BLACK_LIST_SIMILAR_WORD = DEFINITE_ARTICLES.concat([
  '&',
  'a',
  'and',
  'band',
  'di',
  'de',
  'e',
  'och',
  'of',
  'og',
  'trio',
  'quartet',
  'quintet',
  'the band',
  'to',
]);
