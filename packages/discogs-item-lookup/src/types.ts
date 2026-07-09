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
  title: string;
  artists: DiscogsArtist[];
}

export interface LookupResult {
  artist: string;
  title: string;
  discs: {
    disc: number;
    tracks: { position: string; title: string }[];
  }[];
  masterYear: number;
  releaseYear: number;
  discogsUrl: string;
}
