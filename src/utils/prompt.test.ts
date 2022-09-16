/* eslint-disable import/first */
const mockPrompt = jest.fn();
jest.mock('prompts', () => ({
  __esModule: true,
  default: mockPrompt,
}));

jest.mock('./color.log');
import { Release } from '../types';
import { albumPrompt, Question, userDefinedPrompt, validate } from './prompt';

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
    it(`albumPrompt should pass back altered release object`, () => expect(response).toEqual(alteredRelease));
  });

  describe('userDefaultPrompt', () => {
    let response: Partial<Release>;
    beforeEach(async () => {
      mockPrompt.mockResolvedValueOnce({
        artist: 'Altered Artist    ',
        album: '    Album  with multiple space  ',
      });
      response = await userDefinedPrompt({
        artist: 'Artist',
        noOfDiscs: '2',
        album: 'Album',
      });
    });

    it('merges responds with passed release data', async () =>
      expect(response).toStrictEqual({
        artist: 'Altered Artist',
        album: 'Album with multiple space',
        noOfDiscs: '2',
      }));
  });

  describe.each([
    [{ name: 'artist', value: '' }, true],
    [{ name: 'artist', value: 'a' }, true],
    [{ name: 'artist', value: '1' }, true],

    [{ name: 'album', value: '' }, true],
    [{ name: 'album', value: 'a' }, true],
    [{ name: 'album', value: '1' }, true],

    [{ name: 'year', value: '' }, true],
    [{ name: 'year', value: 'a' }, 'Numeric input only'],
    [{ name: 'year', value: '1' }, true],

    [{ name: 'discNumber', value: '' }, true],
    [{ name: 'discNumber', value: 'a' }, 'Numeric input only'],
    [{ name: 'discNumber', value: '1' }, true],

    [{ name: 'noOfDiscs', value: '' }, true],
    [{ name: 'noOfDiscs', value: 'a' }, 'Numeric input only'],
    [{ name: 'noOfDiscs', value: '1' }, true],

    [{ name: 'aux', value: '' }, true],
    [{ name: 'aux', value: 'a' }, true],
    [{ name: 'aux', value: '1' }, true],
  ] as Array<[{ name: Question; value: string }, boolean]>)('with user input %p', (response, expected) => {
    it(`should validate into ${expected}`, () => expect(validate(response.name, response.value)).toEqual(expected));
  });
});
