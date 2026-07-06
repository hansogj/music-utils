import { File, Track } from '../types';
import { debugInfo, error } from '../utils/color.log';
import { executeFile } from '../utils/execute';
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

export const read = async (path = ''): Promise<Partial<Track>> => {
  const output = await executeFile('metaflac', ['--show-tag=TITLE', '--show-tag=TRACKNUMBER', path]);
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

const generateRemoveTagArgs = ({
  album,
  artist,
  trackName,
  trackNo,
  trackNoTotal,
  discNumber,
  year,
}: Partial<Track>): string[] =>
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
    .map((param) => `--remove-tag=${param}`);

const flacTag = (val: string | undefined, tag: string) => val && `${tag}=${val}`;

const generateSetTagArgs = ({
  album,
  artist,
  trackName,
  trackNo,
  trackNoTotal,
  discNumber,
  noOfDiscs,
  year,
}: Partial<Track>): string[] =>
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
    .map((param) => `--set-tag=${param}`);

export const write = async ({ path, track }: File) => {
  debugInfo(`Tagging ${path.split('/').slice(-2).join('/')}`);

  try {
    await executeFile('metaflac', [...generateRemoveTagArgs(track), path]);
    await executeFile('metaflac', [...generateSetTagArgs(track), path]);
  } catch (e) {
    error(`Failed to tag ${path} : ${e}`);
    throw e;
  }
};
