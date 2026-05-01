import { defined } from '@hansogj/array.utils';

import { File, FILETYPE, Track } from '../types';
import { getFileType } from '../utils/path';
import * as flac from './flac';
import * as fromPath from './fromPath';
import * as mp3 from './mp3';

const validateAndFallbackToFileName = async (track: Partial<Track>, path: string): Promise<Partial<Track>> => {
  if ([track, track?.trackName, track?.trackNo].every((e) => defined(e))) {
    return track;
  }

  const trackFromFileName = await fromPath.read(path);
  return { ...trackFromFileName, ...track };
};

const readers: Partial<Record<FILETYPE, (path: string) => Promise<Partial<Track>>>> = {
  flac: (p) => flac.read(p).then((track) => validateAndFallbackToFileName(track, p)),
  mp3: (p) => mp3.read(p).then((track) => validateAndFallbackToFileName(track, p)),
  unknown: (p) => fromPath.read(p),
};

const readTrackTags = async (path: string, fileType: FILETYPE = 'unknown'): Promise<File> => {
  const read = readers[fileType];
  const track = read ? await read(path) : {};
  return { track, path, fileType };
};

const writers: Record<string, (file: File) => Promise<unknown>> = {
  flac: (file) => flac.write(file),
  mp3: (file) => mp3.write(file),
};

export const tagFile = async (file: File): Promise<File> => {
  const write = writers[file.fileType];

  if (!write) {
    throw new Error(`Unable to write tags to to undefined filetype: ${file.path}`);
  }

  await write(file);
  return file;
};

export const extractTags = async (path: string): Promise<File> => {
  const fileType = await getFileType(path);
  return readTrackTags(path, fileType);
};
