import './polyfills';

import { Tag } from '../types';
import { MockUtil } from './__mocks__/mockutils';
import { release, track } from './__mocks__/record.mock';
import { extractTags, getTrackTagsFromPath, tagFile } from './tag';

jest.mock('./execute').mock('./path');
const mocks = MockUtil(jest).requireMocks('./execute', './path');

describe('tag test', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.resetAllMocks();
  });
  describe('tagFile', () => {
    beforeEach(() => {
      mocks.execute.mockReturnValue(Promise.resolve(''));
      tagFile('/file/path', { ...track, ...{ fileType: 'flac' } });
    });
    it('execute is called', () => expect(mocks.execute).toHaveBeenCalledTimes(1));
    it.skip('TODO MORE TESTS', () => expect(mocks.execute).toHaveBeenCalledTimes(1));
  });

  describe('extractTags', () => {
    let extractedTags: Tag;
    beforeEach(async () => {
      mocks.getFileType.mockResolvedValue('flac');
      extractedTags = await extractTags('/file/path');
    });
    it('getFileType is called', () => expect(mocks.getFileType).toHaveBeenCalledTimes(1));
    it('should result expected', () =>
      expect(extractedTags).toStrictEqual({
        fileType: 'flac',
        trackName: 'path',
      }));
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
  ])('getTrackTagsFromPath of %s ', (path: string, expected: Partial<Tag>) => {
    it(`should result in ${JSON.stringify(expected)}`, () =>
      expect(getTrackTagsFromPath(path)).toStrictEqual(expected));
  });
});
