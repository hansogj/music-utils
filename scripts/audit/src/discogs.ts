import { scoreTracklist } from './similarity.js';
import type { DiscogsSearchResult } from './types.js';

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
    res = await discogsGet(`${API}/releases/${releaseId}`, { 'User-Agent': UA, Authorization: `Discogs token=${token}` });
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

  const res = await discogsGet(url.toString(), { 'User-Agent': UA, Authorization: `Discogs token=${token}` });

  const data = (await res.json()) as SearchResponse;

  const results: DiscogsSearchResult[] = (data.results ?? []).slice(0, limit).map((r) => ({
    id: r.id,
    title: r.title,
    year: r.year,
    masterId: r.master_id,
    releaseUrl: `https://www.discogs.com/release/${r.id}`,
    masterUrl: r.master_id ? `https://www.discogs.com/master/${r.master_id}` : undefined,
    genre: r.genre,
    style: r.style,
  }));

  if (localTrackNames.length > 0) {
    return scoreAndRank(results, localTrackNames, token, scoreCandidates);
  }

  return results;
}

export interface ReleaseInfo {
  tracklist: RawTrack[];
  year?: string;
  title?: string;
  artists?: string[];
  genres?: string[];
  styles?: string[];
  country?: string;
  extraartists?: Array<{ name: string; role: string }>;
}

// Fetch full release metadata (tracklist, year, title, artists, genres) for use in repair.ts.
export async function fetchRelease(releaseId: string, token: string): Promise<ReleaseInfo> {
  const res = await discogsGet(`${API}/releases/${releaseId}`, { 'User-Agent': UA, Authorization: `Discogs token=${token}` });
  const data = (await res.json()) as {
    tracklist?: RawTrack[];
    year?: number | string;
    title?: string;
    artists?: Array<{ name: string }>;
    genres?: string[];
    styles?: string[];
    country?: string;
    extraartists?: Array<{ name: string; role: string }>;
  };
  return {
    tracklist: (data.tracklist ?? []).filter((t) => t.type_ === 'track'),
    year: data.year ? String(data.year) : undefined,
    title: data.title,
    // Strip Discogs disambiguation suffixes like " (2)" from artist names.
    artists: data.artists?.map((a) => a.name.replace(/\s*\(\d+\)\s*$/, '').trim()),
    genres: data.genres,
    styles: data.styles,
    country: data.country,
    extraartists: data.extraartists?.map((a) => ({ name: a.name, role: a.role })),
  };
}
