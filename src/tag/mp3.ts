import { defined } from 'array.defined';
import { info } from 'console';

import { File, Track } from '../types';
import { execute } from '../utils/execute';
import { applyMatch, Parser, regExp } from './parser';

const splitLines = (lines: string = '') =>
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

    return { ...res, ...(defined(trackName) && { trackName }), ...(defined(trackNo) && { trackNo }) };
  }, {});

  return reduced;
};

export const id3v2 = (unparsed: string = ''): Partial<Track> => {
  const reduced = splitLines(unparsed).reduce((res: Hash<string>, line: string) => {
    const [key, val] = line.split(/\(.*\):/).map((s) => s.trim());
    // @ts-ignore
    res[key] = val;
    return res;
  }, {});

  const [trackNo, trackNoTotal] = reduced.TRCK?.split(/\//) || [];

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

const mp3Tag = (val: string, tag: string) => val && `--${tag} "${val}"`;

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
    mp3Tag(artist, 'TPE1'),
    mp3Tag([discNumber, noOfDiscs].defined().join('/'), 'TPOS'),
    mp3Tag(year, 'TYER'),
    mp3Tag(album, 'TALB'),
    mp3Tag([trackNo, trackNoTotal].defined().join('/'), 'TRCK'),
    mp3Tag(trackName, 'TIT2'),
  ]
    .defined()
    .join(' ');

export const write = ({ path, track }: File) => {
  info(`Tagging ${path}`);
  return execute(`id3v2 -2 ${generateTagString(track)} "${path}"`.replace(/\s+/, ' ').trim());
};
