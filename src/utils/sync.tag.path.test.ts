import { defined } from 'array.defined';

import { DISC_NO_SPLIT } from '../constants';
import { File, Release, Track } from '../types';
import { MockUtil } from './__mocks__/mockutils';
import * as pathUtils from './path';
import { syncReleaseFolder, syncTrackNames } from './sync.tag.path';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const might = (cond: any) => (defined(cond) ? 'should' : `shouldn't`);

jest.mock('../utils/path');
const mocks = MockUtil<typeof pathUtils>(jest).requireMocks('../utils/path');
type CallParams = { src: string; target: string };
describe('sync.tag.path', () => {
  afterEach(() => jest.resetAllMocks());

  describe('syncReleaseFolder', () => {
    describe.each([
      [undefined, undefined, undefined],
      [{}, '', undefined],
      [{ album: 'Album' }, 'Album', undefined],
      [{ album: 'Album', year: '2020' }, '2020 Album', undefined],
      [{ album: 'New Album', year: '2020' }, 'Album', { src: 'Album', target: '2020 New Album' }],
      [{ album: 'Album', year: '2020', discnumber: '1' }, 'Album', { src: 'Album', target: '2020 Album (disc 1)' }],
      [
        { album: 'Album', year: '2020', discnumber: '1', noOfDiscs: '2' },
        'Album',
        { src: 'Album', target: `2020 Album (disc 1${DISC_NO_SPLIT}2)` },
      ],
      [
        { album: 'New Album', year: '2020' },
        '/store/Long Artist Name/Album',
        { src: 'Album', target: '2020 New Album' },
      ],
    ])('when release eq %o & dirName eq %s ', (release: Partial<Release>, dirName: string, expected: CallParams) => {
      beforeEach(() => mocks.renameCurrentFolder.mockResolvedValueOnce(release));
      beforeEach(async () => syncReleaseFolder(release as Release, dirName));
      it(`${might(expected)} call renameCurrentFolder with params ${expected}`, () => {
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
    it(`${might(expected)} call renameFile with params ${expected}`, () => {
      if (defined(expected)) {
        expect(mocks.renameFile).toHaveBeenCalledTimes(expected.length);
        expected.map(({ src, target }: CallParams) => expect(mocks.renameFile).toHaveBeenCalledWith(src, target));
      } else {
        expect(mocks.renameFile).not.toHaveBeenCalled();
      }
    });
  });
});
