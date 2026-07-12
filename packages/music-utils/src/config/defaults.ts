import { DISC_LABEL, DISC_NO_SPLIT, TRACKS_FILE_NAME } from '../constants';
import type { Config } from './schema';

export const DEFAULT_CONFIG: Config = {
  tracksFile: TRACKS_FILE_NAME,
  patterns: {
    artistFolder: '{artist}',
    albumFolder: '{year} {album}{discSuffix}{auxSuffix}',
    track: '{trackNo}{artistPrefix}{title}',
    trackMultiDisc: 'd{disc}t{trackNo}.{artistPrefix}{title}',
    artistPrefix: ' {artist} - ',
    discSuffix: ` (${DISC_LABEL} {disc}${DISC_NO_SPLIT}{total})`,
    auxSuffix: ' [{aux}]',
  },
  artist: {
    sortArticles: true,
    articles: ['the', 'los', 'il', 'la', 'el', 'le'],
  },
};
