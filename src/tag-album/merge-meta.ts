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
    const [noOfDiscs, discNumber] = numOrOne(track?.noOfDiscs, track?.discnumber);
    const preceedingZero = numOrOne(track?.trackNoTotal)
      .filter((trackNoTotal) => discNumber > 1 || trackNoTotal >= 10)
      .map(() => 0)
      .shift();
    const trackNumber = numOrNull(track?.trackNo)
      .map((trNum) => (trNum > 100 ? parse(trNum % 100, 0) : trNum))
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

export const mergeMetaData = (files: Array<File> = [], userInput: Partial<Release>): Array<File> =>
  files
    .filter((file) => defined(file.path))
    .map(({ fileType, track, path }) => {
      const trackNoTotal = totalNumberOfTracks(track, files);
      return {
        path,
        fileType,
        track: {
          trackNoTotal,
          ...track,
          ...userInput,
        },
      };
    })
    .map(sortable)
    .defined();