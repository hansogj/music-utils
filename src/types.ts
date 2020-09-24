export type FILETYPE = 'mp3' | 'flac' | 'jpg' | 'unknown';

interface OmittableTags {
  disknumber: string;
  noOfDiscs: string;
  year: string;
  trackName: string;
}

export interface Release extends Partial<OmittableTags> {
  artist: string;
  album: string;
}

export interface Track extends Partial<Release> {
  trackName: string;
  trackNo: number;
}

export interface Tag extends Partial<Track> {
  fileType: FILETYPE;
}
