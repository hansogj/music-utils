import '../utils/polyfills';

import path from 'path';

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

export const tagAlbum = (dNam: string) => {
  const dirName = getDirName();

  const [artist, album] = getAlbumArtistInfoFromPath(dirName);

  albumPrompt({ album, artist })
    .then((response) => info(`user answered ${response}`))
    .then((response) => {
      console.log(response);
      return readDir(dirName)
        .filter((_, i) => i < 2)
        .map((file) => path.join(dirName, file))
        .map((filePath) =>
          tagFile(filePath, {
            artist,
            album,
            fileType: 'flac',
            trackName: filePath,
          })
        );
    })

    .catch(error);
};
