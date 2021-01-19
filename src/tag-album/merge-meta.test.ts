import * as tags from '../tag';
import { File, Release, Track } from '../types';
/* eslint-disable no-template-curly-in-string */
import { MockUtil } from '../utils/__mocks__/mockutils';
import { mdkls, release } from '../utils/__mocks__/record.mock';
import * as log from '../utils/color.log';
import * as path from '../utils/path';
import * as prompt from '../utils/prompt';
// eslint-disable-next-line import/first
import { mergeMetaData, sortable } from './merge-meta';

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
