import { File, FILETYPE, Track } from '../types';
import { getFileType } from '../utils/path';
import * as flac from './flac';
import * as fromPath from './fromPath';
import * as mp3 from './mp3';

const readTrackTags = (path: string, fileType: FILETYPE = 'unknown'): Promise<File> =>
  // @ts-ignore
  [
    {
      flac: () => flac.read(path),
      mp3: () => mp3.read(path),
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
    unknown: () => Promise.reject(new Error(`unable to write tags to to undefined filetype: ${file.path}`)),
  }
    [file.fileType]()
    .then(() => file));

export const extractTags = (path: string): Promise<File> =>
  getFileType(path).then((fileType) => readTrackTags(path, fileType));
