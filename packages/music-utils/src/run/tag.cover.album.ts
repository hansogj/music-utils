#!/usr/bin/env node
import path from 'node:path';

import * as dotenv from 'dotenv';

import { tagAlbum } from '../album';
import { ReleaseFiles } from '../album/album';
import { getAlbumDirectory } from '../album/parse.path';
import { coverFromDiscogs } from '../covers/photo';
import { info, json } from '../utils/color.log';

dotenv.config({ path: path.resolve(__dirname, '../..', '.env') });

const dirName = getAlbumDirectory();

coverFromDiscogs({
  dirName,
  quiet: true,
  token: process.env.DISCOGS_TOKEN ?? '',
}).then(() =>
  tagAlbum(dirName).then(({ release }: ReleaseFiles) => {
    info('Successfully tagged album');
    json({ release });
  }),
);
