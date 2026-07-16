import type { Config } from './schema';

/**
 * Thrown when a loaded config fails validation.
 * `.path` is a dotted key path (e.g. `"flac.compressionLevel"`) for the offending value.
 */
export class ConfigError extends Error {
  constructor(
    public readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = 'ConfigError';
  }
}

const isString = (v: unknown): v is string => typeof v === 'string';
const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

const requireString = (v: unknown, path: string): void => {
  if (!isString(v)) throw new ConfigError(path, `expected string, got ${typeof v}`);
};

const requireIntInRange = (v: unknown, path: string, min: number, max: number): void => {
  if (!isInt(v)) throw new ConfigError(path, `expected integer, got ${typeof v}`);
  if (v < min || v > max) throw new ConfigError(path, `expected ${min}–${max}, got ${v}`);
};

/** Assert the loaded config is well-formed. Throws `ConfigError` on the first violation. */
export const validateConfig = (cfg: Config): void => {
  if (cfg.libraryRoot !== undefined && !isString(cfg.libraryRoot)) {
    throw new ConfigError('libraryRoot', `expected string or undefined, got ${typeof cfg.libraryRoot}`);
  }

  requireString(cfg.tracksFile, 'tracksFile');

  const patternKeys: (keyof Config['patterns'])[] = [
    'artistFolder',
    'albumFolder',
    'track',
    'trackMultiDisc',
    'artistPrefix',
    'discSuffix',
    'auxSuffix',
  ];
  patternKeys.forEach((k) => requireString(cfg.patterns?.[k], `patterns.${k}`));

  if (!isBoolean(cfg.artist?.sortArticles))
    throw new ConfigError('artist.sortArticles', `expected boolean, got ${typeof cfg.artist?.sortArticles}`);
  if (!isStringArray(cfg.artist?.articles)) throw new ConfigError('artist.articles', `expected array of strings`);

  requireString(cfg.cover?.filename, 'cover.filename');

  requireString(cfg.disc?.separator, 'disc.separator');
  if (cfg.disc.separator.length === 0) throw new ConfigError('disc.separator', 'must be non-empty');
  if (cfg.disc.separator.includes('/'))
    throw new ConfigError('disc.separator', 'cannot contain "/" (filesystem restriction)');

  requireIntInRange(cfg.flac?.compressionLevel, 'flac.compressionLevel', 0, 8);
};
