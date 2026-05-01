import { File, Track } from '../types';
import { debugInfo, error } from '../utils/color.log';
import { execute } from '../utils/execute';
import { replaceQuotes } from '../utils/path';
import { singleSpace } from './parser';

const ARTIST = 'ARTIST';
const ALBUMARTIST = 'ALBUMARTIST';
const DISCID = 'DISCID';
const DISCNUMBER = 'DISCNUMBER';
const DATE = 'DATE';
const ALBUM = 'ALBUM';
const TRACKNUMBER = 'TRACKNUMBER';
const TRACKTOTAL = 'TRACKTOTAL';
const TITLE = 'TITLE';

const harmless = (val: string): string => `"${replaceQuotes(val)}"`;

export const read = async (path = ''): Promise<Partial<Track>> => {
  const output = await execute(`metaflac --show-tag=TITLE --show-tag=TRACKNUMBER "${path}"`);
  const tags: Record<string, string> = {};

  if (output) {
    output
      .split(/\n/)
      .map((line) => line.trim())
      .defined()
      .forEach((line: string) => {
        const [key, val] = line.split('=');
        if (val) tags[key] = singleSpace(val);
      });
  }

  return {
    ...(tags.TITLE && { trackName: tags.TITLE }),
    ...(tags.TRACKNUMBER && { trackNo: tags.TRACKNUMBER }),
  };
};

const generateRemoveTagString = ({
  album,
  artist,
  trackName,
  trackNo,
  trackNoTotal,
  discNumber,
  year,
}: Partial<Track>) =>
  [
    artist && ARTIST,
    artist && ALBUMARTIST,
    discNumber && DISCID,
    discNumber && DISCNUMBER,
    year && DATE,
    album && ALBUM,
    trackNo && TRACKNUMBER,
    trackNoTotal && TRACKTOTAL,
    trackName && TITLE,
  ]
    .defined()
    .map((param) => `--remove-tag=${param}`)
    .join(' ');

const flacTag = (val: string, tag: string) => val && `${tag}=${harmless(val)}`;

const generateSetTagString = ({
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
    flacTag(artist, ARTIST),
    flacTag(artist, ALBUMARTIST),
    flacTag(discNumber, DISCNUMBER),
    flacTag(year, DATE),
    flacTag(album, ALBUM),
    flacTag(trackNo, TRACKNUMBER),
    flacTag(trackNoTotal, TRACKTOTAL),
    flacTag(trackName, TITLE),
    flacTag([discNumber, noOfDiscs].defined().join('/'), DISCID),
  ]
    .defined()
    .map((param) => `--set-tag=${param}`)
    .join(' ');

export const write = async ({ path, track }: File) => {
  debugInfo(`Tagging ${path.split('/').slice(-2).join('/')}`);

  const removeCmd = `metaflac ${generateRemoveTagString(track)} ${harmless(path)}`.replace(/\s+/, ' ').trim();
  const setCmd = `metaflac ${generateSetTagString(track)} ${harmless(path)}`.replace(/\s+/, ' ').trim();

  try {
    await execute(removeCmd);
    await execute(setCmd);
  } catch (e) {
    error(`Failed to tag ${path} : ${e}`);
    throw e;
  }
};
