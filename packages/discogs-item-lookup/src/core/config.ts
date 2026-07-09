import { DiscogsApiError } from '../errors';

/**
 * Resolves the Discogs token from either a direct argument or an environment variable.
 * @param discogsToken An optional token passed directly to the function.
 * @returns The resolved Discogs token.
 * @throws {DiscogsApiError} if no token can be found.
 */
export function getToken(discogsToken?: string): string {
  const token = discogsToken || process.env.DISCOGS_TOKEN;

  if (!token) {
    throw new DiscogsApiError(
      'Discogs token is not configured. Please provide it as an argument or set the DISCOGS_TOKEN environment variable.',
    );
  }

  return token;
}
