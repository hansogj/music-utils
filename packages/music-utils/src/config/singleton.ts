import { loadConfig } from './load';
import type { Config } from './schema';

let cached: Config | undefined;

/**
 * Returns the resolved configuration, loading it on first access.
 * Subsequent calls return the cached value.
 */
export const getConfig = (): Config => (cached ??= loadConfig());

/** Test helper: force a re-load on next `getConfig()` call. */
export const resetConfigCache = (): void => {
  cached = undefined;
};
