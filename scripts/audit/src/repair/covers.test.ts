import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AlbumAudit, AlbumLayout, Issue, TrackInfo } from '../types.js';

vi.mock('../discogs.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../discogs.js')>()),
  fetchReleaseCover: vi.fn(async (id: string) => ({ cover: { uri: `release-${id}`, uri150: '' } })),
  fetchMasterCover: vi.fn(async (id: number) => ({ uri: `master-${id}`, uri150: '' })),
  downloadImage: vi.fn(async (uri: string) => Buffer.from(`image from ${uri}`)),
}));

// covers.ts's own isImage() check: files holding "BAD" are not images. matchesDiscogs is set per test.
vi.mock('../cover.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../cover.js')>()),
  isImage: vi.fn(async (file: string) => (await fs.readFile(file, 'utf8')) !== 'BAD'),
  matchesDiscogs: vi.fn(async () => undefined),
}));

const { coverActions, coverFilesDifferActions, folderJpgActions } = await import('./covers.js');
const { setPrompt } = await import('./prompt.js');
const { fetchReleaseCover } = await import('../discogs.js');
const { matchesDiscogs } = await import('../cover.js');

let root: string;
let layout: AlbumLayout;

const issue = (code: string, file?: string): Issue => ({ severity: 'MODERATE', code, message: code, file });

const tagged = (releaseId?: string, masterId?: string): TrackInfo[] => [
  {
    filePath: path.join(layout.albumPath, '01.flac'),
    fileName: '01.flac',
    ext: 'flac',
    tags: { discogsReleaseId: releaseId, discogsMasterId: masterId },
    parsedName: undefined,
  },
];

const auditOf = (tracks: TrackInfo[] = [], extra: Partial<AlbumAudit> = {}): AlbumAudit => ({
  layout,
  tracks,
  issues: [],
  ...extra,
});

const file = (name: string) => path.join(layout.albumPath, name);

// A real image where ImageMagick is installed (cover.js reads it), else plain bytes: either
// way the image list takes it. Different colours give different files.
async function image(name: string, colour: string): Promise<Buffer> {
  try {
    (await import('node:child_process')).execFileSync('magick', ['-size', '4x4', `xc:${colour}`, file(name)]);
  } catch {
    await fs.writeFile(file(name), colour);
  }
  return fs.readFile(file(name));
}
const read = (name: string) => fs.readFile(file(name), 'utf8');
const labels = (actions: Array<{ label: string }>) => actions.map((a) => a.label);

function answers(...list: string[]) {
  const queue = [...list];
  setPrompt(async (q) => {
    if (!queue.length) throw new Error(`Unexpected prompt: ${q}`);
    return queue.shift()!;
  });
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-covers-'));
  const albumPath = path.join(root, 'Y', 'Yezda Urfa', '1976 Sacred Baboon');
  await fs.mkdir(albumPath, { recursive: true });
  layout = { letterDir: 'Y', artistName: 'Yezda Urfa', albumFolder: '1976 Sacred Baboon', albumPath };
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe('coverActions', () => {
  it("downloads the master's (first) or the release's cover, noted in info.txt", async () => {
    const actions = await coverActions(issue('MISSING_COVER'), auditOf(tagged('4376665', '9')), 'token');
    expect(labels(actions)).toEqual([
      'Download the cover of Discogs master m9 as cover.jpg',
      'Download the cover of Discogs release r4376665 as cover.jpg',
      'Download the cover of a Discogs release or master you enter',
    ]);
    expect(await actions[0].run()).toBe('cover.jpg from Discogs master m9');
    expect(await read('cover.jpg')).toBe('image from master-9');
    expect(await read('info.txt')).toContain('cover.jpg was set to the cover of Discogs master m9');

    await actions[1].run();
    expect(await read('cover.jpg')).toBe('image from release-4376665');
    expect(await read('info.txt')).toContain('cover.jpg was set to the cover of Discogs release r4376665');
  });

  it("offers another disc folder's cover: first, or last when it isn't the Discogs cover", async () => {
    const set = path.join(root, 'Y', 'Yezda Urfa');
    for (const d of ['1', '2']) await fs.mkdir(path.join(set, `1976 Sacred Baboon (Disc ${d}∕2)`), { recursive: true });
    layout = {
      ...layout,
      albumFolder: '1976 Sacred Baboon (Disc 2∕2)',
      albumPath: path.join(set, '1976 Sacred Baboon (Disc 2∕2)'),
    };
    const discOne = await image('../1976 Sacred Baboon (Disc 1∕2)/cover.jpg', 'navy');

    const actions = await coverActions(issue('MISSING_COVER'), auditOf(tagged('1')), 'token');
    expect(actions[0].label).toBe("Copy Disc 1's cover.jpg as cover.jpg");
    expect(await actions[0].run()).toBe('cover.jpg from Disc 1');
    expect(await fs.readFile(file('cover.jpg'))).toEqual(discOne);
    expect(await read('info.txt')).toContain('cover.jpg copied from Disc 1');

    vi.mocked(matchesDiscogs).mockResolvedValue(false);
    const later = await coverActions(issue('BAD_COVER', 'cover.jpg'), auditOf(tagged('1')), 'token');
    expect(labels(later).at(-2)).toBe("Copy Disc 1's cover.jpg as cover.jpg — not the Discogs cover");
    vi.mocked(matchesDiscogs).mockResolvedValue(undefined);
  });

  it('replaces the file the issue is about, under its own name', async () => {
    await fs.writeFile(file('folder.jpg'), 'old');
    const [release] = await coverActions(issue('COVER_MISMATCH', 'folder.jpg'), auditOf(tagged('1')), 'token');
    expect(release.label).toBe('Download the cover of Discogs release r1 as folder.jpg');
    await release.run();
    expect(await read('folder.jpg')).toBe('image from release-1');
    expect(await read('info.txt')).toContain('folder.jpg was replaced with the cover of Discogs release r1');
  });

  it('fails when Discogs has no image', async () => {
    vi.mocked(fetchReleaseCover).mockResolvedValueOnce({ cover: undefined } as never);
    const [release] = await coverActions(issue('MISSING_COVER'), auditOf(tagged('1')), 'token');
    await expect(release.run()).rejects.toThrow('Discogs release r1 has no images');
  });

  it("a bad cover file gives way to the folder's other, good one: it becomes cover.jpg", async () => {
    await fs.writeFile(file('cover.jpg'), 'BAD');
    await fs.writeFile(file('folder.jpg'), 'good');
    const actions = await coverActions(issue('BAD_COVER', 'cover.jpg'), auditOf());
    expect(labels(actions)).toEqual(['Remove cover.jpg and rename folder.jpg to cover.jpg']);
    await actions[0].run();
    expect(await read('cover.jpg')).toBe('good');
    await expect(fs.access(file('folder.jpg'))).rejects.toThrow();
    expect(await read('info.txt')).toContain('cover.jpg removed (not an image), folder.jpg renamed to cover.jpg');
  });

  it('offers the other images, the Discogs cover first', async () => {
    await image('back.jpg', 'blue');
    const front = await image('front.jpg', 'red');
    vi.mocked(matchesDiscogs).mockImplementation(async (f) => f.endsWith('front.jpg'));
    const actions = await coverActions(issue('MISSING_COVER'), auditOf(tagged('1')), 'token');
    expect(labels(actions)).toEqual([
      'Use front.jpg as cover.jpg (a copy) — it is the Discogs cover',
      'Download the cover of Discogs release r1 as cover.jpg',
      'Use back.jpg as cover.jpg (a copy)',
      'Download the cover of a Discogs release or master you enter',
    ]);
    await actions[0].run();
    expect(await fs.readFile(file('cover.jpg'))).toEqual(front);
  });

  it('offers no other images for a cover that differs from Discogs, nor Discogs without a token', async () => {
    await image('front.jpg', 'red');
    expect(await coverActions(issue('COVER_MISMATCH', 'cover.jpg'), auditOf())).toEqual([]);
    expect(labels(await coverActions(issue('MISSING_COVER'), auditOf(tagged('1'))))).toEqual([
      'Use front.jpg as cover.jpg (a copy)',
    ]);
  });

  describe('a release or master you enter', () => {
    const entered = async (audit: AlbumAudit) => (await coverActions(issue('MISSING_COVER'), audit, 'token')).at(-1)!;

    it('suggests the top search hit; Enter takes it', async () => {
      answers('');
      const action = await entered(auditOf([], { discogsResults: [{ id: 77, title: 'x', releaseUrl: '' }] }));
      expect(await action.run()).toBe('cover.jpg from Discogs release r77');
    });

    it('takes a master ID', async () => {
      answers('m1439');
      await (await entered(auditOf())).run();
      expect(await read('cover.jpg')).toBe('image from master-1439');
    });

    it('skips what is not an ID', async () => {
      answers('nope');
      expect(await (await entered(auditOf())).run()).toBe('skipped');
      await expect(read('cover.jpg')).rejects.toThrow();
    });
  });
});

describe('one cover file: folder.jpg and cover.jpg', () => {
  it('FOLDER_JPG: a folder.jpg on its own is renamed to cover.jpg, noted in info.txt', async () => {
    await fs.writeFile(file('folder.jpg'), 'front');
    const actions = await folderJpgActions(issue('FOLDER_JPG', 'folder.jpg'), auditOf());
    expect(labels(actions)).toEqual(['Rename folder.jpg to cover.jpg']);
    expect(await actions[0].run()).toBe('folder.jpg renamed to cover.jpg');
    expect(await read('cover.jpg')).toBe('front');
    await expect(fs.access(file('folder.jpg'))).rejects.toThrow();
    expect(await read('info.txt')).toContain('folder.jpg renamed to cover.jpg');
    expect(await folderJpgActions(issue('FOLDER_JPG', 'folder.jpg'), auditOf())).toEqual([]); // nothing left
  });

  it('FOLDER_JPG: a folder.jpg that is the same image as cover.jpg is removed', async () => {
    await fs.writeFile(file('cover.jpg'), 'front');
    await fs.writeFile(file('folder.jpg'), 'front');
    const actions = await folderJpgActions(issue('FOLDER_JPG', 'folder.jpg'), auditOf());
    expect(labels(actions)).toEqual(['Remove folder.jpg (the same image as cover.jpg)']);
    await actions[0].run();
    await expect(fs.access(file('folder.jpg'))).rejects.toThrow();
    expect(await read('cover.jpg')).toBe('front');
  });

  it('COVER_FILES_DIFFER: keep cover.jpg, or folder.jpg as cover.jpg; the Discogs cover first', async () => {
    await fs.writeFile(file('cover.jpg'), 'old');
    await fs.writeFile(file('folder.jpg'), 'new');
    const keepCover = 'Keep cover.jpg, remove folder.jpg';
    expect(labels(await coverFilesDifferActions(issue('COVER_FILES_DIFFER'), auditOf()))).toEqual([
      keepCover,
      'Keep folder.jpg as cover.jpg, remove cover.jpg',
    ]);

    vi.mocked(matchesDiscogs).mockImplementation(async (f) => f.endsWith('folder.jpg'));
    const actions = await coverFilesDifferActions(issue('COVER_FILES_DIFFER'), auditOf(tagged('1')), 'token');
    expect(labels(actions)).toEqual([
      'Keep folder.jpg as cover.jpg, remove cover.jpg — it is the Discogs cover',
      keepCover,
    ]);
    expect(await actions[0].run()).toBe('kept folder.jpg as cover.jpg');
    expect(await read('cover.jpg')).toBe('new');
    await expect(fs.access(file('folder.jpg'))).rejects.toThrow();
    expect(await read('info.txt')).toContain('cover.jpg removed, folder.jpg renamed to cover.jpg');
    expect(await coverFilesDifferActions(issue('COVER_FILES_DIFFER'), auditOf())).toEqual([]);
  });

  it('COVER_FILES_DIFFER: keeping cover.jpg removes folder.jpg', async () => {
    await fs.writeFile(file('cover.jpg'), 'old');
    await fs.writeFile(file('folder.jpg'), 'new');
    const [keep] = await coverFilesDifferActions(issue('COVER_FILES_DIFFER'), auditOf());
    await keep.run();
    expect(await read('cover.jpg')).toBe('old');
    await expect(fs.access(file('folder.jpg'))).rejects.toThrow();
  });
});
