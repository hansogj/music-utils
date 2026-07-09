import '../utils/polyfills';

import { vi } from 'vitest';

import { Track } from '../types';
import { albumTrack } from '../utils/__mocks__/record.mock';
import * as execute from '../utils/execute';
import { metaflac } from './__mocks__/flac.mocks';
import * as flac from './flac';

vi.mock('../utils/execute');
vi.mock('../utils/cmd.options');
vi.mock('../utils/color.log');

const mocks = vi.mocked(execute);
const path = '/Album/d1t1 track.flac';

describe('flac', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  describe('when path is read', () => {
    let extraction: Partial<Track>;

    describe.each([
      [undefined, {}],
      [metaflac[0], {}],
      [metaflac[1], { trackName: 'Flac Track', trackNo: '1' }],
      [metaflac[2], { trackName: `Flac Track with 'acute , / slash and extra space`, trackNo: '1' }],
    ])('and metaflac returns of %s ', (metaflacOutput: string, expected: Partial<Track>) => {
      beforeEach(async () => {
        mocks.executeFile.mockResolvedValueOnce(metaflacOutput);
        extraction = await flac.read(path);
      });

      it('finds metadata from file tag', () => expect(mocks.executeFile).toHaveBeenCalledTimes(1));
      it('should call executeFile with args array', () =>
        expect(mocks.executeFile).toHaveBeenCalledWith('metaflac', [
          '--show-tag=TITLE',
          '--show-tag=TRACKNUMBER',
          path,
        ]));
      it('should result expected', () => expect(extraction).toStrictEqual(expected));
    });
  });

  describe('write', () => {
    describe.each([
      [{}, [] as string[], [] as string[]],
      [{ album: albumTrack.album }, ['--remove-tag=ALBUM'], ['--set-tag=ALBUM=MDK']],
      [
        albumTrack,
        [
          '--remove-tag=ARTIST',
          '--remove-tag=ALBUMARTIST',
          '--remove-tag=DISCID',
          '--remove-tag=DISCNUMBER',
          '--remove-tag=DATE',
          '--remove-tag=ALBUM',
          '--remove-tag=TRACKNUMBER',
          '--remove-tag=TRACKTOTAL',
          '--remove-tag=TITLE',
        ],
        [
          '--set-tag=ARTIST=Magma',
          '--set-tag=ALBUMARTIST=Magma',
          '--set-tag=DISCNUMBER=02',
          '--set-tag=DATE=1973',
          '--set-tag=ALBUM=MDK',
          '--set-tag=TRACKNUMBER=01',
          '--set-tag=TRACKTOTAL=12',
          '--set-tag=TITLE=Tusen Takk',
          '--set-tag=DISCID=02/04',
        ],
      ],
    ])('with track data %o ', (track: Partial<Track>, expectedRemoveArgs: string[], expectedSetArgs: string[]) => {
      beforeEach(async () => {
        mocks.executeFile.mockResolvedValue('SUCCESS');
        await flac.write({ path, fileType: 'flac', track });
      });
      it('has executed twice', () => expect(mocks.executeFile).toHaveBeenCalledTimes(2));
      it('has called remove tags', () =>
        expect(mocks.executeFile).toHaveBeenCalledWith('metaflac', [...expectedRemoveArgs, path]));
      it('has called set tags', () =>
        expect(mocks.executeFile).toHaveBeenCalledWith('metaflac', [...expectedSetArgs, path]));
    });
  });

  describe('when filename contains quote', () => {
    const quotedPath = '/artist/album name with "quotes"/track name with "quotes".flac';
    beforeEach(async () => {
      mocks.executeFile.mockResolvedValue('SUCCESS');
      await flac.write({
        path: quotedPath,
        fileType: 'flac',
        track: { album: 'album name with "quotes"' },
      });
    });

    it('has executed twice', () => expect(mocks.executeFile).toHaveBeenCalledTimes(2));
    it('passes path as separate arg (no shell escaping needed)', () =>
      expect(mocks.executeFile).toHaveBeenCalledWith('metaflac', ['--remove-tag=ALBUM', quotedPath]));
    it('passes tag value as separate arg (no shell escaping needed)', () =>
      expect(mocks.executeFile).toHaveBeenCalledWith('metaflac', [
        '--set-tag=ALBUM=album name with "quotes"',
        quotedPath,
      ]));
  });
});
