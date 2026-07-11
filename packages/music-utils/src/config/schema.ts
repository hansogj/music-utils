export interface Config {
  /** Base directory for `music-utils-rip` — where new albums land. Tilde is expanded. When unset, callers should fall back to `process.cwd()`. */
  libraryRoot?: string;
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
}

export type PartialConfig = {
  libraryRoot?: string;
  patterns?: Partial<Config['patterns']>;
  artist?: Partial<Config['artist']>;
};
