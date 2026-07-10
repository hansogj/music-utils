import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

import { DEFAULT_CONFIG } from './defaults';
import type { Config, PartialConfig } from './schema';

const CONFIG_FILE_NAME = 'music-utils.config.json';
const HOME_CONFIG_FILE_NAME = '.music-utilsrc.json';

const expandHome = (p: string): string => (p.startsWith('~') ? p.replace(/^~/, homedir()) : p);

const readIfExists = (path: string): PartialConfig | null => {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw) as PartialConfig;
};

const merge = (base: Config, override: PartialConfig | null): Config => {
  if (!override) return base;
  return {
    ...((override.libraryRoot ?? base.libraryRoot) ? { libraryRoot: override.libraryRoot ?? base.libraryRoot } : {}),
    patterns: { ...base.patterns, ...(override.patterns ?? {}) },
    artist: {
      sortArticles: override.artist?.sortArticles ?? base.artist.sortArticles,
      articles: override.artist?.articles ?? base.artist.articles,
    },
  };
};

/**
 * Resolve config in precedence order (first match wins per key):
 * 1. `./music-utils.config.json`  (cwd — project-local)
 * 2. `~/.music-utilsrc.json`      (home — user global)
 * 3. Built-in defaults.
 *
 * A missing file at either location is silently skipped.
 * The returned config has `libraryRoot` fully expanded (~/ resolved).
 */
export const loadConfig = (cwd: string = process.cwd()): Config => {
  const home = readIfExists(resolve(homedir(), HOME_CONFIG_FILE_NAME));
  const project = readIfExists(resolve(cwd, CONFIG_FILE_NAME));
  const merged = merge(merge(DEFAULT_CONFIG, home), project);
  return merged.libraryRoot ? { ...merged, libraryRoot: expandHome(merged.libraryRoot) } : merged;
};
