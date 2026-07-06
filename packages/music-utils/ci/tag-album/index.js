'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const album_1 = require('../../src/album');
const path_1 = require('../../src/utils/path');
const dirname = (0, path_1.getDirName)();
(0, album_1.tagAlbum)(dirname).then(() => 'Happy ending');
