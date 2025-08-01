import * as tags from '../tag';
import { File, Track } from '../types';
import { MockUtil } from '../utils/__mocks__/mockutils';
import { mdkls, release } from '../utils/__mocks__/record.mock';
import * as log from '../utils/color.log';
import * as path from '../utils/path';
import * as prompt from '../utils/prompt';
import { tagAlbum } from './album';
import * as parsePath from './parse.path';

type Mocks = typeof prompt & typeof parsePath & typeof log & typeof tags & typeof path;

jest
  .mock('./parse.path')
  .mock('../utils/prompt')
  .mock('../utils/cmd.options')
  .mock('../utils/path')
  .mock('../utils/color.log')
  .mock('../tag');

const mocks = MockUtil<Mocks>(jest).requireMocks('./parse.path', '../utils/prompt', '../tag', '../utils/path');

const parsedAlbumFolderName = {
  album: release.album,
  year: release.year,
  discNumber: '1',
  noOfDiscs: '1',
};
const mockDirName = '/MyArtis/1973 MyAlbum';
describe('tag album', () => {
  afterEach(jest.clearAllMocks);
  afterEach(jest.resetModules);

  describe(`tagAlbum(${mockDirName})`, () => {
    beforeEach(() => mocks.parseAlbumInfo.mockReturnValue(parsedAlbumFolderName));
    describe('is connected', () => {
      beforeEach(async () => {
        mocks.albumPrompt.mockResolvedValue({});
        mocks.readDir.mockReturnValue([]);
        await tagAlbum(mockDirName);
      });
      it('should call utils', () => {
        expect(mocks.parseAlbumInfo).toHaveBeenCalledTimes(1);
        expect(mocks.albumPrompt).toHaveBeenCalledTimes(1);
        expect(mocks.albumPrompt).toHaveBeenCalledWith(parsedAlbumFolderName);
      });
    });

    describe('with response from prompt', () => {
      const extractedTagsDefault: Partial<Track> = {
        album: 'MDK',
        artist: 'Magma',
        trackName: 'MOCKED TRACK NAME',
      };
      beforeEach(async () => {
        mocks.albumPrompt.mockResolvedValue(release);
        mocks.readDir.mockReturnValue(mdkls);

        mocks.extractTags.mockImplementation((trackPath: string) =>
          Promise.resolve({
            fileType: /jpg/.test(trackPath) ? 'jpg' : 'mp3',
            path: trackPath,
            track: extractedTagsDefault,
          } as File),
        );
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
          expect(mocks.extractTags.mock.calls[i].shift()).toEqual([mockDirName, track].join('/')),
        );
      });

      it(`has called tagFile ${mdkls.length - 1} times`, () =>
        expect(mocks.tagFile).toHaveBeenCalledTimes(mdkls.length - 1));

      it.each(
        mdkls
          .filter((track) => /mp3/.test(track))
          .map((trackPath, index) => ({
            index,
            file: {
              path: [mockDirName, trackPath].join('/'),
              fileType: 'mp3',
              track: {
                album: 'MDK',
                artist: 'Magma',
                trackName: 'MOCKED TRACK NAME',
                trackNoTotal: '7',
                year: '1973',
              },
            } as File,
          })),
      )('has called tagFile with %p', ({ file, index }: { file: File; index: number }) =>
        expect(mocks.tagFile.mock.calls[index][0]).toEqual(file),
      );
    });
  });
});
