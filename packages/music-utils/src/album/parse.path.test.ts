import '../utils/polyfills';

import { type Mock, type MockInstance, vi } from 'vitest';

import { DISC_LABEL } from '../constants';
import { Release } from '../types';
import * as cmdOptions from '../utils/cmd.options';
import * as colorLog from '../utils/color.log';
import * as pathUtils from '../utils/path';
import { artistSortable, getAlbumDirectory, parseAlbumInfo } from './parse.path';

vi.mock('../utils/color.log', () => ({
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  success: vi.fn(),
  json: vi.fn(),
  debugInfo: vi.fn(),
  exit: vi.fn(),
  default: vi.fn(),
}));
vi.mock('../utils/cmd.options', () => ({
  getCommandLineArgs: vi.fn(),
}));

describe('artist sort', () => {
  describe.each([
    ['artist', 'artist'],
    ['the artist', 'artist, the'],
    ['The Artist', 'Artist, the'],
    ['TheArtist', 'TheArtist'],
    ['los Artist', 'Artist, los'],
    ['la Artist', 'Artist, la'],
    ['il Artist', 'Artist, il'],
  ])('artistSortable(%s)', (path: string, expected: string) => {
    it(`should return ${expected}`, () => expect(artistSortable(path)).toEqual(expected));
  });
});
describe('parse.path', () => {
  describe.each([
    ['artist', { artist: 'artist', album: '', noOfDiscs: '1' }],
    ['artist/album', { artist: 'artist', album: 'Album', discNumber: '1', noOfDiscs: '1' }],
    [
      '/My Band / album   of the Year   ',
      { artist: 'My Band', album: 'Album Of The Year', discNumber: '1', noOfDiscs: '1' },
    ],
    [`/Artist/'74 album`, { artist: 'Artist', album: `'74 Album`, discNumber: '1', noOfDiscs: '1' }],
    [`/The Artist/'74 album`, { artist: 'Artist, the', album: `'74 Album`, discNumber: '1', noOfDiscs: '1' }],
    [`/Artist/1974 album`, { artist: 'Artist', album: `Album`, year: '1974', discNumber: '1', noOfDiscs: '1' }],
    [`/Artist/ 1974 album`, { artist: 'Artist', album: `Album`, year: '1974', discNumber: '1', noOfDiscs: '1' }],
    [`/Artist/album (${DISC_LABEL} 1)`, { artist: 'Artist', album: `Album`, discNumber: '1', noOfDiscs: '1' }],
    [`/Artist/album (disc21 )`, { artist: 'Artist', album: `Album`, discNumber: '21', noOfDiscs: '21' }],
    [`/Artist/album ( ${DISC_LABEL}  21 ) `, { artist: 'Artist', album: `Album`, discNumber: '21', noOfDiscs: '21' }],
    [`/Artist/album (disc21∕22 )`, { artist: 'Artist', album: `Album`, discNumber: '21', noOfDiscs: '22' }],
    [
      `/Artist/album ( ${DISC_LABEL}  21 ∕ 22 ) `,
      { artist: 'Artist', album: `Album`, discNumber: '21', noOfDiscs: '22' },
    ],
    [
      `/Artist/album ( ${DISC_LABEL}  21∕22 ) `,
      { artist: 'Artist', album: `Album`, discNumber: '21', noOfDiscs: '22' },
    ],
    [
      `/Artist/1974 album [1980 - 1981]   `,
      { artist: 'Artist', album: `Album`, year: '1974', aux: '1980 - 1981', discNumber: '1', noOfDiscs: '1' },
    ],
    [
      `Artist/1974 album of the year ( ${DISC_LABEL}  21 ) some aux information   `,
      {
        artist: 'Artist',
        album: `Album Of The Year`,
        discNumber: '21',
        year: '1974',
        aux: 'some aux information',
        noOfDiscs: '21',
      },
    ],

    [
      `Artist/1974 album of the year ( ${DISC_LABEL}  21 ) [1980 -   1981]   `,
      {
        artist: 'Artist',
        album: `Album Of The Year`,
        discNumber: '21',
        year: '1974',
        aux: '1980 - 1981',
        noOfDiscs: '21',
      },
    ],

    [
      `Artist/1974 album of the year [  1980 - 1981 ] ( ${DISC_LABEL}  21 ) some aux information   `,
      {
        artist: 'Artist',
        album: `Album Of The Year`,
        discNumber: '21',
        year: '1974',
        aux: 'some aux information 1980 - 1981',
        noOfDiscs: '21',
      },
    ],
  ])('parseAlbumInfo(%s)', (path: string, expected: Partial<Release>) => {
    beforeEach(() => {
      vi.spyOn(pathUtils, 'readDir');
      // @ts-ignore
      pathUtils.readDir.mockReturnValue([]);
    });
    it(`should return ${JSON.stringify({ expected })})`, () => expect(parseAlbumInfo(path)).toEqual(expected));
  });

  describe.each([
    ['/artist/album', [], { artist: 'artist', album: 'Album', discNumber: '1', noOfDiscs: '1' }],
    [`/artist/album (${DISC_LABEL} 1∕2)`, [], { artist: 'artist', album: 'Album', noOfDiscs: '2', discNumber: '1' }],
    ['/artist/album', ['album'], { artist: 'artist', album: 'Album', noOfDiscs: '1', discNumber: '1' }],

    [
      '/artist/1977 album',
      ['album', 'album'],
      { artist: 'artist', album: 'Album', noOfDiscs: '2', year: '1977', discNumber: '1' },
    ],
    [
      '/artist/1977 album',
      ['album', 'not my release', 'album'],
      { artist: 'artist', album: 'Album', noOfDiscs: '2', year: '1977', discNumber: '1' },
    ],
    [
      '/artist/1997 match album',
      [
        `1997 match album 1`,
        '1998 Some other release',
        '1997 match album 2',
        '1999 No match exact album',
        '1997 match album 3 [with external info]',
        '1997 something else but still match album',
      ],
      { artist: 'artist', album: 'Match Album', noOfDiscs: '4', year: '1997', discNumber: '1' },
    ],

    [
      `/artist/album (${DISC_LABEL} 3∕22)`,
      ['album', 'album'],
      { artist: 'artist', album: 'Album', noOfDiscs: '22', discNumber: '3' },
    ],
  ])('parseAlbumInfo(%s) and lsDir eq %p', (path: string, lsDir: string[], expected: Partial<Release>) => {
    beforeEach(() => {
      vi.spyOn(pathUtils, 'readDir');
      // @ts-ignore
      pathUtils.readDir.mockReturnValue(lsDir);
    });
    it(`should return ${JSON.stringify({ expected })})`, () => expect(parseAlbumInfo(path)).toEqual(expected));
  });
});

describe('getAlbumDirectory', () => {
  const getCommandLineArgs = cmdOptions.getCommandLineArgs as Mock;
  const exit = colorLog.exit as Mock;
  let cwd: MockInstance;
  let chdir: MockInstance;

  beforeEach(() => {
    cwd = vi.spyOn(process, 'cwd').mockReturnValue('/starting/dir');
    chdir = vi.spyOn(process, 'chdir').mockImplementation(() => undefined);
  });
  afterEach(() => {
    cwd.mockRestore();
    chdir.mockRestore();
  });

  it('returns cwd when no --album arg is provided', () => {
    getCommandLineArgs.mockReturnValue({});
    expect(getAlbumDirectory()).toEqual('/starting/dir');
    expect(chdir).not.toHaveBeenCalled();
  });

  it('chdirs into the album folder and returns the new cwd', () => {
    getCommandLineArgs.mockReturnValue({ album: 'Some Album' });
    cwd.mockReturnValueOnce('/starting/dir').mockReturnValue('/starting/dir/Some Album');
    expect(getAlbumDirectory()).toEqual('/starting/dir/Some Album');
    expect(chdir).toHaveBeenCalledWith('/starting/dir/Some Album');
  });

  it('calls exit when chdir throws', () => {
    getCommandLineArgs.mockReturnValue({ album: 'missing' });
    chdir.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    getAlbumDirectory();
    expect(exit).toHaveBeenCalledWith(expect.stringContaining('chdir'));
  });
});
