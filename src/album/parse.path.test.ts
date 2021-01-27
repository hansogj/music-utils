import '../utils/polyfills';

import { DISC_LABLE } from '../constants';
import { Release } from '../types';
import * as pathUtils from '../utils/path';
import { parseAlbumInfo } from './parse.path';

jest.mock('../utils/color.log');
describe('parse.path', () => {
  describe.each([
    ['artist', { artist: 'artist' }],
    ['artist/album', { artist: 'artist', album: 'Album', discNumber: '1', noOfDiscs: '1' }],
    [
      '/My Band / album   of the Year   ',
      { artist: 'My Band', album: 'Album Of The Year', discNumber: '1', noOfDiscs: '1' },
    ],
    [`/Artist/'74 album`, { artist: 'Artist', album: `'74 Album`, discNumber: '1', noOfDiscs: '1' }],
    [`/Artist/1974 album`, { artist: 'Artist', album: `Album`, year: '1974', discNumber: '1', noOfDiscs: '1' }],
    [`/Artist/ 1974 album`, { artist: 'Artist', album: `Album`, year: '1974', discNumber: '1', noOfDiscs: '1' }],
    [`/Artist/album (${DISC_LABLE} 1)`, { artist: 'Artist', album: `Album`, discNumber: '1', noOfDiscs: '1' }],
    [`/Artist/album (disc21 )`, { artist: 'Artist', album: `Album`, discNumber: '21', noOfDiscs: '21' }],
    [`/Artist/album ( ${DISC_LABLE}  21 ) `, { artist: 'Artist', album: `Album`, discNumber: '21', noOfDiscs: '21' }],
    [`/Artist/album (disc21∕22 )`, { artist: 'Artist', album: `Album`, discNumber: '21', noOfDiscs: '22' }],
    [
      `/Artist/album ( ${DISC_LABLE}  21 ∕ 22 ) `,
      { artist: 'Artist', album: `Album`, discNumber: '21', noOfDiscs: '22' },
    ],
    [
      `/Artist/album ( ${DISC_LABLE}  21∕22 ) `,
      { artist: 'Artist', album: `Album`, discNumber: '21', noOfDiscs: '22' },
    ],
    [
      `/Artist/1974 album [1980 - 1981]   `,
      { artist: 'Artist', album: `Album`, year: '1974', aux: '1980 - 1981', discNumber: '1', noOfDiscs: '1' },
    ],
    [
      `Artist/1974 album of the year ( ${DISC_LABLE}  21 ) [1980 -   1981]   `,
      {
        artist: 'Artist',
        album: `Album Of The Year`,
        discNumber: '21',
        year: '1974',
        aux: '1980 - 1981',
        noOfDiscs: '21',
      },
    ],
  ])('parseAlbumInfo(%s)', (path: string, epected: Partial<Release>) => {
    beforeEach(() => {
      jest.spyOn(pathUtils, 'readDir');
      // @ts-ignore
      pathUtils.readDir.mockReturnValue([]);
    });
    it(`should return ${JSON.stringify({ epected })})`, () => expect(parseAlbumInfo(path)).toEqual(epected));
  });

  describe.each([
    ['/artist/album', [], { artist: 'artist', album: 'Album', discNumber: '1', noOfDiscs: '1' }],
    [`/artist/album (${DISC_LABLE} 1∕2)`, [], { artist: 'artist', album: 'Album', noOfDiscs: '2', discNumber: '1' }],
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
        '1999 No match excact album',
        '1997 match album 3 [with external info]',
        '1997 something else but still match album',
      ],
      { artist: 'artist', album: 'Match Album', noOfDiscs: '4', year: '1997', discNumber: '1' },
    ],

    [
      `/artist/album (${DISC_LABLE} 3∕22)`,
      ['album', 'album'],
      { artist: 'artist', album: 'Album', noOfDiscs: '22', discNumber: '3' },
    ],
  ])('parseAlbumInfo(%s) and lsDir eq %p', (path: string, lsDir: string[], epected: Partial<Release>) => {
    beforeEach(() => {
      jest.spyOn(pathUtils, 'readDir');
      // @ts-ignore
      pathUtils.readDir.mockReturnValue(lsDir);
    });
    it(`should return ${JSON.stringify({ epected })})`, () => expect(parseAlbumInfo(path)).toEqual(epected));
  });
});
