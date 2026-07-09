import { describe, it, expect, afterEach } from 'vitest';
import { getToken } from '../../src/core/config';
import { DiscogsApiError } from '../../src/errors';

describe('getToken', () => {
  const originalToken = process.env.DISCOGS_TOKEN;

  // Reset process.env after each test
  afterEach(() => {
    process.env.DISCOGS_TOKEN = originalToken;
  });

  it('should return the token passed as an argument', () => {
    process.env.DISCOGS_TOKEN = 'env-token';
    const argToken = 'arg-token';
    expect(getToken(argToken)).toBe(argToken);
  });

  it('should return the token from environment variable if no argument is provided', () => {
    const envToken = 'env-token-123';
    process.env.DISCOGS_TOKEN = envToken;
    expect(getToken()).toBe(envToken);
  });

  it('should throw DiscogsApiError if no token is available', () => {
    delete process.env.DISCOGS_TOKEN;
    expect(() => getToken()).toThrow(DiscogsApiError);
    expect(() => getToken()).toThrow('Discogs token is not configured.');
  });
});
