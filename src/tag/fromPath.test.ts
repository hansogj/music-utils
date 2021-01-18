import '../utils/polyfills';

import { Track } from '../types';
import { read } from './fromPath';

jest.mock('../utils/execute').mock('../utils/path');

describe('fromPath', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.resetAllMocks();
  });

  describe.each([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [undefined as any, {}],
    ['track', { trackName: 'track' }],
    ['/album/track', { trackName: 'track' }],
    ['/album/track.mp3', { trackName: 'track' }],
    ['/album/track.flac', { trackName: 'track' }],
    ['/album/track.no1.flac', { trackName: 'track.no1' }],
    ['/album/01 track.flac', { trackName: 'track', trackNo: '01' }],
    ['/album/01 - track.flac', { trackName: 'track', trackNo: '01' }],
    ['/album/Disc 2 - 01 - track.flac', { trackName: 'track', trackNo: '01', noOfDiscs: '2' }],
    ['/album/Disc 1  01 track.flac', { trackName: 'track', trackNo: '01', noOfDiscs: '1' }],
    [
      "/album/Disc 1  01 track there's no stop in meeeeee!.flac",
      { trackName: "track there's no stop in meeeeee!", trackNo: '01', noOfDiscs: '1' },
    ],

    [
      "/album/Disc 1  01 track there's no                    stop.flac",
      { trackName: "track there's no stop", trackNo: '01', noOfDiscs: '1' },
    ],
    ['/album/d1t1 track.flac', { trackName: 'track', trackNo: '1', noOfDiscs: '1' }],
    ['/album/d1t01 -  track.flac', { trackName: 'track', trackNo: '01', noOfDiscs: '1' }],
    ['/album/d11t11 -  track.flac', { trackName: 'track', trackNo: '11', noOfDiscs: '11' }],
  ])('getTrackTagsFromPath of %s ', (path: string, expected: Partial<Track>) => {
    it(`should result in ${JSON.stringify(expected)}`, async () =>
      read(path).then((it) => expect(it).toStrictEqual(expected)));
  });
});
