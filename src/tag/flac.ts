import { File, MetaFlac, Track } from '../types';
import { error, info } from '../utils/color.log';
import { execute } from '../utils/execute';

const ARTIST = `ARTIST`;
const ALBUMARTIST = `ALBUMARTIST`;
const DISCID = `DISCID`;
const DISCNUMBER = `DISCNUMBER`;
const DATE = 'DATE';
const ALBUM = 'ALBUM';
const TRACKNUMBER = 'TRACKNUMBER';
const TRACKTOTAL = 'TRACKTOTAL';
const TITLE = 'TITLE';

export const read = (path = ''): Promise<Partial<Track>> =>
  execute(`metaflac --show-tag=TITLE --show-tag=TRACKNUMBER '${path}'`).then((output) => {
    const reduced: MetaFlac = `${output}`
      .split(/\n/)
      .map((split: string) => split.trim())
      .defined()
      .reduce((res: MetaFlac, line: string) => {
        const [key, val] = line.split('=');
        // @ts-ignore
        res[key] = val;
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
  discnumber,
  year,
}: Partial<Track>) => {
  return [
    artist && ARTIST,
    artist && ALBUMARTIST,
    discnumber && DISCID,
    discnumber && DISCNUMBER,
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

const generateSetTagString = ({
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
    artist && [ARTIST, `'${artist}'`].join('='),
    artist && [ALBUMARTIST, `'${artist}'`].join('='),
    discnumber && [DISCNUMBER, `'${discnumber}'`].join('='),
    year && [DATE, `'${year}'`].join('='),
    album && [ALBUM, `'${album}'`].join('='),
    trackNo && [TRACKNUMBER, `'${trackNo}'`].join('='),
    trackNoTotal && [TRACKTOTAL, `'${trackNoTotal}'`].join('='),
    trackName && [TITLE, `'${trackName}'`].join('='),
    discnumber && `${DISCID}='${[discnumber, noOfDiscs].defined().join('/')}'`,
  ]
    .defined()
    .map((param) => ['--set-tag', param].join('='))
    .join(' ');

export const write = ({ path, track }: File) => {
  info(`Tagging ${path}`);
  const [executeRemoveTag, executeSetTag] = [generateRemoveTagString, generateSetTagString]
    .map((action) => action(track))
    .map((tags) => ['metaflac', tags, `'${path}'`].join(' '))
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