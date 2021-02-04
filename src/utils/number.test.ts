/* eslint-disable @typescript-eslint/no-explicit-any */
import { maybe } from './number';

describe.each([
  [undefined, undefined, undefined],
  [undefined, 0, 0],
  [0, 0, 0],
  ['1', 0, 1],
  ['a', 0, 0],
  ['a', undefined, undefined],
])('when num is %o and fallback is %o ', (num: any, or: any, expected: number) => {
  it(`parse should result ${expected}`, () => expect(maybe(num).valueOr(or)).toEqual(expected));
});
