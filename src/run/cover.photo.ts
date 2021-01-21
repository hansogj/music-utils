// eslint-disable-next-line no-console
import { sacad } from '../covers/photo';
import { execute } from '../utils/execute';
import { getDirName } from '../utils/path';

const dirname = getDirName();
sacad(dirname).then(() => execute(`gthumb "cover.jpg"`));
