import { describe, expect, it } from 'vitest';

import { parsePastedTracklist } from './paste.js';

const brief = (lines: string[], disc?: number) =>
  parsePastedTracklist(lines, disc).map(({ disc, no, title, duration }) => [disc, no, title, duration]);

describe('parsePastedTracklist', () => {
  it('numbers plain titles by line order', () => {
    expect(brief(['Roundabout', 'Cans and Brahms', '', 'We Have Heaven'])).toEqual([
      [1, 1, 'Roundabout', undefined],
      [1, 2, 'Cans and Brahms', undefined],
      [1, 3, 'We Have Heaven', undefined],
    ]);
  });

  it('reads track numbers in common shapes and drops durations', () => {
    expect(brief(['1. Roundabout 8:29', '02 - Cans and Brahms (1:38)', '3\tWe Have Heaven\t1:40'])).toEqual([
      [1, 1, 'Roundabout', '8:29'],
      [1, 2, 'Cans and Brahms', '1:38'],
      [1, 3, 'We Have Heaven', '1:40'],
    ]);
  });

  it('numbers vinyl sides by order', () => {
    expect(brief(['A1 Roundabout', 'A2 Cans and Brahms', 'B1 South Side of the Sky'])).toEqual([
      [1, 1, 'Roundabout', undefined],
      [1, 2, 'Cans and Brahms', undefined],
      [1, 3, 'South Side of the Sky', undefined],
    ]);
  });

  it('reads disc and track from "1-03", "CD2-01" and "d2t01"', () => {
    expect(brief(['1-01 Siberian Khatru', '2-01 And You and I'])).toEqual([
      [1, 1, 'Siberian Khatru', undefined],
      [2, 1, 'And You and I', undefined],
    ]);
    expect(brief(['d1t01 Siberian Khatru', 'd2t01 And You and I']).map((t) => t[0])).toEqual([1, 2]);
    expect(brief(['CD1-1 Siberian Khatru', 'CD2-1 And You and I']).map((t) => t[0])).toEqual([1, 2]);
  });

  it('keeps numbers that start titles when not every line has a position', () => {
    expect(brief(['99 Problems', 'Dirt Off Your Shoulder']).map((t) => t[2])).toEqual([
      '99 Problems',
      'Dirt Off Your Shoulder',
    ]);
    expect(brief(['A Day in the Life', 'Lovely Rita']).map((t) => t[2])).toEqual(['A Day in the Life', 'Lovely Rita']);
  });

  it('drops an artist every line starts with', () => {
    expect(brief(['1. Yes - Roundabout', '2. Yes - Heart of the Sunrise']).map((t) => t[2])).toEqual([
      'Roundabout',
      'Heart of the Sunrise',
    ]);
    expect(brief(['1. Opening - Siberian Khatru', '2. Roundabout']).map((t) => t[2])).toEqual([
      'Opening - Siberian Khatru',
      'Roundabout',
    ]);
  });

  it('puts one pasted disc on the folder’s disc', () => {
    expect(brief(['1. And You and I', '2. Close to the Edge'], 2).map((t) => [t[0], t[1]])).toEqual([
      [2, 1],
      [2, 2],
    ]);
  });

  it('is empty for no lines', () => {
    expect(parsePastedTracklist(['', '  '])).toEqual([]);
  });
});
