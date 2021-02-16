// eslint-disable-next-line no-console
// import { syncArtistFolder } from '../utils/sync.tag.path';
import '../utils/polyfills';

import { tagAlbum } from '../album';
import { ReleaseFiles } from '../album/album';
import { getAlbumDirectory } from '../album/parse.path';
import { info, json } from '../utils/color.log';

/* getArtistFolderName()
  .then(tagAlbum)
 */
tagAlbum(getAlbumDirectory()).then(({ release }: ReleaseFiles) => {
  info('Successfully tagged album');
  json({ release });
});
