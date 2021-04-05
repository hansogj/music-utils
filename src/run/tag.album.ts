import '../utils/polyfills';

import { tagAlbum } from '../album';
import { ReleaseFiles } from '../album/album';
import { getAlbumDirectory } from '../album/parse.path';
import { info, json } from '../utils/color.log';

tagAlbum(getAlbumDirectory()).then(({ release }: ReleaseFiles) => {
  info('Successfully tagged album');
  json({ release });
});
