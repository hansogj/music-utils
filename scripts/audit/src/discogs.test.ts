import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchMaster,
  fetchOriginalYear,
  fetchRelease,
  flattenTracklist,
  matchScore,
  numberTracklist,
  parseDiscogsRef,
  pickMasterVersion,
  resetDiscogsCaches,
  resolveReleaseId,
  searchDiscogs,
} from './discogs.js';

const RESPONSES: Record<string, unknown> = {
  '/releases/3422683': { title: 'In Rock', year: 1989, master_id: 1439, tracklist: [] },
  '/masters/1439': { title: 'Deep Purple In Rock', year: 1970, main_release: 1849291 },
  '/releases/500': { title: 'Bootleg', year: 1995, tracklist: [] },
  '/releases/600': { title: 'Unknown master year', year: 2001, master_id: 6000, tracklist: [] },
  '/masters/6000': { year: 0, main_release: 600 },
  // Yessongs: master → 3×LP main release; CD versions 3-disc (skipped), 2×CD 7+6, 2×CD 8+5.
  '/masters/35063': { title: 'Yessongs', year: 1973, main_release: 8304347 },
  '/masters/35063/versions': { versions: [{ id: 901 }, { id: 902 }, { id: 903 }] },
  '/releases/901': { master_id: 35063, tracklist: cdTracks(5, 4, 4) },
  '/releases/902': { master_id: 35063, tracklist: cdTracks(7, 6) },
  '/releases/903': { master_id: 35063, tracklist: cdTracks(8, 5) },
};

function cdTracks(...perDisc: number[]) {
  return perDisc.flatMap((n, d) =>
    Array.from({ length: n }, (_, i) => ({
      position: `${d + 1}-${i + 1}`,
      title: `T${d + 1}.${i + 1}`,
      type_: 'track',
    })),
  );
}

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

  it('uses the master title and keeps the release title', async () => {
    const release = await fetchRelease('3422683', 'token');
    expect(release.title).toBe('Deep Purple In Rock');
    expect(release.releaseTitle).toBe('In Rock');
  });

  it('uses the release year when there is no master', async () => {
    const release = await fetchRelease('500', 'token');
    expect(release.year).toBe('1995');
    expect(release.title).toBe('Bootleg');
    expect(release.masterId).toBeUndefined();
  });

  it('falls back to the release year when the master year is unknown (0)', async () => {
    expect((await fetchRelease('600', 'token')).year).toBe('2001');
  });
});

describe('rate limiting', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('pauses after a 429 and retries, with one message', async () => {
    vi.useFakeTimers();
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const ok = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementationOnce(async () => new Response('', { status: 429, statusText: 'Too Many Requests' }));
    fetchMock.mockImplementation(ok);

    const master = fetchMaster(1439, 'token');
    await vi.advanceTimersByTimeAsync(5000);
    expect((await master).year).toBe('1970');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(stderr.mock.calls.map(([m]) => String(m))).toEqual([expect.stringMatching(/rate limit.*pausing 5s/)]);
    stderr.mockRestore();
  });

  it('gives up after repeated 429s', async () => {
    vi.useFakeTimers();
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    fetchMock.mockImplementation(async () => new Response('', { status: 429, statusText: 'Too Many Requests' }));
    const master = fetchMaster(1439, 'token').catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(await master).toEqual(new Error('Discogs 429: Too Many Requests'));
    expect(fetchMock).toHaveBeenCalledTimes(8);
    stderr.mockRestore();
  });

  it('does not fetch a release scored for the search again when it is picked', async () => {
    RESPONSES['/database/search'] = { results: [{ id: 902, title: 'Yes - Yessongs', master_id: 35063 }] };
    try {
      const results = await searchDiscogs('Yes', '1973 Yessongs', 'token', ['T1.1', 'T1.2']);
      expect(results[0].id).toBe(902);
      fetchMock.mockClear();
      expect((await fetchRelease('902', 'token')).tracklist).toHaveLength(13);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      delete RESPONSES['/database/search'];
    }
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

describe('numberTracklist', () => {
  const tracks = (...positions: string[]) => positions.map((position, i) => ({ position, title: `T${i + 1}` }));
  const nums = (...positions: string[]) => numberTracklist(tracks(...positions)).map((t) => `${t.disc}.${t.no}`);

  it('uses numeric positions as given', () => {
    expect(nums('1', '2', '3')).toEqual(['1.1', '1.2', '1.3']);
    expect(nums('1-1', '1-2', '2-1', '2-2')).toEqual(['1.1', '1.2', '2.1', '2.2']);
    expect(nums('1.01', '2.01')).toEqual(['1.1', '2.1']);
  });

  it('keeps gaps in numeric positions rather than renumbering', () => {
    expect(nums('1', '2', '4')).toEqual(['1.1', '1.2', '1.4']);
  });

  it('numbers vinyl sides by listing order', () => {
    expect(nums('A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'B4')).toEqual(['1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7']);
    expect(nums('A', 'B')).toEqual(['1.1', '1.2']);
  });

  it('reads disc prefixes like CD2-3 and numbers per disc', () => {
    expect(nums('CD1-1', 'CD1-2', 'CD2-1')).toEqual(['1.1', '1.2', '2.1']);
  });

  it('falls back to listing order when positions are mixed or blank', () => {
    expect(nums('1', '2', 'Bonus')).toEqual(['1.1', '1.2', '1.3']);
    expect(nums('', '')).toEqual(['1.1', '1.2']);
  });

  it('starts a new disc when plain numbering restarts at 1', () => {
    expect(nums('1', '2', '3', '1', '2')).toEqual(['1.1', '1.2', '1.3', '2.1', '2.2']);
  });

  it('keeps titles with their numbers', () => {
    expect(numberTracklist(tracks('B1', 'A1')).map((t) => t.title)).toEqual(['T1', 'T2']);
  });
});

describe('flattenTracklist', () => {
  it('keeps tracks, turns a suite (index) into one track and drops headings', () => {
    const flat = flattenTracklist([
      { position: '', title: 'CD 1', type_: 'heading' },
      { position: '1-4', title: 'Perpetual Change', type_: 'track' },
      {
        position: '',
        title: 'And You And I',
        type_: 'index',
        sub_tracks: [
          { position: '1-5.a', title: 'Cord Of Life', type_: 'track' },
          { position: '1-5.b', title: 'Eclipse', type_: 'track' },
        ],
      },
      { position: '', title: 'Empty index', type_: 'index' },
    ]);
    expect(flat.map((t) => [t.position, t.title])).toEqual([
      ['1-4', 'Perpetual Change'],
      ['1-5', 'And You And I'],
    ]);
  });
});

describe('matchScore', () => {
  const numbered = numberTracklist(cdTracks(3, 2).map((t, i) => ({ ...t, title: ['A', 'B', 'C', 'Dee', 'Eee'][i] })));

  it('scores a disc folder against its own disc only', () => {
    expect(matchScore(['Dee', 'Eee'], numbered, '1973 X (Disc 2∕2)')).toBeCloseTo(1, 1);
    expect(matchScore(['Dee', 'Eee'], numbered, '1973 X')).toBeLessThan(0.5);
    expect(matchScore(['Dee'], [], '1973 X')).toBeUndefined();
  });
});

describe('pickMasterVersion', () => {
  it("picks the CD version with this disc folder's track count", async () => {
    const picked = await pickMasterVersion('35063', 'token', { disc: 1, noOfDiscs: 2, localCount: 8 });
    expect(picked).toEqual({ releaseId: '903', why: '2×CD, disc 1: 8 tracks' });
  });

  it('settles for the first CD version with the right number of discs', async () => {
    const picked = await pickMasterVersion('35063', 'token', { disc: 2, noOfDiscs: 2, localCount: 9 });
    expect(picked).toEqual({ releaseId: '902', why: '2×CD, disc 2: 6 tracks' });
  });

  it('falls back to the main release', async () => {
    expect(await pickMasterVersion('35063', 'token', { disc: 1, noOfDiscs: 4, localCount: 8 })).toEqual({
      releaseId: '8304347',
      why: 'main release',
    });
    // No version list (request fails) → main release too.
    expect(await pickMasterVersion('1439', 'token', { disc: 1, noOfDiscs: 2, localCount: 8 })).toEqual({
      releaseId: '1849291',
      why: 'main release',
    });
  });
});
