import '../utils/polyfills';

import { Track } from '../types';
import { MockUtil } from '../utils/__mocks__/mockutils';
import { albumTrack } from '../utils/__mocks__/record.mock';
import * as execute from '../utils/execute';
import * as pathUtils from '../utils/path';
import * as mp3mocks from './__mocks__/mp3.mocks';
import * as mp3 from './mp3';

jest.mock('../utils/execute').mock('../utils/path');

const path = '/Album/d1t1 track.wtf';
const mocks = MockUtil<typeof execute & typeof pathUtils>(jest).requireMocks('../utils/execute', '../utils/path');

describe('mp3', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.resetAllMocks();
    jest.restoreAllMocks();
  });

  describe('when path is read', () => {
    beforeEach(() => {
      jest.spyOn(mp3, 'id3v1');
      jest.spyOn(mp3, 'id3v2');
      mocks.execute.mockResolvedValue('');
      mp3.read(path);
    });

    it('should call execute', () => expect(mocks.execute).toHaveBeenCalledTimes(1));
    it('should call execute with params ', () => expect(mocks.execute).toHaveBeenCalledWith(`id3v2 -l "${path}"`));

    describe('extract and parse id3 data', () => {
      describe.each([
        [undefined, {}],
        [
          mp3mocks.id3v1,
          {
            trackName: 'Track Name',
            trackNo: '1',
          } as Partial<Track>,
        ],
        [
          mp3mocks.id3v2,
          {
            trackName: 'Track Name',
            trackNo: '01',
            trackNoTotal: '12',
          } as Partial<Track>,
        ],
        [
          mp3mocks.id3v2_2,
          {
            trackName: 'Spyworld',
            trackNo: '2',
          },
        ],
      ])('when commandline output is %s ', (unparsed: string, expectedTrack: Partial<Track>) => {
        it(`id3v2 should return ${JSON.stringify(expectedTrack)}`, () => {
          expect(mp3.parseId3Output(unparsed)).toEqual(expectedTrack);
        });
      });
    });

    describe('write', () => {
      describe.each([
        [{}, ''],
        [{ album: albumTrack.album }, `--TALB "MDK"`],
        [albumTrack, `--TPE1 "Magma" --TPOS "02/04" --TYER "1973" --TALB "MDK" --TRCK "01/12" --TIT2 "Tusen Takk"`],
      ])('with track data %o ', (track: Partial<Track>, expected: string) => {
        const callParams = `id3v2 -2 ${expected} "/Album/d1t1 track.wtf"`;
        beforeEach(async () => {
          mocks.execute.mockResolvedValue('SUCCESS');
          await mp3.write({ path, fileType: 'mp3', track });
        });
        it('has executed once', () => expect(mocks.execute).toHaveBeenCalledTimes(2));
        it(`has executed once with ${callParams}`, () => expect(mocks.execute).toHaveBeenCalledWith(callParams));
      });
    });
  });
});
