import '../utils/polyfills';

import path from 'path';

import { FILETYPE, MuiscFileTypes } from '../types';
import log, { error, info } from '../utils/color.log';
import { getAlbumArtistInfoFromPath, getDirName, getFileType, readDir } from '../utils/path';
import { albumPrompt } from '../utils/prompt';
import { tagFile } from '../utils/tag';

/* 
Promise.all(readDir(dirName)
              
.filter((_, i) => i < 2)
.map((file) => path.join(dirName, file))
.map((filePath) =>({
    filePath, fileType:   getFileType(filePath))
})
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const tagAlbum = (dirName: string): Promise<any> => {
  const [artist, album] = getAlbumArtistInfoFromPath(dirName);

  const fileList = readDir(dirName).map((file) => path.join(dirName, file));

  return albumPrompt({ album, artist })
    .then((response) => info(`user answered ${response}`))
    .then(() => Promise.all(fileList.map(getFileType)))
    .then((fileTypes: FILETYPE[]) =>
      Promise.all(
        fileTypes
          .map((fileType, i) =>
            MuiscFileTypes.includes(fileType)
              ? tagFile(fileList[i], {
                  artist,
                  album,
                  fileType,
                  trackName: 'trackname',
                })
              : undefined
          )
          .defined()
      )
    )

    .catch(error);
};
