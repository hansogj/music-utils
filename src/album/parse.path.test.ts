import '../utils/polyfills';

import { DISC_LABLE } from '../constants';
import { Release } from '../types';
import { getAlbumArtistInfoFromPath, parseAlbumFolderName } from './parse.path';

describe('parse.path', () => {
  describe.each([
    ['', []],
    ['/', []],
    ['/album', ['album']],
    ['/artis/album', ['artis', 'album']],
    ['/lib/artis/album', ['artis', 'album']],
  ])('getAlbumArtistInfoFromPath(%s)', (currentPath: string, epected: string[]) => {
    it(`should return ${JSON.stringify({ epected })})`, () =>
      expect(getAlbumArtistInfoFromPath(currentPath)).toEqual(epected));
  });

  describe.each([
    ['album', { album: 'Album' }],
    [' album   of the Year   ', { album: 'Album Of The Year' }],
    [`'74 album`, { album: `'74 Album` }],
    [`1974 album`, { album: `Album`, year: '1974' }],
    [` 1974 album`, { album: `Album`, year: '1974' }],
    [`album (${DISC_LABLE} 1)`, { album: `Album`, discNumber: '1' }],

    [`album (disc21 )`, { album: `Album`, discNumber: '21' }],
    [`album ( ${DISC_LABLE}  21 ) `, { album: `Album`, discNumber: '21' }],
    [`album (disc21∕22 )`, { album: `Album`, discNumber: '21', noOfDiscs: '22' }],
    [`album ( ${DISC_LABLE}  21 ∕ 22 ) `, { album: `Album`, discNumber: '21', noOfDiscs: '22' }],
    [`album ( ${DISC_LABLE}  21∕22 ) `, { album: `Album`, discNumber: '21', noOfDiscs: '22' }],
    [
      `1974 album of the year ( ${DISC_LABLE}  21 ) [1980 - 1981]   `,
      { album: `Album Of The Year [1980 - 1981]`, discNumber: '21', year: '1974' },
    ],
  ])('parseAlbumSplit(%s)', (albumSplit: string, epected: Partial<Release>) => {
    it(`should return ${JSON.stringify({ epected })})`, () =>
      expect(parseAlbumFolderName(albumSplit)).toEqual(epected));
  });
});
