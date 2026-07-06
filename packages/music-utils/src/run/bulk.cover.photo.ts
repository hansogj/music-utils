#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import * as dotenv from 'dotenv';

import { coverFromDiscogs } from '../covers/photo';
import { info } from '../utils/color.log';

dotenv.config({ path: path.resolve(__dirname, '../..', '.env') });

const dir = process.argv[2] || '.';

const entries = fs
  .readdirSync(dir)
  .map((entry) => path.join(dir, entry))
  .filter((entry) => fs.statSync(entry).isDirectory());

(async () => {
  for (const albumDir of entries) {
    const hasJpg = fs.readdirSync(albumDir).some((f) => /\.jpe?g$/i.test(f));
    if (hasJpg) continue;

    info(albumDir);

    try {
      await coverFromDiscogs({
        dirName: albumDir,
        quiet: true,
        token: process.env.DISCOGS_TOKEN ?? '',
      });
    } catch (_) {
      // continue to next directory
    }
  }
})();
