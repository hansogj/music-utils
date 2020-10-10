import { defined } from 'array.defined';

import { Tag } from '../types';
import { execute } from './execute';
import { getFileType } from './path';

const dash = /(\s*-\s*)?/;

const regExp = (...expressions: RegExp[]) => new RegExp(expressions.map((exp) => exp.source).join(''));

export const getTrackTagsFromPath = (path = ''): Partial<Tag> => {
  const unparasedTrackName: string = `/${path}`
    .split('/')
    .last()
    .map((filePath) => filePath.split('.').filter((_, i, arr) => arr.length === 1 || i < arr.length - 1))
    .map((filePaths) => filePaths.join('.'))
    .defined()
    .onEmpty((o: Array<string>) => o.push(''))
    .shift() as string;

  type Parser = {
    matcher: RegExp;
    selector: (selecFrom: RegExpMatchArray) => Array<string>;
  };

  const mapToTags = (fromSelection: RegExpMatchArray, matches: number[]) =>
    fromSelection === null ? [] : matches.map((i) => fromSelection[i].split(/\s/).defined().join(' '));

  const t1: Parser = {
    matcher: regExp(/(\d*)/, dash, /(.*)/),
    selector: (selectFrom: RegExpMatchArray) => mapToTags(selectFrom, [1, 3]),
  };

  const t2: Parser = {
    matcher: regExp(/Disc\s(\d*)/, dash, /\s*/, t1.matcher),
    selector: (selectFrom: RegExpMatchArray) => mapToTags(selectFrom, [3, 5, 1]),
  };

  const t3: Parser = {
    matcher: regExp(/d(\d*)t(\d*)/, dash, /\s*/, t1.matcher), // , ),
    selector: (selectFrom: RegExpMatchArray) => mapToTags(selectFrom, [2, 6, 1]),
  };

  const [trackNo, trackName, noOfDiscs] = [t1, t2, t3]
    .filter(({ matcher }) => defined(unparasedTrackName) && matcher.test(unparasedTrackName))
    .last()
    .flatMap(({ matcher, selector }: typeof t1) => selector(unparasedTrackName.match(matcher) as RegExpMatchArray));

  return {
    ...(defined(trackNo) && { trackNo }),
    ...(defined(trackName) && { trackName }),
    ...(defined(noOfDiscs) && { noOfDiscs }),
  };
};

export const getTrackTagsFromFlac = (path = ''): Promise<Partial<Tag>> => {
  return Promise.resolve({});
};

const getTrackname = (path: string) =>
  `${path
    .split('/')
    .last()
    .onEmpty((o: Array<string>) => o.push(path))
    .shift()}`;

export const tagFile = (path: string, tag: Tag): Promise<Tag> => {
  //  warning(JSON.stringify(tag));
  return execute(`echo ${path}`).then(() => tag);
};

export const extractTags = (path: string): Promise<Tag> => {
  return getFileType(path).then(
    (fileType) =>
      ({
        fileType,
        trackName: getTrackname(path),
      } as Tag)
  );
};
