#!/usr/bin/env node
import * as dotenv from 'dotenv';
import path from 'path';

import { getAlbumDirectory } from '../album/parse.path';
import { coverFromDiscogs } from '../covers/photo';
import { getCommandLineArgs } from '../utils/cmd.options';

dotenv.config({ path: path.resolve(__dirname, '../..', '.env') });
const { quiet, releaseId } = getCommandLineArgs();

const token = process.env.DISCOGS_TOKEN ?? '';

if (releaseId)
  coverFromDiscogs({
    releaseId,
    quiet: true,
    token,
  });
else {
  const dirName = getAlbumDirectory();

  coverFromDiscogs({
    dirName,
    quiet,
    token,
  });
}
