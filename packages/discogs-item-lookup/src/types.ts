export interface DiscogsArtist {
  name: string;
  id: number;
}

export interface DiscogsTrack {
  position: string;
  title: string;
  duration: string;
  type_: 'track' | 'heading';
}

export interface DiscogsReleaseResponse {
  id: number;
  title: string;
  artists: DiscogsArtist[];
  tracklist: DiscogsTrack[];
  master_id: number;
  year: number;
}

export interface DiscogsMasterResponse {
  id: number;
  year: number;
  main_release: number;
  title: string;
  artists: DiscogsArtist[];
}

export interface LookupResult {
  artist: string;
  title: string;
  totalDiscs: number;
  discs: {
    disc: number;
    tracks: { position: string; title: string }[];
  }[];
  /** Original release year from the master, falling back to the release year. */
  masterYear: number;
  releaseYear: number;
  releaseId: string;
  masterId?: number;
  discogsUrl: string;
}
