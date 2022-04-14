import { defined } from '@hansogj/array.utils/lib/defined';
import maybe from 'maybe-for-sure';
import path from 'path';

import { DEFINITE_ARTICLES, DISC_NO_SPLIT } from '../constants';
import { applyMatch, Parser, regExp } from '../tag/parser';
import { Release } from '../types';
import { getCommandLineArgs } from '../utils/cmd.options';
import { exit } from '../utils/color.log';
import { wov } from '../utils/number';
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

const discNrParserApplied = (album: string) => applyMatch(album, [discNrParser]);
const auxParserApplied = (album: string) => applyMatch(album, [auxParser]);

const prettyAux = (...aux: string[]) => removeDoubleSpace(aux.join(' ')).replace(/\[|\]/g, '');
const splitParsedDiscNumber = (parsedDiscNumber: string) =>
  `${parsedDiscNumber}`
    .split(DISC_NO_SPLIT)
    .map((n: string) => wov(n, undefined))
    .defined()
    .map((e) => `${e}`)
    .onEmpty((o: string[]) => o.push('1') as never); // defaults to discNumber: 1

const parseDiscNumber = (parsedAlbum = ''): Partial<Release> =>
  [parsedAlbum]
    .map(discNrParserApplied)
    .map(([albumTitle, parsedDiscNumber, ...aux]) => ({
      aux: aux.join(' '),
      parsedDiscNumber,
      album: maybe(albumTitle).valueOr(parsedAlbum),
    }))
    .map(({ parsedDiscNumber, album, aux }) => {
      const [albumTitle, parsedAux, rest] = auxParserApplied(album);
      const [discNumber, noOfDiscs] = splitParsedDiscNumber(parsedDiscNumber);
      return {
        discNumber,
        noOfDiscs,
        ...((aux || parsedAux) && { aux: prettyAux(aux, parsedAux) }),
        album: removeDoubleSpace(
          maybe(albumTitle || album)
            .map((it) => [it].concat([rest]).defined().join(' '))
            .valueOr(parsedAlbum)
        ),
      };
    })
    .shift();

const parseAlbumFolderName = (
  albumPath: string
): Pick<Release, 'album' | 'discNumber' | 'year' | 'noOfDiscs' | 'aux'> => {
  const splitParts: string[] = albumPath.split(' ').defined();
  const [year, ...albumNameSplits] = /\d{4}/.test(splitParts[0])
    ? [splitParts[0], ...splitParts.slice(1)]
    : [undefined, ...splitParts];

  const { discNumber, noOfDiscs, album, aux } = parseDiscNumber(albumNameSplits.join(' '));

  return {
    album: capitalize(album),
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
    new RegExp(`${album}`, 'i').test(disc)
  ).length;

  return wov(discNumber, 1) > numberOfAlbumsWithSimilarNames ? discNumber : `${numberOfAlbumsWithSimilarNames}`;
};

export const artistSortable = (artist: string) =>
  DEFINITE_ARTICLES.filter((prefix) => RegExp(`^${prefix} `, 'i').test(artist))
    .map((prefix: string) =>
      artist
        .split(RegExp(`^${prefix} `, 'i'))
        .reverse()
        .join(`, ${prefix}`)
    )
    .onEmpty((o: string[]) => o.push(artist) as never)
    .shift();

export const parseAlbumInfo = (
  albumPath: string = __dirname
): Pick<Release, 'artist' | 'album' | 'discNumber' | 'year' | 'noOfDiscs' | 'aux'> => {
  const [artist, albumSplit] = getAlbumArtistInfoFromPath(albumPath);
  const release = albumSplit && parseAlbumFolderName(albumSplit);
  const noOfDiscs = release?.noOfDiscs ? release?.noOfDiscs : calcNoOfDiscsFromPath(albumPath, release);

  return { ...{ artist: artistSortable(artist) }, ...(release && release), ...(noOfDiscs && { noOfDiscs }) };
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
