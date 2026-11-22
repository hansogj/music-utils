import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReleaseInfo } from '../discogs.js';
import type { AlbumAudit, AlbumLayout, TrackInfo } from '../types.js';

// Tag writes are recorded per file instead of running metaflac / id3v2.
const written = new Map<string, Record<string, string>>();
vi.mock('../tag-write.js', () => ({
  writeTags: vi.fn(async (file: string, _ext: string, tags: Record<string, string>) => {
    written.set(path.basename(file), { ...written.get(path.basename(file)), ...tags });
  }),
}));

const release = (
  releaseId: string,
  titles: string[],
  positions = titles.map((_, i) => String(i + 1)),
): ReleaseInfo => ({
  releaseId,
  masterId: 9,
  year: '1976',
  releaseYear: '1976',
  title: 'Sacred Baboon',
  artists: ['Yezda Urfa'],
  tracklist: titles.map((title, i) => ({ position: positions[i], title, type_: 'track' })),
});

vi.mock('../discogs.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../discogs.js')>()),
  fetchRelease: vi.fn(async (id: string) => release(id, ['One', 'Two'])),
  resolveReleaseId: vi.fn(async () => '7'),
  pickMasterVersion: vi.fn(async () => ({ releaseId: '8', why: 'a 2-CD version' })),
}));

// The raw-mode list needs a TTY: the test says what was picked.
vi.mock('./release-picker.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./release-picker.js')>()),
  pickRelease: vi.fn(),
}));

const { discogsActionFor } = await import('./discogs-action.js');
const { resetRepairSession } = await import('./folder.js');
const { BackSignal, setPrompt } = await import('./prompt.js');
const { pickRelease } = await import('./release-picker.js');
const { fetchRelease, pickMasterVersion, resolveReleaseId } = await import('../discogs.js');

let root: string;
let layout: AlbumLayout;
let output: string[];
let asked: string[];

async function album(folder: string, files: string[]): Promise<TrackInfo[]> {
  const albumPath = path.join(root, 'Y', 'Yezda Urfa', folder);
  await fs.mkdir(albumPath, { recursive: true });
  for (const f of files) await fs.writeFile(path.join(albumPath, f), '');
  layout = { letterDir: 'Y', artistName: 'Yezda Urfa', albumFolder: folder, albumPath };
  return files.map((fileName) => ({
    filePath: path.join(albumPath, fileName),
    fileName,
    ext: 'mp3',
    tags: {},
    parsedName: fileName.replace(/^\d+ - (.*)\.mp3$/, '$1'),
  }));
}

const auditOf = (tracks: TrackInfo[], extra: Partial<AlbumAudit> = {}): AlbumAudit => ({
  layout,
  tracks,
  issues: [],
  ...extra,
});

// Answers prompts in order; fails on a prompt the test didn't expect.
function answer(script: Array<[RegExp, string]>) {
  const queue = [...script];
  setPrompt(async (q) => {
    asked.push(q);
    const next = queue.shift();
    if (!next || !next[0].test(q)) throw new Error(`Unexpected prompt: ${JSON.stringify(q)}`);
    return next[1];
  });
  return () => expect(queue, 'unanswered prompts').toEqual([]);
}

const shown = () => output.join('\n');

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-discogs-action-'));
  written.clear();
  output = [];
  asked = [];
  resetRepairSession();
  vi.mocked(pickRelease).mockReset();
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void output.push(args.join(' ')));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe('discogsActionFor — the release ID prompt', () => {
  it('skips without an ID to suggest', async () => {
    const action = await discogsActionFor(auditOf(await album('1976 Sacred Baboon', ['01 - One.mp3'])), 'token');
    expect(action.label).toBe('Tag from Discogs release ID');
    const done = answer([[/Release ID \[enter ID\]: $/, '']]);
    expect(await action.run()).toBeUndefined();
    done();
    expect(shown()).toMatch(/Skipped — no release ID/);
    expect(written.size).toBe(0);
  });

  it('labels the top search hit with its match score', async () => {
    const tracks = await album('1976 Sacred Baboon', ['01 - One.mp3']);
    const results = [{ id: 42, title: 'Yezda Urfa - Sacred Baboon', matchScore: 0.876, releaseUrl: '' }];
    const action = await discogsActionFor(auditOf(tracks, { discogsResults: results }), 'token');
    expect(action.label).toBe('Tag from Discogs release ID (suggested: 42 — Yezda Urfa - Sacred Baboon, 88% match)');
  });

  it('names the top search hit’s format', async () => {
    const tracks = await album('1976 Sacred Baboon', ['01 - One.mp3']);
    const results = [{ id: 42, title: 'Sacred Baboon', matchScore: 0.9, releaseUrl: '', format: ['CD', 'Album'] }];
    const action = await discogsActionFor(auditOf(tracks, { discogsResults: results }), 'token');
    expect(action.label).toBe('Tag from Discogs release ID (suggested: 42 — Sacred Baboon, CD, 90% match)');
  });

  it('asks for another ID after a failed fetch, or gives up', async () => {
    const tracks = await album('1976 Sacred Baboon', ['01 - One.mp3', '02 - Two.mp3']);
    vi.mocked(fetchRelease).mockRejectedValueOnce(new Error('Discogs 404'));
    let done = answer([
      [/Release ID/, '1'],
      [/Try a different release ID\? \[y\/N\]/, 'y'],
      [/Release ID \[enter ID\]/, 'r2'],
    ]);
    const action = await discogsActionFor(auditOf(tracks), 'token');
    expect(await action.run()).toBe('Tagged from Discogs release 2');
    done();
    expect(shown()).toMatch(/✗ Discogs 404/);
    expect(written.get('02 - Two.mp3')).toMatchObject({ TITLE: 'Two', DISCOGS_RELEASE_ID: '2', TRACKNUMBER: '2/2' });

    vi.mocked(fetchRelease).mockRejectedValueOnce(new Error('Discogs 500'));
    done = answer([
      [/Release ID/, '3'],
      [/Try a different release ID/, ''],
    ]);
    expect(await action.run()).toBeUndefined();
    done();
  });

  it('resolves a master ID to its main release', async () => {
    const tracks = await album('1976 Sacred Baboon', ['01 - One.mp3', '02 - Two.mp3']);
    const done = answer([[/Release ID/, 'm9']]);
    expect(await (await discogsActionFor(auditOf(tracks), 'token')).run()).toBe('Tagged from Discogs release 7');
    done();
    expect(resolveReleaseId).toHaveBeenCalledWith({ type: 'master', id: '9' }, 'token');
    expect(shown()).toMatch(/Master m9 → main release r7/);
  });

  it("for a disc folder, a master resolves to a version with that many discs; the disc's own tracks are used", async () => {
    const tracks = await album('1976 Sacred Baboon (Disc 2∕2)', ['01 - Three.mp3', '02 - Four.mp3']);
    vi.mocked(fetchRelease).mockResolvedValueOnce(
      release('8', ['One', 'Two', 'Three', 'Four'], ['1-1', '1-2', '2-1', '2-2']),
    );
    const done = answer([[/Release ID/, 'm9']]);
    expect(await (await discogsActionFor(auditOf(tracks), 'token')).run()).toBe('Tagged from Discogs release 8');
    done();
    expect(pickMasterVersion).toHaveBeenCalledWith('9', 'token', { disc: 2, noOfDiscs: 2, localCount: 2 });
    expect(shown()).toMatch(/Master m9 → release r8 \(a 2-CD version\)/);
    expect(shown()).toMatch(/Disc 2∕2 → release tracks 3–4 of 4 \(2-1 Three … Four\), 100% title match/);
    expect(written.get('01 - Three.mp3')).toMatchObject({ TITLE: 'Three', TRACKNUMBER: '1/2', DISCNUMBER: '2/2' });
  });

  it('asks again when the master lookup fails', async () => {
    const tracks = await album('1976 Sacred Baboon', ['01 - One.mp3']);
    vi.mocked(resolveReleaseId).mockRejectedValueOnce(new Error('Master not found'));
    const done = answer([
      [/Release ID/, 'm404'],
      [/Release ID \[enter ID\]/, ''],
    ]);
    expect(await (await discogsActionFor(auditOf(tracks), 'token')).run()).toBeUndefined();
    done();
    expect(shown()).toMatch(/✗ Master not found[\s\S]*Skipped — no release ID/);
  });
});

describe('discogsActionFor — the browse list', () => {
  const results = [{ id: 5, title: 'Yezda Urfa - Sacred Baboon', releaseUrl: '' }];

  // "Enter a different ID" in the list used to end the action ("Skipped — no release ID").
  it('takes the release picked in the list, after "enter a different ID" asks again', async () => {
    const tracks = await album('1976 Sacred Baboon', ['01 - One.mp3', '02 - Two.mp3']);
    vi.mocked(pickRelease).mockResolvedValueOnce(undefined).mockResolvedValueOnce('6');
    const done = answer([
      [/Release ID \[5\] {2}\(b to browse list\)/, 'b'],
      [/Release ID \[5\]/, 'b'],
    ]);
    const action = await discogsActionFor(auditOf(tracks, { discogsResults: results }), 'token');
    expect(await action.run()).toBe('Tagged from Discogs release 6');
    done();
  });

  it('Esc in the list goes back to the action menu', async () => {
    const tracks = await album('1976 Sacred Baboon', ['01 - One.mp3']);
    vi.mocked(pickRelease).mockResolvedValueOnce(null);
    answer([[/Release ID/, 'b']]);
    const action = await discogsActionFor(auditOf(tracks, { discogsResults: results }), 'token');
    await expect(action.run()).rejects.toBeInstanceOf(BackSignal);
  });
});

describe('discogsActionFor — the tracklist', () => {
  it('stops on a release without tracks', async () => {
    const tracks = await album('1976 Sacred Baboon', ['01 - One.mp3']);
    vi.mocked(fetchRelease).mockResolvedValueOnce(release('1', []));
    answer([[/Release ID/, '1']]);
    expect(await (await discogsActionFor(auditOf(tracks), 'token')).run()).toBeUndefined();
    expect(shown()).toMatch(/No tracks found on this release/);
  });

  it.each([
    [['One', 'Two', 'Bonus'], 'Discogs has 1 more track(s) — may be a bonus edition (3 vs 2 local)'],
    [['One'], 'Discogs has 1 fewer track(s) — may be a different pressing (1 vs 2 local)'],
  ])('warns when the track counts differ: %j', async (titles, warning) => {
    const tracks = await album('1976 Sacred Baboon', ['01 - One.mp3', '02 - Two.mp3']);
    vi.mocked(fetchRelease).mockResolvedValueOnce(release('1', titles));
    const done = answer([
      [/Release ID/, '1'],
      [/Continue anyway\? \[y\/N\]/, ''],
    ]);
    expect(await (await discogsActionFor(auditOf(tracks), 'token')).run()).toBeUndefined();
    done();
    expect(shown()).toContain(warning);
    expect(written.size).toBe(0);
  });

  it("warns when the disc folders together don't hold the release's track count", async () => {
    await album('1976 Sacred Baboon (Disc 1∕2)', ['01 - One.mp3', '02 - Two.mp3', '03 - Extra.mp3']);
    const tracks = await album('1976 Sacred Baboon (Disc 2∕2)', ['01 - Three.mp3', '02 - Four.mp3']);
    vi.mocked(fetchRelease).mockResolvedValueOnce(release('1', ['One', 'Two', 'Three', 'Four']));
    const done = answer([
      [/Release ID/, '1'],
      [/\[Enter\] OK {3}\[n\] Start at another track/, ''],
    ]);
    expect(await (await discogsActionFor(auditOf(tracks), 'token')).run()).toBe('Tagged from Discogs release 1');
    done();
    expect(shown()).toMatch(/The release has 4 tracks, your 2 disc folders 5: it may split the songs differently/);
    expect(shown()).toMatch(/Disc 2∕2 → release tracks 3–4 of 4 .* — placed by titles/);
    expect(written.get('02 - Four.mp3')).toMatchObject({ TITLE: 'Four', TRACKNUMBER: '2/2', DISCNUMBER: '2/2' });
  });
});
