import '../utils/polyfills';

import { join } from 'path';

import { extractTags, tagFile } from '../tag';
import { File, MusicFileTypes, Release, Track } from '../types';
import { getCommandLineArgs } from '../utils/cmd.options';
import { debugInfo, error } from '../utils/color.log';
import { readDir } from '../utils/path';
import { albumPrompt } from '../utils/prompt';
import { syncReleaseFolder } from '../utils/sync.tag.path';
import { mergeMetaData } from './merge-meta';
import { parseAlbumInfo } from './parse.path';

export interface ParsedValues extends Pick<Track, 'artist' | 'album'> {}

export type ReleaseFiles = { release: Release; files: File[] };

export const tagAlbum = (dirName: string, tracksFromFile?: string[]): Promise<ReleaseFiles> => {
  const fileList = readDir(dirName).map((file) => join(dirName, file));
  const { tagOnly } = getCommandLineArgs();

  return (tagOnly ? Promise.resolve(parseAlbumInfo(dirName)) : albumPrompt(parseAlbumInfo(dirName)))
    .then((release) =>
      Promise.all(fileList.map(extractTags))
        .then((files: Array<File>) => files.filter((file) => MusicFileTypes.includes(file.fileType)))
        .then((files: Array<File>) => mergeMetaData(files, release, tracksFromFile))
        .then((files: Array<File>) => debugInfo(files))
        .then((files: Array<File>) => Promise.all(files.map(tagFile)))
        .then((files: Array<File>) =>
          (tagOnly ? Promise.resolve({}) : syncReleaseFolder(release as Release, dirName)).then(() => ({
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
