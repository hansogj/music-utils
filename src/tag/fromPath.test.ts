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
    ['track', { trackName: 'Track' }],
    ['/album/track', { trackName: 'Track' }],
    ['/album/track.mp3', { trackName: 'Track' }],
    ['/album/track.flac', { trackName: 'Track' }],
    ['/album/track.no1.flac', { trackName: 'Track.no1' }],
    ['/album/01 track.flac', { trackName: 'Track', trackNo: '01' }],
    ['/album/01. artist dist 1 track.flac', { trackName: 'Artist Dist 1 Track', trackNo: '01' }],
    ['/album/01 The Final Chapter - Starlight.mp3', { trackName: 'The Final Chapter - Starlight', trackNo: '01' }],
    ['/album/01 - track.flac', { trackName: 'Track', trackNo: '01' }],
    ['/album/Disc 2 - 01 - track.flac', { trackName: 'Track', trackNo: '01', noOfDiscs: '2' }],
    ['/album/Disc 1  01 track.flac', { trackName: 'Track', trackNo: '01', noOfDiscs: '1' }],
    [
      "/album/Disc 1  01 track there's no stop in meeeeee!.flac",
      { trackName: "Track There's No Stop In Meeeeee!", trackNo: '01', noOfDiscs: '1' },
    ],

    [
      "/album/Disc 1  01 track there's no                    stop.flac",
      { trackName: "Track There's No Stop", trackNo: '01', noOfDiscs: '1' },
    ],
    ['/album/d1t1 track.flac', { trackName: 'Track', trackNo: '1', noOfDiscs: '1' }],
    ['/album/d1t01 -  track.flac', { trackName: 'Track', trackNo: '01', noOfDiscs: '1' }],
    ['/album/d11t11 -  track.flac', { trackName: 'Track', trackNo: '11', noOfDiscs: '11' }],
  ])('getTrackTagsFromPath of %s ', (path: string, expected: Partial<Track>) => {
    it(`should result in ${JSON.stringify(expected)}`, async () =>
      read(path).then((it) => expect(it).toStrictEqual(expected)));
  });
});
