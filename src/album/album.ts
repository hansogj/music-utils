import '../utils/polyfills';

import { join } from 'path';

import { extractTags, tagFile } from '../tag';
import { File, MuiscFileTypes, Release, Track } from '../types';
import { error } from '../utils/color.log';
import { getAlbumArtistInfoFromPath, parseAlbumFolderName, readDir } from '../utils/path';
import { albumPrompt } from '../utils/prompt';
import { syncReleaseFolder } from '../utils/sync-tag-path';
import { mergeMetaData } from './merge-meta';

export interface ParsedValues extends Pick<Track, 'artist' | 'album'> {}

type ReleaseFiles = { release: Release; files: File[] };

export const tagAlbum = (dirName: string, tracksFromFile?: string[]): Promise<ReleaseFiles> => {
  const [artist, albumSplit] = getAlbumArtistInfoFromPath(dirName);
  const { year, discnumber, noOfDiscs, album } = parseAlbumFolderName(albumSplit);
  const fileList = readDir(dirName).map((file) => join(dirName, file));
  const parsed: Release = { album, artist, year, discnumber: discnumber || '1', noOfDiscs: noOfDiscs || discnumber };
  return albumPrompt(parsed)
    .then((release) =>
      Promise.all(fileList.map(extractTags))
        .then((files: Array<File>) => files.filter((file) => MuiscFileTypes.includes(file.fileType)))
        .then((files: Array<File>) => mergeMetaData(files, release, tracksFromFile))
        .then((files: File[]) => Promise.all(files.map(tagFile)))
        .then((files: File[]) => ({
          release: syncReleaseFolder(release as Release, dirName),
          files,
        }))
    )
    .catch((e) => {
      error(e);
      return undefined;
    });
};
