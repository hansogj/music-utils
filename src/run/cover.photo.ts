import * as dotenv from 'dotenv';
import path from 'path';

import { getAlbumDirectory } from '../album/parse.path';
import { coverFromDiscogs } from '../covers/photo';
import { getCommandLineArgs } from '../utils/cmd.options';

const albumDirName = getAlbumDirectory();
const { quiet } = getCommandLineArgs();

dotenv.config({ path: path.resolve(__dirname, '../..', '.env') });
coverFromDiscogs(albumDirName, quiet, process.env.DISCOGS_TOKEN);
