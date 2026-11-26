import { fitTracklist } from '@hansogj/discogs-item-lookup/format';

import { type ArtistRelease, fetchArtistReleases, fetchMaster, fetchRawTracklist, numberTracklist } from './discogs.js';
import { dice } from './similarity.js';
import { type DiscogsSearchResult } from './types.js';

// The deeper search: when the release picked for an album has another number of tracks,
// the artist's Discogs discography is scored by the album's own track titles, whatever
// the releases are called (a compilation of the same songs under another title).

// Entries scored at most (each a request: about a minute at 60 a minute).
export const DEEP_SEARCH_MAX = 60;
// A local title is found on a release when one of its titles is this close (Dice, 0–1).
export const FOUND_AT = 0.75;

// The share (0–1) of the local titles found anywhere on the release, in any order.
export function tracksFound(localNames: string[], titles: string[]): number {
  const named = localNames.filter((n) => n.trim());
  if (named.length === 0 || titles.length === 0) return 0;
  const found = named.filter((n) => titles.some((t) => dice(n, t) >= FOUND_AT)).length;
  return found / named.length;
}

// Most tracks found first (in whole %); then the track count closest to the folder's.
export function rankDeep(results: DiscogsSearchResult[], localCount: number): DiscogsSearchResult[] {
  const pct = (r: DiscogsSearchResult) => Math.round((r.matchScore ?? 0) * 100);
  const off = (r: DiscogsSearchResult) => Math.abs((r.trackCount ?? 0) - localCount);
  return [...results].sort((a, b) => pct(b) - pct(a) || off(a) - off(b));
}

// What to score: the artist's own entries (role Main, not appearances), the folder's year
// and those nearest it first, at most `max`.
export function deepCandidates(entries: ArtistRelease[], year: number | undefined, max: number): ArtistRelease[] {
  const distance = (e: ArtistRelease) => (year && e.year ? Math.abs(Number(e.year) - year) : 1000);
  return entries
    .filter((e) => e.role === 'Main')
    .map((e, i) => ({ e, i }))
    .sort((a, b) => distance(a.e) - distance(b.e) || a.i - b.i)
    .slice(0, max)
    .map(({ e }) => e);
}

export interface DeepSearchOptions {
  artistId: number;
  artistName: string;
  localNames: string[]; // every disc folder's, for a set
  year?: number;
  token: string;
  max?: number;
  progress?: (done: number, total: number) => void;
  stopped?: () => boolean; // Esc: rank what's scored so far
}

export async function deepSearch(opts: DeepSearchOptions): Promise<DiscogsSearchResult[]> {
  const { token, localNames } = opts;
  const localCount = localNames.length;
  const candidates = deepCandidates(
    await fetchArtistReleases(opts.artistId, token),
    opts.year,
    opts.max ?? DEEP_SEARCH_MAX,
  );
  const fits = (tracks: Array<{ position: string; title: string }>) => numberTracklist(tracks).length === localCount;
  const results: DiscogsSearchResult[] = [];
  for (const [i, e] of candidates.entries()) {
    if (opts.stopped?.()) break;
    opts.progress?.(i, candidates.length);
    try {
      const master = e.type === 'master' ? await fetchMaster(e.id, token) : undefined;
      const releaseId = master ? (master.mainRelease ?? e.mainRelease) : e.id;
      if (!releaseId) continue;
      const raw = master?.tracklist ?? (await fetchRawTracklist(releaseId, token));
      const titles = numberTracklist(fitTracklist(raw, fits)).map((t) => t.title);
      if (titles.length === 0) continue;
      results.push({
        id: releaseId,
        title: `${e.artist ?? opts.artistName} - ${e.title}`,
        ...(e.year ? { year: e.year } : {}),
        ...(master ? { masterId: e.id, masterUrl: `https://www.discogs.com/master/${e.id}` } : {}),
        releaseUrl: `https://www.discogs.com/release/${releaseId}`,
        ...(e.format ? { format: e.format.split(/,\s*/) } : {}),
        trackCount: titles.length,
        matchScore: tracksFound(localNames, titles),
      });
    } catch {
      // One entry failing (a 404, a deleted release) doesn't end the search.
    }
  }
  opts.progress?.(candidates.length, candidates.length);
  return rankDeep(
    results.filter((r) => (r.matchScore ?? 0) > 0),
    localCount,
  );
}
