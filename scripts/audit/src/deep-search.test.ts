import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deepCandidates, deepSearch, rankDeep, tracksFound } from './deep-search.js';
import { type ArtistRelease, resetDiscogsCaches, searchArtistId } from './discogs.js';
import type { DiscogsSearchResult } from './types.js';

const tracks = (...titles: string[]) => titles.map((title, i) => ({ position: String(i + 1), title, type_: 'track' }));

const RESPONSES: Record<string, unknown> = {
  '/artists/9/releases': {
    pagination: { pages: 1 },
    releases: [
      { id: 100, type: 'master', main_release: 1001, title: 'Jazz Classics', year: 1950, role: 'Main' },
      {
        id: 200,
        type: 'release',
        title: 'High Society',
        year: 2003,
        role: 'Main',
        format: 'CD, Comp',
        artist: 'Sidney Bechet (2)',
      },
      { id: 300, type: 'release', title: 'Various', year: 2003, role: 'Appearance' },
      { id: 400, type: 'release', title: 'Gone', year: 2002, role: 'Main' },
      { id: 500, type: 'release', title: 'Other Songs', year: 2004, role: 'Main' },
      { id: 600, type: 'label', title: 'Not a release', role: 'Main' },
    ],
  },
  '/masters/100': { main_release: 1001, tracklist: tracks('Summertime', 'Blue Horizon') },
  '/releases/200': { tracklist: tracks('High Society', 'Tiger Rag', 'Summertime', 'Bonus') },
  '/releases/500': { tracklist: tracks('Something Else') },
  '/database/search': { results: [{ id: 9 }] },
};

beforeEach(() => {
  resetDiscogsCaches();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = RESPONSES[new URL(url).pathname];
      return body
        ? new Response(JSON.stringify(body), { status: 200 })
        : new Response('not found', { status: 404, statusText: 'Not Found' });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('tracksFound', () => {
  it('is the share of local titles found anywhere on the release', () => {
    expect(tracksFound(['Tiger Rag', 'Summertime', 'Nope'], ['Summertime', 'Tiger rag!'])).toBeCloseTo(2 / 3);
    expect(tracksFound(['', ' '], ['A'])).toBe(0);
    expect(tracksFound(['A b'], [])).toBe(0);
  });
});

describe('rankDeep', () => {
  const r = (id: number, matchScore: number, trackCount: number): DiscogsSearchResult => ({
    id,
    title: '',
    releaseUrl: '',
    matchScore,
    trackCount,
  });
  it('puts most tracks found first, then the closest track count', () => {
    expect(rankDeep([r(1, 0.5, 3), r(2, 1, 30), r(3, 1, 4), r(4, 1, 2)], 3).map((x) => x.id)).toEqual([3, 4, 2, 1]);
  });
});

describe('deepCandidates', () => {
  const e = (id: number, year: string | undefined, role = 'Main'): ArtistRelease => ({
    id,
    type: 'release',
    title: '',
    role,
    ...(year ? { year } : {}),
  });
  it("keeps the artist's own entries, nearest the folder's year first, up to max", () => {
    const list = [e(1, '1950'), e(2, '2003', 'Appearance'), e(3, '2001'), e(4, undefined), e(5, '2003')];
    expect(deepCandidates(list, 2003, 3).map((x) => x.id)).toEqual([5, 3, 1]);
    expect(deepCandidates(list, undefined, 9).map((x) => x.id)).toEqual([1, 3, 4, 5]);
  });
});

describe('deepSearch', () => {
  it("scores the artist's discography by the local titles and ranks it", async () => {
    const progress: Array<[number, number]> = [];
    const results = await deepSearch({
      artistId: 9,
      artistName: 'Sidney Bechet',
      localNames: ['High Society', 'Tiger Rag', 'Summertime'],
      year: 2003,
      token: 't',
      progress: (d, t) => progress.push([d, t]),
    });
    expect(results.map((r) => [r.id, Math.round(r.matchScore! * 100), r.trackCount])).toEqual([
      [200, 100, 4],
      [1001, 33, 2],
    ]);
    expect(results[0]).toMatchObject({ title: 'Sidney Bechet - High Society', format: ['CD', 'Comp'], year: '2003' });
    expect(results[1]).toMatchObject({ title: 'Sidney Bechet - Jazz Classics', masterId: 100 });
    expect(progress.at(-1)).toEqual([4, 4]);
  });

  it('stops when Esc is pressed', async () => {
    const results = await deepSearch({
      artistId: 9,
      artistName: 'Sidney Bechet',
      localNames: ['High Society'],
      token: 't',
      stopped: () => true,
    });
    expect(results).toEqual([]);
  });
});

describe('searchArtistId', () => {
  it('is the first artist a name search finds', async () => {
    expect(await searchArtistId('Sidney Bechet', 't')).toBe(9);
  });
});
