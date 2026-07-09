import { defined } from '@hansogj/array.utils';
import { vi } from 'vitest';

import * as parsePath from '../album/parse.path';
import { Release } from '../types';
import * as pathUtils from '../utils/path';
import * as utilPrompts from '../utils/prompt';
import * as tagAlbum from './artist.folder.name';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const might = (cond: any) => (defined(cond) ? 'should' : `shouldn't`);

vi.mock('../utils/color.log');
vi.mock('../utils/prompt');
vi.mock('../utils/path');
vi.mock('../album/parse.path');

const mocks = { ...vi.mocked(pathUtils), ...vi.mocked(utilPrompts), ...vi.mocked(parsePath) };
type CallParams = { src: string; target: string; store?: string };

describe('artist.folder.name', () => {
  afterEach(() => vi.resetAllMocks());
  beforeEach(() => void mocks.artistPrompt.mockResolvedValue(true));

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
        beforeEach(() => void mocks.getAlbumDirectory.mockImplementation(() => dirName));
        beforeEach(() => void mocks.parseAlbumInfo.mockImplementation(() => ({ artist })));
        beforeEach(() => void mocks.renameFolder.mockResolvedValueOnce(artist));

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
