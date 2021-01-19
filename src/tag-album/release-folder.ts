import { defined } from 'array.defined';

import { DISC_NO_SPLIT } from '../constants';
import { Release } from '../types';
import { renameCurrentFolder } from '../utils/path';

export const syncReleaseFolder = (release: Release, dirName: string): Promise<Release> => {
  const { discnumber, noOfDiscs, year, album } = release || ({} as Release);
  const src = `${dirName}`.split('/').pop();
  const disc = defined(discnumber) && `(disc ${[discnumber, noOfDiscs].defined().join(DISC_NO_SPLIT)})`;
  const target = [year, album, disc].defined().join(' ');
  const shouldRename = defined(target) && target !== dirName;
  return shouldRename ? renameCurrentFolder(src, target).then(() => release) : Promise.resolve(release);
};
