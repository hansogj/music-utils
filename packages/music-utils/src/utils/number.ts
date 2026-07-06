import './polyfills';

import { defined } from '@hansogj/array.utils';
import maybeOr from '@hansogj/maybe';

export const maybe = (num: string | number) =>
  maybeOr(num)
    .map((n) => `${n}`)
    .map(parseInt)
    .nothingIf(isNaN);

export const toIntOr = (num: string | number, or: number | undefined): number =>
  maybeOr(num)
    .map((n) => `${n}`)
    .map(parseInt)
    .nothingIf(isNaN)
    .valueOr(or) as number;

export const toInts =
  (or: number | undefined) =>
  (...nums: Array<string | number>) =>
    nums.map((num) => toIntOr(num, or));

export const numOrNull = toInts(0);

export const precedingZero = (discNumber: number, trackNumber: number) =>
  defined(discNumber) && trackNumber < 10 ? 0 : trackNumber < 10 && 0;

/** @deprecated Use toIntOr */
export const wov = toIntOr;
