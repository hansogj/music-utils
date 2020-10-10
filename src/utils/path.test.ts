import './polyfills';

import { FILETYPE, Release } from '../types';
import { MockUtil } from './__mocks__/mockutils';
import { getAlbumArtistInfoFromPath, getFileType, getPwd, parseAlbumFolderName } from './path';

jest.mock('./execute');
const mocks = MockUtil(jest).requireMocks('./execute');

describe('path', () => {
  beforeEach(() => jest.resetAllMocks());
  beforeEach(() => jest.resetModules());
  const setMockReturnValue = (val: string) => mocks.execute.mockReturnValue(Promise.resolve(val));

  describe.each([
    ['Rock and Roll.flac: audio/flac; charset=binary', 'flac' as FILETYPE],
    ['Rock and Roll.mp3: audio/mpeg; charset=binary', 'mp3' as FILETYPE],
    ['folder.jpg: image/jpeg; charset=binary', 'jpg' as FILETYPE],
    ['whuut.png: jobbish; charset=binary', 'unknown' as FILETYPE],
  ])('getFileType(%p)', (stdout: string, filetype: FILETYPE) => {
    beforeEach(() => setMockReturnValue(stdout));
    it(`should return ${filetype}`, () => getFileType(stdout).then((result) => expect(result).toEqual(filetype)));
  });

  describe.each([
    ['', []],
    ['/', []],
    ['/path', ['path']],
    ['/my/path', ['my', 'path']],
    ['/home/my/path', ['home', 'my', 'path']],
  ])('when current pwd is %s', (currentPath: string, epected: string[]) => {
    beforeEach(() => setMockReturnValue(currentPath));
    it(`getPwd() return ${JSON.stringify({ epected })})`, () => getPwd().then((res) => expect(res).toEqual(epected)));
  });

  describe.each([
    ['', []],
    ['/', []],
    ['/album', ['album']],
    ['/artis/album', ['artis', 'album']],
    ['/lib/artis/album', ['artis', 'album']],
  ])('getAlbumArtistInfoFromPath(%s)', (currentPath: string, epected: string[]) => {
    it(`should return ${JSON.stringify({ epected })})`, () => {
      return expect(getAlbumArtistInfoFromPath(currentPath)).toEqual(epected);
    });
  });

  describe.each([
    ['album', { album: 'Album' }],
    [' album   of the Year   ', { album: 'Album Of The Year' }],
    [`'74 album`, { album: `'74 Album` }],
    [`1974 album`, { album: `Album`, year: '1974' }],
    [` 1974 album`, { album: `Album`, year: '1974' }],
    [`album (disc 1)`, { album: `Album`, discnumber: '1' }],
    [`album (disc21 )`, { album: `Album`, discnumber: '21' }],
    [`album ( disc  21 ) `, { album: `Album`, discnumber: '21' }],
    [
      `1974 album of the year ( disc  21 ) [1980 - 1981]   `,
      { album: `Album Of The Year [1980 - 1981]`, discnumber: '21', year: '1974' },
    ],
  ])('parseAlbumSplit(%s)', (albumSplit: string, epected: Partial<Release>) => {
    it(`should return ${JSON.stringify({ epected })})`, () =>
      expect(parseAlbumFolderName(albumSplit)).toEqual(epected));
  });
});
