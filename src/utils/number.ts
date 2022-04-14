/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-restricted-globals */
import './polyfills';

import { defined } from '@hansogj/array.utils/lib/defined';
import maybeOr from 'maybe-for-sure';

export const maybe = (num: string | number) =>
  maybeOr(num)
    .map((n) => `${n}`)
    .map(parseInt)
    .nothingIf(isNaN);

export const wov = (num: string | number, or: number | undefined): number =>
  maybeOr(num)
    .map((n) => `${n}`)
    .map(parseInt)
    .nothingIf(isNaN)
    .valueOr(or) as number;

export const generator =
  (or: number | undefined) =>
  (...nums: Array<string | number>) =>
    nums.map((num) => wov(num, or));

export const numOrNull = generator(0);

export const precedingZero = (discNumber: number, trackNumber: number) =>
  defined(discNumber) && trackNumber < 10 ? 0 : trackNumber < 10 && 0;
