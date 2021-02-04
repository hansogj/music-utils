import { defined } from 'array.defined';

import { Track } from '../types';
import { capitalize } from '../utils/string';
import { applyMatch, Parser, regExp } from './parser';

const dash = /(\s*-\s*)?/;

const trackNoParser: Parser = {
  matcher: regExp(/(\d*)\.?/, dash, /(.*)/),
  select: [1, 3],
};

const trackNameParser: Parser = {
  matcher: regExp(/Disc\s(\d*)/, dash, /\s*/, trackNoParser.matcher),
  select: [3, 5, 1],
};

const noOfDiscsParser: Parser = {
  matcher: regExp(/d(\d*)t(\d*)/, dash, /\s*/, trackNoParser.matcher), // , ),
  select: [2, 6, 1],
};

export const read = (path = ''): Promise<Partial<Track>> => {
  const unparasedTrackName: string = `/${path}`
    .split('/')
    .last()
    .map((filePath) => filePath.split('.').filter((_, i, arr) => arr.length === 1 || i < arr.length - 1))
    .map((filePaths) => filePaths.join('.'))
    .defined()
    .onEmpty((o: Array<string>) => o.push(''))
    .shift() as string;

  const [trackNo, trackName, noOfDiscs] = applyMatch(unparasedTrackName, [
    trackNoParser,
    trackNameParser,
    noOfDiscsParser,
  ]).map(capitalize);

  return new Promise((resolve) =>
    resolve({
      ...(defined(trackNo) && { trackNo }),
      ...(defined(trackName) && { trackName }),
      ...(defined(noOfDiscs) && { noOfDiscs }),
    })
  );
};

export const write = (track: Track) => new Promise((resolve) => resolve(track));
