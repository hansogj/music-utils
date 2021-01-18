import '../utils/polyfills';

import { File, Track } from '../types';
import { MockUtil } from '../utils/__mocks__/mockutils';
import * as execute from '../utils/execute';
import * as pathUtils from '../utils/path';
import * as flac from './flac';
import * as mp3 from './mp3';
import { extractTags } from './tag';

jest.mock('../utils/execute').mock('../utils/path').mock('./mp3').mock('./flac');

const mocks = MockUtil<typeof execute & typeof pathUtils>(jest).requireMocks('../utils/execute', '../utils/path');

const mp3Mock = MockUtil<typeof mp3>(jest).requireMocks('./mp3');
const flacMock = MockUtil<typeof flac>(jest).requireMocks('./flac');

describe('tag test', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.resetAllMocks();
  });

  describe('getTrackTags', () => {
    let extraction: File;
    const path = '/Album/d1t1 track.wtf';

    describe('when no matcihng fileType', () => {
      beforeEach(async () => {
        //      mocks.execute.mockResolvedValue('TITLE=Rock and Roll');
        mocks.getFileType.mockResolvedValue('unknown');
        extraction = await extractTags(path);
      });
      it('getFileType is called', () => expect(mocks.getFileType).toHaveBeenCalledTimes(1));
      it('has not tried read tags from meta data', () => expect(mocks.execute).not.toHaveBeenCalled());
      it('should result expected', () =>
        expect(extraction).toStrictEqual({
          fileType: 'unknown',
          path,
          track: { trackName: 'track', noOfDiscs: '1', trackNo: '1' },
        } as File));
    });

    const trackReads = [[undefined], [{}], [{ trackName: 'track', noOfDiscs: '1', trackNo: '1' }]] as Partial<Track>[];
    describe('when filetype is mp3', () => {
      describe.each(trackReads)('and read track is %o ', (track: Partial<Track>) => {
        beforeEach(async () => {
          mp3Mock.read.mockResolvedValue({ track });
          mocks.getFileType.mockResolvedValue('mp3');
          mp3Mock.read.mockResolvedValue(track as Partial<Track>);
          extraction = await extractTags(path);
        });

        it('getFileType is called', () => expect(mocks.getFileType).toHaveBeenCalledTimes(1));
        it('has red tags from meta data', () => expect(mp3Mock.read).toHaveBeenCalled());

        it('should result expected', () =>
          expect(extraction).toStrictEqual({
            path,
            track,
            fileType: 'mp3',
          }));
      });
    });

    describe('when filetype is flac', () => {
      describe.each(trackReads)('and read track is %o ', (track: Partial<Track>) => {
        beforeEach(async () => {
          flacMock.read.mockResolvedValue({ track });
          mocks.getFileType.mockResolvedValue('flac');
          flacMock.read.mockResolvedValue(track as Partial<Track>);
          extraction = await extractTags(path);
        });

        it('getFileType is called', () => expect(mocks.getFileType).toHaveBeenCalledTimes(1));
        it('has red tags from meta data', () => expect(flacMock.read).toHaveBeenCalled());

        it('should result expected', () =>
          expect(extraction).toStrictEqual({
            path,
            track,
            fileType: 'flac',
          }));
      });
    });
  });
  /*
  
  describe('tagFile', () => {
      describe('with undefined file', () => {
          it('rejects', async () => {
              expect.assertions(1);
              await expect(tagFile(undefined)).rejects.toEqual(new Error('missing track info'));
            });
        });
        describe.each([[undefined, undefined]])('%o ', (cond: File, expected: string) => {
            beforeEach(async () => tagFile(cond));
            it.skip(`execute is called`, () => expect(mocks.execute).toHaveBeenLastCalledWith(expected));
        });
        
    describe('from defined file type', () => {
        beforeEach(() => {
        mocks.execute.mockReturnValue(Promise.resolve(''));
        tagFile({ path: '/file/path', track, fileType: 'flac' });
    });
    it('execute is called', () => expect(mocks.execute).toHaveBeenCalledTimes(1));
      it.skip('TODO MORE TESTS', () => expect(mocks.execute).toHaveBeenCalledTimes(1));
    });
});

*/
});
