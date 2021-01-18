import { defined } from 'array.defined';

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

export const read = (path = ''): Promise<Partial<Track>> =>
  execute(`id3v2 -l '${path}'`)
    .then((output) => [output].join('').trim())
    .then((output: string) => {
      if (/^id3v1/.test(output)) {
        id3v1(output);
      }

      if (/^id3v2/.test(output)) {
        id3v2(output);
      }

      if (/No ID3 tag/.test(output)) {
        // TODO TEST
        return new Error('No ID3 tag');
      }

      return {};
    });

const generateTagString = ({
  album,
  artist,
  trackName,
  trackNo,
  trackNoTotal,
  discnumber,
  noOfDiscs,
  year,
}: Partial<Track>) =>
  [
    artist && `--TPE1 '${artist}'`,
    discnumber && `--TPOS '${[discnumber, noOfDiscs].defined().join('/')}'`,
    year && `--TYER '${year}'`,
    album && `--TALB '${album}'`,
    trackNo && `--TRCK '${[trackNo, trackNoTotal].defined().join('/')}'`,
    trackName && `--TIT2 '${trackName}'`,
  ]
    .defined()
    .join(' ');

export const write = ({ path, track }: File) =>
  execute(`id3v2 -2 ${generateTagString(track)} '${path}'`.replace(/\s+/, ' ').trim());
