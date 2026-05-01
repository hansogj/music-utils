import './polyfills';

import { defined } from '@hansogj/array.utils';
import prompts, { Answers } from 'prompts';

import { Release } from '../types';
import { exit, info, json } from './color.log';
import { removeDoubleSpace } from './string';

const questions: Release = {
  artist: '',
  album: '',
  year: undefined,
  discNumber: '1',
  noOfDiscs: '1',
  aux: '',
};
export type Question = keyof typeof questions;

const numericFields: Question[] = ['year', 'discNumber', 'noOfDiscs'];
const isNumeric = (name: Question) => numericFields.includes(name);

export const validate = (name: Question, value: string) => {
  if (isNumeric(name)) {
    return value === '' || /^\d+$/.test(value) ? true : 'Numeric input only';
  }

  return true;
};

const verifyPrompt = async (release: Partial<Release>): Promise<Partial<Release>> => {
  json(release);

  if (process.env.NO_PROMPT) {
    return release;
  }

  const response: Answers<string> = await prompts({
    type: 'text',
    name: 'value',
    message: 'Is this right info? Y/N?',
    validate: (value: string) =>
      ['y', 'n', 'yes', 'no'].includes(value.toLowerCase()) ? true : `You have to response YES or NO`,
  });

  if (response.value === undefined) {
    exit();
  }

  if (/y/.test(response.value.toLowerCase())) {
    return release;
  }

  throw new Error('Not wanted metadata');
};

export const userDefinedPrompt = async (release: Partial<Release>): Promise<Partial<Release>> => {
  info('Type new record data. Leave blank to keep data');

  const response: Answers<string> = await prompts(
    Object.entries({ ...questions, ...release }).map(([name, originalValue]) => ({
      name,
      message: `${name.toUpperCase()}: ${originalValue}`,
      type: 'text',
      validate: (value) => validate(name as Question, value),
    })),
  );

  const merged: Record<string, string> = {};

  for (const [key, val] of Object.entries(response)) {
    if (defined(val)) {
      merged[key] = removeDoubleSpace(`${val}`);
    }
  }

  return { ...release, ...merged };
};

const MAX_RETRIES = 5;

export const userDefinedRelease = (release: Partial<Release>, retries = MAX_RETRIES): Promise<Partial<Release>> =>
  userDefinedPrompt(release)
    .then((udr) => verifyPrompt(udr))
    .catch(() => {
      if (retries <= 0) {
        exit('Too many retries. Exiting.');
      }

      return userDefinedRelease(release, retries - 1);
    });

export const albumPrompt = (album: Partial<Release>): Promise<Partial<Release>> =>
  verifyPrompt(album).catch(() => userDefinedRelease(album));

export const artistPrompt = (src: string, target: string): Promise<string> =>
  prompts({
    type: 'confirm',
    name: 'value',
    message: `Rename ${src} > ${target}?`,
    initial: true,
  }).then(({ value }) => (value ? Promise.resolve(value) : Promise.reject(value)));
