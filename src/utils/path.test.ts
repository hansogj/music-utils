import './polyfills';

import { FILETYPE } from '../types';
import { MockUtil } from './__mocks__/mockutils';
import * as execute from './execute';
import { getFileType, getPwd } from './path';

jest.mock('./execute');
const mocks = MockUtil<typeof execute>(jest).requireMocks('./execute');

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
});
