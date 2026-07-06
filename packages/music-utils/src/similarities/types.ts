export interface Similarity {
  combination: string;
  other: string;
  similarity: number;
}

export interface ArtistSimilarity {
  artist: string;
  similarities: Similarity[];
}
