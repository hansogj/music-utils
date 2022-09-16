/* eslint-disable @typescript-eslint/no-unused-vars */
import { parseAlbumInfo } from '../album/parse.path';
import { COVER_FILE_NAME, COVER_FILE_RESOLUTION } from '../constants';
import { Release } from '../types';
import { error, info, success } from '../utils/color.log';
import { execute } from '../utils/execute';
import { albumPrompt } from '../utils/prompt';

const getAlbumInfo = (dirName: string, noPrompt: boolean): Promise<Partial<Release>> => {
  const { album, ...rest } = parseAlbumInfo(dirName);
  const artist = rest.artist.replace(/\[.*\]/, '').trim();
  return noPrompt
    ? Promise.resolve({ album, artist } as Partial<Release>)
    : albumPrompt({ album, artist } as Partial<Release>);
};

const log = (release: Partial<Release>) => {
  success(`Downloading album cover for [${release.artist}/${release.album}]`);
  return release;
};

export const sacad = (dirName: string, noPrompt: boolean): Promise<unknown> =>
  getAlbumInfo(dirName, noPrompt)
    .then(log)
    .then((release) =>
      execute(`sacad "${release.artist}" "${release.album}" ${COVER_FILE_RESOLUTION} "${COVER_FILE_NAME}"`),
    );

export const glyrc = (dirName: string, noPrompt: boolean): Promise<unknown> =>
  getAlbumInfo(dirName, noPrompt)
    .then(log)
    .then((release) => execute(`glyrc  cover --artist "${release.artist}"  --album "${release.album}" `))
    .then(() =>
      execute(
        'for IMG in *.jpg *.jpeg *.png; do echo $IMG; rename \'s/.*cover.*\\.([0-9a-z]+)$/cover.$1/i\' "$IMG"; done ',
      ),
    )
    .catch(error)
    .then(() => execute('[ -e cover.png ] && convert cover.png cover.jpg ; [ -e cover.png ] && rm cover.png'))
    .catch(() => ({}))
    .then(() => execute('[ -e cover.jpeg ] && mv cover.jpeg cover.jpg'))
    .catch(() => ({}))
    .then(() => execute('ls -dl *cover*'))
    .then(info)
    .catch(error);
