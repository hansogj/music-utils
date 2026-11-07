import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchMaster,
  fetchOriginalYear,
  fetchRelease,
  parseDiscogsRef,
  resetDiscogsCaches,
  resolveReleaseId,
} from './discogs.js';

const RESPONSES: Record<string, unknown> = {
  '/releases/3422683': { title: 'In Rock', year: 1989, master_id: 1439, tracklist: [] },
  '/masters/1439': { year: 1970, main_release: 1849291 },
  '/releases/500': { title: 'Bootleg', year: 1995, tracklist: [] },
  '/releases/600': { title: 'Unknown master year', year: 2001, master_id: 6000, tracklist: [] },
  '/masters/6000': { year: 0, main_release: 600 },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetDiscogsCaches();
  vi.stubEnv('HOME', mkdtempSync(path.join(os.tmpdir(), 'discogs-test-')));
  fetchMock = vi.fn(async (url: string) => {
    const body = RESPONSES[new URL(url).pathname];
    return body
      ? new Response(JSON.stringify(body), { status: 200 })
      : new Response('not found', { status: 404, statusText: 'Not Found' });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('parseDiscogsRef', () => {
  it.each([
    ['4565937', { type: 'release', id: '4565937' }],
    ['[r3422683]', { type: 'release', id: '3422683' }],
    ['m1439', { type: 'master', id: '1439' }],
    ['[M1439]', { type: 'master', id: '1439' }],
    ['https://www.discogs.com/release/3422683-Deep-Purple-In-Rock', { type: 'release', id: '3422683' }],
    ['https://www.discogs.com/master/1439-Deep-Purple-In-Rock', { type: 'master', id: '1439' }],
  ])('parses %s', (input, expected) => {
    expect(parseDiscogsRef(input)).toEqual(expected);
  });

  it.each(['', 'b', 'x1439', 'https://www.discogs.com/artist/1-Foo'])('rejects %o', (input) => {
    expect(parseDiscogsRef(input)).toBeUndefined();
  });
});

describe('fetchRelease', () => {
  it('uses the master year for a reissue and keeps the release year', async () => {
    const release = await fetchRelease('3422683', 'token');
    expect(release).toMatchObject({ releaseId: '3422683', year: '1970', releaseYear: '1989', masterId: 1439 });
  });

  it('uses the release year when there is no master', async () => {
    const release = await fetchRelease('500', 'token');
    expect(release.year).toBe('1995');
    expect(release.masterId).toBeUndefined();
  });

  it('falls back to the release year when the master year is unknown (0)', async () => {
    expect((await fetchRelease('600', 'token')).year).toBe('2001');
  });
});

describe('fetchMaster / resolveReleaseId', () => {
  it('caches masters per session', async () => {
    await fetchMaster(1439, 'token');
    await fetchMaster(1439, 'token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('resolves a master to its main release and passes release IDs through', async () => {
    expect(await resolveReleaseId({ type: 'master', id: '1439' }, 'token')).toBe('1849291');
    expect(await resolveReleaseId({ type: 'release', id: '42' }, 'token')).toBe('42');
  });
});

describe('fetchOriginalYear', () => {
  it('persists results so a later session needs no requests', async () => {
    const first = await fetchOriginalYear('3422683', 'token');
    expect(first).toEqual({ releaseId: '3422683', year: '1970', releaseYear: '1989', masterId: 1439 });

    const cacheFile = path.join(process.env['HOME']!, '.cache', 'music-audit', 'original-years.json');
    expect(JSON.parse(readFileSync(cacheFile, 'utf8'))['3422683'].year).toBe('1970');

    resetDiscogsCaches();
    fetchMock.mockClear();
    expect(await fetchOriginalYear('3422683', 'token')).toEqual(first);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
