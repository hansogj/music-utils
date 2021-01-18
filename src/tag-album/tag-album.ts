/* eslint-disable no-sequences */
import '../utils/polyfills';
import '../utils/polyfills';

import { defined } from 'array.defined';
import { join } from 'path';

import { extractTags, tagFile } from '../tag';
import { File, MuiscFileTypes, Release, Track } from '../types';
import { error, info } from '../utils/color.log';
import parse, { generator } from '../utils/parse.defined';
import { getAlbumArtistInfoFromPath, parseAlbumFolderName, readDir } from '../utils/path';
import { albumPrompt } from '../utils/prompt';

export interface ParsedValues extends Pick<Track, 'artist' | 'album'> {}

const numOrOne = generator(1);
const numOrNull = generator(0);

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
        trackNo: [(noOfDiscs > 1 || discNumber > 1) && discNumber, preceedingZero, trackNumber].defined().join(''),
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

export const tagAlbum = (dirName: string): Promise<File[]> => {
  const [artist, albumSplit] = getAlbumArtistInfoFromPath(dirName);
  // eslint-disable-next-line prefer-const
  let { year, discnumber, album } = parseAlbumFolderName(albumSplit);
  const fileList = readDir(dirName).map((file) => join(dirName, file));

  discnumber = defined(discnumber) ? discnumber : '1';
  return albumPrompt({ album, artist, year, discnumber, noOfDiscs: discnumber })
    .then((userInput) =>
      Promise.all(fileList.map(extractTags))
        .then((files: Array<File>) => files.filter((file) => MuiscFileTypes.includes(file.fileType)))
        .then((files: Array<File>) => mergeMetaData(files, userInput))
    )
    .then((files: File[]) => Promise.all(files.map((file) => (info(`Tagging ${file.path}`), file)).map(tagFile)))
    .then((files: File[]) => {
      info(`Happy tracking ${files.length} files`);
      return files;
    })
    .catch((e) => {
      error(e);
      return [];
    });
};
