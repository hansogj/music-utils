import * as tags from '../tag';
import { File, Release, Track } from '../types';
/* eslint-disable no-template-curly-in-string */
import { MockUtil } from '../utils/__mocks__/mockutils';
import { mdkls, release } from '../utils/__mocks__/record.mock';
import * as log from '../utils/color.log';
import * as path from '../utils/path';
import * as prompt from '../utils/prompt';
// eslint-disable-next-line import/first
import { mergeMetaData, sortable, tagAlbum } from './tag-album';

type Mocks = typeof prompt & typeof log & typeof tags & typeof path;

jest.mock('../utils/prompt').mock('../utils/path').mock('../utils/color.log').mock('../tag');
const mocks = MockUtil<Mocks>(jest).requireMocks('../utils/prompt', '../tag', '../utils/path');

const parsedAlbumFolderName = {
  album: release.album,
  year: release.year,
  discnumber: 1,
  noOfDiscs: 1,
};
const mockDirName = '/MyArtis/1973 MyAlbum';
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
      const extractedTagsDefault: Partial<Track> = {
        album: 'MDK',
        artist: 'Magma',
        trackName: 'MOCKED TRACK NAME',
      };
      beforeEach(async () => {
        mocks.albumPrompt.mockResolvedValue(release);
        mocks.readDir.mockReturnValue(mdkls);
        mocks.parseAlbumFolderName.mockReturnValue(parsedAlbumFolderName);
        mocks.extractTags.mockImplementation((trackPath: string) =>
          Promise.resolve({
            fileType: /jpg/.test(trackPath) ? 'jpg' : 'mp3',
            path: trackPath,
            track: extractedTagsDefault,
          } as File)
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
          expect(mocks.extractTags.mock.calls[i].shift()).toEqual([mockDirName, track].join('/'))
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
          }))
      )('has called tagFile with %p', ({ file, index }: { file: File; index: number }) =>
        expect(mocks.tagFile.mock.calls[index][0]).toEqual(file)
      );
    });
  });

  describe('mergeMetaData', () => {
    describe.each([
      [undefined, undefined, []],
      [[], {}, []],
      [[{ path: 'mypath' } as File], {}, [{ path: 'mypath', fileType: undefined, track: { trackNoTotal: '1' } }]],
      [
        [{ path: 'mypath', fileType: 'flac' } as File],
        {} as Partial<Release>,
        [{ path: 'mypath', fileType: 'flac', track: { trackNoTotal: '1' } } as File],
      ],
      [
        [{ path: 'mypath', fileType: 'flac', track: { album: 'Album', artist: 'Artist' } } as File],
        {},
        [{ path: 'mypath', fileType: 'flac', track: { album: 'Album', artist: 'Artist', trackNoTotal: '1' } } as File],
      ],
      [
        [{ path: 'mypath', fileType: 'flac', track: { album: 'Album', artist: 'Artist' } } as File],
        { album: 'Override', artist: 'Override' },
        [
          {
            path: 'mypath',
            fileType: 'flac',
            track: { album: 'Override', artist: 'Override', trackNoTotal: '1' },
          } as File,
        ],
      ],

      [
        [{ path: 'mypath', fileType: 'flac', track: { trackName: 'TrackName' } } as File],
        { album: 'Album', artist: 'Artist' },
        [
          {
            path: 'mypath',
            fileType: 'flac',
            track: { album: 'Album', artist: 'Artist', trackName: 'TrackName', trackNoTotal: '1' },
          } as File,
        ],
      ],
      [
        [{ path: 'mypath', fileType: 'flac', track: { trackNoTotal: '15' } } as File],
        {},
        [{ path: 'mypath', fileType: 'flac', track: { trackNoTotal: '15' } } as File],
      ],

      [
        [{ path: 'mypath', fileType: 'flac' } as File, { path: 'mypath', fileType: 'flac' } as File],
        {},
        [
          { path: 'mypath', fileType: 'flac', track: { trackNoTotal: '2' } } as File,
          { path: 'mypath', fileType: 'flac', track: { trackNoTotal: '2' } } as File,
        ],
      ],
    ])(
      'of parameters files: %o and promptResponse: %o ',
      (files: Array<File>, promptResponse: Partial<Release>, mergedData: Array<File>) => {
        it(`should result in expected: ${JSON.stringify(mergedData)}`, () =>
          expect(mergeMetaData(files, promptResponse)).toStrictEqual(mergedData));
      }
    );
  });
});

describe.each([
  [undefined, undefined],
  [{}, {}],
  [{ trackNo: '1' }, { trackNo: '1' }],
  [
    { trackNo: '1', trackNoTotal: '10' },
    { trackNo: '01', trackNoTotal: '10' },
  ],
  [
    { trackNo: '01', trackNoTotal: '10' },
    { trackNo: '01', trackNoTotal: '10' },
  ],

  [
    { trackNo: '1', trackNoTotal: '20', discnumber: '1' },
    { trackNo: '01', trackNoTotal: '20', discnumber: '1' },
  ],

  [
    { trackNo: '1', trackNoTotal: '20', discnumber: '1', noOfDiscs: '2' },
    { trackNo: '101', trackNoTotal: '20', discnumber: '1', noOfDiscs: '2' },
  ],

  [
    { trackNo: '1', trackNoTotal: '20', discnumber: '2' },
    { trackNo: '201', trackNoTotal: '20', discnumber: '2' },
  ],
  [
    { trackNo: '1', trackNoTotal: '9', discnumber: '2' },
    { trackNo: '201', trackNoTotal: '9', discnumber: '2' },
  ],

  [
    { trackNo: '1', trackNoTotal: '9', discnumber: '02' },
    { trackNo: '201', trackNoTotal: '9', discnumber: '02' },
  ],
  [
    { trackNo: '201', trackNoTotal: '9', discnumber: '02' },
    { trackNo: '201', trackNoTotal: '9', discnumber: '02' },
  ],
])('with track  %o ', (track: File['track'], expected: File['track']) => {
  it(`should alter trackNo as sortable result in ${JSON.stringify(expected)}`, () =>
    expect(
      sortable({
        path: './',
        fileType: 'flac',
        track,
      }).track
    ).toStrictEqual(expected));
});
