import fs from 'fs';
import path from 'path';

import { FILETYPE } from '../types';
import { execute } from './execute';

const splits = (paths: string) =>
  paths
    .split('/')
    .filter((split) => split.length)
    .map((split) => split.replace(/\n/, ''));

export const getPwd = (): Promise<string[]> => execute('pwd').then((e) => splits(e as string));

export const getAlbumArtistInfoFromPath = (current: string = __dirname) =>
  splits(path.join(current))
    .splice(-2)

    .flatMap((split: string, i: number) => (i === 1 ? [split] : [split]))
    .filter((split) => split !== '.');

export const readDir = (folder: string) => fs.readdirSync(folder);

export const getDirName = () => process.cwd();

export const getFileType = (filePath: string): Promise<FILETYPE> =>
  execute(`file -i "${filePath}"`).then((stdout) => {
    if (/mp3/.test(`${stdout}`)) {
      return 'mp3';
    }

    if (/flac/.test(`${stdout}`)) {
      return 'flac';
    }

    if (/jpe?g/.test(`${stdout}`)) {
      return 'jpg';
    }

    return 'unknown';
  });
