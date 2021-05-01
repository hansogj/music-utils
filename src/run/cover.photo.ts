// eslint-disable-next-line no-console
import { getAlbumDirectory } from '../album/parse.path';
import { sacad } from '../covers/photo';
import { getCommandLineArgs } from '../utils/cmd.options';
import { execute } from '../utils/execute';

const albumDirName = getAlbumDirectory();
const { quiet } = getCommandLineArgs();

sacad(albumDirName, quiet).then(() => (quiet ? undefined : execute(`gthumb "cover.jpg"`)));
