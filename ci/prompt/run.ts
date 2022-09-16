/* eslint-disable no-console */
import path from 'path';

import { albumPrompt } from '../../src/utils/prompt';

const MU_TEST_ZEP_1 = path.join(
  process.env.PWD,
  '/test-data/copy/Led Zeppelin/1976 The Song Remains the Same (disc 1)',
);
process.chdir(MU_TEST_ZEP_1);

albumPrompt({
  artist: 'Magma',
  album: 'MDK',
  year: '1973',
}).then(console.log);
