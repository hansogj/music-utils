'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
/* eslint-disable no-console */
const path_1 = __importDefault(require('path'));
const prompt_1 = require('../../src/utils/prompt');
const MU_TEST_ZEP_1 = path_1.default.join(
  `${process.env.PWD}`,
  '/test-data//copy/Led Zeppelin/1976 The Song Remains The Same (Disc 1∕2)',
);
process.chdir(MU_TEST_ZEP_1);
(0, prompt_1.albumPrompt)({
  artist: 'Magma',
  album: 'MDK',
  year: '1973',
}).then(console.log);
