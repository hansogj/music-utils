// eslint-disable-next-line no-console
import { tagAlbum } from '../tag-album';
import { info, json } from '../utils/color.log';
import { getDirName } from '../utils/path';

const dirname = getDirName();
tagAlbum(dirname).then((e) => {
  info('Successfully tagged album');
  json(e);
});
