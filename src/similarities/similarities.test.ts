import { findSimilaritiesAmongArtists } from './similarities';
import { ArtistSimilarity, Similarity } from './types';
import { getArtistCombination, unify } from './utils';

jest.mock('../utils/cmd.options');

const mockedLogger: typeof console = { ...global.console, time: jest.fn(), timeLog: jest.fn() };

const dirB = ['A/Artist', 'B/The Balad', 'M/Magma', '/lib/music/M/MAGMA'];
describe('similarities', () => {
  const extractSimilarities = (compares: ArtistSimilarity[]) =>
    compares.flatMap(({ similarities }: ArtistSimilarity) =>
      similarities.map(({ similarity, other }) => ({ similarity, other }))
    );

  describe.each([
    [[], []],
    [['O/Artist'], [{ similarity: 1, other: 'A/Artist' }]],
    [['A/Artist'], []],
    [['O/ARTIST'], [{ similarity: 1, other: 'A/Artist' }]],
    [['A/Artyst'], [{ similarity: 0.83, other: 'A/Artist' }]],
    [['B/*** Balad'], [{ similarity: 1, other: 'B/The Balad' }]],
    [['B/The Balad'], []],
    [['B/Balad, the'], [{ similarity: 1, other: 'B/The Balad' }]],
    [['Balad, the'], [{ similarity: 1, other: 'B/The Balad' }]],
    [
      ['Magma'],
      [
        { similarity: 1, other: 'M/MAGMA' }, // skipped preceding folders
        { similarity: 1, other: 'M/Magma' },
      ],
    ],
    [
      ['Artist', 'Artyst'],
      [
        { similarity: 1, other: 'A/Artist' },
        { similarity: 0.83, other: 'A/Artist' },
      ],
    ],
  ])('when artists eq %o ', (dirA: string[], expected: Partial<Similarity>[]) => {
    let compare: ArtistSimilarity[];
    beforeEach(() => (compare = findSimilaritiesAmongArtists(dirA, dirB, 0.4, [], mockedLogger)));
    it(`should result in expected`, () => expect(extractSimilarities(compare)).toEqual(expected));
  });

  describe('compare complex band name', () => {
    const dirBB = [
      '/lib/music/K/King Gizzard and the Lizzard Wizzard',
      '/lib/music/W/Wizzard King Gizzard and the Lizzard ',
    ];

    let compare: ArtistSimilarity[];
    beforeEach(
      () =>
        (compare = findSimilaritiesAmongArtists(
          [' King Gizzard and the Lizzard Wizzard'],
          dirBB,
          0.4,
          [],
          mockedLogger
        ))
    );
    it(`should not generate artist combination`, () =>
      expect(extractSimilarities(compare)).toEqual([
        {
          other: 'K/King Gizzard and the Lizzard Wizzard',
          similarity: 1,
        },
        {
          other: 'W/Wizzard King Gizzard and the Lizzard ',
          similarity: 1,
        },
      ]));
  });

  describe('compare with ignore option', () => {
    let compare: ArtistSimilarity[];
    beforeEach(() => (compare = findSimilaritiesAmongArtists(['Balad, the'], dirB, 0.4, ['Balad, the'], mockedLogger)));
    it(`should not have similarities `, () => expect(extractSimilarities(compare)).toEqual([]));
  });
});

describe('utils', () => {
  describe.each([
    [' ', []],
    ['Artist', ['Artist']],
    ['  Artist   ', ['Artist']],
    ['The Artist', ['Artist', 'Artist The', 'The Artist']], // sole definite article is omitted
    [
      'The New Artist', // The - sole definite article is omitted
      // prettier-ignore
      [ 'Artist', 'Artist New', 'Artist New The', 'Artist The', 'Artist The New', 'New', 'New Artist', 'New Artist The', 'New The', 'New The Artist', 'The Artist', 'The Artist New', 'The New', 'The New Artist',  ],
    ],
    [
      'Alain Eckert Quartet', // The - quiartet is omitted
      // prettier-ignore
      [ 'Alain', 'Alain Eckert', 'Alain Eckert Quartet', 'Alain Quartet', 'Alain Quartet Eckert', 'Eckert', 'Eckert Alain', 'Eckert Alain Quartet', 'Eckert Quartet', 'Eckert Quartet Alain', 'Quartet Alain', 'Quartet Alain Eckert', 'Quartet Eckert', 'Quartet Eckert Alain', ],
    ],
  ])('when artists eq %o ', (artist: string, expected: string[]) => {
    it(`should combine to ${expected}`, () => expect(getArtistCombination(artist)).toEqual(expected));
  });

  const calculatedSimilarities = [
    { other: '/music/lib/G/Grant‐Lee Phillips', combination: 'Phillips', similarity: 1 },
    { other: '/music/lib/E/Esther Phillips', combination: 'Phillips', similarity: 1 },
    { other: '/music/lib/E/Esther Phillips', combination: 'Antony Phillips', similarity: 0.67 },
    { other: '/music/lib/A/Anthony Phillips', combination: 'Phillips', similarity: 1 },
    { other: '/music/lib/A/Anthony Phillips', combination: 'Antony Phillips', similarity: 0.93 },
    { other: '/music/lib/A/Altona', combination: 'Antony', similarity: 0.67 },
    { other: '/music/lib/A/Anthony Phillips', combination: 'Antony', similarity: 1 },
  ];
  // prettier-ignore
  const calculateNova = [ { combination: 'Nova Ars', other: '/music/lib/A/Ars Nova [USA]', similarity: 1, }, { combination: 'Nova Ars', other: '/music/lib/A/Ars Nova [Japan]', similarity: 1, }, { combination: 'Nova', other: '/music/lib/V/Vita Nova', similarity: 1, }, { combination: 'Nova', other: '/music/lib/N/Nova', similarity: 1, }, { combination: 'Nova', other: '/music/lib/A/Ars Nova [USA]', similarity: 1, }, { combination: 'Nova', other: '/music/lib/A/Ars Nova [Japan]', similarity: 1, }, { combination: 'Ars Nova', other: '/music/lib/A/Ars Nova [USA]', similarity: 1, }, { combination: 'Ars Nova', other: '/music/lib/A/Ars Nova [Japan]', similarity: 1, }, { combination: 'Ars', other: '/music/lib/A/Ars Nova [USA]', similarity: 1, }, { combination: 'Ars', other: '/music/lib/A/Ars Nova [Japan]', similarity: 1, }, { combination: 'Nova', other: '/music/lib/N/NOVI', similarity: 0.75, }, { combination: 'Ars', other: '/music/lib/A/Arc', similarity: 0.67, }, { combination: 'Nova Ars', other: '/music/lib/N/Novalis', similarity: 0.63, }, { combination: 'Nova Ars', other: '/music/lib/N/Nuova Era', similarity: 0.63, }, ];

  const from = (...index: number[]) => calculatedSimilarities.filter((_, i) => index.includes(i));
  const fromNova = (...index: number[]) => calculateNova.filter((_, i) => index.includes(i));

  describe.each([
    [[], []],
    [from(0), from(0)],
    [from(1), from(1)],
    [from(1, 2), from(1)],
    [from(6, 3), from(3)],
    [from(0, 1, 2, 3), from(0, 1, 3)],
    [calculatedSimilarities, from(0, 1, 3, 5)],
    [calculateNova, fromNova(0, 1, 2, 3, 10, 11, 12, 13)],
  ])(``.replace(/\n/, ''), (comparers: Similarity[], expected: Similarity[]) => {
    // it(`unify() should be unify`, () => expect(unify(comparers)).toEqual(expected));
    it(`unify() should be unify`, () => expect(comparers.reduce(unify, [])).toEqual(expected.reduce(unify, [])));
  });
});
