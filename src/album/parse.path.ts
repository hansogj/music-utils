import path from 'path';

import { DISC_LABLE, DISC_NO_SPLIT } from '../constants';
import { applyMatch, Parser, regExp } from '../tag/parser';
import { Release } from '../types';
import parse from '../utils/parse.defined';
import { splits } from '../utils/path';

const capitalize = (s: string) => s.slice(0, 1).toLocaleUpperCase() + s.slice(1);

const discNrParser: Parser = {
  matcher: regExp(/(.*)\(\s*[dD][iI][sS][cC]\s*(.*)\s*\)(.*)/),
  select: [1, 2, 3],
};

const discNrParserApplied = (album: string) => applyMatch(album, [discNrParser]);

const parseDiscNumber = (album: string = ''): Partial<Release> => {
  return [album]
    .map(discNrParserApplied)
    .map(([pre, discNumberWithTotal, ...rest]) => {
      const remains = [pre]
        .concat(rest)
        .defined()
        .onEmpty((o: string[]) => o.push(album))
        .join(' ');
      return { discNumberWithTotal, remains };
    })
    .map(({ discNumberWithTotal, remains }) => {
      const [discNumber, noOfDiscs] = `${discNumberWithTotal}`
        .split(DISC_NO_SPLIT)
        .map((n: string) => parse(n, undefined))
        .defined()
        .map((e) => `${e}`);
      return { discNumber, noOfDiscs, album: remains };
    })
    .shift();
};

export const parseAlbumFolderName = (
  albumPath: string
): Pick<Release, 'album' | 'discNumber' | 'year' | 'noOfDiscs'> => {
  const splitParts: string[] = albumPath.split(' ').defined();
  const [year, ...albumNameSplits] = /\d{4}/.test(splitParts[0])
    ? [splitParts[0], ...splitParts.slice(1)]
    : [undefined, ...splitParts];

  const { discNumber, noOfDiscs, album } = parseDiscNumber(albumNameSplits.join(' '));

  return {
    album: album.split(' ').map(capitalize).join(' '),
    ...(discNumber && { discNumber }),
    ...(noOfDiscs && { noOfDiscs }),
    ...(year && { year }),
  };
};

export const getAlbumArtistInfoFromPath = (current: string = __dirname) =>
  splits(path.join(current))
    .splice(-2)
    .flatMap((split: string, i: number) => (i === 1 ? [split] : [split]))
    .filter((split) => split !== '.');
