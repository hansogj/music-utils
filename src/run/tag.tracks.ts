// eslint-disable-next-line no-console
import fs from 'fs';
import path from 'path';

import { tagAlbum } from '../album';
import { getAlbumDirectory } from '../album/parse.path';
import { TRACKS_FILE_NAME } from '../constants';
import { getCommandLineArgs } from '../utils/cmd.options';
import { error, exit, info, json } from '../utils/color.log';
import { replaceDangers } from '../utils/path';
import { syncTrackNames } from '../utils/sync.tag.path';

const { fileName } = getCommandLineArgs();
let tracks;

const tracksFile = fileName || path.resolve(__dirname, '../..', TRACKS_FILE_NAME);

try {
  tracks = fs.readFileSync(tracksFile, 'utf8').toString().split('\n').defined().map(replaceDangers);
} catch (err) {
  error(err);
  exit(`Failed reading file ${fileName} to describe tracks`);
}

const albumDirName = getAlbumDirectory();

tagAlbum(albumDirName, tracks)
  .then(({ files, release }) => ({
    files: syncTrackNames(files, release),
    release,
  }))
  .then(({ release }) => {
    info('Successfully tagged all tracks in album ');
    json(release);
  });
