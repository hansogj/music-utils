/* eslint-disable import/first */
const mockPrompt = jest.fn();
jest.mock('prompts', () => ({
  __esModule: true,
  default: mockPrompt,
}));

jest.mock('./color.log');
import { Release } from '../types';
import { albumPrompt, userDefinedPrompt } from './prompt';

describe('prompt', () => {
  const release: Partial<Release> = { artist: 'Magma' };
  const alteredRelease: Partial<Release> = {
    ...release,
    ...{
      album: 'MDK',
      year: '1973',
      discNumber: '1',
      noOfDiscs: '1',
    },
  };

  beforeEach(() => jest.resetAllMocks());

  describe.each([['y'], ['Y'], ['yes'], ['YES']])('when user responds positive', (value: string) => {
    beforeEach(() => mockPrompt.mockResolvedValueOnce({ value }));
    it(`albumPrompt should pass back release object`, () =>
      albumPrompt(release).then((res) => expect(res).toEqual(release)));
  });

  describe('when user responds negative', () => {
    let response: Partial<Release>;
    beforeEach(async () => {
      mockPrompt.mockResolvedValueOnce({ value: 'n' });
      mockPrompt.mockResolvedValueOnce(alteredRelease);
      mockPrompt.mockResolvedValueOnce({ value: 'y' });
      response = await albumPrompt(release);
    });
    it(`albumPrompt should pass back altered relase object`, () => expect(response).toEqual(alteredRelease));
  });

  describe('userDefaultPrompt', () => {
    let response: Partial<Release>;
    beforeEach(async () => {
      mockPrompt.mockResolvedValueOnce({ artist: 'Altered Artist', album: '' });
      response = await userDefinedPrompt({ artist: 'Artist', noOfDiscs: '2', album: 'Album' });
    });

    it('merges respons with passed release data', async () =>
      expect(response).toStrictEqual({
        artist: 'Altered Artist',
        album: 'Album',
        noOfDiscs: '2',
      }));
  });
});
