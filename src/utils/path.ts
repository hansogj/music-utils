import fs from 'fs';
import path from 'path';

import { FILETYPE, Release } from '../types';
import { execute } from './execute';

const splits = (paths: string) =>
  paths
    .split('/')
    .filter((split) => split.length)
    .map((split) => split.replace(/\n/, ''));

export const getPwd = (): Promise<string[]> => execute('pwd').then((e) => splits(e as string));

const capitalize = (s: string) => s.slice(0, 1).toLocaleUpperCase() + s.slice(1);

const parseDiscNumber = (album: string) => {
  const diskNrRegExp2 = /(.*)\(\s*disc\s*(\d*)\s*\)(.*)/;

  const [, pre, num, ...rest] = diskNrRegExp2.test(album)
    ? [album.match(diskNrRegExp2)].defined().flatMap((e: string) => e)
    : [undefined, album, undefined];

  return [num, [pre, ...rest].join(' ').split(' ').defined().join(' ')];
};

export const parseAlbumFolderName = (album: string): Pick<Release, 'album' | 'discnumber' | 'year'> => {
  const splitParts: string[] = album.split(' ').defined();
  const [year, ...albumNameSplits] = /\d{4}/.test(splitParts[0])
    ? [splitParts[0], ...splitParts.slice(1)]
    : [undefined, ...splitParts];

  const [discnumber, albumTitle] = parseDiscNumber(albumNameSplits.join(' '));

  return {
    album: albumTitle.split(' ').map(capitalize).join(' '),
    ...(discnumber && { discnumber }),
    ...(year && { year }),
  };
};

export const getAlbumArtistInfoFromPath = (current: string = __dirname) =>
  splits(path.join(current))
    .splice(-2)
    .flatMap((split: string, i: number) => (i === 1 ? [split] : [split]))
    .filter((split) => split !== '.');

const isHidden = (fileName: string) => !/^\..*/.test(fileName);

export function readDir(folder: string, filterHidden = true) {
  return filterHidden ? fs.readdirSync(folder).filter(isHidden) : fs.readdirSync(folder);
}

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
