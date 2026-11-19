export type FILETYPE = 'mp3' | 'flac' | 'jpg' | 'text' | 'unknown';
export const MusicFileTypes: FILETYPE[] = ['flac', 'mp3'];

interface Disc {
  discNumber: string;
  noOfDiscs: string;
  year: string;
  aux?: string;
}

/** What a Discogs lookup adds to the tags (rip), as music-audit writes them. */
export interface DiscogsTags {
  releaseId: string;
  masterId?: number;
  /** Genres then styles, at most 4, joined with ", ". */
  genre?: string;
  /** The release page: written to COMMENT. */
  url: string;
}

export interface Release extends Partial<Disc> {
  artist: string;
  album: string;
  discogs?: DiscogsTags;
}

export interface Track extends Partial<Release> {
  trackName: string;
  trackNo: string;
  trackNoTotal: string;
}

export interface File {
  fileType: FILETYPE;
  track: Partial<Track>;
  path: string;
}

export interface MetaFlac {
  TITLE: string;
  TRACKNUMBER: string;
  ALBUM: string;
  ARTIST: string;
}
