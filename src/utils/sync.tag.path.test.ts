import { defined } from 'array.defined';

import { DISC_LABLE, DISC_NO_SPLIT } from '../constants';
import { File, Release, Track } from '../types';
import { MockUtil } from './__mocks__/mockutils';
import * as pathUtils from './path';
import { syncReleaseFolder, syncTrackNames } from './sync.tag.path';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const might = (cond: any) => (defined(cond) ? 'should' : `shouldn't`);

jest.mock('../utils/path').mock('../utils/color.log');
const mocks = MockUtil<typeof pathUtils>(jest).requireMocks('../utils/path');
type CallParams = { src: string; target: string };
describe('sync.tag.path', () => {
  afterEach(() => jest.resetAllMocks());

  describe('syncReleaseFolder', () => {
    describe.each([
      [undefined, undefined, undefined],
      [{}, '', undefined],
      [{ album: 'Album' }, 'Album', undefined],
      [{ album: 'My Album' }, 'My album', undefined],
      [{ album: 'Album', year: '2020' }, '2020 Album', undefined],
      [{ album: 'New Album', year: '2020' }, 'Album', { src: 'Album', target: '2020 New Album' }],
      [{ album: 'Album', year: '2020', discNumber: '1' }, 'Album', { src: 'Album', target: '2020 Album' }],
      [
        { album: 'Album', year: '2020', discNumber: '1', noOfDiscs: '2' },
        'Album',
        { src: 'Album', target: `2020 Album (${DISC_LABLE} ${[1, 2].join(DISC_NO_SPLIT)})` },
      ],
      [
        { album: 'New Album', year: '2020' },
        '/store/Long Artist Name/Album',
        { src: 'Album', target: '2020 New Album' },
      ],

      [
        { album: 'New Album', year: '2020', aux: '1980 - 1981' },
        '/store/Long Artist Name/Album',
        { src: 'Album', target: '2020 New Album [1980 - 1981]' },
      ],
      [
        { album: 'New Album', year: '2020', aux: '1980 - 1981', discNumber: '11', noOfDiscs: '12' },
        '/store/Long Artist Name/Album',
        { src: 'Album', target: `2020 New Album [1980 - 1981] (${DISC_LABLE} ${[11, 12].join(DISC_NO_SPLIT)})` },
      ],
    ])('when release eq %o & dirName eq %s ', (release: Partial<Release>, dirName: string, expected: CallParams) => {
      beforeEach(() => mocks.renameCurrentFolder.mockResolvedValueOnce(release));
      beforeEach(async () => syncReleaseFolder(release as Release, dirName));
      it(`${might(expected)} call renameCurrentFolder with params ${JSON.stringify(expected)}`, () => {
        if (defined(expected)) {
          expect(mocks.renameCurrentFolder).toHaveBeenCalled();
          expect(mocks.renameCurrentFolder).toHaveBeenCalledWith(expected.src, expected.target);
        } else {
          expect(mocks.renameCurrentFolder).not.toHaveBeenCalled();
        }
      });
    });
  });

  const commonTrack: Partial<Track> = {
    trackName: 'MyTrack',
    trackNoTotal: '2',
    album: 'Album',
  };
  describe.each([
    [undefined, undefined],
    [[], undefined],
    [[{} as File], undefined],
    [
      [{ path: '/path/to/d1 track.flac', fileType: 'flac', track: { ...commonTrack, trackNo: '01' } } as File],
      [{ src: 'd1 track.flac', target: '01 MyTrack.flac' }],
    ],
    [
      [
        { path: '/path/to/d1 track.flac', fileType: 'flac', track: { ...commonTrack, trackNo: '01' } } as File,
        { path: '/path/to/d2 track.flac', fileType: 'flac', track: { ...commonTrack, trackNo: '02' } } as File,
      ],
      [
        { src: 'd1 track.flac', target: '01 MyTrack.flac' },
        { src: 'd2 track.flac', target: '02 MyTrack.flac' },
      ],
    ],

    [
      [{ path: '/path/to/01 track.flac', fileType: 'flac', track: { trackName: 'track', trackNo: '01' } } as File],
      undefined,
    ],
  ])('when files list is %o', (files: File[], expected: CallParams[]) => {
    beforeEach(() => mocks.renameFile.mockResolvedValue({}));
    beforeEach(async () => syncTrackNames(files));
    it(`${might(expected)} call renameFile with params ${JSON.stringify(expected)}`, () => {
      if (defined(expected)) {
        expect(mocks.renameFile).toHaveBeenCalledTimes(expected.length);
        expected.map(({ src, target }: CallParams) => expect(mocks.renameFile).toHaveBeenCalledWith(src, target));
      } else {
        expect(mocks.renameFile).not.toHaveBeenCalled();
      }
    });
  });
});
