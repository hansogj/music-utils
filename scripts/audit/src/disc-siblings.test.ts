import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Fake audio: each file holds its tags as JSON.
vi.mock('./tags.js', () => ({
  readTags: async (filePath: string) => {
    const raw = await fs.readFile(filePath, 'utf8');
    return { tags: { discogsReleaseId: raw ? JSON.parse(raw).DISCOGS_RELEASE_ID : undefined } };
  },
}));

const { expectedFirstTrack, siblingDiscs, siblingReleaseId } = await import('./disc-siblings.js');

let artistDir: string;

async function album(folder: string, tracks: number, opts: { info?: string; tagged?: string } = {}) {
  const dir = path.join(artistDir, folder);
  await fs.mkdir(dir, { recursive: true });
  for (let i = 1; i <= tracks; i++) {
    const tags = opts.tagged ? { DISCOGS_RELEASE_ID: opts.tagged } : {};
    await fs.writeFile(path.join(dir, `${String(i).padStart(2, '0')} - Track.mp3`), JSON.stringify(tags));
  }
  if (opts.info) await fs.writeFile(path.join(dir, 'info.txt'), opts.info);
  return { letterDir: 'Y', artistName: 'Yes', albumFolder: folder, albumPath: dir };
}

beforeEach(async () => {
  artistDir = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'disc-siblings-')), 'Y', 'Yes');
});

afterEach(async () => {
  await fs.rm(path.dirname(path.dirname(artistDir)), { recursive: true, force: true });
});

describe('siblingDiscs', () => {
  it('finds the other disc folders of the same album, with track counts and release IDs', async () => {
    await album('1973 Yessongs (Disc 1∕3)', 8, { info: 'Yes\n\nDiscogs-Release: 8270054\nDisc: 1/3\n' });
    await album('1987 Yessongs (Disc 3∕3)', 4, { tagged: '8270054' }); // year changed by an earlier rename
    await album('1973 Yessongs (Disc 1∕2)', 9); // another split of a different size
    await album('1972 Close To The Edge', 3);
    const disc2 = await album('1973 Yessongs (Disc 2∕3)', 5);

    const siblings = await siblingDiscs(disc2);
    expect(siblings.map((s) => [s.disc, s.trackCount, s.releaseId])).toEqual([
      [1, 8, '8270054'],
      [3, 4, '8270054'],
    ]);
    expect(siblingReleaseId(siblings)).toBe('8270054');
    expect(expectedFirstTrack(2, siblings)).toBe(8);
    expect(expectedFirstTrack(3, siblings)).toBeUndefined(); // disc 2 is this folder, not a sibling
    expect(expectedFirstTrack(1, siblings)).toBe(0);
  });

  it('is empty for a folder that is not a disc, and for an album folder with no tracks', async () => {
    expect(await siblingDiscs(await album('1972 Close To The Edge', 3))).toEqual([]);
    await fs.mkdir(path.join(artistDir, '1973 Yessongs (Disc 1∕2)'));
    const siblings = await siblingDiscs(await album('1973 Yessongs (Disc 2∕2)', 5));
    expect(siblings).toEqual([
      { disc: 1, albumPath: path.join(artistDir, '1973 Yessongs (Disc 1∕2)'), trackCount: 0, releaseId: undefined },
    ]);
  });

  it('suggests no release when the other discs disagree', () => {
    expect(
      siblingReleaseId([
        { disc: 1, albumPath: 'a', trackCount: 8, releaseId: '1' },
        { disc: 3, albumPath: 'b', trackCount: 4, releaseId: '2' },
      ]),
    ).toBeUndefined();
  });
});
