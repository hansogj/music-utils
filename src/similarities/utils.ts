/* eslint-disable no-plusplus */
/* eslint-disable no-param-reassign */

import '@hansogj/array.utils';

import { defined } from '@hansogj/array.utils/lib/defined';

import { BLACK_LIST_SIMILAR_WORD } from '../constants';
import { Similarity } from './types';

const editDistance = (s1: string, s2: string) => {
  s1 = s1.toLowerCase().trim();
  s2 = s2.toLowerCase().trim();

  // eslint-disable-next-line no-array-constructor
  const costs = [];

  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;

    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) costs[j] = j;
      else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }

    if (i > 0) costs[s2.length] = lastValue;
  }

  return costs[s2.length];
};

export const equalityLevel = (s1: string, s2: string) => {
  const [longer, shorter] = [`${s1}`, `${s2}`]
    .sort((a, b) => a.length - b.length)
    .map((param) => param.split('/').pop());
  const longerLength = longer.length;
  //  console.log(JSON.stringify({ s1, s2 }));

  if (longerLength === 0) {
    return 1.0;
  }

  const intersection =
    longer.split(' ').reduce((curr, n) => {
      curr = shorter.split(' ').includes(n) ? curr + 1 : curr;
      return curr;
    }, 0) / longer.split(' ').length;

  const distance = (longerLength - editDistance(longer, shorter)) / parseFloat(`${longerLength}`);
  //  console.log(JSON.stringify({ intersection, distance, max: Math.max(intersection, distance) }));

  return Math.max(intersection, distance);
};

const permute = (arr: string[]) => {
  const res: string[] = [];

  const permutations = (len: number, val: string, existing: boolean[]) => {
    if (len === 0) {
      res.push(val);
      return;
    }

    arr.forEach((_, i) => {
      // so that we do not repeat the item, using an array here makes it           O(1) operation
      if (!existing[i]) {
        existing[i] = true;
        permutations(len - 1, [val, arr[i]].defined().join(' '), existing);
        existing[i] = false;
      }
    });
  };

  arr.forEach((_, i) => permutations(arr.length - i, '', []));

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

const skipPrecedingFolders = (other: string) =>
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
      other: skipPrecedingFolders(other),
      similarity: parseFloat(equalityLevel(combination, other).toFixed(2)),
    }))
    .filter(({ similarity }) => similarity > threshold);
