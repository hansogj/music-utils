import '../utils/polyfills';

import { defined } from '@hansogj/array.utils';
import maybe from '@hansogj/maybe';

import { File, Release, Track } from '../types';
import { numOrNull, toIntOr } from '../utils/number';

export type ParsedValues = Pick<Track, 'artist' | 'album'>;

const totalNumberOfTracks = (files: File[], track: Partial<Track> = {}): string =>
  `${track.trackNoTotal !== undefined ? track.trackNoTotal : files.length}`;

export const sortable = (file: File): File => {
  let track = file?.track;

  if (defined(track) && defined(track.trackNo)) {
    const discNumber = maybe(track)
      .mapTo('discNumber')
      .ifNothing(() => Math.floor(parseInt(track.trackNo, 10) / 100))
      .map((it) => `${it}`)
      .valueOr('1');

    const trackNumber = numOrNull(track?.trackNo, 0)
      .map((trNum) => (trNum > 100 ? toIntOr(trNum % 100, 0) : trNum))
      .shift();

    const trackNo = [trackNumber].defined().join('');
    track = { ...track, discNumber, trackNo };
  }

  return { ...file, track };
};

export const mergeMetaData = (files: File[] = [], release: Partial<Release>, tracksFromFile?: string[]): File[] =>
  files
    .filter((file) => defined(file.path))
    .map(({ fileType, track, path }, index: number) => ({
      path,
      fileType,
      track: {
        ...track,
        ...release,
        ...(defined(tracksFromFile) && defined(tracksFromFile[index]) && { trackName: tracksFromFile[index] }),
        trackNoTotal: totalNumberOfTracks(files, track),
      },
    }))
    .map(sortable)
    .defined();
