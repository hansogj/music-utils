import '../utils/polyfills';

import { join } from 'path';

import { extractTags, tagFile } from '../tag';
import { File, MuiscFileTypes, Release, Track } from '../types';
import { error } from '../utils/color.log';
import { getAlbumArtistInfoFromPath, parseAlbumFolderName, readDir } from '../utils/path';
import { albumPrompt } from '../utils/prompt';
import { mergeMetaData } from './merge-meta';
import { syncReleaseFolder } from './release-folder';

export interface ParsedValues extends Pick<Track, 'artist' | 'album'> {}

export const tagAlbum = (dirName: string): Promise<Release> => {
  const [artist, albumSplit] = getAlbumArtistInfoFromPath(dirName);
  const { year, discnumber, noOfDiscs, album } = parseAlbumFolderName(albumSplit);
  const fileList = readDir(dirName).map((file) => join(dirName, file));
  const parsed: Release = { album, artist, year, discnumber: discnumber || '1', noOfDiscs: noOfDiscs || discnumber };
  return albumPrompt(parsed)
    .then((userInput) =>
      Promise.all(fileList.map(extractTags))
        .then((files: Array<File>) => files.filter((file) => MuiscFileTypes.includes(file.fileType)))
        .then((files: Array<File>) => mergeMetaData(files, userInput))
        .then((files: File[]) => Promise.all(files.map(tagFile)))
        .then(() => syncReleaseFolder(userInput as Release, dirName))
    )
    .catch((e) => {
      error(e);
      return undefined;
    });
};
