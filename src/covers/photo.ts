/* eslint-disable @typescript-eslint/no-unused-vars */
import { parseAlbumInfo } from '../album/parse.path';
import { COVER_FILE_NAME, COVER_FILE_RESOLUTION } from '../constants';
import { Release } from '../types';
import { success } from '../utils/color.log';
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

export const sacad = (dirName: string, noPrompt: boolean): Promise<any> =>
  getAlbumInfo(dirName, noPrompt)
    .then(log)
    .then((release) =>
      execute(`sacad "${release.artist}" "${release.album}" ${COVER_FILE_RESOLUTION} "${COVER_FILE_NAME}"`)
    );

export const glyrc = (dirName: string, noPrompt: boolean): Promise<any> =>
  getAlbumInfo(dirName, noPrompt)
    .then(log)
    .then((release) => execute(`glyrc  cover --artist "${release.artist}"  --album "${release.album}" `));
