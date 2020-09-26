import { album as testalbum } from '../__mocks__/record.mock';
import { info, json } from '../../src/utils/color.log';
import { albumPrompt } from '../../src/utils/prompt';

albumPrompt(testalbum).then((alb) => {
  info('finally we can have some calm');
  return json(alb);
});
