// eslint-disable-next-line no-console
import { tagAlbum } from '../../src/tag-album';
import { getDirName } from '../../src/utils/path';

const dirname = getDirName();
tagAlbum(dirname).then(() => 'Happy ending');
