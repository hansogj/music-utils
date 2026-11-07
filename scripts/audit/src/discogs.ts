import { scoreTracklist } from './similarity.js';
import fs from 'node:fs/promises';
import path from 'node:path';

import { userHome } from './env.js';
import type { DiscogsSearchResult, OriginalYear } from './types.js';

const API = 'https://api.discogs.com';
const UA = 'MusicLibraryAudit/1.0 +https://github.com/hansogj/music-utils';

// Discogs returns 429 when rate-limited and occasionally 500 under load.
// Retry both with exponential backoff, honouring the Retry-After header.
async function discogsGet(url: string, headers: Record<string, string>): Promise<Response> {
  const MAX = 4;
  for (let attempt = 0; attempt < MAX; attempt++) {
    const res = await fetch(url, { headers });
    if (res.ok) return res;
    if ((res.status === 429 || res.status === 500) && attempt < MAX - 1) {
      const retryAfter = res.headers.get('Retry-After');
      const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : (2 ** attempt) * 1500;
      process.stderr.write(`  Discogs ${res.status} — retrying in ${Math.round(waitMs / 1000)}s…\n`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    throw new Error(`Discogs ${res.status}: ${res.statusText}`);
  }
  throw new Error('Discogs: max retries exceeded');
}

function authHeaders(token: string): Record<string, string> {
  return { 'User-Agent': UA, Authorization: `Discogs token=${token}` };
}

export interface DiscogsRef {
  type: 'release' | 'master';
  id: string;
}

// Accepts 4565937, r4565937, [r4565937], m1439, [m1439] and discogs.com release/master URLs.
// Bare numbers are release IDs. Mirrors parseDiscogsId in @hansogj/discogs-item-lookup.
export function parseDiscogsRef(input: string): DiscogsRef | undefined {
  const s = input.trim();
  const url = s.match(/discogs\.com\/(?:[^/]+\/)*(release|master)\/(\d+)/i);
  if (url) return { type: url[1].toLowerCase() as DiscogsRef['type'], id: url[2] };
  const ref = s.match(/^\[?\s*([rm]?)(\d+)\s*\]?$/i);
  if (ref) return { type: ref[1].toLowerCase() === 'm' ? 'master' : 'release', id: ref[2] };
  return undefined;
}

export interface MasterInfo {
  id: number;
  year?: string; // undefined when Discogs reports 0 (unknown)
  mainRelease?: number;
}

// Masters are shared by every pressing and disc of an album — cache per session.
const masterCache = new Map<number, Promise<MasterInfo>>();

export function fetchMaster(masterId: number, token: string): Promise<MasterInfo> {
  let cached = masterCache.get(masterId);
  if (!cached) {
    cached = discogsGet(`${API}/masters/${masterId}`, authHeaders(token))
      .then((res) => res.json() as Promise<{ year?: number; main_release?: number }>)
      .then((data) => ({
        id: masterId,
        year: data.year ? String(data.year) : undefined,
        mainRelease: data.main_release,
      }));
    cached.catch(() => masterCache.delete(masterId)); // don't cache failures
    masterCache.set(masterId, cached);
  }
  return cached;
}

// Resolves a parsed reference to a release ID; a master resolves to its main release.
export async function resolveReleaseId(ref: DiscogsRef, token: string): Promise<string> {
  if (ref.type === 'release') return ref.id;
  const master = await fetchMaster(Number(ref.id), token);
  if (!master.mainRelease) throw new Error(`Master ${ref.id} has no main release`);
  return String(master.mainRelease);
}

interface RawResult {
  id: number;
  title: string;
  year?: string;
  master_id?: number;
  genre?: string[];
  style?: string[];
}

interface SearchResponse {
  results?: RawResult[];
}

interface RawTrack {
  position: string;
  title: string;
  type_: string;
  duration?: string;
  extraartists?: Array<{ name: string; role: string }>;
}

function cleanAlbumTitle(folderName: string): string {
  return folderName
    .replace(/^\d{4}\s+/, '')              // strip leading year
    .replace(/\s*\([^)]+\)\s*/g, ' ')     // strip parentheticals (Disc N/M)
    .replace(/\s*\[[^\]]+\]\s*/g, ' ')    // strip aux brackets
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchReleaseTracks(releaseId: number, token: string): Promise<string[]> {
  let res: Response;
  try {
    res = await discogsGet(`${API}/releases/${releaseId}`, authHeaders(token));
  } catch {
    return [];
  }
  const data = (await res.json()) as { tracklist?: RawTrack[] };
  return (data.tracklist ?? [])
    .filter((t) => t.type_ === 'track')
    .map((t) => t.title);
}

// Fetch tracklists for up to `scoreCandidates` results in parallel,
// score each against local track names, and sort best-first.
async function scoreAndRank(
  results: DiscogsSearchResult[],
  localNames: string[],
  token: string,
  scoreCandidates: number,
): Promise<DiscogsSearchResult[]> {
  if (localNames.length === 0 || results.length === 0) return results;

  const toScore = results.slice(0, scoreCandidates);
  const rest = results.slice(scoreCandidates);

  const scored = await Promise.all(
    toScore.map(async (r) => {
      const titles = await fetchReleaseTracks(r.id, token);
      return {
        ...r,
        trackCount: titles.length,
        matchScore: titles.length > 0 ? scoreTracklist(localNames, titles) : undefined,
      };
    }),
  );

  // Sort scored results best-first; unscored results stay at the end.
  scored.sort((a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1));

  return [...scored, ...rest];
}

export async function searchDiscogs(
  artist: string,
  albumFolder: string,
  token: string,
  localTrackNames: string[] = [],
  limit = 5,
  scoreCandidates = 3,
): Promise<DiscogsSearchResult[]> {
  const title = cleanAlbumTitle(albumFolder);

  const url = new URL(`${API}/database/search`);
  url.searchParams.set('type', 'release');
  url.searchParams.set('artist', artist);
  url.searchParams.set('release_title', title);
  url.searchParams.set('per_page', String(limit));

  const res = await discogsGet(url.toString(), authHeaders(token));

  const data = (await res.json()) as SearchResponse;

  const results: DiscogsSearchResult[] = (data.results ?? []).slice(0, limit).map((r) => ({
    id: r.id,
    title: r.title.replace(/\s*\(\d+\)(\s+-\s+|$)/, '$1'),
    year: r.year,
    masterId: r.master_id,
    releaseUrl: `https://www.discogs.com/release/${r.id}`,
    masterUrl: r.master_id ? `https://www.discogs.com/master/${r.master_id}` : undefined,
    genre: r.genre,
    style: r.style,
  }));

  const ranked =
    localTrackNames.length > 0 ? await scoreAndRank(results, localTrackNames, token, scoreCandidates) : results;
  return withOriginalYears(ranked, token, scoreCandidates);
}

// Adds the master (original) year to the top candidates. Pressings of one album share
// a master, so this is usually a single extra request.
async function withOriginalYears(
  results: DiscogsSearchResult[],
  token: string,
  candidates: number,
): Promise<DiscogsSearchResult[]> {
  const masterIds = [...new Set(results.slice(0, candidates).flatMap((r) => (r.masterId ? [r.masterId] : [])))];
  const years = new Map<number, string | undefined>();
  await Promise.all(
    masterIds.map(async (id) => {
      try {
        years.set(id, (await fetchMaster(id, token)).year);
      } catch {
        // Non-fatal — fall back to the release year
      }
    }),
  );
  return results.map((r) => ({ ...r, originalYear: (r.masterId && years.get(r.masterId)) || r.year }));
}

export interface ReleaseInfo {
  releaseId: string;
  tracklist: RawTrack[];
  year?: string; // original year: the master's, falling back to the release's own
  releaseYear?: string; // year of this specific pressing/reissue
  masterId?: number;
  title?: string;
  artists?: string[];
  genres?: string[];
  styles?: string[];
  country?: string;
  extraartists?: Array<{ name: string; role: string }>;
}

// Fetch full release metadata (tracklist, year, title, artists, genres) for use in repair.ts.
// The returned `year` is the master's (original) year, so a 1989 reissue of a 1970 album
// is tagged 1970; `releaseYear` keeps the reissue year.
export async function fetchRelease(releaseId: string, token: string): Promise<ReleaseInfo> {
  const res = await discogsGet(`${API}/releases/${releaseId}`, authHeaders(token));
  const data = (await res.json()) as {
    tracklist?: RawTrack[];
    year?: number | string;
    master_id?: number;
    title?: string;
    artists?: Array<{ name: string }>;
    genres?: string[];
    styles?: string[];
    country?: string;
    extraartists?: Array<{ name: string; role: string }>;
  };
  const releaseYear = data.year && String(data.year) !== '0' ? String(data.year) : undefined;
  const masterYear = data.master_id ? (await fetchMaster(data.master_id, token)).year : undefined;
  return {
    releaseId,
    tracklist: (data.tracklist ?? []).filter((t) => t.type_ === 'track'),
    year: masterYear ?? releaseYear,
    releaseYear,
    ...(data.master_id ? { masterId: data.master_id } : {}),
    title: data.title,
    // Strip Discogs disambiguation suffixes like " (2)" from artist names.
    artists: data.artists?.map((a) => a.name.replace(/\s*\(\d+\)\s*$/, '').trim()),
    genres: data.genres,
    styles: data.styles,
    country: data.country,
    extraartists: data.extraartists?.map((a) => ({ name: a.name.replace(/\s*\(\d+\)\s*$/, '').trim(), role: a.role })),
  };
}

// ── original-year cache ───────────────────────────────────────────────────────
// release ID → original year, persisted so repeat audits don't re-query Discogs for
// every tagged album. Master years don't change; delete the file to force a refresh.

const yearCachePath = () => path.join(userHome(), '.cache', 'music-audit', 'original-years.json');
let yearCache: Promise<Record<string, OriginalYear>> | undefined;

function loadYearCache(): Promise<Record<string, OriginalYear>> {
  yearCache ??= fs
    .readFile(yearCachePath(), 'utf8')
    .then((s) => JSON.parse(s) as Record<string, OriginalYear>)
    .catch(() => ({}));
  return yearCache;
}

async function saveYearCache(cache: Record<string, OriginalYear>): Promise<void> {
  try {
    await fs.mkdir(path.dirname(yearCachePath()), { recursive: true });
    await fs.writeFile(yearCachePath(), JSON.stringify(cache), 'utf8');
  } catch {
    // Non-fatal — e.g. a root-owned cache file when switching between sudo and non-sudo runs
  }
}

export async function fetchOriginalYear(releaseId: string, token: string): Promise<OriginalYear> {
  const cache = await loadYearCache();
  if (cache[releaseId]) return cache[releaseId];
  const release = await fetchRelease(releaseId, token);
  const original: OriginalYear = {
    releaseId,
    year: release.year,
    releaseYear: release.releaseYear,
    ...(release.masterId ? { masterId: release.masterId } : {}),
  };
  cache[releaseId] = original;
  await saveYearCache(cache);
  return original;
}

/** Test helper: forget in-memory caches. */
export function resetDiscogsCaches(): void {
  masterCache.clear();
  yearCache = undefined;
}
