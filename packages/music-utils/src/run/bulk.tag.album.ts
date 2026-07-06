#!/usr/bin/env node
import '../utils/polyfills';

import fs from 'node:fs';
import path from 'node:path';

import { tagAlbum } from '../album';
import { ReleaseFiles } from '../album/album';
import { error, info, json } from '../utils/color.log';

const dir = process.argv[2] || '.';

const entries = fs
  .readdirSync(dir)
  .map((entry) => path.join(dir, entry))
  .filter((entry) => fs.statSync(entry).isDirectory());

(async () => {
  for (const albumDir of entries) {
    info(albumDir);

    try {
      const { release }: ReleaseFiles = await tagAlbum(path.resolve(albumDir));
      json({ release });
    } catch (e) {
      error(`Failed to tag ${albumDir}: ${e}`);
    }
  }
})();
