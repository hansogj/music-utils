export type Severity = 'SEVERE' | 'HIGH' | 'MODERATE';

export interface Issue {
  severity: Severity;
  code: string;
  file?: string;
  message: string;
  suggestion?: string;
}

export interface TrackTags {
  title?: string;
  trackNo?: string;
  trackNoTotal?: string;
  artist?: string;
  albumArtist?: string;
  album?: string;
  year?: string;
  discNumber?: string;
  noOfDiscs?: string;
  genre?: string;
  comment?: string;
}

export interface TrackInfo {
  filePath: string;
  fileName: string;
  ext: 'mp3' | 'flac';
  tags: TrackTags;
  parsedName: string | undefined;
  tagReadError?: string;
}

export interface AlbumLayout {
  letterDir?: string;
  artistName: string;
  albumFolder: string;
  albumPath: string;
}

export interface DiscogsSearchResult {
  id: number;
  title: string;
  year?: string;
  masterId?: number;
  releaseUrl: string;
  masterUrl?: string;
  genre?: string[];
  style?: string[];
}

export interface AlbumAudit {
  layout: AlbumLayout;
  tracks: TrackInfo[];
  issues: Issue[];
  discogsResults?: DiscogsSearchResult[];
}

export interface AuditReport {
  root: string;
  date: string;
  audits: AlbumAudit[];
  summary: {
    albumsScanned: number;
    tracksScanned: number;
    albumsWithIssues: number;
    issuesBySeverity: Record<Severity, number>;
  };
}
