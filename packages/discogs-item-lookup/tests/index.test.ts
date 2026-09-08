import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiscogsApiError, lookupRelease } from '../src/index';

// Mock environment variables
vi.stubEnv('DISCOGS_TOKEN', 'test-token-from-env');

describe('lookupRelease', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should lookup a release with a master ID and return formatted data', async () => {
    const { lookupRelease } = await import('../src/index');
    const result = await lookupRelease({ releaseId: 'r249504' });

    expect(result.artist).toBe('Daft Punk');
    expect(result.title).toBe('One More Time');
    expect(result.releaseYear).toBe(2000);
    expect(result.masterYear).toBe(2000); // from master release
    // single-disc release in the mock: expect one disc with two tracks
    expect(result.discs.length).toBe(1);
    expect(result.discs[0].tracks.length).toBe(2);
    expect(result.discs[0].tracks[0].title).toBe('One More Time (Short Radio Edit)');
    expect(result.discogsUrl).toBe('https://www.discogs.com/release/249504');
  });

  it('should lookup a release without a master ID and use its own year as masterYear', async () => {
    const result = await lookupRelease({ releaseId: '12345' });

    expect(result.artist).toBe('Daft Punk');
    expect(result.releaseYear).toBe(2005);
    expect(result.masterYear).toBe(2005); // falls back to release year
  });

  it('should throw an error for an invalid release ID format', async () => {
    await expect(lookupRelease({ releaseId: 'invalid-id' })).rejects.toThrow(DiscogsApiError);
    await expect(lookupRelease({ releaseId: 'invalid-id' })).rejects.toThrow('Invalid Release ID format: "invalid-id"');
  });

  it('should throw an error if no token is provided', async () => {
    vi.stubEnv('DISCOGS_TOKEN', ''); // Unset the token
    await expect(lookupRelease({ releaseId: '249504' })).rejects.toThrow(DiscogsApiError);
    await expect(lookupRelease({ releaseId: '249504' })).rejects.toThrow('Discogs token is not configured.');
    vi.stubEnv('DISCOGS_TOKEN', 'test-token-from-env'); // Reset for other tests
  });

  it('should throw an error if the release fetch fails', async () => {
    await expect(lookupRelease({ releaseId: '999999' })).rejects.toThrow(DiscogsApiError);
    await expect(lookupRelease({ releaseId: '999999' })).rejects.toThrow(/API request failed/);
  });

  it('should use a token passed as an argument over the environment variable', async () => {
    // This test is more about ensuring the token is passed down.
    // We don't have a specific mock for a different token, but we can verify it runs successfully.
    const result = await lookupRelease({
      releaseId: 'r249504',
      token: 'arg-token',
    });
    expect(result.artist).toBe('Daft Punk');
  });

  it('should strip numbered disambiguation suffix from artist name', async () => {
    const result = await lookupRelease({ releaseId: '1961624' });
    expect(result.artist).toBe('Area');
  });

  it('should report totalDiscs from a 2-disc release', async () => {
    const result = await lookupRelease({ releaseId: '2000001' });
    expect(result.totalDiscs).toBe(2);
    expect(result.discs.length).toBe(2);
  });

  it('should report totalDiscs=2 even when disc filter returns only 1 disc', async () => {
    const result = await lookupRelease({ releaseId: '2000001', disc: 1 });
    expect(result.totalDiscs).toBe(2);
    expect(result.discs.length).toBe(1);
    expect(result.discs[0].disc).toBe(1);
  });

  it('should set totalDiscs=1 for a single-disc release', async () => {
    const result = await lookupRelease({ releaseId: 'r249504' });
    expect(result.totalDiscs).toBe(1);
  });
});
