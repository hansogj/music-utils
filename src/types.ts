export type FILETYPE = 'mp3' | 'flac' | 'jpg' | 'unknown';
export const MuiscFileTypes: FILETYPE[] = ['flac', 'mp3'];
interface OmittableTags {
  discnumber: string;
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
  trackNo: string;
}

export interface Tag extends Partial<Track> {
  fileType: FILETYPE;
}
