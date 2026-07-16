import fs from 'node:fs';
import { join } from 'node:path';

import { getConfig } from '../config';
import { singleSpace } from '../tag/parser';
import { FILETYPE } from '../types';
import { executeFile } from './execute';

export const splits = (paths: string) =>
  paths
    .split('/')
    .filter((split) => split.length)
    .map((split) => split.replace(/\n/, ''));

export const getPwd = (): Promise<string[]> => executeFile('pwd', []).then(splits);

const isHidden = (fileName: string) => !/^\..*/.test(fileName);

export const readDir = (folder: string, filterHidden = true) =>
  filterHidden ? fs.readdirSync(folder).filter(isHidden) : fs.readdirSync(folder);

export const getDirName = () => process.cwd();

export const getFileType = (filePath: string): Promise<FILETYPE> =>
  executeFile('file', ['-i', filePath]).then((stdout) => {
    if (/\.mp3/.test(stdout)) return 'mp3';
    if (/\.flac/.test(stdout)) return 'flac';
    if (/\.jpe?g/.test(stdout)) return 'jpg';
    if (/\.te?xt/.test(stdout)) return 'text';
    return 'unknown';
  });

export const renameFolder = (src: string, target: string, root = '../') =>
  executeFile('mv', [join(root, src), join(root, target)]);

export const renameFile = (src: string, target: string) => executeFile('mv', [src, target]);

export const replaceQuotes = (str = '') => singleSpace(str).replace(/"/g, `'`);

export const replaceDangers = (str = '') => replaceQuotes(str).replace(/\//g, getConfig().disc.separator);
