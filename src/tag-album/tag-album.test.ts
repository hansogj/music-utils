import { FILETYPE } from '../types';
/* eslint-disable no-template-curly-in-string */
import mdkls from '../utils/__mocks__/mdk';
import { MockUtil } from '../utils/__mocks__/mockutils';
import { release } from '../utils/__mocks__/record.mock';

jest.mock('../utils/prompt').mock('../utils/path').mock('../utils/color.log').mock('../utils/tag');
const mocks = MockUtil(jest).requireMocks('../utils/prompt', '../utils/path', '../utils/tag');

// eslint-disable-next-line import/first
import { tagAlbum } from './tag-album';

const mockDirName = '/MyArtis/MyAlbum';
describe('tag album', () => {
  afterEach(jest.clearAllMocks);
  afterEach(jest.resetModules);

  describe(`tagAlbum(${mockDirName})`, () => {
    beforeEach(() => mocks.getAlbumArtistInfoFromPath.mockReturnValue([release.artist, release.album]));
    describe('is connected', () => {
      beforeEach(async () => {
        mocks.getAlbumArtistInfoFromPath.mockReturnValue([release.artist, release.album]);
        mocks.albumPrompt.mockResolvedValue({});
        mocks.readDir.mockReturnValue([]);
        await tagAlbum(mockDirName);
      });
      it('should call utils', () => {
        expect(mocks.getAlbumArtistInfoFromPath).toHaveBeenCalledTimes(1);
        expect(mocks.getAlbumArtistInfoFromPath).toHaveBeenCalledWith(mockDirName);
        expect(mocks.albumPrompt).toHaveBeenCalledTimes(1);
        expect(mocks.albumPrompt).toHaveBeenCalledWith({ artist: release.artist, album: release.album });
      });
    });

    describe('with response from prompt', () => {
      beforeEach(async () => {
        mocks.albumPrompt.mockResolvedValue(release);
        mocks.readDir.mockReturnValue(mdkls);
        mocks.getFileType.mockImplementation((e): FILETYPE => (/jpg/.test(e) ? 'jpg' : 'mp3'));
        mocks.tagFile.mockImplementation((_, tag) => Promise.resolve(tag));
        await tagAlbum(mockDirName);
      });
      it(`has called readDir(${mockDirName})`, () => {
        expect(mocks.readDir).toHaveBeenCalledTimes(1);
        expect(mocks.readDir).toHaveBeenCalledWith(mockDirName);
      });

      it(`has called getFileType`, () => {
        expect(mocks.getFileType).toHaveBeenCalledTimes(mdkls.length);
        mdkls.forEach((track, i) =>
          expect(mocks.getFileType.mock.calls[i].shift()).toEqual([mockDirName, track].join('/'))
        );
      });
      it(`has called tagFile`, () => {
        expect(mocks.tagFile).toHaveBeenCalledTimes(mdkls.length - 1);
        mdkls
          .filter((track) => /flac/.test(track))
          .forEach((track, i) =>
            expect(mocks.getFileType.mock.calls[i].shift()).toEqual([mockDirName, track].join('/'))
          );
      });
    });
  });
});
