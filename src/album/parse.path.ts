import { defined } from 'array.defined';
import path from 'path';

import { DISC_NO_SPLIT } from '../constants';
import { applyMatch, Parser, regExp } from '../tag/parser';
import { Release } from '../types';
import { getCommandLineArgs } from '../utils/cmd.options';
import { exit } from '../utils/color.log';
import numParser from '../utils/parse.defined';
import { getDirName, readDir, splits } from '../utils/path';

const capitalize = (s: string) => s.slice(0, 1).toLocaleUpperCase() + s.slice(1);

const discNrParser: Parser = {
  matcher: regExp(/(.*)\(\s*[dD][iI][sS][cC]\s*(.*)\s*\)(.*)/),
  select: [1, 2, 3],
};

const auxParser: Parser = {
  matcher: regExp(/(.*)\[(.*)\](.*)/),
  select: [1, 2, 3],
};

const discNrParserApplied = (album: string) => applyMatch(album, [discNrParser]);
const auxParserApplied = (album: string) => applyMatch(album, [auxParser]);
const removeDoubleSpace = (str: string) => str.split(' ').defined().join(' ');

const joinedRest = (albumTitle: string | string[], rest: string[], fallback: string) =>
  []
    .concat(albumTitle)
    .concat(rest)
    .defined()
    .onEmpty((o: string[]) => o.push(fallback))
    .join(' ');

const splitParsedDiscNumber = (parsedDiscNumber: string) =>
  `${parsedDiscNumber}`
    .split(DISC_NO_SPLIT)
    .map((n: string) => numParser(n, undefined))
    .defined()
    .map((e) => `${e}`)
    .onEmpty((o: string[]) => o.push('1')); // defaults to discNumber: 1

const parseDiscNumber = (parsedAlbum: string = ''): Partial<Release> => {
  return [parsedAlbum]
    .map(discNrParserApplied)
    .map(([albumTitle, parsedDiscNumber, ...rest]) => ({
      parsedDiscNumber,
      album: joinedRest(albumTitle, rest, parsedAlbum),
    }))
    .map(({ parsedDiscNumber, album }) => {
      const [albumTitle, aux, rest] = auxParserApplied(album);
      const [discNumber, noOfDiscs] = splitParsedDiscNumber(parsedDiscNumber);
      return {
        discNumber,
        noOfDiscs,
        ...(aux && { aux: removeDoubleSpace(aux) }),
        album: removeDoubleSpace(joinedRest([albumTitle, album].defined().first(), rest, parsedAlbum)),
      };
    })
    .shift();
};

const parseAlbumFolderName = (
  albumPath: string
): Pick<Release, 'album' | 'discNumber' | 'year' | 'noOfDiscs' | 'aux'> => {
  const splitParts: string[] = albumPath.split(' ').defined();
  const [year, ...albumNameSplits] = /\d{4}/.test(splitParts[0])
    ? [splitParts[0], ...splitParts.slice(1)]
    : [undefined, ...splitParts];

  const { discNumber, noOfDiscs, album, aux } = parseDiscNumber(albumNameSplits.join(' '));

  return {
    album: album.split(' ').map(capitalize).join(' '),
    ...(year && { year }),
    ...(discNumber && { discNumber }),
    ...(noOfDiscs && { noOfDiscs }),
    ...(aux && { aux }),
  };
};

const getAlbumArtistInfoFromPath = (current: string = __dirname) =>
  splits(path.join(current))
    .splice(-2)
    .flatMap((split: string, i: number) => (i === 1 ? [split] : [split]))
    .filter((split) => split !== '.')
    .map(removeDoubleSpace);

const calcNoOfDiscsFromPath = (dirName: string, { album }: Partial<Release> = {}): string => {
  const listOfDirs = readDir(dirName.split('/').slice(0, -1).join('/')).filter((disc) =>
    new RegExp(`${album}`, 'i').test(disc)
  );

  return defined(listOfDirs) && `${listOfDirs.length}`;
};

export const parseAlbumInfo = (
  albumPath: string = __dirname
): Pick<Release, 'artist' | 'album' | 'discNumber' | 'year' | 'noOfDiscs' | 'aux'> => {
  const [artist, albumSplit] = getAlbumArtistInfoFromPath(albumPath);
  const release = albumSplit && parseAlbumFolderName(albumSplit);
  const noOfDiscs = release?.noOfDiscs ? release?.noOfDiscs : calcNoOfDiscsFromPath(albumPath, release);

  return { artist, ...(release && release), ...(noOfDiscs && { noOfDiscs }) };
};

export const getAlbumDirectory = () => {
  const { album } = getCommandLineArgs();

  if (defined(album)) {
    try {
      process.chdir(path.join(getDirName(), album));
    } catch (err) {
      exit(`chdir: ${err}`);
    }
  }

  return getDirName();
};
