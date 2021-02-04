import '../utils/polyfills';

import { File, Track } from '../types';
import { MockUtil } from '../utils/__mocks__/mockutils';
import * as execute from '../utils/execute';
import * as pathUtils from '../utils/path';
import { capitalize } from '../utils/string';
import * as flac from './flac';
import * as mp3 from './mp3';
import { extractTags, tagFile } from './tag';

jest.mock('../utils/execute').mock('../utils/cmd.options').mock('../utils/path').mock('./mp3').mock('./flac');

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
    const track: Track = { trackName: 'Track', noOfDiscs: '1', trackNo: '1' } as Track;
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
          track: { trackName: 'Track', noOfDiscs: '1', trackNo: '1' },
        } as File));
    });

    const trackReads = [[undefined], [{}], [{ trackName: 'Track', noOfDiscs: '1', trackNo: '1' }]] as Partial<Track>[];
    describe('when filetype is mp3', () => {
      describe.skip.each(trackReads)('and read track is %o ', (tags: Partial<Track>) => {
        beforeEach(async () => {
          mp3Mock.read.mockResolvedValue({ tags });
          mocks.getFileType.mockResolvedValue('mp3');
          mp3Mock.read.mockResolvedValue(tags as Partial<Track>);
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
      describe.only.each(trackReads)('and read track is %o ', (tags: Partial<Track>) => {
        beforeEach(async () => {
          flacMock.read.mockResolvedValue({ track: tags });

          mocks.getFileType.mockResolvedValue('flac');
          flacMock.read.mockResolvedValue(tags as Partial<Track>);
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

  describe('tagFile', () => {
    let mp3Spy: jest.SpyInstance;
    let flacSpy: jest.SpyInstance;
    let thenSpy: jest.Mock;
    let file: File;

    beforeEach(() => {
      flacSpy = jest.spyOn(flac, 'write').mockResolvedValueOnce(undefined);
      mp3Spy = jest.spyOn(mp3, 'write').mockResolvedValueOnce(undefined);
      thenSpy = jest.fn();
    });

    afterEach(() => jest.resetAllMocks());

    describe('with filetype unknown', () => {
      beforeEach(() => {
        file = { fileType: 'unknown' } as File;
      });
      it('rejects', async () => {
        expect.assertions(1);
        return tagFile(file).catch((e) => expect(e.message).toContain('Unable to write tags to to undefined filetype'));
      });
    });

    describe('with flac filetype', () => {
      beforeEach(async () => {
        file = { fileType: 'flac' } as File;
        tagFile(file).then(thenSpy);
      });
      it('calls flac write', () => expect(flacSpy).toHaveBeenCalledTimes(1));
      it('fire callback', () => expect(thenSpy).toHaveBeenCalledTimes(1));
      it('mp3 write is never called', () => expect(mp3Spy).not.toHaveBeenCalled());
    });

    describe('with mp3 filetype', () => {
      beforeEach(async () => {
        file = { fileType: 'mp3' } as File;
        tagFile(file).then(thenSpy);
      });
      it('calls mp3 write', () => expect(mp3Spy).toHaveBeenCalledTimes(1));
      it('fire callback', () => expect(thenSpy).toHaveBeenCalledTimes(1));
      it('flac write is never called', () => expect(flacSpy).not.toHaveBeenCalled());
    });
  });
});
