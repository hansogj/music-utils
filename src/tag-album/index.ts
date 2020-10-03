import { getDirName } from '../utils/path';
import { tagAlbum } from './tag-album';

export * from './tag-album';
tagAlbum(getDirName());
