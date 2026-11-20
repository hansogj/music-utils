import type { DiscogsCredit } from './format';

export interface DiscogsArtist {
  name: string;
  id: number;
  join?: string;
  /** Artist name variation used on this release. */
  anv?: string;
  role?: string;
  tracks?: string;
  resource_url?: string;
}

export interface DiscogsTrack {
  position: string;
  title: string;
  duration?: string;
  type_: 'track' | 'heading' | 'index';
  extraartists?: DiscogsCredit[];
  sub_tracks?: DiscogsTrack[];
  /** Set by flattenTracklist() on a suite's part that is a track of its own. */
  suite?: string;
  part?: string;
}

export interface DiscogsReleaseResponse {
  id: number;
  title: string;
  artists: DiscogsArtist[];
  tracklist: DiscogsTrack[];
  master_id: number;
  year: number;
  genres?: string[];
  styles?: string[];
  country?: string;
  extraartists?: DiscogsCredit[];
}

export interface DiscogsMasterResponse {
  id: number;
  year: number;
  main_release: number;
  title: string;
  artists: DiscogsArtist[];
}

export interface LookupTrack {
  position: string;
  title: string;
  duration?: string;
  /** Track credits (composers, writers, soloists), names without Discogs' "(n)". */
  extraartists?: DiscogsCredit[];
  /** A suite's part that is a track of its own: the suite's title ("War"); `title` is "War; a) Ouverture". */
  suite?: string;
  /** With `suite`: the part's own title ("a) Ouverture"). */
  part?: string;
}

export interface LookupResult {
  /** @deprecated Every credited artist joined with ", ". Use `artists[0]` or `artistCredit`. */
  artist: string;
  /** The credited artists, Discogs' "(n)" suffix dropped. */
  artists: string[];
  /** Every credited artist joined as Discogs shows them ("/" as ", "); only when several. */
  artistCredit?: string;
  /** Album title from the master, falling back to the release title. */
  title: string;
  releaseTitle: string;
  totalDiscs: number;
  discs: {
    disc: number;
    tracks: LookupTrack[];
  }[];
  /** The whole release's tracks (index entries as one track, headings dropped), whatever `disc` asked for. */
  tracklist: LookupTrack[];
  genres: string[];
  styles: string[];
  country?: string;
  /** Release personnel, names without Discogs' "(n)". */
  extraartists: DiscogsCredit[];
  /** Original release year from the master, falling back to the release year. */
  masterYear: number;
  releaseYear: number;
  releaseId: string;
  masterId?: number;
  discogsUrl: string;
}
