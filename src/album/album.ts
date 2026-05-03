import '../utils/polyfills';

import { join } from 'path';

import { extractTags, tagFile } from '../tag';
import { File, MusicFileTypes, Release } from '../types';
import { getCommandLineArgs } from '../utils/cmd.options';
import { debugInfo, error } from '../utils/color.log';
import { readDir } from '../utils/path';
import { albumPrompt } from '../utils/prompt';
import { syncReleaseFolder } from '../utils/sync.tag.path';
import { mergeMetaData } from './merge-meta';
import { parseAlbumInfo } from './parse.path';

export type ParsedValues = Pick<File['track'], 'artist' | 'album'>;

export type ReleaseFiles = { release: Release; files: File[] };

export const extractAlbumInfo = async (dirName: string): Promise<File[]> => {
  const fileList = readDir(dirName).map((file) => join(dirName, file));
  const files = await Promise.all(fileList.map(extractTags));
  debugInfo(files);
  return files.filter((file) => MusicFileTypes.includes(file.fileType));
};

export const tagAlbum = async (dirName: string, tracksFromFile?: string[]): Promise<ReleaseFiles> => {
  const { tagOnly } = getCommandLineArgs();

  const release = tagOnly ? parseAlbumInfo(dirName) : await albumPrompt(parseAlbumInfo(dirName));

  const extracted = await extractAlbumInfo(dirName);
  const merged = mergeMetaData(extracted, release, tracksFromFile);
  debugInfo(merged);
  const files = await Promise.all(merged.map(tagFile));

  try {
    if (!tagOnly) {
      await syncReleaseFolder(release as Release, dirName);
    }
  } catch (e) {
    error(e);
  }

  return { files, release: release as Release };
};
