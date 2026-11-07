import 'dotenv/config';
import maybe from '@hansogj/maybe';
import { fetchRelease, fetchMaster } from './core/api-client';
import { parseDiscogsId } from './core/sanitizer';
import { getToken } from './core/config';
import { DiscogsApiError } from './errors';
import type { LookupResult } from './types';

// By re-exporting, we make these part of the package's public API.
export type { LookupResult } from './types';
export { DiscogsApiError } from './errors';

/**
 * Fetches and formats comprehensive release data from the Discogs API.
 * @param releaseId The ID of the Discogs release. Can be in formats like '249504', 'r249504', or '[r249504]',
 *   or a master ID ('m1439', '[m1439]') which resolves to the master's main release.
 * @param discogsToken Your Discogs personal access token. If not provided, it will try to use the DISCOGS_TOKEN environment variable.
 * @returns A promise that resolves with the formatted release data.
 */
export interface LookupReleaseOptions {
  releaseId: string;
  token?: string;
  disc?: number;
}

export async function lookupRelease(options: LookupReleaseOptions): Promise<LookupResult> {
  const { releaseId, token: discogsToken, disc: discFilter } = options;
  const parsed = parseDiscogsId(releaseId);
  if (!parsed) {
    throw new DiscogsApiError(
      `Invalid Release ID format: "${releaseId}". Please provide a release ID (e.g. r249504) or master ID (e.g. m1439).`,
    );
  }

  // Resolve provided arguments: support both lookupRelease(id, token) and lookupRelease(id, disc, token)
  const token = getToken(discogsToken);

  // A master ID resolves to the master's main release for the tracklist.
  const masterFromInput = parsed.type === 'master' ? await fetchMaster(Number(parsed.id), token) : undefined;
  const sanitizedId = masterFromInput ? String(masterFromInput.main_release) : parsed.id;
  const release = await fetchRelease(sanitizedId, token);

  // Discogs reports year 0 when unknown, so fall back to the release year.
  const master = masterFromInput ?? (release.master_id ? await fetchMaster(release.master_id, token) : undefined);
  const masterYear = master?.year || release.year;
  // Heuristic: determine the disc number for each track from its position string.
  // Common patterns:
  // - "1-1" or "2-03" => prefix before '-' indicates disc number
  // - "1.01" => prefix before '.' indicates disc number
  // - "1" => track number on disc 1
  // Otherwise assume disc 1.
  const tracklist = release.tracklist || [];

  function parseDiscFromPosition(pos: string | undefined): number {
    if (!pos) return 1;
    // digits before -, ., / or :
    const m = pos.match(/^(\d+)(?:[-.\/:])/);
    if (m) return parseInt(m[1], 10);
    // simple numeric position like "1" or "2"
    const m2 = pos.match(/^(\d+)$/);
    if (m2) return parseInt(m2[1], 10);
    // patterns like "1/2"
    const m3 = pos.match(/^(\d+)\/\d+/);
    if (m3) return parseInt(m3[1], 10);
    return 1;
  }

  const discsMap = new Map<number, { position: string; title: string }[]>();

  tracklist
    .filter(({ type_ }) => type_ === 'track')
    .forEach((t, idx) => {
      const pos = t.position || String(idx + 1);
      const discNum = parseDiscFromPosition(pos);
      if (!discsMap.has(discNum)) discsMap.set(discNum, []);
      discsMap.get(discNum)!.push({ position: pos, title: t.title });
    });

  // Build discs array sorted by disc number
  let discs = Array.from(discsMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([disc, tracks]) => ({ disc, tracks }));

  // If every disc only has one track and the number of discs equals the number of tracks,
  // treat as a single disc (common for single-disc releases with positions "1", "2", ...)
  const totalTracks = tracklist.filter(({ type_ }) => type_ === 'track').length;
  if (discs.length === totalTracks && discs.every((d) => d.tracks.length === 1)) {
    discs = [{ disc: 1, tracks: discs.map((d) => d.tracks[0]) }];
  }

  const totalDiscs = discs.length;

  // If a disc filter was provided, return only that disc (if present).
  if (typeof discFilter === 'number') {
    discs = discs.filter((d) => d.disc === discFilter);
  }

  // Format the final data structure
  return {
    artist: maybe(release.artists)
      .map((artists) => artists.map((a) => a.name.replace(/\s*\(\d+\)\s*$/, '').trim()).join(', '))
      .valueOr('Unknown Artist'),
    title: release.title,
    totalDiscs,
    discs,
    masterYear: masterYear,
    releaseYear: release.year,
    releaseId: sanitizedId,
    ...(master ? { masterId: master.id } : {}),
    discogsUrl: `https://www.discogs.com/release/${sanitizedId}`,
  };
}
