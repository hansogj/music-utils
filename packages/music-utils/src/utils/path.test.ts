import './polyfills';

import fs from 'node:fs';

import { type MockInstance, vi } from 'vitest';

import { DISC_NO_SPLIT } from '../constants';
import { FILETYPE } from '../types';
import * as execute from './execute';
import {
  getDirName,
  getFileType,
  getPwd,
  readDir,
  renameFile,
  renameFolder,
  replaceDangers,
  replaceQuotes,
} from './path';

vi.mock('./execute');
const mocks = vi.mocked(execute);

describe('path', () => {
  beforeEach(() => vi.resetAllMocks());
  beforeEach(() => vi.resetModules());
  const setMockReturnValue = (val: string) => mocks.executeFile.mockReturnValue(Promise.resolve(val));

  describe.each([
    ['Rock and Roll.flac: audio/flac; charset=binary', 'flac' as FILETYPE],
    ['Rock and Roll.mp3: audio/mpeg; charset=binary', 'mp3' as FILETYPE],
    ['folder.jpg: image/jpeg; charset=binary', 'jpg' as FILETYPE],
    ['song.txt: text/plain; charset=utf-8', 'text' as FILETYPE],
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

  describe('readDir', () => {
    const entries = ['a.flac', '.hidden', 'b.mp3', '.DS_Store', 'cover.jpg'];
    let readdirSync: MockInstance;

    beforeEach(() => {
      readdirSync = vi.spyOn(fs, 'readdirSync').mockReturnValue(entries as unknown as fs.Dirent[]);
    });
    afterEach(() => readdirSync.mockRestore());

    it('filters hidden entries by default', () => {
      expect(readDir('/some/folder')).toEqual(['a.flac', 'b.mp3', 'cover.jpg']);
    });

    it('returns everything when filterHidden=false', () => {
      expect(readDir('/some/folder', false)).toEqual(entries);
    });
  });

  describe('getDirName', () => {
    it('returns process.cwd()', () => {
      const cwd = vi.spyOn(process, 'cwd').mockReturnValue('/tmp/music');
      expect(getDirName()).toEqual('/tmp/music');
      cwd.mockRestore();
    });
  });

  describe('renameFolder', () => {
    it('invokes mv with default root ../', () => {
      mocks.executeFile.mockReturnValue(Promise.resolve(''));
      renameFolder('old dir', 'new dir');
      expect(mocks.executeFile).toHaveBeenCalledWith('mv', ['../old dir', '../new dir']);
    });

    it('honors an explicit root', () => {
      mocks.executeFile.mockReturnValue(Promise.resolve(''));
      renameFolder('a', 'b', '/base/');
      expect(mocks.executeFile).toHaveBeenCalledWith('mv', ['/base/a', '/base/b']);
    });
  });

  describe('renameFile', () => {
    it('invokes mv with raw src and target', () => {
      mocks.executeFile.mockReturnValue(Promise.resolve(''));
      renameFile('foo.flac', 'bar.flac');
      expect(mocks.executeFile).toHaveBeenCalledWith('mv', ['foo.flac', 'bar.flac']);
    });
  });

  describe.each([
    ['', ''],
    ['plain text', 'plain text'],
    ['some "quoted" text', "some 'quoted' text"],
    ['  double  spaces   collapsed  ', 'double spaces collapsed'],
  ])('replaceQuotes(%p)', (input: string, expected: string) => {
    it(`returns ${JSON.stringify(expected)}`, () => expect(replaceQuotes(input)).toEqual(expected));
  });

  it('replaceQuotes() with no argument returns empty string', () => {
    expect(replaceQuotes()).toEqual('');
  });

  describe.each([
    ['', ''],
    ['Disc 1/2', `Disc 1${DISC_NO_SPLIT}2`],
    ['a/b/c', `a${DISC_NO_SPLIT}b${DISC_NO_SPLIT}c`],
    ['no slashes here', 'no slashes here'],
    ['mixed "quotes" and / slash', `mixed 'quotes' and ${DISC_NO_SPLIT} slash`],
  ])('replaceDangers(%p)', (input: string, expected: string) => {
    it(`returns ${JSON.stringify(expected)}`, () => expect(replaceDangers(input)).toEqual(expected));
  });
});
