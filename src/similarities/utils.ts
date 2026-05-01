import { defined } from '@hansogj/array.utils';

import { BLACK_LIST_SIMILAR_WORD } from '../constants';
import { Similarity } from './types';

const editDistance = (rawS1: string, rawS2: string) => {
  const s1 = rawS1.toLowerCase().trim();
  const s2 = rawS2.toLowerCase().trim();

  const costs: number[] = [];

  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;

    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];

        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(newValue, lastValue, costs[j]) + 1;
        }

        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }

    if (i > 0) costs[s2.length] = lastValue;
  }

  return costs[s2.length];
};

export const equalityLevel = (s1: string, s2: string) => {
  const [longer, shorter] = [`${s1}`, `${s2}`].sort((a, b) => a.length - b.length).map((p) => p.split('/').pop());
  const longerLength = longer.length;

  if (longerLength === 0) {
    return 1.0;
  }

  const longerWords = longer.split(' ');
  const shorterWords = shorter.split(' ');
  const intersection =
    longerWords.reduce((curr, word) => (shorterWords.includes(word) ? curr + 1 : curr), 0) / longerWords.length;

  const distance = (longerLength - editDistance(longer, shorter)) / longerLength;

  return Math.max(intersection, distance);
};

const permute = (arr: string[]) => {
  const res: string[] = [];

  const permutations = (len: number, val: string, existing: boolean[]) => {
    if (len === 0) {
      res.push(val);
      return;
    }

    for (let i = 0; i < arr.length; i++) {
      if (!existing[i]) {
        existing[i] = true;
        permutations(len - 1, [val, arr[i]].defined().join(' '), existing);
        existing[i] = false;
      }
    }
  };

  for (let i = 0; i < arr.length; i++) {
    permutations(arr.length - i, '', []);
  }

  return res.sort();
};

export const unify = (acc: Similarity[], current: Similarity) => {
  const indexOfEqualOther = acc
    .map((added: Similarity, i) => (added.other === current.other ? i : undefined))
    .defined()
    .shift();

  if (!defined(indexOfEqualOther)) {
    acc.push(current);
  } else if (acc[indexOfEqualOther].similarity < current.similarity) {
    acc.splice(indexOfEqualOther, 1, current);
  }

  return acc;
};

export const getArtistCombination = (artist: string) => {
  const splits: string[] = artist.split('/').pop().split(',').join(' ').split(' ').defined();
  return permute(splits).filter((permutation) => !BLACK_LIST_SIMILAR_WORD.includes(permutation.toLocaleLowerCase()));
};

const getLastPathSegments = (other: string) =>
  other
    .split('/')
    .defined()
    .filter((_, i, self) => (self.length > 2 ? i > self.length - 3 : true))
    .join('/');

export const findSimToOther = (combination: string, fromDirectory: string[], threshold: number): Similarity[] =>
  fromDirectory
    .defined()
    .map((other) => ({
      combination,
      other: getLastPathSegments(other),
      similarity: parseFloat(equalityLevel(combination, other).toFixed(2)),
    }))
    .filter(({ similarity }) => similarity > threshold);
