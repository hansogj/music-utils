import '../utils/polyfills';

import { defined } from 'array.defined';

import { File, Release, Track } from '../types';
import parse, { numOrNull, numOrOne } from '../utils/parse.defined';

export interface ParsedValues extends Pick<Track, 'artist' | 'album'> {}

const totalNumberOfTracks = ({ trackNoTotal }: Partial<Track> = {} as Partial<Track>, files: File[]) =>
  `${trackNoTotal !== undefined ? trackNoTotal : files.length}`;

export const sortable = (file: File): File => {
  let track = file?.track;

  if (defined(track) && defined(track.trackNo)) {
    const [noOfDiscs, discNumber] = numOrOne(track?.noOfDiscs, track?.discNumber);
    const trackNumber = numOrNull(track?.trackNo)
      .map((trNum) => (trNum > 100 ? parse(trNum % 100, 0) : trNum))
      .shift();

    const preceedingZero = numOrOne(track?.trackNoTotal)
      .filter((trackNoTotal) => (discNumber > 1 || trackNoTotal >= 10) && trackNumber < 10)
      .map(() => 0)
      .shift();

    track = {
      ...track,
      ...{
        trackNo: [[noOfDiscs, discNumber].some((num) => num > 1) && discNumber, preceedingZero, trackNumber]
          .defined()
          .join(''),
      },
    };
  }

  return {
    ...file,
    track,
  };
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
