import './polyfills';

import { defined } from 'array.defined';

import { DISC_LABLE, DISC_NO_SPLIT } from '../constants';
import { File, Release } from '../types';
import { debugInfo } from './color.log';
import parseNumber from './parse.defined';
import { renameCurrentFolder, renameFile } from './path';

const toLowerCase = (s: string = '') =>
  s
    .split('')
    .map((split) => split.toLowerCase())
    .join('');

export const syncReleaseFolder = (release: Release, dirName: string = ''): Promise<Release> => {
  const { discNumber, noOfDiscs, year, album } = release || ({} as Release);
  const src = dirName.split('/').pop();

  const aux = release?.aux && `[${release.aux}]`;
  const disc =
    [discNumber, noOfDiscs].every(defined) &&
    parseNumber(noOfDiscs, 0) > 1 &&
    `(${DISC_LABLE} ${[discNumber, noOfDiscs].defined().join(DISC_NO_SPLIT)})`;
  const target = [year, album, disc, aux].defined().join(' ');

  debugInfo({ msg: 'rename folder name', src, target });
  const shouldRename = defined(src) && toLowerCase(target) !== toLowerCase(src);

  return shouldRename ? renameCurrentFolder(src, target).then(() => release) : Promise.resolve(release);
};

export const syncTrackNames = (files: File[] = []) =>
  Promise.all(
    files.map(({ path, fileType, track }) => {
      const src = `${path}`.split('/').pop();
      const target =
        [track, track?.trackName, track?.trackNo].every((e) => defined(e)) &&
        `${track.trackNo} ${track.trackName}.${fileType}`;

      debugInfo([track?.trackName, track?.trackNo]);
      debugInfo(`mv  ${src}  ${target}`);
      return defined(target) && target !== src ? renameFile(src, target).then(() => files) : Promise.resolve(files);
    })
  );
