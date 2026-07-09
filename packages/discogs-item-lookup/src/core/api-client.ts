import { DiscogsApiError } from '../errors';
import type { DiscogsReleaseResponse, DiscogsMasterResponse } from '../types';

const API_BASE_URL = 'https://api.discogs.com';

async function fetchDiscogsAPI<T>(url: string, token: string): Promise<T> {
  const headers = {
    Authorization: `Discogs token=${token}`,
    'User-Agent': 'DiscogsLookupScript/1.0',
  };

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const errorText = await response.text();
    // Try to parse error message from Discogs, otherwise use the full text
    let errorMessage = errorText;
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.message) {
        errorMessage = errorJson.message;
      }
    } catch (e) {
      // Ignore parsing error, use the raw text
    }
    throw new DiscogsApiError(
      `API request failed to ${url}. Status: ${response.status} - ${errorMessage}`,
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Fetches release data from the Discogs API.
 * @param releaseId The numeric ID of the release.
 * @param token The Discogs personal access token.
 * @returns A promise that resolves with the release data.
 */
export function fetchRelease(
  releaseId: string,
  token: string,
): Promise<DiscogsReleaseResponse> {
  return fetchDiscogsAPI<DiscogsReleaseResponse>(
    `${API_BASE_URL}/releases/${releaseId}`,
    token,
  );
}

/**
 * Fetches master release data from the Discogs API.
 * @param masterId The numeric ID of the master release.
 * @param token The Discogs personal access token.
 * @returns A promise that resolves with the master release data.
 */
export function fetchMaster(
  masterId: number,
  token: string,
): Promise<DiscogsMasterResponse> {
  return fetchDiscogsAPI<DiscogsMasterResponse>(
    `${API_BASE_URL}/masters/${masterId}`,
    token,
  );
}
