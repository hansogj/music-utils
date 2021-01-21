// eslint-disable-next-line no-console
import { tagAlbum } from '../album';
import { info, json } from '../utils/color.log';
import { getDirName } from '../utils/path';

const dirname = getDirName();
tagAlbum(dirname).then(({ release }) => {
  info('Successfully tagged album');
  json({ release });
});
