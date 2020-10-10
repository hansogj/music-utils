import '../utils/polyfills';

import path from 'path';

import { FILETYPE, MuiscFileTypes, Release, Tag, Track } from '../types';
import log, { error, info } from '../utils/color.log';
import { getAlbumArtistInfoFromPath, getDirName, getFileType, parseAlbumFolderName, readDir } from '../utils/path';
import { albumPrompt } from '../utils/prompt';
import { extractTags, tagFile } from '../utils/tag';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const tagAlbum = (dirName: string): Promise<any> => {
  const [artist, albumSplit] = getAlbumArtistInfoFromPath(dirName);
  const { year, discnumber, album } = parseAlbumFolderName(albumSplit);
  const fileList = readDir(dirName).map((file) => path.join(dirName, file));

  return albumPrompt({ album, artist, year, discnumber })
    .then((response) => info(`user answered ${response}`))
    .then(() => Promise.all(fileList.map(extractTags)))
    .then((tags: Array<Tag>) =>
      Promise.all(
        tags
          .map(({ fileType, trackName }, i) =>
            MuiscFileTypes.includes(fileType)
              ? tagFile(fileList[i], {
                  artist,
                  album,
                  fileType,
                  trackName,
                })
              : undefined
          )
          .defined()
      )
    )

    .catch(error);
};
