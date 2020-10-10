/* eslint-disable no-template-curly-in-string */

import { MockUtil } from '../utils/__mocks__/mockutils';
import { mdkls, release } from '../utils/__mocks__/record.mock';

jest.mock('../utils/prompt').mock('../utils/path').mock('../utils/color.log').mock('../utils/tag');
const mocks = MockUtil(jest).requireMocks('../utils/prompt', '../utils/path', '../utils/tag');

// eslint-disable-next-line import/first
import { tagAlbum } from './tag-album';

const parsedAlbumFolderName = {
  album: release.album,
  year: release.year,
  discnumber: 1,
};
const mockDirName = '/MyArtis/MyAlbum';
describe('tag album', () => {
  afterEach(jest.clearAllMocks);
  afterEach(jest.resetModules);

  describe(`tagAlbum(${mockDirName})`, () => {
    beforeEach(() => mocks.getAlbumArtistInfoFromPath.mockReturnValue([release.artist, release.album]));
    describe('is connected', () => {
      beforeEach(async () => {
        mocks.getAlbumArtistInfoFromPath.mockReturnValue([release.artist, release.album]);
        mocks.parseAlbumFolderName.mockReturnValue(parsedAlbumFolderName);
        mocks.albumPrompt.mockResolvedValue({});
        mocks.readDir.mockReturnValue([]);
        await tagAlbum(mockDirName);
      });
      it('should call utils', () => {
        expect(mocks.getAlbumArtistInfoFromPath).toHaveBeenCalledTimes(1);
        expect(mocks.getAlbumArtistInfoFromPath).toHaveBeenCalledWith(mockDirName);
        expect(mocks.albumPrompt).toHaveBeenCalledTimes(1);
        expect(mocks.albumPrompt).toHaveBeenCalledWith({ ...release, ...parsedAlbumFolderName });
      });
    });

    describe('with response from prompt', () => {
      beforeEach(async () => {
        mocks.albumPrompt.mockResolvedValue(release);
        mocks.readDir.mockReturnValue(mdkls);
        mocks.parseAlbumFolderName.mockReturnValue(parsedAlbumFolderName);
        mocks.extractTags.mockImplementation((path: string) => {
          return Promise.resolve({
            fileType: /jpg/.test(path) ? 'jpg' : 'mp3',
            trackName: path,
          });
        });
        mocks.tagFile.mockImplementation((_, tag) => Promise.resolve(tag));
        await tagAlbum(mockDirName);
      });
      it(`has called readDir(${mockDirName})`, () => {
        expect(mocks.readDir).toHaveBeenCalledTimes(1);
        expect(mocks.readDir).toHaveBeenCalledWith(mockDirName);
      });

      it(`has called extractTags`, () => {
        expect(mocks.extractTags).toHaveBeenCalledTimes(mdkls.length);
        mdkls.forEach((track, i) =>
          expect(mocks.extractTags.mock.calls[i].shift()).toEqual([mockDirName, track].join('/'))
        );
      });

      it(`has called tagFile ${mdkls.length - 1} times`, () =>
        expect(mocks.tagFile).toHaveBeenCalledTimes(mdkls.length - 1));

      it.each(
        mdkls
          .filter((track) => /mp3/.test(track))
          .map((track, index) => ({
            track,
            index,
            tag: {
              album: 'MDK',
              artist: 'Magma',
              fileType: 'mp3',
            },
          }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      )('has called tagFile with %p', ({ track, index, tag }: any) => {
        expect(mocks.tagFile.mock.calls[index][0]).toEqual([mockDirName, track].join('/'));
        expect(mocks.tagFile.mock.calls[index][1]).toEqual(expect.objectContaining(tag));
      });
    });
  });
});
