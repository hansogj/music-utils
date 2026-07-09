import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchDiscogs, downloadImage } from './discogs-client';

const mockSuccessResponse = (data: any) => ({
  ok: true,
  json: async () => data,
  arrayBuffer: async () => new ArrayBuffer(8),
});

const mockErrorResponse = (status: number, statusText: string) => ({
  ok: false,
  status,
  statusText,
});

// Mock global fetch
const fetch = vi.fn();
vi.stubGlobal('fetch', fetch);

describe('discogs-client', () => {
  beforeEach(() => {
    fetch.mockClear();
  });

  describe('fetchDiscogs', () => {
    it('should call fetch with the correct headers and return JSON data', async () => {
      const mockData = { results: ['test'] };
      fetch.mockResolvedValue(mockSuccessResponse(mockData));

      const url = 'https://api.discogs.com/some/path';
      const token = 'test-token';
      const data = await fetchDiscogs(url, token);

      expect(fetch).toHaveBeenCalledWith(url, {
        headers: {
          'User-Agent': 'DiscogsCover/1.2.0',
          Authorization: `Discogs token=${token}`,
        },
      });
      expect(data).toEqual(mockData);
    });

    it('should throw an error if the response is not ok', async () => {
      fetch.mockResolvedValue(mockErrorResponse(404, 'Not Found'));

      const url = 'https://api.discogs.com/some/path';
      const token = 'test-token';

      await expect(fetchDiscogs(url, token)).rejects.toThrow('Discogs API error: 404 Not Found');
    });
  });

  describe('downloadImage', () => {
    it('should download an image and return it as a Buffer', async () => {
      const mockArrayBuffer = new Uint8Array([1, 2, 3]).buffer;
      fetch.mockResolvedValue({
        ok: true,
        arrayBuffer: async () => mockArrayBuffer,
      });

      const url = 'https://img.discogs.com/image.jpg';
      const buffer = await downloadImage(url);

      expect(fetch).toHaveBeenCalledWith(url, {
        headers: { 'User-Agent': 'DiscogsCover/1.2.0' },
      });
      expect(buffer).toBeInstanceOf(Buffer);
      expect(Buffer.from(mockArrayBuffer)).toEqual(buffer);
    });

    it('should throw an error if the image download fails', async () => {
      fetch.mockResolvedValue(mockErrorResponse(500, 'Server Error'));

      const url = 'https://img.discogs.com/image.jpg';

      await expect(downloadImage(url)).rejects.toThrow(
        'Failed to download image: 500 Server Error',
      );
    });
  });
});
