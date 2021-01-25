// eslint-disable-next-line no-console
import { getAlbumDirectory } from '../album/parse.path';
import { sacad } from '../covers/photo';
import { execute } from '../utils/execute';

const albumDirName = getAlbumDirectory();

sacad(albumDirName).then(() => execute(`gthumb "cover.jpg"`));
