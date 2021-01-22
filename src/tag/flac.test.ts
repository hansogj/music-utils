import '../utils/polyfills';

import { ACUTE, DISC_NO_SPLIT } from '../constants';
import { Track } from '../types';
import { MockUtil } from '../utils/__mocks__/mockutils';
import { albumTrack } from '../utils/__mocks__/record.mock';
import * as execute from '../utils/execute';
import * as pathUtils from '../utils/path';
import { metaflac } from './__mocks__/flac.mocks';
import * as flac from './flac';

jest
  .mock('../utils/execute')
  // .mock('../utils/path').
  .mock('../utils/cmd.options')
  .mock('../utils/color.log');

const mocks = MockUtil<typeof execute /* & typeof pathUtils */>(jest).requireMocks(
  '../utils/execute' /* , '../utils/path' */
);
const path = '/Album/d1t1 track.flac';

describe('flac', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.resetAllMocks();
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
        mocks.execute.mockResolvedValueOnce(metaflacOutput);
        extraction = await flac.read(path);
      });

      it('finds metadata from file tag', () => expect(mocks.execute).toHaveBeenCalledTimes(1));
      it('should result expected', () => expect(extraction).toStrictEqual(expected));
    });
  });

  describe('write', () => {
    describe.each([
      [{}, '', ''],
      [{ album: albumTrack.album }, `--remove-tag=ALBUM`, `--set-tag=ALBUM="MDK"`],
      [
        albumTrack,
        `--remove-tag=ARTIST --remove-tag=ALBUMARTIST --remove-tag=DISCID --remove-tag=DISCNUMBER --remove-tag=DATE --remove-tag=ALBUM --remove-tag=TRACKNUMBER --remove-tag=TRACKTOTAL --remove-tag=TITLE`,
        `--set-tag=ARTIST="Magma" --set-tag=ALBUMARTIST="Magma" --set-tag=DISCNUMBER="02" --set-tag=DATE="1973" --set-tag=ALBUM="MDK" --set-tag=TRACKNUMBER="01" --set-tag=TRACKTOTAL="12" --set-tag=TITLE="Tusen Takk" --set-tag=DISCID="02/04"`,
      ],
    ])('with track data %o ', (track: Partial<Track>, expectedRemoveParams: string, expectedSetParams: string) => {
      const [callParamsRemoveTags, callParamsSetTags] = [expectedRemoveParams, expectedSetParams].map((params) =>
        [`metaflac`, params, `"/Album/d1t1 track.flac"`].defined().join(' ')
      );

      beforeEach(async () => {
        mocks.execute.mockResolvedValue('SUCCESS');
        await flac.write({ path, fileType: 'mp3', track });
      });
      it('has executed once', () => expect(mocks.execute).toHaveBeenCalledTimes(2));
      it(`has executed once with ${callParamsRemoveTags}`, () =>
        expect(mocks.execute).toHaveBeenCalledWith(callParamsRemoveTags));

      it(`has executed once with ${callParamsSetTags}`, () =>
        expect(mocks.execute).toHaveBeenCalledWith(callParamsSetTags));
    });
  });
});
