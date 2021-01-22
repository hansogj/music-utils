import path from 'path';

import { DISC_NO_SPLIT } from '../constants';
import { applyMatch, Parser, regExp } from '../tag/parser';
import { Release } from '../types';
import parse from '../utils/parse.defined';
import { splits } from '../utils/path';

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

const joinedRest = (albumTitle: string | string[], rest: string[], fallback: string) =>
  []
    .concat(albumTitle)
    .concat(rest)
    .defined()
    .onEmpty((o: string[]) => o.push(fallback))
    .join(' ');

const splitDiscNumber = (parsedDiscNumber: string) =>
  `${parsedDiscNumber}`
    .split(DISC_NO_SPLIT)
    .map((n: string) => parse(n, undefined))
    .defined()
    .map((e) => `${e}`);

const parseDiscNumber = (parsedAlbum: string = ''): Partial<Release> => {
  return [parsedAlbum]
    .map(discNrParserApplied)
    .map(([albumTitle, parsedDiscNumber, ...rest]) => ({
      parsedDiscNumber,
      album: joinedRest(albumTitle, rest, parsedAlbum),
    }))
    .map(({ parsedDiscNumber, album }) => {
      const [albumTitle, aux, rest] = auxParserApplied(album);
      const [discNumber, noOfDiscs] = splitDiscNumber(parsedDiscNumber);
      return {
        discNumber,
        noOfDiscs,
        aux,
        album: joinedRest([albumTitle, album].defined().first(), rest, parsedAlbum),
      };
    })
    .shift();
};

export const parseAlbumFolderName = (
  albumPath: string
): Pick<Release, 'album' | 'discNumber' | 'year' | 'noOfDiscs' | 'aux'> => {
  const splitParts: string[] = albumPath.split(' ').defined();
  const [year, ...albumNameSplits] = /\d{4}/.test(splitParts[0])
    ? [splitParts[0], ...splitParts.slice(1)]
    : [undefined, ...splitParts];

  const { discNumber, noOfDiscs, album, aux } = parseDiscNumber(albumNameSplits.join(' '));

  return {
    album: album.split(' ').map(capitalize).join(' '),
    ...(discNumber && { discNumber }),
    ...(noOfDiscs && { noOfDiscs }),
    ...(year && { year }),
    ...(aux && { aux }),
  };
};

export const getAlbumArtistInfoFromPath = (current: string = __dirname) =>
  splits(path.join(current))
    .splice(-2)
    .flatMap((split: string, i: number) => (i === 1 ? [split] : [split]))
    .filter((split) => split !== '.');
