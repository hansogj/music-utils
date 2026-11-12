import fs from 'node:fs/promises';
import path from 'node:path';

import { discOfFolder, sliceForDisc } from './disc-split.js';
import { RateLimiter } from './rate-limit.js';
import { userHome } from './env.js';
import { scoreTracklist } from './similarity.js';
import type { DiscogsSearchResult, OriginalYear } from './types.js';

const API = 'https://api.discogs.com';
const UA = 'MusicLibraryAudit/1.0 +https://github.com/hansogj/music-utils';

// Every request waits for a slot in the shared rate limit (see rate-limit.ts), so the scan
// doesn't run into 429s. A 429 that still happens (the same token in use elsewhere) pauses
// all requests with a growing pause; enough attempts to outlast a full 60s window. A 500
// (Discogs under load) is retried a few times with backoff.
export const discogsLimiter = new RateLimiter({ log: (m) => process.stderr.write(`  ${m}\n`) });

const MAX_429 = 8; // pauses of 5+10+20+40+60+60+60s: well past a full window
const MAX_500 = 3;

async function discogsGet(url: string, headers: Record<string, string>): Promise<Response> {
  for (let attempt = 0, errors = 0; ; ) {
    await discogsLimiter.acquire();
    const res = await fetch(url, { headers });
    discogsLimiter.observe(res.headers);
    if (res.ok) {
      discogsLimiter.succeeded();
      return res;
    }
    if (res.status === 429 && ++attempt < MAX_429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '', 10);
      discogsLimiter.rateLimited(Number.isNaN(retryAfter) ? undefined : retryAfter);
      continue;
    }
    if (res.status === 500 && ++errors < MAX_500) {
      const waitMs = 2 ** errors * 1500;
      process.stderr.write(`  Discogs 500 — retrying in ${Math.round(waitMs / 1000)}s…\n`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    throw new Error(`Discogs ${res.status}: ${res.statusText}`);
  }
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
  title?: string;
  year?: string; // undefined when Discogs reports 0 (unknown)
  mainRelease?: number;
}

// Masters are shared by every pressing and disc of an album — cache per session.
const masterCache = new Map<number, Promise<MasterInfo>>();

export function fetchMaster(masterId: number, token: string): Promise<MasterInfo> {
  let cached = masterCache.get(masterId);
  if (!cached) {
    cached = discogsGet(`${API}/masters/${masterId}`, authHeaders(token))
      .then((res) => res.json() as Promise<{ title?: string; year?: number; main_release?: number }>)
      .then((data) => ({
        id: masterId,
        title: data.title?.trim() || undefined,
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

export interface MasterVersionWanted {
  disc: number;
  noOfDiscs: number;
  localCount: number;
}

// For a "(Disc n∕m)" folder a master's main release is often the original vinyl, whose
// sides don't map onto CDs. Prefer a CD version with as many discs as there are folders
// (and, best, as many tracks on this disc as the folder has); else the main release.
export async function pickMasterVersion(
  masterId: string,
  token: string,
  want: MasterVersionWanted,
  maxChecks = 5,
): Promise<{ releaseId: string; why: string }> {
  const main = async () => ({ releaseId: await resolveReleaseId({ type: 'master', id: masterId }, token), why: 'main release' });
  let ids: number[];
  try {
    const res = await discogsGet(`${API}/masters/${masterId}/versions?format=CD&per_page=25`, authHeaders(token));
    const data = (await res.json()) as { versions?: Array<{ id: number }> };
    ids = (data.versions ?? []).map((v) => v.id);
  } catch {
    return main();
  }

  let sameDiscs: { releaseId: string; why: string } | undefined;
  for (const id of ids.slice(0, maxChecks)) {
    let numbered: NumberedTrack[];
    try {
      numbered = numberTracklist((await fetchRelease(String(id), token)).tracklist);
    } catch {
      continue;
    }
    if (new Set(numbered.map((t) => t.disc)).size !== want.noOfDiscs) continue;
    const onDisc = numbered.filter((t) => t.disc === want.disc).length;
    const why = `${want.noOfDiscs}×CD, disc ${want.disc}: ${onDisc} tracks`;
    if (onDisc === want.localCount) return { releaseId: String(id), why };
    sameDiscs ??= { releaseId: String(id), why };
  }
  return sameDiscs ?? main();
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
  sub_tracks?: RawTrack[];
}

// The release's tracks as files on a disc. An "index" entry (a suite such as "And You
// And I", listed with its parts as sub-tracks and no position of its own) is one file:
// it keeps its title and takes its position from the first part ("1-5.a" → "1-5",
// "B2a" → "B2"). Headings are dropped.
export function flattenTracklist(tracklist: RawTrack[]): RawTrack[] {
  return tracklist.flatMap((t) => {
    if (t.type_ === 'track') return [t];
    if (t.type_ !== 'index' || !t.sub_tracks?.length) return [];
    const position = t.position?.trim() || t.sub_tracks[0].position.trim().replace(/\.?[a-z]$/, '');
    return [{ ...t, type_: 'track', position }];
  });
}

export interface NumberedTrack {
  disc: number;
  no: number;
  title: string;
  position: string;
}

const NUMERIC_POSITION = /^(?:(\d+)[-./:])?(\d+)$/;
const DISC_PREFIX = /^(?:cd|disc|dvd)?\s*(\d+)\s*[-./:]/i;

// Maps Discogs tracks to the disc/track numbers of local files.
// Numeric positions ("3", "1-03", "2.05") are used as given; plain numbers that start
// again at 1 (CD1 / CD2 headings) begin a new disc. Anything else — vinyl sides
// ("A1", "B2"), "CD1-3", blanks — is numbered by listing order, per disc.
export function numberTracklist(tracklist: Array<{ position: string; title: string }>): NumberedTrack[] {
  const numeric = tracklist.length > 0 && tracklist.every((t) => NUMERIC_POSITION.test(t.position.trim()));
  const counters = new Map<number, number>();
  let restartDisc = 1;
  let prevNo = 0;
  return tracklist.map((t) => {
    const position = t.position.trim();
    if (numeric) {
      const [, disc, noStr] = position.match(NUMERIC_POSITION)!;
      const no = parseInt(noStr, 10);
      if (disc) return { disc: parseInt(disc, 10), no, title: t.title, position };
      if (no <= prevNo) restartDisc++;
      prevNo = no;
      return { disc: restartDisc, no, title: t.title, position };
    }
    const disc = parseInt(position.match(DISC_PREFIX)?.[1] ?? '1', 10);
    const no = (counters.get(disc) ?? 0) + 1;
    counters.set(disc, no);
    return { disc, no, title: t.title, position };
  });
}

function cleanAlbumTitle(folderName: string): string {
  return folderName
    .replace(/^\d{4}\s+/, '')              // strip leading year
    .replace(/\s*\([^)]+\)\s*/g, ' ')     // strip parentheticals (Disc N/M)
    .replace(/\s*\[[^\]]+\]\s*/g, ' ')    // strip aux brackets
    .replace(/\s+/g, ' ')
    .trim();
}

interface RawRelease {
  tracklist?: RawTrack[];
  year?: number | string;
  master_id?: number;
  title?: string;
  artists?: Array<{ name: string }>;
  genres?: string[];
  styles?: string[];
  country?: string;
  extraartists?: Array<{ name: string; role: string }>;
}

// Releases fetched to score search results are usually fetched again when one is picked
// for tagging: keep the most recent ones for the session.
const RELEASE_CACHE_SIZE = 200;
const releaseCache = new Map<string, Promise<RawRelease>>();

function getRelease(releaseId: string, token: string): Promise<RawRelease> {
  let cached = releaseCache.get(releaseId);
  if (cached) {
    releaseCache.delete(releaseId); // re-insert: most recently used last
  } else {
    cached = discogsGet(`${API}/releases/${releaseId}`, authHeaders(token)).then((res) => res.json() as Promise<RawRelease>);
    const pending = cached;
    // Don't cache failures.
    pending.catch(() => releaseCache.get(releaseId) === pending && releaseCache.delete(releaseId));
  }
  releaseCache.set(releaseId, cached);
  if (releaseCache.size > RELEASE_CACHE_SIZE) releaseCache.delete(releaseCache.keys().next().value!);
  return cached;
}

async function fetchReleaseTracks(releaseId: number, token: string): Promise<NumberedTrack[]> {
  try {
    const data = await getRelease(String(releaseId), token);
    return numberTracklist(flattenTracklist(data.tracklist ?? []));
  } catch {
    return [];
  }
}

// How well local track names match a release. For a "(Disc n∕m)" folder only that
// disc's part of the release counts, so disc 2 isn't compared with disc 1's titles.
export function matchScore(localNames: string[], numbered: NumberedTrack[], albumFolder: string): number | undefined {
  if (numbered.length === 0) return undefined;
  const folderDisc = discOfFolder(albumFolder);
  if (folderDisc.noOfDiscs <= 1) return scoreTracklist(localNames, numbered.map((t) => t.title));
  return sliceForDisc(numbered, { ...folderDisc, localNames, localCount: localNames.length }).score;
}

// Fetch tracklists for up to `scoreCandidates` results in parallel,
// score each against local track names, and sort best-first.
async function scoreAndRank(
  results: DiscogsSearchResult[],
  localNames: string[],
  albumFolder: string,
  token: string,
  scoreCandidates: number,
): Promise<DiscogsSearchResult[]> {
  if (localNames.length === 0 || results.length === 0) return results;

  const toScore = results.slice(0, scoreCandidates);
  const rest = results.slice(scoreCandidates);

  const scored = await Promise.all(
    toScore.map(async (r) => {
      const numbered = await fetchReleaseTracks(r.id, token);
      return {
        ...r,
        trackCount: numbered.length,
        matchScore: matchScore(localNames, numbered, albumFolder),
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
    localTrackNames.length > 0 ? await scoreAndRank(results, localTrackNames, albumFolder, token, scoreCandidates) : results;
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
  title?: string; // album title: the master's, falling back to the release's own
  releaseTitle?: string;
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
  const data = await getRelease(releaseId, token);
  const releaseYear = data.year && String(data.year) !== '0' ? String(data.year) : undefined;
  const master = data.master_id ? await fetchMaster(data.master_id, token) : undefined;
  return {
    releaseId,
    tracklist: flattenTracklist(data.tracklist ?? []),
    year: master?.year ?? releaseYear,
    releaseYear,
    ...(data.master_id ? { masterId: data.master_id } : {}),
    title: master?.title ?? data.title,
    releaseTitle: data.title,
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
  releaseCache.clear();
  discogsLimiter.reset();
  yearCache = undefined;
}
