import './polyfills';

import { defined } from '@hansogj/array.utils';
// @ts-expect-error TS1479: @inquirer/prompts is ESM-only but works at runtime via Node's interop
import { confirm, input } from '@inquirer/prompts';

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

  const confirmed = await confirm({
    message: 'Is this right info?',
    default: true,
  });

  if (confirmed) {
    return release;
  }

  throw new Error('Not wanted metadata');
};

export const userDefinedPrompt = async (release: Partial<Release>): Promise<Partial<Release>> => {
  info('Type new record data. Leave blank to keep data');

  const merged: Record<string, string> = {};
  const entries = Object.entries({ ...questions, ...release });

  for (const [name, originalValue] of entries) {
    try {
      const value = await input({
        message: `${name.toUpperCase()}: ${originalValue}`,
        validate: (val) => validate(name as Question, val),
      });

      if (defined(value)) {
        merged[name] = removeDoubleSpace(`${value}`);
      }
    } catch (_) {
      exit();
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
  confirm({
    message: `Rename ${src} > ${target}?`,
    default: true,
  }).then((value) => (value ? Promise.resolve(`${value}`) : Promise.reject(`${value}`)));
