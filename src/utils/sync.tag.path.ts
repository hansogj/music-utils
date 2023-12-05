import './polyfills';

import { defined } from '@hansogj/array.utils';

import { DISC_LABEL, DISC_NO_SPLIT } from '../constants';
import { File, Release } from '../types';
import { debugInfo } from './color.log';
import { precedingZero, wov } from './number';
import { renameFile, renameFolder } from './path';
import { toLowerCase } from './string';

export const syncReleaseFolder = (release: Release, dirName = ''): Promise<Release> => {
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

export const syncTrackNames = (files: File[] = [], release?: Release) =>
  Promise.all(
    files.map(({ path, fileType, track: { trackName, trackNo, discNumber } = {} }) => {
      const src = `${path}`.split('/').pop();
      const discNr = discNumber || release.discNumber;
      const zero = precedingZero(parseInt(discNr, 10), parseInt(trackNo, 10)) === 0 ? '0' : '';
      const artistSection = release?.artist ? ` ${release?.artist} - ` : ' ';
      let sortableTrackNumber = discNr ? `d${discNr}t${zero}${trackNo}.` : trackNo;

      if (trackNo?.length > 2) {
        const [discNoFromTrack, ...rest] = trackNo.split('');
        sortableTrackNumber = discNr ? `d${discNr}t${rest.join('')}.` : `d${discNoFromTrack}t${rest.join('')}.`;
      }

      const target =
        [trackName, sortableTrackNumber].every((e) => defined(e)) &&
        `${sortableTrackNumber}${artistSection}${trackName}.${fileType}`;

      debugInfo({ trackName, trackNo, sortableTrackNumber, discNr });
      debugInfo(`mv  ${src}  ${target}`);
      return defined(target) && target !== src ? renameFile(src, target).then(() => files) : Promise.resolve(files);
    }),
  );
