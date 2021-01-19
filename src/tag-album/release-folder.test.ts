import { defined } from 'array.defined';

import { DISC_NO_SPLIT } from '../constants';
import { Release } from '../types';
import { MockUtil } from '../utils/__mocks__/mockutils';
import * as pathUtils from '../utils/path';
import { syncReleaseFolder } from './release-folder';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const might = (cond: any) => (defined(cond) ? 'should' : `shouldn't`);

jest.mock('../utils/path');
const mocks = MockUtil<typeof pathUtils>(jest).requireMocks('../utils/path');

describe('rename', () => {
  afterEach(() => jest.resetAllMocks());
  describe.each([
    [undefined, undefined, undefined],
    [{}, '', undefined],
    [{ album: 'Album' }, 'Album', undefined],
    [{ album: 'Album', year: '2020' }, '2020 Album', undefined],
    [{ album: 'New Album', year: '2020' }, 'Album', { src: 'Album', target: '2020 New Album' }],
    [{ album: 'Album', year: '2020', discnumber: '1' }, 'Album', { src: 'Album', target: '2020 Album (disc 1)' }],
    [
      { album: 'Album', year: '2020', discnumber: '1', noOfDiscs: '2' },
      'Album',
      { src: 'Album', target: `2020 Album (disc 1${DISC_NO_SPLIT}2)` },
    ],
    [{ album: 'New Album', year: '2020' }, '/store/Long Artist Name/Album', { src: 'Album', target: '2020 New Album' }],
  ])(
    'when release eq %o & dirName eq %s ',
    (release: Partial<Release>, dirName: string, expected: { src: string; target: string }) => {
      beforeEach(() => mocks.renameCurrentFolder.mockResolvedValueOnce(release));
      beforeEach(async () => syncReleaseFolder(release as Release, dirName));
      it(`${might(expected)} call rename with params ${expected}`, () => {
        if (defined(expected)) {
          expect(mocks.renameCurrentFolder).toHaveBeenCalled();
          expect(mocks.renameCurrentFolder).toHaveBeenCalledWith(expected.src, expected.target);
        } else {
          expect(mocks.renameCurrentFolder).not.toHaveBeenCalled();
        }
      });
    }
  );
});
