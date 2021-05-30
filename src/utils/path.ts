import fs from 'fs';

import { DISC_NO_SPLIT } from '../constants';
import { singleSpace } from '../tag/parser';
import { FILETYPE } from '../types';
import { debugInfo, info } from './color.log';
import { execute } from './execute';

export const splits = (paths: string) =>
  paths
    .split('/')
    .filter((split) => split.length)
    .map((split) => split.replace(/\n/, ''));

export const getPwd = (): Promise<string[]> => execute('pwd').then((e) => splits(e as string));

const isHidden = (fileName: string) => !/^\..*/.test(fileName);

export const readDir = (folder: string, filterHidden = true) =>
  filterHidden ? fs.readdirSync(folder).filter(isHidden) : fs.readdirSync(folder);

export const getDirName = () => process.cwd();

export const getFileType = (filePath: string): Promise<FILETYPE> =>
  execute(`file -i "${filePath}"`).then((stdout) => {
    if (/\.mp3/.test(`${stdout}`)) {
      return 'mp3';
    }

    if (/\.flac/.test(`${stdout}`)) {
      return 'flac';
    }

    if (/\.jpe?g/.test(`${stdout}`)) {
      return 'jpg';
    }

    if (/\.te?xt/.test(`${stdout}`)) {
      return 'text';
    }

    return 'unknown';
  });

export const renameFolder = (src: string, target: string, root = '../') =>
  execute(`mv ${root}"${src}" ${root}"${target}"`);

export const renameFile = (src: string, target: string) => execute(`mv "${src}" "${target}"`);

export const replaceQuotes = (str: string = '') => singleSpace(str).replace(/"/g, `'`);

export const replaceDangers = (str: string = '') => replaceQuotes(str).replace(/\//g, DISC_NO_SPLIT);
