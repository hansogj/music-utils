import { defined } from 'array.defined';

export type Parser = {
  matcher: RegExp;
  // selector: (selecFrom: RegExpMatchArray) => Array<string>;
  select: number[];
};

const selectFrom = (match: RegExpMatchArray, matches: number[]) =>
  match === null ? [] : matches.map((i) => match[i].split(/\s/).defined().join(' '));

export const regExp = (...expressions: RegExp[]) => new RegExp(expressions.map((exp) => exp.source).join(''));
export const applyMatch = (unparasedTrackName: string, matchers: Parser[]) =>
  matchers
    .filter(({ matcher }) => defined(unparasedTrackName) && matcher.test(unparasedTrackName))
    .last()
    .flatMap(({ matcher, select }: Parser) => selectFrom(unparasedTrackName.match(matcher), select));
