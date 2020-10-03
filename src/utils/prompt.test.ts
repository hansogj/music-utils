/* eslint-disable import/first */
const mockPrompt = jest.fn();
jest.mock('prompts', () => ({
  __esModule: true,
  default: mockPrompt,
}));

import { Release } from '../types';
import { albumPrompt } from './prompt';

jest.mock('./color.log');

describe('prompt', () => {
  const release: Partial<Release> = { artist: 'Magma' };
  const alteredRelease: Partial<Release> = {
    ...release,
    ...{
      album: 'MDK',
      year: '1973',
      discnumber: '1',
      noOfDiscs: '1',
    },
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });
  describe.each([['y'], ['Y'], ['yes'], ['YES']])('when user responds positive', (value: string) => {
    beforeEach(() => mockPrompt.mockResolvedValueOnce({ value }));
    it(`albumPrompt should pass back release object`, () =>
      albumPrompt(release).then((res) => expect(res).toEqual(release)));
  });

  describe('when user responds negative', () => {
    beforeEach(() => {
      mockPrompt.mockResolvedValueOnce({ value: 'n' });
      mockPrompt.mockResolvedValueOnce(alteredRelease);
      mockPrompt.mockResolvedValueOnce({ value: 'y' });
    });
    it(`albumPrompt should pass back altered relase object`, () =>
      albumPrompt(release).then((res) => expect(res).toEqual(alteredRelease)));
  });
});
