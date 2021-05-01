// eslint-disable-next-line no-console
import { getAlbumDirectory } from '../album/parse.path';
import { glyrc } from '../covers/photo';
import { getCommandLineArgs } from '../utils/cmd.options';

const albumDirName = getAlbumDirectory();
const { quiet } = getCommandLineArgs();

glyrc(albumDirName, quiet);
