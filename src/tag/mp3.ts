import { defined } from '@hansogj/array.utils';

import { File, Track } from '../types';
import { debugInfo } from '../utils/color.log';
import { executeFile } from '../utils/execute';
import { toIntOr } from '../utils/number';
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
  const reduced = splitLines(unparsed).reduce((res: Record<string, string>, line: string) => {
    const [trackName] = applyMatch(line, [trackNameParser]);
    const [trackNo] = applyMatch(line, [trackNoParser]);

    return {
      ...res,
      ...(defined(trackName) && { trackName }),
      ...(toIntOr(trackNo, undefined) && { trackNo }),
    } as Partial<Track>;
  }, {});

  return reduced as Partial<Track>;
};

export const id3v2 = (unparsed = ''): Partial<Track> => {
  const reduced = splitLines(unparsed).reduce((res: Record<string, string>, line: string) => {
    const [key, val] = line.split(/\(.*\):/).map((s) => s.trim());
    res[key] = val;
    return res;
  }, {});

  const [trackNo, trackNoTotal] =
    reduced.TRCK?.split(/\//)
      .defined()
      .filter((e) => toIntOr(e, 0) !== 0) || [];

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
  executeFile('id3v2', ['-l', path])
    .then((output) => output.trim())
    .then(parseId3Output);

const mp3TagArgs = (val: string | undefined, tag: string): string[] | false => (val ? [`--${tag}`, val] : false);

const generateTagArgs = ({
  album,
  artist,
  trackName,
  trackNo,
  trackNoTotal,
  discNumber,
  noOfDiscs,
  year,
}: Partial<Track>): string[] =>
  (
    [
      mp3TagArgs(artist, ARTIST),
      mp3TagArgs([discNumber, noOfDiscs].defined().join('/'), TPOS),
      mp3TagArgs(year, YEAR),
      mp3TagArgs(album, ALBUM),
      mp3TagArgs([trackNo, trackNoTotal].defined().join('/'), TRACKNUMBER),
      mp3TagArgs(trackName, TITLE),
    ] as (string[] | false)[]
  )
    .filter((v): v is string[] => v !== false)
    .flat();

export const write = ({ path, track }: File) => {
  debugInfo(`Tagging ${path.split('/').slice(-2).join('/')}`);

  return executeFile('id3v2', ['-2', ...generateTagArgs(track), path]);
};
