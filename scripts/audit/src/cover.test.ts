import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  albumRef,
  artistCoverCandidates,
  asJpeg,
  checkCovers,
  coverIn,
  coversIn,
  type CoverSource,
  hashDistance,
  imageHash,
  imagesIn,
  isImage,
  matchesDiscogs,
  pHash,
  SAME_COVER,
  withoutSolvedCoverIssues,
  writeCover,
} from './cover.js';
import type { AlbumAudit, AlbumLayout, TrackInfo } from './types.js';

let hasMagick = true;
try {
  execFileSync('magick', ['-version'], { stdio: 'ignore' });
} catch {
  hasMagick = false; // CI
}

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'cover-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const layoutOf = (artist: string, album: string): AlbumLayout => ({
  letterDir: 'D',
  artistName: artist,
  albumFolder: album,
  albumPath: path.join(root, 'D', artist, album),
});

// A tiny real image (where ImageMagick is installed) for image names, else the path as text.
const tinyJpeg = hasMagick ? execFileSync('magick', ['-size', '4x4', 'xc:gray', 'jpg:-']) : undefined;

async function make(...paths: string[]): Promise<void> {
  for (const p of paths) {
    const full = path.join(root, p);
    await fs.mkdir(path.dirname(full), { recursive: true });
    const image = /\.(jpe?g|png)$/i.test(p) && !p.includes('bad') ? tinyJpeg : undefined;
    await fs.writeFile(full, image ?? p);
  }
}

const track = (tags: TrackInfo['tags']): TrackInfo => ({
  filePath: '/x/01.flac',
  fileName: '01.flac',
  ext: 'flac',
  tags,
  parsedName: undefined,
});

// Two covers that look nothing alike, drawn by ImageMagick.
function draw(file: string, kind: 'a' | 'b', size = 300, border = 0): void {
  const art =
    kind === 'a'
      ? ['gradient:navy-orange', '-fill', 'white', '-draw', `circle ${size / 2},${size / 2} ${size / 2},${size / 5}`]
      : ['gradient:white-black', '-rotate', '90', '-fill', 'red', '-draw', `rectangle 0,0 ${size / 3},${size}`];
  execFileSync('magick', [
    '-size',
    `${size}x${size}`,
    ...art,
    ...(border ? ['-bordercolor', 'white', '-border', String(border)] : []),
    file,
  ]);
}

describe('pHash / hashDistance', () => {
  it('hashes the low frequencies: a flat image has none, an image and its negative are far apart', () => {
    expect(pHash(new Uint8Array(1024).fill(128))).toBe('8000000000000000'); // only the brightness bit
    const picture = Uint8Array.from({ length: 1024 }, (_, i) => ((i % 32) * 8 + Math.floor(i / 32) * 3) % 256);
    const negative = picture.map((p) => 255 - p);
    expect(hashDistance(pHash(picture), pHash(negative))).toBeGreaterThan(40);
    expect(hashDistance('ffffffffffffffff', '0000000000000000')).toBe(64);
    expect(hashDistance('f0', '0f')).toBe(8);
  });
});

describe.skipIf(!hasMagick)('imageHash', () => {
  it('matches the same cover at another size, with a scan border, or as PNG, and not another cover', async () => {
    const a = path.join(root, 'a.jpg');
    const aBig = path.join(root, 'a-big.png');
    const b = path.join(root, 'b.jpg');
    draw(a, 'a');
    draw(aBig, 'a', 1200, 60);
    draw(b, 'b');
    const [ha, haBig, hb] = await Promise.all([imageHash(a), imageHash(aBig), imageHash(b)]);
    expect(hashDistance(ha, haBig)).toBeLessThanOrEqual(SAME_COVER);
    expect(hashDistance(ha, hb)).toBeGreaterThan(SAME_COVER);
    // From a buffer, as downloaded
    expect(await imageHash(await fs.readFile(a))).toBe(ha);
  });

  it('fails on a file that is not an image', async () => {
    await make('bad.jpg');
    await expect(imageHash(path.join(root, 'bad.jpg'))).rejects.toThrow(/magick/);
    expect(await isImage(path.join(root, 'bad.jpg'))).toBe(false);
    await make('good.jpg');
    expect(await isImage(path.join(root, 'good.jpg'))).toBe(true);
  });
});

describe('coverIn / imagesIn', () => {
  it('finds cover.jpg and folder.jpg in any case (cover.jpg first), and the other images', async () => {
    await make('A/Folder.jpg', 'A/Cover.JPG', 'A/front.jpg', 'A/back.png', 'A/.hidden.jpg', 'A/01.flac');
    expect(await coversIn(path.join(root, 'A'))).toEqual(['Cover.JPG', 'Folder.jpg']);
    expect(await coverIn(path.join(root, 'A'))).toBe('Cover.JPG');
    expect(await imagesIn(path.join(root, 'A'))).toEqual(['back.png', 'front.jpg']);
    await make('B/folder.jpg');
    expect(await coverIn(path.join(root, 'B'))).toBe('folder.jpg');
    expect(await coverIn(path.join(root, 'missing'))).toBeUndefined();
    expect(await imagesIn(path.join(root, 'missing'))).toEqual([]);
  });
});

describe('albumRef', () => {
  it('takes the release from the tags, else the comment URL or info.txt, and the master from the tags', () => {
    expect(albumRef([track({ discogsReleaseId: '123', discogsMasterId: '45' })])).toEqual({
      releaseId: '123',
      masterId: 45,
    });
    expect(albumRef([track({ comment: 'https://www.discogs.com/release/77' })])).toEqual({ releaseId: '77' });
    expect(albumRef([track({})], 'Discogs-Release: 88\n')).toEqual({ releaseId: '88' });
    expect(albumRef([track({ discogsMasterId: 'x' })])).toEqual({});
  });
});

const source = (hashes: {
  release?: string;
  masterId?: number;
  master?: string;
}): CoverSource & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    release: async (id) => {
      calls.push(`r${id}`);
      return {
        ...(hashes.release ? { hash: hashes.release } : {}),
        ...(hashes.masterId ? { masterId: hashes.masterId } : {}),
      };
    },
    master: async (id) => {
      calls.push(`m${id}`);
      return hashes.master;
    },
  };
};

describe.skipIf(!hasMagick)('matchesDiscogs', () => {
  it("is true for the release's cover, else the master's; false for neither; undefined with nothing to compare", async () => {
    const a = path.join(root, 'a.jpg');
    const b = path.join(root, 'b.jpg');
    draw(a, 'a');
    draw(b, 'b');
    const [ha, hb] = [await imageHash(a), await imageHash(b)];

    const viaRelease = source({ release: ha, masterId: 9, master: hb });
    expect(await matchesDiscogs(a, { releaseId: '1' }, viaRelease)).toBe(true);
    expect(viaRelease.calls).toEqual(['r1']); // the master isn't fetched

    expect(await matchesDiscogs(a, { releaseId: '1' }, source({ release: hb, masterId: 9, master: ha }))).toBe(true);
    expect(await matchesDiscogs(a, { masterId: 9 }, source({ master: ha }))).toBe(true);
    expect(await matchesDiscogs(a, { releaseId: '1', masterId: 9 }, source({ release: hb, master: hb }))).toBe(false);
    expect(await matchesDiscogs(a, { releaseId: '1' }, source({}))).toBeUndefined(); // no Discogs images
    expect(await matchesDiscogs(a, {}, source({ release: ha }))).toBeUndefined();
  });
});

describe('checkCovers', () => {
  it('reports a missing album cover (naming other images) and a missing artist cover', async () => {
    await make('D/Yes/1971 Fragile/01.flac', 'D/Yes/1971 Fragile/front.jpg');
    const issues = await checkCovers(layoutOf('Yes', '1971 Fragile'), []);
    expect(issues.map((i) => [i.code, i.message, i.suggestion])).toEqual([
      ['MISSING_COVER', 'No cover.jpg or folder.jpg in the album folder', 'Other images: front.jpg'],
      ['ARTIST_COVER_MISSING', 'No cover.jpg or folder.jpg in the artist folder "Yes"', undefined],
    ]);
  });

  it('takes folder.jpg as the cover, in the album and in the artist folder', async () => {
    await make('D/Yes/1971 Fragile/folder.jpg', 'D/Yes/folder.jpg');
    expect(await checkCovers(layoutOf('Yes', '1971 Fragile'), [])).toEqual([]);
  });

  it('is quiet when both are there and there is nothing to compare with', async () => {
    await make('D/Yes/1971 Fragile/cover.jpg', 'D/Yes/cover.jpg');
    expect(await checkCovers(layoutOf('Yes', '1971 Fragile'), [])).toEqual([]);
    // A release without images: no verdict
    expect(await checkCovers(layoutOf('Yes', '1971 Fragile'), [track({ discogsReleaseId: '1' })], source({}))).toEqual(
      [],
    );
  });

  it.skipIf(!hasMagick)("reports a cover that isn't the release's or master's", async () => {
    await make('D/Yes/cover.jpg', 'D/Yes/1971 Fragile/info.txt');
    const album = layoutOf('Yes', '1971 Fragile');
    draw(path.join(album.albumPath, 'cover.jpg'), 'a');
    draw(path.join(root, 'b.jpg'), 'b');
    const other = await imageHash(path.join(root, 'b.jpg'));
    const s = source({ release: other, masterId: 9, master: other });
    const issues = await checkCovers(album, [track({ discogsReleaseId: '1' })], s);
    expect(issues.map((i) => [i.code, i.message])).toEqual([
      ['COVER_MISMATCH', "cover.jpg isn't the cover of Discogs release r1"],
    ]);
    expect(s.calls).toEqual(['r1', 'm9']);
  });
});

describe.skipIf(!hasMagick)('checkCovers — files that are not images', () => {
  it('reports a cover.jpg that is a saved web page, and does not offer one as a candidate', async () => {
    await make('D/Yes/1971 Fragile/01.flac');
    await fs.writeFile(path.join(root, 'D/Yes/1971 Fragile/cover.jpg'), '<html>');
    await fs.writeFile(path.join(root, 'D/Yes/cover.jpg'), '<html>');
    const layout = layoutOf('Yes', '1971 Fragile');
    expect((await checkCovers(layout, [])).map((i) => [i.code, i.message])).toEqual([
      ['BAD_COVER', "cover.jpg can't be read as an image"],
      ['ARTIST_COVER_MISSING', `cover.jpg in the artist folder "Yes" can't be read as an image`],
    ]);
    expect(await artistCoverCandidates(layout)).toEqual([]);
  });

  it('checks each cover file: a good cover.jpg does not excuse a broken folder.jpg', async () => {
    await make('D/Yes/1971 Fragile/cover.jpg', 'D/Yes/cover.jpg');
    await fs.writeFile(path.join(root, 'D/Yes/1971 Fragile/folder.jpg'), '<html>');
    const issues = await checkCovers(layoutOf('Yes', '1971 Fragile'), []);
    expect(issues.map((i) => [i.code, i.file])).toEqual([['BAD_COVER', 'folder.jpg']]);
  });

  it('leaves an unreadable image out of the other images', async () => {
    await make('D/Yes/1971 Fragile/front.jpg', 'D/Yes/cover.jpg');
    await fs.writeFile(path.join(root, 'D/Yes/1971 Fragile/back.jpg'), '<html>');
    const issues = await checkCovers(layoutOf('Yes', '1971 Fragile'), []);
    expect(issues.map((i) => [i.code, i.suggestion])).toEqual([['MISSING_COVER', 'Other images: front.jpg']]);
  });

  it('accepts a good folder.jpg in the artist folder next to a broken cover.jpg', async () => {
    await make('D/Yes/1971 Fragile/cover.jpg', 'D/Yes/folder.jpg');
    await fs.writeFile(path.join(root, 'D/Yes/cover.jpg'), '<html>');
    expect(await checkCovers(layoutOf('Yes', '1971 Fragile'), [])).toEqual([]);
  });
});

describe('withoutSolvedCoverIssues', () => {
  it('drops cover issues solved since the scan', async () => {
    await make('D/Yes/1971 Fragile/01.flac');
    const layout = layoutOf('Yes', '1971 Fragile');
    const audit: AlbumAudit = { layout, tracks: [], issues: await checkCovers(layout, []) };
    audit.issues.push({ severity: 'HIGH', code: 'NO_TAGS', message: 'x' });
    await make('D/Yes/cover.jpg');
    expect((await withoutSolvedCoverIssues(audit)).map((i) => i.code)).toEqual(['MISSING_COVER', 'NO_TAGS']);
    await make('D/Yes/1971 Fragile/cover.jpg');
    expect((await withoutSolvedCoverIssues(audit)).map((i) => i.code)).toEqual(['NO_TAGS']);
  });
});

describe('writeCover / artistCoverCandidates / asJpeg', () => {
  it('writes the cover files under their own names, or cover.jpg when there is none', async () => {
    await make('A/Cover.JPG', 'A/folder.jpg');
    expect(await writeCover(path.join(root, 'A'), Buffer.from('new'))).toEqual(['Cover.JPG', 'folder.jpg']);
    expect(await fs.readFile(path.join(root, 'A/folder.jpg'), 'utf8')).toBe('new');
    expect(await writeCover(path.join(root, 'A'), Buffer.from('only'), ['folder.jpg'])).toEqual(['folder.jpg']);
    expect(await fs.readFile(path.join(root, 'A/Cover.JPG'), 'utf8')).toBe('new');
    await make('B/01.flac');
    expect(await writeCover(path.join(root, 'B'), Buffer.from('x'))).toEqual(['cover.jpg']);
    expect((await fs.readdir(path.join(root, 'B'))).sort()).toEqual(['01.flac', 'cover.jpg']);
  });

  it('cleans up and throws when the folder is gone', async () => {
    await expect(writeCover(path.join(root, 'gone'), Buffer.from('x'))).rejects.toThrow();
  });

  it("lists this album's cover first, then the other albums'", async () => {
    await make(
      'D/Yes/1971 Fragile/cover.jpg',
      'D/Yes/1970 Time and a Word/Cover.jpg',
      'D/Yes/1969 Yes/01.flac',
      'D/Yes/1972 Close to the Edge/cover.jpg',
      'D/Yes/notes.txt',
    );
    expect(await artistCoverCandidates(layoutOf('Yes', '1971 Fragile'))).toEqual([
      path.join(root, 'D/Yes/1971 Fragile/cover.jpg'),
      path.join(root, 'D/Yes/1970 Time and a Word/Cover.jpg'),
      path.join(root, 'D/Yes/1972 Close to the Edge/cover.jpg'),
    ]);
    expect(await artistCoverCandidates(layoutOf('Yes', '1969 Yes'), 1)).toEqual([
      path.join(root, 'D/Yes/1970 Time and a Word/Cover.jpg'),
    ]);
  });

  it('returns a JPEG as it is', async () => {
    await fs.writeFile(path.join(root, 'a.jpg'), 'as it is');
    expect((await asJpeg(path.join(root, 'a.jpg'))).toString()).toBe('as it is');
  });

  it.skipIf(!hasMagick)('converts a PNG to JPEG', async () => {
    draw(path.join(root, 'a.png'), 'a');
    const jpeg = await asJpeg(path.join(root, 'a.png'));
    expect(jpeg.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  });
});
