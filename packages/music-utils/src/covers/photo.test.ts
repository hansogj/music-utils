import * as fs from 'node:fs';

import * as discogsCover from '@hansogj/discogs-cover';

import { COVER_FILE_NAME } from '../constants';
import * as prompt from '../utils/prompt';
import { coverFromDiscogs } from './photo';

jest.mock('node:fs');
jest.mock('@hansogj/discogs-cover');
jest.mock('../utils/color.log', () => ({
  error: jest.fn(),
  info: jest.fn(),
  success: jest.fn(),
  warning: jest.fn(),
  json: jest.fn(),
  debugInfo: jest.fn(),
  exit: jest.fn(),
}));
jest.mock('../utils/prompt');
jest.mock('../album/parse.path', () => ({
  parseAlbumInfo: jest.fn().mockReturnValue({
    artist: 'Led Zeppelin',
    album: 'The Song Remains The Same',
    year: '1976',
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockLog = require('../utils/color.log') as Record<string, jest.Mock>;
const mockFs = fs as jest.Mocked<typeof fs>;
const mockDiscogs = discogsCover as jest.Mocked<typeof discogsCover>;
const mockPrompt = prompt as jest.Mocked<typeof prompt>;

describe('coverFromDiscogs', () => {
  const token = 'test-token';
  const imageBuffer = Buffer.from('fake-image-data');

  afterEach(jest.clearAllMocks);

  describe('with releaseId', () => {
    it('fetches cover by releaseId and writes to file', async () => {
      mockDiscogs.discogsMainCover.mockResolvedValue(imageBuffer);

      await coverFromDiscogs({ releaseId: '12345', quiet: true, token });

      expect(mockDiscogs.discogsMainCover).toHaveBeenCalledWith({
        releaseId: '12345',
        strategy: 'prompt',
        token,
      });
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(COVER_FILE_NAME, imageBuffer);
      expect(mockLog.info).toHaveBeenCalledWith('Cover saved!');
    });
  });

  describe('with dirName (artist/title lookup)', () => {
    it('prompts for album info and fetches cover', async () => {
      mockPrompt.albumPrompt.mockResolvedValue({ artist: 'Led Zeppelin', album: 'The Song Remains The Same' });
      mockDiscogs.discogsMainCover.mockResolvedValue(imageBuffer);

      await coverFromDiscogs({ dirName: '/Led Zeppelin/1976 The Song Remains The Same', quiet: false, token });

      expect(mockPrompt.albumPrompt).toHaveBeenCalled();
      expect(mockDiscogs.discogsMainCover).toHaveBeenCalledWith(
        expect.objectContaining({
          artist: 'Led Zeppelin',
          title: 'The Song Remains The Same',
          strategy: 'prompt',
          token,
        }),
      );
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(COVER_FILE_NAME, imageBuffer);
    });

    it('skips prompt when quiet is true', async () => {
      mockDiscogs.discogsMainCover.mockResolvedValue(imageBuffer);

      await coverFromDiscogs({ dirName: '/Led Zeppelin/1976 The Song Remains The Same', quiet: true, token });

      expect(mockPrompt.albumPrompt).not.toHaveBeenCalled();
      expect(mockDiscogs.discogsMainCover).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('logs error when discogs fetch fails', async () => {
      mockDiscogs.discogsMainCover.mockRejectedValue(new Error('API rate limit'));

      await coverFromDiscogs({ releaseId: '99999', quiet: true, token });

      expect(mockLog.error).toHaveBeenCalledWith('API rate limit');
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });
  });
});
