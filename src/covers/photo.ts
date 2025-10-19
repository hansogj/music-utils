import * as fs from 'node:fs';

import { discogsMainCover } from '@hansogj/discogs-cover';

import { parseAlbumInfo } from '../album/parse.path';
import { COVER_FILE_NAME } from '../constants';
import { Release } from '../types';
import { error, info, success } from '../utils/color.log';
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

export const coverFromDiscogs = async (dirName: string, noPrompt: boolean, token: string) => {
  const release = await getAlbumInfo(dirName, noPrompt).then(log);

  try {
    const imageBuffer = await discogsMainCover({
      artist: release.artist,
      title: release.album,
      strategy: 'prompt',
      token,
    });
    fs.writeFileSync(COVER_FILE_NAME, imageBuffer);
    info('Cover saved!');
  } catch (e) {
    error((e as Error).message);
  }
};
