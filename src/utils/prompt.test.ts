import { confirm, input } from '@inquirer/prompts';

jest.mock('./color.log');
import { Release } from '../types';
import { albumPrompt, Question, userDefinedPrompt, validate } from './prompt';

const mockInput = input as jest.MockedFunction<typeof input>;
const mockConfirm = confirm as jest.MockedFunction<typeof confirm>;

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

  describe.each([true])('when user confirms positive', (value: boolean) => {
    beforeEach(() => mockConfirm.mockResolvedValueOnce(value));
    it(`albumPrompt should pass back release object`, () =>
      albumPrompt(release).then((res) => expect(res).toEqual(release)));
  });

  describe('when user responds negative then provides new data', () => {
    let response: Partial<Release>;
    beforeEach(async () => {
      // First confirm: reject
      mockConfirm.mockResolvedValueOnce(false);
      // userDefinedPrompt: input calls for each field
      const fields = ['artist', 'album', 'year', 'discNumber', 'noOfDiscs', 'aux'];
      const values: Record<string, string> = {
        artist: 'Magma',
        album: 'MDK',
        year: '1973',
        discNumber: '1',
        noOfDiscs: '1',
        aux: '',
      };
      fields.forEach((field) => mockInput.mockResolvedValueOnce(values[field] || ''));
      // Second confirm: accept
      mockConfirm.mockResolvedValueOnce(true);
      response = await albumPrompt(release);
    });
    it(`albumPrompt should pass back altered release object`, () => expect(response).toEqual(alteredRelease));
  });

  describe('userDefinedPrompt', () => {
    let response: Partial<Release>;
    beforeEach(async () => {
      // input is called for each field in the release + defaults
      const inputValues = [
        'Altered Artist    ', // artist
        '    Album  with multiple space  ', // album
        '', // year
        '', // discNumber
        '2', // noOfDiscs
        '', // aux
      ];
      inputValues.forEach((val) => mockInput.mockResolvedValueOnce(val));
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
