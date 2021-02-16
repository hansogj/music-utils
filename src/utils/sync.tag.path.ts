import './polyfills';

import { defined } from 'array.defined';

import { DISC_LABEL, DISC_NO_SPLIT } from '../constants';
import { File, Release } from '../types';
import { debugInfo } from './color.log';
import { wov } from './number';
import { renameFile, renameFolder } from './path';
import { toLowerCase } from './string';

export const syncReleaseFolder = (release: Release, dirName: string = ''): Promise<Release> => {
  const { discNumber, noOfDiscs, year, album } = release || ({} as Release);
  const src = dirName.split('/').pop();

  const aux = release?.aux && `[${release.aux}]`;
  const disc =
    [discNumber, noOfDiscs].every(defined) &&
    wov(noOfDiscs, 0) > 1 &&
    `(${DISC_LABEL} ${[discNumber, noOfDiscs].defined().join(DISC_NO_SPLIT)})`;
  const target = [year, album, disc, aux].defined().join(' ');

  const shouldRename = defined(src) && toLowerCase(target) !== toLowerCase(src);
  debugInfo({ msg: shouldRename ? 'rename album folder name' : 'keeping', src, target });
  return shouldRename ? renameFolder(src, target).then(() => release) : Promise.resolve(release);
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
