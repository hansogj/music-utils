import { defined } from 'array.defined';

import { DISC_NO_SPLIT } from '../constants';
import { File, Release } from '../types';
import { renameCurrentFolder, renameFile } from './path';

const toLowerCase = (s: string = '') =>
  s
    .split('')
    .map((split) => split.toLowerCase())
    .join('');

export const syncReleaseFolder = (release: Release, dirName: string = ''): Promise<Release> => {
  const { discnumber, noOfDiscs, year, album } = release || ({} as Release);
  const src = dirName.split('/').pop();
  const disc =
    [discnumber, noOfDiscs].every(defined) && `(disc ${[discnumber, noOfDiscs].defined().join(DISC_NO_SPLIT)})`;
  const target = [year, album, disc].defined().join(' ');
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

      return defined(target) && target !== src ? renameFile(src, target).then(() => files) : Promise.resolve(files);
    })
  );
