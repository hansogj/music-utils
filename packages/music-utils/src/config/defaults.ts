import { COVER_FILE_NAME, DISC_LABEL, DISC_NO_SPLIT, TRACKS_FILE_NAME } from '../constants';
import type { Config } from './schema';

export const DEFAULT_CONFIG: Config = {
  tracksFile: TRACKS_FILE_NAME,
  patterns: {
    artistFolder: '{artist}',
    albumFolder: '{year} {album}{discSuffix}{auxSuffix}',
    track: '{trackNo}{artistPrefix}{title}',
    trackMultiDisc: 'd{disc}t{trackNo}.{artistPrefix}{title}',
    artistPrefix: ' {artist} - ',
    // {discSep} resolves from `config.disc.separator` at render time.
    discSuffix: ` (${DISC_LABEL} {disc}{discSep}{total})`,
    auxSuffix: ' [{aux}]',
  },
  artist: {
    sortArticles: true,
    articles: ['the', 'los', 'il', 'la', 'el', 'le'],
  },
  cover: {
    filename: COVER_FILE_NAME,
  },
  disc: {
    separator: DISC_NO_SPLIT,
  },
  flac: {
    compressionLevel: 5,
  },
};
