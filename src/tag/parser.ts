import { defined } from '@hansogj/array.utils';

export const singleSpace = (str = '') => str.split(/\s/).defined().join(' ');

export type Parser = {
  matcher: RegExp;
  select: number[];
};

const selectFrom = (match: RegExpMatchArray, matches: number[]) =>
  match === null ? [] : matches.map((i) => singleSpace(match[i]));

export const regExp = (...expressions: RegExp[]) => new RegExp(expressions.map((exp) => exp.source).join(''));
export const applyMatch = (unparasedTrackName: string, matchers: Parser[]) =>
  matchers
    .filter(({ matcher }) => defined(unparasedTrackName) && matcher.test(unparasedTrackName))
    .last()
    .flatMap(({ matcher, select }: Parser) => selectFrom(unparasedTrackName.match(matcher), select));
