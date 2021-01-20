// eslint-disable-next-line no-console
import { tagAlbum } from '../album';
import { getCommandLineArgs } from '../utils/cmd.options';
import { error, exit, info, json } from '../utils/color.log';
import { getDirName } from '../utils/path';
import { syncTrackNames } from '../utils/sync-tag-path';

const fs = require('fs');

const dirname = getDirName();
const { fileName } = getCommandLineArgs();
let tracks;

try {
  tracks = fs
    .readFileSync(fileName, 'utf8')
    .toString()
    .split('\n')
    .map((line: string) => line.trim());
} catch (err) {
  error(err);
  exit(`Failed reading file ${fileName} to describe tracks`);
}

tagAlbum(dirname, tracks)
  .then(({ files, release }) => ({
    files: syncTrackNames(files),
    release,
  }))
  .then(({ release }) => {
    info('Successfully tagged all tracks in album ');
    json(release);
  });
