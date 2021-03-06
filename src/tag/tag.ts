import { defined } from 'array.defined';

import { File, FILETYPE, Track } from '../types';
import { getFileType } from '../utils/path';
import * as flac from './flac';
import * as fromPath from './fromPath';
import * as mp3 from './mp3';

const validateAndfallbackToFileName = (track: Partial<Track>, path: string) =>
  [track, track?.trackName, track?.trackNo].every((e) => defined(e))
    ? Promise.resolve(track)
    : fromPath.read(path).then((trackFromFileName) => ({
        ...trackFromFileName,
        ...track,
      }));

const readTrackTags = (path: string, fileType: FILETYPE = 'unknown'): Promise<File> =>
  // @ts-ignore
  [
    {
      flac: () => flac.read(path).then((track) => validateAndfallbackToFileName(track, path)),
      mp3: () => mp3.read(path).then((track) => validateAndfallbackToFileName(track, path)),
      unknown: () => fromPath.read(path),
      jpg: undefined,
    }[fileType],
  ]
    .defined()
    .onEmpty((o: Function[]) => o.push(() => new Promise((resolve) => resolve({ path, fileType, track: {} }))))
    .map((read) => read().then((track: Partial<Track>) => ({ track, path, fileType })))
    .shift();

export const tagFile = (file: File): Promise<File> =>
  // @ts-ignore
  ({
    flac: () => flac.write(file),
    mp3: () => mp3.write(file),
    unknown: () => Promise.reject(new Error(`Unable to write tags to to undefined filetype: ${file.path}`)),
  }
    [file.fileType]()
    .then(() => file));

export const extractTags = (path: string): Promise<File> =>
  getFileType(path).then((fileType) => readTrackTags(path, fileType));
