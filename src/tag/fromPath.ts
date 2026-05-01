import { defined } from '@hansogj/array.utils';
import nodePath from 'path';

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
  matcher: regExp(/d(\d*)t(\d*)/, dash, /\s*/, trackNoParser.matcher),
  select: [2, 6, 1],
};

export const read = (path = ''): Promise<Partial<Track>> => {
  const ext = nodePath.extname(path);
  const unparsedTrackName = nodePath.basename(path, ext) || '';

  const [trackNo, trackName, noOfDiscs] = applyMatch(unparsedTrackName, [
    trackNoParser,
    trackNameParser,
    noOfDiscsParser,
  ]).map(capitalize);

  return Promise.resolve({
    ...(defined(trackNo) && { trackNo }),
    ...(defined(trackName) && { trackName }),
    ...(defined(noOfDiscs) && { noOfDiscs }),
  });
};
