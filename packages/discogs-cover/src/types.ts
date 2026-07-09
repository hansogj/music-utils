export interface DiscogsSearchResult {
  id: number;
  title: string;
  cover_image: string;
  resource_url: string;
}

export interface DiscogsSearchResponse {
  results: DiscogsSearchResult[];
}

export interface DiscogsImage {
  uri: string;
  type: 'primary' | 'secondary';
}

export interface DiscogsMasterReleaseResponse {
  images: DiscogsImage[];
}

export interface DiscogsReleaseResponse {
  master_id?: number;
  master_url?: string | null;
  images: DiscogsImage[];
}

export interface DiscogsCoverOptions {
  artist?: string;
  title?: string;
  releaseId?: string;
  strategy?: 'first' | 'prompt';
  token?: string;
}
