import { describe, it, expect } from 'vitest';
import { fetchRelease, fetchMaster } from '../../src/core/api-client';
import { DiscogsApiError } from '../../src/errors';
import { mockRelease, mockMaster } from '../mocks/data';

describe('api-client', () => {
  const token = 'fake-token';

  describe('fetchRelease', () => {
    it('should fetch and return release data on success', async () => {
      const releaseData = await fetchRelease('249504', token);
      expect(releaseData).toEqual(mockRelease);
    });

    it('should throw DiscogsApiError on a 404 response', async () => {
      await expect(fetchRelease('999999', token)).rejects.toThrow(
        DiscogsApiError,
      );
      await expect(fetchRelease('999999', token)).rejects.toThrow(
        'API request failed to https://api.discogs.com/releases/999999. Status: 404 - Release not found.',
      );
    });
  });

  describe('fetchMaster', () => {
    it('should fetch and return master data on success', async () => {
      const masterData = await fetchMaster(3369, token);
      expect(masterData).toEqual(mockMaster);
    });

    it('should throw DiscogsApiError on a 404 response', async () => {
      await expect(fetchMaster(9999, token)).rejects.toThrow(DiscogsApiError);
      await expect(fetchMaster(9999, token)).rejects.toThrow(
        'API request failed to https://api.discogs.com/masters/9999. Status: 404 - Master not found.',
      );
    });
  });
});
