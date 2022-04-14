import { defined } from 'array.defined';

import { File, Track } from '../types';
import { debugInfo } from '../utils/color.log';
import { execute } from '../utils/execute';
import { wov } from '../utils/number';
import { replaceQuotes } from '../utils/path';
import { applyMatch, Parser, regExp } from './parser';

const ARTIST = `TPE1`;
const TPOS = 'TPOS';
const YEAR = 'TYER';
const ALBUM = 'TALB';
const TRACKNUMBER = 'TRCK';
const TITLE = 'TIT2';

const splitLines = (lines = '') =>
  lines
    .split(/\n/)
    .map((split: string) => split.trim())
    .defined();

const hit = /\s*:(.*)/;

const trackNameParser: Parser = {
  matcher: regExp(/Title/, hit, /Artist/, hit),
  select: [1],
};

const trackNoParser: Parser = {
  matcher: regExp(/Comment/, hit, /Track/, hit),
  select: [2],
};

export const id3v1 = (unparsed: string): Partial<Track> => {
  const reduced = splitLines(unparsed).reduce((res: Hash<string>, line: string) => {
    const [trackName] = applyMatch(line, [trackNameParser]);
    const [trackNo] = applyMatch(line, [trackNoParser]);

    return { ...res, ...(defined(trackName) && { trackName }), ...(wov(trackNo, undefined) && { trackNo }) };
  }, {});

  return reduced;
};

export const id3v2 = (unparsed = ''): Partial<Track> => {
  const reduced = splitLines(unparsed).reduce((res: Hash<string>, line: string) => {
    const [key, val] = line.split(/\(.*\):/).map((s) => s.trim());
    // @ts-ignore
    res[key] = val;
    return res;
  }, {});

  const [trackNo, trackNoTotal] =
    reduced.TRCK?.split(/\//)
      .defined()
      .filter((e) => wov(e, 0) !== 0) || [];

  return {
    ...(reduced.TIT2 && { trackName: reduced.TIT2 }),
    ...(trackNo && { trackNo }),
    ...(trackNoTotal && { trackNoTotal }),
  } as Partial<Track>;
};

export const parseId3Output = (output: string) => ({
  ...id3v2(output),
  ...id3v1(output),
});

export const read = (path = ''): Promise<Partial<Track>> =>
  execute(`id3v2 -l "${path}"`)
    .then((output) => [output].join('').trim())
    .then(parseId3Output);

const mp3Tag = (val: string, tag: string) => val && `--${tag} "${replaceQuotes(val)}"`;

const generateTagString = ({
  album,
  artist,
  trackName,
  trackNo,
  trackNoTotal,
  discNumber,
  noOfDiscs,
  year,
}: Partial<Track>) =>
  [
    mp3Tag(artist, ARTIST),
    mp3Tag([discNumber, noOfDiscs].defined().join('/'), TPOS),
    mp3Tag(year, YEAR),
    mp3Tag(album, ALBUM),
    mp3Tag([trackNo, trackNoTotal].defined().join('/'), TRACKNUMBER),
    mp3Tag(trackName, TITLE),
  ]
    .defined()
    .join(' ');

export const write = ({ path, track }: File) => {
  debugInfo(`Tagging ${path.split('/').slice(-2).join('/')}`);

  return execute(`id3v2 -2 ${generateTagString(track)} "${path}"`.replace(/\s+/, ' ').trim());
};
