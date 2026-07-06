'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const record_mock_1 = require('../../src/utils/__mocks__/record.mock');
const color_log_1 = require('../../src/utils/color.log');
const prompt_1 = require('../../src/utils/prompt');
(0, prompt_1.albumPrompt)(record_mock_1.release).then((alb) => {
  (0, color_log_1.info)('finally we can have some calm');
  return (0, color_log_1.json)(alb);
});
