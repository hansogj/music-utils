import { File, Release } from '../types';
// eslint-disable-next-line import/first
import { mergeMetaData, sortable } from './merge-meta';

type TestCase = { files: Array<File>; release: Partial<Release>; tracksFromFile: string[] };
describe('mergeMetaData', () => {
  describe.each([
    [{} as TestCase, []],

    [
      { files: [{ path: 'mypath' } as File], release: {}, tracksFromFile: undefined },
      [{ path: 'mypath', fileType: undefined, track: { trackNoTotal: '1' } }],
    ],
    [
      { files: [{ path: 'mypath', fileType: 'flac' } as File], release: {}, tracksFromFile: undefined },
      [{ path: 'mypath', fileType: 'flac', track: { trackNoTotal: '1' } } as File],
    ],
    [
      {
        files: [{ path: 'mypath', fileType: 'flac', track: { album: 'Album', artist: 'Artist' } } as File],
        release: {},
        tracksFromFile: undefined,
      },
      [{ path: 'mypath', fileType: 'flac', track: { album: 'Album', artist: 'Artist', trackNoTotal: '1' } } as File],
    ],

    [
      {
        files: [{ path: 'mypath', fileType: 'flac', track: { album: 'Album', artist: 'Artist' } } as File],
        release: { album: 'Override', artist: 'Override' },
        tracksFromFile: undefined,
      },

      [
        {
          path: 'mypath',
          fileType: 'flac',
          track: { album: 'Override', artist: 'Override', trackNoTotal: '1' },
        } as File,
      ],
    ],

    [
      {
        files: [{ path: 'mypath', fileType: 'flac', track: { trackName: 'TrackName' } } as File],
        release: { album: 'Album', artist: 'Artist' },
        tracksFromFile: undefined,
      },
      [
        {
          path: 'mypath',
          fileType: 'flac',
          track: { album: 'Album', artist: 'Artist', trackName: 'TrackName', trackNoTotal: '1' },
        } as File,
      ],
    ],

    [
      {
        files: [{ path: 'mypath', fileType: 'flac', track: { trackNoTotal: '15' } } as File],
        release: {},
        tracksFromFile: undefined,
      },
      [{ path: 'mypath', fileType: 'flac', track: { trackNoTotal: '15' } } as File],
    ],

    [
      {
        files: [{ path: 'mypath', fileType: 'flac' } as File, { path: 'mypath', fileType: 'flac' } as File],
        release: {},
        tracksFromFile: undefined,
      },
      [
        { path: 'mypath', fileType: 'flac', track: { trackNoTotal: '2' } } as File,
        { path: 'mypath', fileType: 'flac', track: { trackNoTotal: '2' } } as File,
      ],
    ],

    [
      {
        files: [{ path: 'myPath', fileType: 'flac' } as File, { path: 'myPath', fileType: 'flac' } as File],
        release: {},
        tracksFromFile: ['Track 01', 'Track 02'],
      },
      [
        { path: 'myPath', fileType: 'flac', track: { trackNoTotal: '2', trackName: 'Track 01' } } as File,
        { path: 'myPath', fileType: 'flac', track: { trackNoTotal: '2', trackName: 'Track 02' } } as File,
      ],
    ],
    [
      {
        files: [
          { path: 'myPath', fileType: 'flac', track: { trackName: 'Oldie 20' } } as File,
          { path: 'myPath', fileType: 'flac', track: { trackName: 'Oldie 20' } } as File,
        ],
        release: {},
        tracksFromFile: ['Track 01', 'Track 02'],
      },
      [
        { path: 'myPath', fileType: 'flac', track: { trackNoTotal: '2', trackName: 'Track 01' } } as File,
        { path: 'myPath', fileType: 'flac', track: { trackNoTotal: '2', trackName: 'Track 02' } } as File,
      ],
    ],
  ])(
    'of parameters files: %o ,  userInput release: %o and tracksFromFile: %o ',
    ({ files, release, tracksFromFile }: TestCase, mergedData: Array<File>) => {
      it(`should result in expected: ${JSON.stringify(mergedData)}`, () =>
        expect(mergeMetaData(files, release, tracksFromFile)).toStrictEqual(mergedData));
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
    { trackNo: '10', trackNoTotal: '20', discnumber: '1' },
    { trackNo: '10', trackNoTotal: '20', discnumber: '1' },
  ],

  [
    { trackNo: '1', trackNoTotal: '20', discnumber: '1', noOfDiscs: '2' },
    { trackNo: '101', trackNoTotal: '20', discnumber: '1', noOfDiscs: '2' },
  ],
  [
    { trackNo: '10', trackNoTotal: '20', discnumber: '1', noOfDiscs: '2' },
    { trackNo: '110', trackNoTotal: '20', discnumber: '1', noOfDiscs: '2' },
  ],

  [
    { trackNo: '10', trackNoTotal: '20', discnumber: '2', noOfDiscs: '2' },
    { trackNo: '210', trackNoTotal: '20', discnumber: '2', noOfDiscs: '2' },
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
