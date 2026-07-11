import './polyfills';

import { defined } from '@hansogj/array.utils';

import { getConfig, renderAlbumFolder, renderTrackName } from '../config';
import { File, Release } from '../types';
import { debugInfo } from './color.log';
import { precedingZero } from './number';
import { renameFile, renameFolder } from './path';
import { toLowerCase } from './string';

export const syncReleaseFolder = (release: Release, dirName = ''): Promise<Release> => {
  const src = dirName.split('/').pop();
  const target = renderAlbumFolder(release ?? {}, getConfig());

  const shouldRename = defined(src) && toLowerCase(target) !== toLowerCase(src);
  debugInfo({ msg: shouldRename ? 'rename album folder name' : 'keeping', src, target });
  return shouldRename ? renameFolder(src!, target).then(() => release) : Promise.resolve(release);
};

interface NormalizedTrack {
  disc?: string;
  trackNo?: string;
  trackName?: string;
}

/**
 * Split a 3+-digit trackNo into its encoded disc + track components, and
 * left-pad the track number when it would look better with a leading zero.
 */
const normalizeTrack = (
  trackNo: string | undefined,
  trackDisc: string | undefined,
  releaseDisc: string | undefined,
): NormalizedTrack => {
  const disc = trackDisc || releaseDisc;

  if ((trackNo?.length ?? 0) > 2) {
    const [encodedDisc, ...rest] = trackNo!.split('');
    return { disc: trackDisc ?? encodedDisc, trackNo: rest.join('') };
  }

  // Pad only in the multi-disc branch and only if trackNo is < 2 chars — matches pre-refactor behavior.
  const needsPad =
    disc !== undefined &&
    (trackNo?.length ?? 0) < 2 &&
    precedingZero(parseInt(disc, 10), parseInt(trackNo ?? '0', 10)) === 0;
  return { disc, trackNo: trackNo ? `${needsPad ? '0' : ''}${trackNo}` : trackNo };
};

export const syncTrackNames = (files: File[] = [], release?: Release) =>
  Promise.all(
    files.map(({ path, fileType, track = {} }) => {
      const src = `${path}`.split('/').pop();
      const { disc, trackNo } = normalizeTrack(track.trackNo, track.discNumber, release?.discNumber);
      const trackName = track.trackName;

      const target =
        defined(trackName) && defined(trackNo)
          ? `${renderTrackName({ trackName, trackNo, discNumber: disc }, release ?? {}, getConfig())}.${fileType}`
          : undefined;

      debugInfo({ trackName, trackNo, disc });
      debugInfo(`mv  ${src}  ${target}`);
      return defined(target) && target !== src
        ? renameFile(src!, `${target}`).then(() => files)
        : Promise.resolve(files);
    }),
  );
