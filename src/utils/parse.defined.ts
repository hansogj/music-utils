/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-restricted-globals */
import './polyfills';

const numberParser = (num: string | number, or: number | undefined): number => {
  return [num]
    .defined()
    .map((n) => `${n}`)
    .map(parseInt)
    .filter((e) => !isNaN(e))
    .onEmpty((o: any[]) => o.push(or))
    .shift();
};

export const generator = (or: number | undefined) => (...nums: Array<string | number>) =>
  nums.map((num) => numberParser(num, or));

export const numOrNull = generator(0);

export default numberParser;
