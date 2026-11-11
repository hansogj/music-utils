import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { writeTags } from './tag-write.js';
import { readMp3Tags } from './tags.js';

// A few bytes of MPEG frame header: id3v2 tags any file, and audio files are gitignored.
const AUDIO = Buffer.from([0xff, 0xfb, 0x90, 0x64, ...Array(400).fill(0)]);
const URL = 'https://www.discogs.com/release/4376665';

// The full repair write path shells out to id3v2, which CI doesn't have.
const hasId3v2 = (() => {
  try {
    execFileSync('id3v2', ['--version']);
    return true;
  } catch {
    return false;
  }
})();

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tag-write-'));
  file = path.join(dir, 'track.mp3');
  await fs.writeFile(file, AUDIO);
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe.skipIf(!hasId3v2)('writeTags (mp3, with id3v2)', () => {
  it('keeps both Discogs IDs and the full URL, read back by readMp3Tags', async () => {
    await writeTags(file, 'mp3', {
      TITLE: 'Hard Attack',
      ARTIST: 'Accept',
      TRACKNUMBER: '1/2',
      COMMENT: URL,
      DISCOGS_RELEASE_ID: '4376665',
      DISCOGS_MASTER_ID: '245487',
    });
    const { tags, error } = await readMp3Tags(file);
    expect(error).toBeUndefined();
    expect(tags).toMatchObject({
      title: 'Hard Attack',
      trackNo: '1',
      comment: URL,
      discogsReleaseId: '4376665',
      discogsMasterId: '245487',
    });
  });

  it('a retag keeps both IDs (id3v2 runs first and leaves the TXXX frames alone)', async () => {
    await writeTags(file, 'mp3', { TITLE: 'a', DISCOGS_RELEASE_ID: '1', DISCOGS_MASTER_ID: '2', COMMENT: URL });
    await writeTags(file, 'mp3', { TITLE: 'b', DISCOGS_RELEASE_ID: '3', DISCOGS_MASTER_ID: '4', COMMENT: URL });
    const { tags } = await readMp3Tags(file);
    expect(tags).toMatchObject({ title: 'b', discogsReleaseId: '3', discogsMasterId: '4', comment: URL });
  });
});
