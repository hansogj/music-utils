export type FILETYPE = 'mp3' | 'flac' | 'jpg' | 'text' | 'unknown';
export const MusicFileTypes: FILETYPE[] = ['flac', 'mp3'];

interface Disc {
  discNumber: string;
  noOfDiscs: string;
  year: string;
  aux?: string;
}

export interface Release extends Partial<Disc> {
  artist: string;
  album: string;
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
