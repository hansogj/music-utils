import { tagAlbum } from '../../src/album';
import { getDirName } from '../../src/utils/path';

const dirname = getDirName();
tagAlbum(dirname).then(() => 'Happy ending');
