// eslint-disable-next-line no-console
import { extractAlbumInfo } from '../album/album';
import { getAlbumDirectory, parseAlbumInfo } from '../album/parse.path';
import { File } from '../types';
import { info } from '../utils/color.log';
import { syncTrackNames } from '../utils/sync.tag.path';

const dirName = getAlbumDirectory();
const release = parseAlbumInfo(dirName);

extractAlbumInfo(dirName)
  .then((files: File[]) => syncTrackNames(files, release))
  .then(() => info('Successfully tagged all tracks in album '));
