export interface Config {
  /** Base directory for `music-utils-rip` — where new albums land. Tilde is expanded. When unset, callers should fall back to `process.cwd()`. */
  libraryRoot?: string;
  /** Default path for `music-utils-tracks-tag` when `-f` is not supplied. Relative paths are resolved against `process.cwd()`. */
  tracksFile: string;
  patterns: {
    /** Directory name for the artist (default: "{artist}"). */
    artistFolder: string;
    /** Directory name for the album (default: "{year} {album}{discSuffix}{auxSuffix}"). */
    albumFolder: string;
    /** Track filename when the release is single-disc (default: "{trackNo}{artistPrefix}{title}"). */
    track: string;
    /** Track filename when the release spans multiple discs (default: "d{disc}t{trackNo}.{artistPrefix}{title}"). */
    trackMultiDisc: string;
    /** Rendered before {title} when release.artist is present (default: " {artist} - "; falls back to " "). */
    artistPrefix: string;
    /** Appended to albumFolder when noOfDiscs > 1 (default: " (Disc {disc}∕{total})"). */
    discSuffix: string;
    /** Appended to albumFolder when aux info is present (default: " [{aux}]"). */
    auxSuffix: string;
  };
  artist: {
    /** Move definite articles to the end during folder naming ("The Beatles" → "Beatles, The"). */
    sortArticles: boolean;
    /** Which words to treat as definite articles for the sort. */
    articles: string[];
  };
  cover: {
    /** Filename `music-utils-rip` / `music-utils-cover-photo` write for album art (default: "cover.jpg"). */
    filename: string;
  };
  disc: {
    /**
     * Character between disc-number and total in folder names (default: `∕` U+2215).
     * Cannot be `/` (filesystem restriction). Applied to both `patterns.discSuffix`
     * (via `{discSep}` token) and `replaceDangers` when sanitizing user-supplied strings.
     */
    separator: string;
  };
  flac: {
    /** Passed to the `flac` CLI as `-<level>`. Range 0–8; higher = smaller file, slower encode. Default: 5. */
    compressionLevel: number;
  };
}

export type PartialConfig = {
  libraryRoot?: string;
  tracksFile?: string;
  patterns?: Partial<Config['patterns']>;
  artist?: Partial<Config['artist']>;
  cover?: Partial<Config['cover']>;
  disc?: Partial<Config['disc']>;
  flac?: Partial<Config['flac']>;
};
