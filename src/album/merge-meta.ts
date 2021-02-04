import '../utils/polyfills';

import { defined } from 'array.defined';

import { File, Release, Track } from '../types';
import { numOrNull, wov } from '../utils/number';

export interface ParsedValues extends Pick<Track, 'artist' | 'album'> {}

const totalNumberOfTracks = ({ trackNoTotal }: Partial<Track> = {} as Partial<Track>, files: File[]) =>
  `${trackNoTotal !== undefined ? trackNoTotal : files.length}`;

export const sortable = (file: File): File => {
  let track = file?.track;

  if (defined(track) && defined(track.trackNo)) {
    const discNumber = wov(track?.discNumber, undefined);
    const trackNumber = numOrNull(track?.trackNo, 0)
      .map((trNum) => (trNum > 100 ? wov(trNum % 100, 0) : trNum))
      .shift();

    const preceedingZero = defined(discNumber) && trackNumber < 10 ? 0 : trackNumber < 10 && 0; //  trackNoTotal > 10 ? (defined(discNumber)  || trackNumber < 10) && 0;
    const trackNo = [discNumber, preceedingZero, trackNumber].defined().join('');
    track = { ...track, ...{ trackNo } };
  }

  return { ...file, track };
};

export const mergeMetaData = (
  files: Array<File> = [],
  release: Partial<Release>,
  tracksFromFile?: string[]
): Array<File> =>
  files
    .filter((file) => defined(file.path))
    .map(({ fileType, track, path }, index: number) => ({
      path,
      fileType,
      track: {
        ...track,
        ...release,
        ...(defined(tracksFromFile) && defined(tracksFromFile[index]) && { trackName: tracksFromFile[index] }),
        trackNoTotal: totalNumberOfTracks(track, files),
      },
    }))
    .map(sortable)
    .defined();
