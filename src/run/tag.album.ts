// eslint-disable-next-line no-console
import { tagAlbum } from '../album';
import { getAlbumDirectory } from '../album/parse.path';
import { info, json } from '../utils/color.log';

const albumDirName = getAlbumDirectory();

tagAlbum(albumDirName).then(({ release }) => {
  info('Successfully tagged album');
  json({ release });
});
