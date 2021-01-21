// eslint-disable-next-line no-console
import fs from 'fs';
import path from 'path';

import { tagAlbum } from '../album';
import { TRACKS_FILE_NAME } from '../constants';
import { getCommandLineArgs } from '../utils/cmd.options';
import { error, exit, info, json } from '../utils/color.log';
import { getDirName } from '../utils/path';
import { syncTrackNames } from '../utils/sync.tag.path';

const acute = '´';
const dirname = getDirName();
const { fileName } = getCommandLineArgs();
let tracks;

const tracksFile = fileName || path.resolve(__dirname, '../..', TRACKS_FILE_NAME);

try {
  tracks = fs
    .readFileSync(tracksFile, 'utf8')
    .toString()
    .split('\n')
    .map((line: string) => line.trim().replace(/'/, acute).replace(/'/, acute));
} catch (err) {
  error(err);
  exit(`Failed reading file ${fileName} to describe tracks`);
}

exit('aasdasd');
tagAlbum(dirname, tracks)
  .then(({ files, release }) => ({
    files: syncTrackNames(files),
    release,
  }))
  .then(({ release }) => {
    info('Successfully tagged all tracks in album ');
    json(release);
  });
