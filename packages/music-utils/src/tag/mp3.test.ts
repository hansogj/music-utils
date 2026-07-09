import '../utils/polyfills';

import { vi } from 'vitest';

import { Track } from '../types';
import { albumTrack } from '../utils/__mocks__/record.mock';
import * as execute from '../utils/execute';
import * as mp3mocks from './__mocks__/mp3.mocks';
import * as mp3 from './mp3';

vi.mock('../utils/execute');
vi.mock('../utils/color.log');

const path = '/Album/d1t1 track.wtf';
const mocks = vi.mocked(execute);

describe('mp3', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.restoreAllMocks();
  });

  describe('when path is read', () => {
    beforeEach(() => {
      vi.spyOn(mp3, 'id3v1');
      vi.spyOn(mp3, 'id3v2');
      mocks.executeFile.mockResolvedValue('');
      mp3.read(path);
    });

    it('should call executeFile', () => expect(mocks.executeFile).toHaveBeenCalledTimes(1));
    it('should call executeFile with args array', () =>
      expect(mocks.executeFile).toHaveBeenCalledWith('id3v2', ['-l', path]));

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
          mp3mocks.id3v1_2,
          {
            trackName: 'Down and out',
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
        [{}, [] as string[]],
        [{ album: albumTrack.album }, ['--TALB', 'MDK']],
        [
          albumTrack,
          [
            '--TPE1',
            'Magma',
            '--TPOS',
            '02/04',
            '--TYER',
            '1973',
            '--TALB',
            'MDK',
            '--TRCK',
            '01/12',
            '--TIT2',
            'Tusen Takk',
          ],
        ],
      ])('with track data %o ', (track: Partial<Track>, expectedArgs: string[]) => {
        beforeEach(async () => {
          mocks.executeFile.mockResolvedValue('SUCCESS');
          await mp3.write({ path, fileType: 'mp3', track });
        });
        it('has executed twice (read + write)', () => expect(mocks.executeFile).toHaveBeenCalledTimes(2));
        it('has called write with args array', () =>
          expect(mocks.executeFile).toHaveBeenCalledWith('id3v2', ['-2', ...expectedArgs, path]));
      });
    });
  });
});
