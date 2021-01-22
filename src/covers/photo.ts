/* eslint-disable @typescript-eslint/no-unused-vars */
import { getAlbumArtistInfoFromPath, parseAlbumFolderName } from '../album/parse.path';
import { COVER_FILE_NAME, COVER_FILE_RESOLUTION } from '../constants';
import { Release } from '../types';
import { info } from '../utils/color.log';
import { execute } from '../utils/execute';
import { albumPrompt } from '../utils/prompt';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sacad = (dirName: string): Promise<any> => {
  const [artist, albumSplit] = getAlbumArtistInfoFromPath(dirName);
  const { album } = parseAlbumFolderName(albumSplit);

  return albumPrompt({ album, artist } as Partial<Release>).then((release) => {
    info(`Downloading album cover for ${release.artist}  ${release.album}`);
    return execute(`sacad "${release.artist}" "${release.album}" ${COVER_FILE_RESOLUTION} "${COVER_FILE_NAME}"`);
  });
};
