import { defined } from '@hansogj/array.utils';
import maybe from '@hansogj/maybe';
import path from 'path';

import { DEFINITE_ARTICLES, DISC_NO_SPLIT } from '../constants';
import { applyMatch, Parser, regExp } from '../tag/parser';
import { Release } from '../types';
import { getCommandLineArgs } from '../utils/cmd.options';
import { exit } from '../utils/color.log';
import { toIntOr } from '../utils/number';
import { getDirName, readDir, splits } from '../utils/path';
import { capitalize, removeDoubleSpace } from '../utils/string';

const discNrParser: Parser = {
  matcher: regExp(/(.*)\(\s*[dD][iI][sS][cC]\s*(.*)\s*\)(.*)/),
  select: [1, 2, 3],
};

const auxParser: Parser = {
  matcher: regExp(/(.*)\[(.*)\](.*)/),
  select: [1, 2, 3],
};

const cleanAuxInfo = (...aux: string[]) => removeDoubleSpace(aux.join(' ')).replace(/\[|\]/g, '');

const splitParsedDiscNumber = (parsedDiscNumber: string): string[] => {
  const parts = `${parsedDiscNumber}`
    .split(DISC_NO_SPLIT)
    .map((n: string) => toIntOr(n, undefined))
    .defined()
    .map((e) => `${e}`);

  return parts.length > 0 ? parts : ['1']; // defaults to discNumber: 1
};

const parseDiscNumber = (parsedAlbum = ''): Partial<Release> => {
  const [albumTitle, parsedDiscNumber, ...auxParts] = applyMatch(parsedAlbum, [discNrParser]);
  const aux = auxParts.join(' ');
  const album = maybe(albumTitle).valueOr(parsedAlbum);

  const [cleanAlbumTitle, parsedAux, rest] = applyMatch(album, [auxParser]);
  const [discNumber, noOfDiscs] = splitParsedDiscNumber(parsedDiscNumber);

  return {
    discNumber,
    noOfDiscs,
    ...((aux || parsedAux) && { aux: cleanAuxInfo(aux, parsedAux) }),
    album: removeDoubleSpace(
      maybe(cleanAlbumTitle || album)
        .map((it) => [it].concat([rest]).defined().join(' '))
        .valueOr(parsedAlbum),
    ),
  };
};

const parseAlbumFolderName = (
  albumPath: string,
): Pick<Release, 'album' | 'discNumber' | 'year' | 'noOfDiscs' | 'aux'> => {
  const splitParts: string[] = albumPath.split(' ').defined();
  const [year, ...albumNameSplits] = /\d{4}/.test(splitParts[0])
    ? [splitParts[0], ...splitParts.slice(1)]
    : [undefined, ...splitParts];

  const { discNumber, noOfDiscs, album, aux } = parseDiscNumber(albumNameSplits.join(' '));

  return {
    album: capitalize(album ?? ''),
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

const calcNoOfDiscsFromPath = (dirName: string, { album, discNumber }: Partial<Release> = {}): string => {
  const numberOfAlbumsWithSimilarNames = readDir(dirName.split('/').slice(0, -1).join('/')).filter((disc) =>
    new RegExp(`${album}`, 'i').test(disc),
  ).length;

  return toIntOr(discNumber ?? 1, 1) > numberOfAlbumsWithSimilarNames
    ? (discNumber ?? '1')
    : `${numberOfAlbumsWithSimilarNames}`;
};

export const artistSortable = (artist: string) => {
  const matchingPrefix = DEFINITE_ARTICLES.find((prefix) => RegExp(`^${prefix} `, 'i').test(artist));
  if (!matchingPrefix) return artist;

  return artist
    .split(RegExp(`^${matchingPrefix} `, 'i'))
    .reverse()
    .join(`, ${matchingPrefix}`);
};

export const parseAlbumInfo = (
  albumPath: string = __dirname,
): Pick<Release, 'artist' | 'album' | 'discNumber' | 'year' | 'noOfDiscs' | 'aux'> => {
  const [artist, albumSplit] = getAlbumArtistInfoFromPath(albumPath);
  const release = albumSplit ? parseAlbumFolderName(albumSplit) : undefined;
  const noOfDiscs = release?.noOfDiscs ? release.noOfDiscs : calcNoOfDiscsFromPath(albumPath, release);

  return { artist: artistSortable(artist), album: '', ...release, ...(noOfDiscs && { noOfDiscs }) };
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
