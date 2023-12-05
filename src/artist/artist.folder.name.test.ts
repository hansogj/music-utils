import { defined } from '@hansogj/array.utils';

import * as parsePath from '../album/parse.path';
import { Release } from '../types';
import { MockUtil } from '../utils/__mocks__/mockutils';
import * as pathUtils from '../utils/path';
import * as utilPrompts from '../utils/prompt';
// eslint-disable-next-line import/first
import * as tagAlbum from './artist.folder.name';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const might = (cond: any) => (defined(cond) ? 'should' : `shouldn't`);

jest.mock('../utils/color.log').mock('../utils/prompt').mock('../utils/path').mock('../album/parse.path');

const mocks = MockUtil<typeof pathUtils & typeof utilPrompts & typeof parsePath>(jest).requireMocks(
  '../utils/path',
  '../utils/prompt',
  '../album/parse.path',
);
type CallParams = { src: string; target: string; store?: string };

describe('artist.folder.name', () => {
  afterEach(() => jest.resetAllMocks());
  beforeEach(() => mocks.artistPrompt.mockResolvedValue(true));

  describe('syncArtistFolder', () => {
    describe.each([
      [undefined, undefined, undefined],
      ['', undefined, undefined],
      ['Artist', 'Artist/Album', undefined],
      ['Artist', '/store/Artist/Album', undefined],
      ['Altered Artist', '/store/Artist/Album', { src: 'Artist', target: 'Altered Artist', store: '/store' }],
      ['Artist, the', '/store/The Artist/Album', { src: 'The Artist', target: 'Artist, the', store: '/store' }],
    ])(
      'when artist name eq %s & dirName eq %s ',
      (artist: Release['artist'], dirName: string, expected: CallParams) => {
        let artistName: string;
        beforeEach(() => mocks.getAlbumDirectory.mockImplementation(() => dirName));
        beforeEach(() => mocks.parseAlbumInfo.mockImplementation(() => ({ artist })));
        beforeEach(() => mocks.renameFolder.mockResolvedValueOnce(artist));

        beforeEach(async () => (artistName = await tagAlbum.getArtistFolderName()));
        it(`${might(expected)} call renameFolder with params ${JSON.stringify(expected)}`, () => {
          if (defined(expected)) {
            expect(mocks.renameFolder).toHaveBeenCalled();
            expect(mocks.renameFolder).toHaveBeenCalledWith(expected.src, expected.target, expected.store);
            expect(artistName).toEqual([expected.store, artist, 'Album'].join('/'));
          } else {
            expect(mocks.renameFolder).not.toHaveBeenCalled();
          }
        });
      },
    );
  });
});
