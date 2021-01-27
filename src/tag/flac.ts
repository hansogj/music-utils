import { File, MetaFlac, Track } from '../types';
import { error, info } from '../utils/color.log';
import { execute } from '../utils/execute';
import { replaceQuotes } from '../utils/path';
import { singleSpace } from './parser';

const ARTIST = `ARTIST`;
const ALBUMARTIST = `ALBUMARTIST`;
const DISCID = `DISCID`;
const DISCNUMBER = `DISCNUMBER`;
const DATE = 'DATE';
const ALBUM = 'ALBUM';
const TRACKNUMBER = 'TRACKNUMBER';
const TRACKTOTAL = 'TRACKTOTAL';
const TITLE = 'TITLE';

const harmless = (val: string): string => `"${replaceQuotes(val)}"`;

export const read = (path = ''): Promise<Partial<Track>> =>
  execute(`metaflac --show-tag=TITLE --show-tag=TRACKNUMBER "${path}"`).then((output) => {
    const reduced: MetaFlac = `${output}`
      .split(/\n/)
      .map((split: string) => split.trim())
      .defined()
      .reduce((res: MetaFlac, line: string) => {
        const [key, val] = line.split('=');
        // @ts-ignore
        res[key] = val && singleSpace(val);
        return res;
      }, {} as MetaFlac);

    return {
      ...(reduced.TITLE && { trackName: reduced.TITLE }),
      ...(reduced.TRACKNUMBER && { trackNo: reduced.TRACKNUMBER }),
    } as Partial<Track>;
  });

const generateRemoveTagString = ({
  album,
  artist,
  trackName,
  trackNo,
  trackNoTotal,
  discNumber,
  year,
}: Partial<Track>) => {
  return [
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
    .map((param) => ['--remove-tag', param].join('='))
    .join(' ');
};

const flacTag = (val: string, tag: string) => val && [tag, harmless(val)].join('=');

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
    .map((param) => ['--set-tag', param].join('='))
    .join(' ');

export const write = ({ path, track }: File) => {
  info(`Tagging ${path}`);
  const [executeRemoveTag, executeSetTag] = [generateRemoveTagString, generateSetTagString]
    .map((action) => action(track))
    .map((tags) => ['metaflac', tags, harmless(path)].join(' '))
    .map((exec) => exec.replace(/\s+/, ' ').trim());

  return execute(executeRemoveTag)
    .then(() => execute(executeSetTag))
    .catch((e) => {
      error(`Failed to tag ${path} : ${e}`);
      return e;
    });
};

//  .then(e )> ;
// metaflac --show-tag=TITLE --show-tag=ALBUM --show-tag=ARTIST d1t01.\ Led\ Zeppelin\ -\ Rock\ and\ Roll.flac
// TITLE=Rock and Roll
// ALBUM=The Song Remains the Same
// ARTIST=Led Zeppelin____

// ALBUM
// ALBUMARTIST
// ALBUMARTISTSORT
// ARTIST
// ARTISTSORT
// COMPILATION
// DATE
// DISCID
// GENRE
// MUSICBRAINZ_ALBUMARTISTID
// MUSICBRAINZ_ALBUMID
// MUSICBRAINZ_ARTISTID
// MUSICBRAINZ_DISCID
// MUSICBRAINZ_TRACKID
// TITLE
// TRACKTOTAL
