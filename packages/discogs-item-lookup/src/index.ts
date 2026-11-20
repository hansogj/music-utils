import 'dotenv/config';
import { fetchRelease, fetchMaster } from './core/api-client';
import { parseDiscogsId } from './core/sanitizer';
import { getToken } from './core/config';
import { DiscogsApiError } from './errors';
import { cleanArtistName, fitTracklist, flattenTracklist, joinArtistCredit } from './format';
import type { DiscogsCredit } from './format';
import type { DiscogsTrack, LookupResult, LookupTrack } from './types';

// By re-exporting, we make these part of the package's public API.
export type { LookupResult, LookupTrack } from './types';
export { DiscogsApiError } from './errors';
export * from './format';

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
  /**
   * The number of files the tracks go on (for `disc`, that disc's): when a suite's parts
   * could be one track or several, the reading that gives this many tracks is used
   * (see SuiteReading). Without it, Discogs' own reading.
   */
  trackCount?: number;
}

export async function lookupRelease(options: LookupReleaseOptions): Promise<LookupResult> {
  const { releaseId, token: discogsToken, disc: discFilter, trackCount } = options;
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
  const cleanCredits = (credits: DiscogsCredit[] | undefined): DiscogsCredit[] =>
    (credits ?? []).map(({ name, role }) => ({ name: cleanArtistName(name), role }));
  const toLookupTrack = (t: DiscogsTrack): LookupTrack => ({
    position: t.position,
    title: t.title,
    ...(t.duration ? { duration: t.duration } : {}),
    ...(t.extraartists?.length ? { extraartists: cleanCredits(t.extraartists) } : {}),
    ...(t.suite ? { suite: t.suite, part: t.part } : {}),
  });
  const onDisc = (all: ReturnType<typeof discsOf>) =>
    typeof discFilter === 'number' ? all.filter((d) => d.disc === discFilter) : all;
  // Headings are dropped; a suite is one track or several, as Discogs numbers its parts,
  // or as fits `trackCount`.
  const raw = release.tracklist || [];
  const flat =
    trackCount === undefined
      ? flattenTracklist(raw)
      : fitTracklist(
          raw,
          (tracks) => onDisc(discsOf(tracks.map(toLookupTrack))).flatMap((d) => d.tracks).length === trackCount,
        );
  const tracklist: LookupTrack[] = flat.map(toLookupTrack);
  let discs = discsOf(tracklist);
  const totalDiscs = discs.length;

  // If a disc filter was provided, return only that disc (if present).
  discs = onDisc(discs);

  const artists = (release.artists ?? []).map((a) => cleanArtistName(a.name));

  // Format the final data structure
  return {
    artist: artists.length ? artists.join(', ') : 'Unknown Artist',
    artists,
    ...(release.artists && release.artists.length > 1 ? { artistCredit: joinArtistCredit(release.artists) } : {}),
    // Album title and year come from the master (the original album) when there is one.
    title: master?.title ?? release.title,
    releaseTitle: release.title,
    totalDiscs,
    discs,
    tracklist,
    genres: release.genres ?? [],
    styles: release.styles ?? [],
    ...(release.country ? { country: release.country } : {}),
    extraartists: cleanCredits(release.extraartists),
    masterYear: masterYear,
    releaseYear: release.year,
    releaseId: sanitizedId,
    ...(master ? { masterId: master.id } : {}),
    discogsUrl: `https://www.discogs.com/release/${sanitizedId}`,
  };
}

// A disc prefix before the track number: "1-1", "2-03", "1.01", "1/2", "2:05". A lettered
// part ("2.a") or a plain number ("3") has none.
const DISC_PREFIX = /^(\d+)[-./:]\d/;

/** The tracks per disc, sorted by disc number; one disc when no position has a disc prefix. */
function discsOf(tracklist: LookupTrack[]): { disc: number; tracks: LookupTrack[] }[] {
  const tracks = tracklist.map((t, idx) => ({ ...t, position: t.position || String(idx + 1) }));
  if (!tracks.some((t) => DISC_PREFIX.test(t.position))) return tracks.length ? [{ disc: 1, tracks }] : [];
  const discsMap = new Map<number, LookupTrack[]>();
  tracks.forEach((t) => {
    const discNum = parseInt(t.position.match(DISC_PREFIX)?.[1] ?? '1', 10);
    if (!discsMap.has(discNum)) discsMap.set(discNum, []);
    discsMap.get(discNum)!.push(t);
  });
  return Array.from(discsMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([disc, discTracks]) => ({ disc, tracks: discTracks }));
}
