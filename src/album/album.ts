import '../utils/polyfills';

import { join } from 'path';

import { extractTags, tagFile } from '../tag';
import { File, MuiscFileTypes, Release, Track } from '../types';
import { debugInfo, error } from '../utils/color.log';
import { readDir } from '../utils/path';
import { albumPrompt } from '../utils/prompt';
import { syncReleaseFolder } from '../utils/sync.tag.path';
import { mergeMetaData } from './merge-meta';
import { parseAlbumInfo } from './parse.path';

export interface ParsedValues extends Pick<Track, 'artist' | 'album'> {}

type ReleaseFiles = { release: Release; files: File[] };

export const tagAlbum = (dirName: string, tracksFromFile?: string[]): Promise<ReleaseFiles> => {
  const fileList = readDir(dirName).map((file) => join(dirName, file));

  return albumPrompt(parseAlbumInfo(dirName))
    .then((release) =>
      Promise.all(fileList.map(extractTags))
        .then((files: Array<File>) => files.filter((file) => MuiscFileTypes.includes(file.fileType)))
        .then((files: Array<File>) => mergeMetaData(files, release, tracksFromFile))
        .then((files: Array<File>) => debugInfo(files))
        .then((files: Array<File>) => Promise.all(files.map(tagFile)))
        .then((files: Array<File>) =>
          syncReleaseFolder(release as Release, dirName).then(() => ({
            files,
            release,
          }))
        )
    )
    .catch((e) => {
      error(e);
      return undefined;
    });
};
