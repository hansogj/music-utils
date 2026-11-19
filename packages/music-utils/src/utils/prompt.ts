import './polyfills';

import { defined } from '@hansogj/array.utils';
import prompts, { Answers } from 'prompts';

import { getConfig } from '../config/singleton';
import { Release } from '../types';
import { exit, info } from './color.log';
import { releaseTable } from './release-table';
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

/**
 * Cross-field check for the disc-info prompt: `noOfDiscs` (total) must be ≥ `discNumber`
 * (the disc currently being ripped/tagged). Blank inputs are treated as "keep original"
 * and fall back to the pre-prompt release values.
 */
export const validateCrossField = (
  name: Question,
  value: string,
  currentAnswers: Record<string, unknown> | undefined,
  original: Partial<Release>,
): true | string => {
  if (name !== 'noOfDiscs' || value === '') return true;

  const answerDisc = currentAnswers?.discNumber != null ? `${currentAnswers.discNumber}`.trim() : '';
  const rawDisc = answerDisc || original.discNumber || '';
  const disc = parseInt(rawDisc, 10);
  const total = parseInt(value, 10);

  if (Number.isFinite(disc) && Number.isFinite(total) && total < disc) {
    return `Total discs (${total}) must be ≥ current disc number (${disc})`;
  }

  return true;
};

const verifyPrompt = async (release: Partial<Release>): Promise<Partial<Release>> => {
  console.log(['', ...releaseTable(release, getConfig()), ''].join('\n'));

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

  // Only the editable fields: the rest of the release (Discogs IDs) is kept as it is.
  const editable = { ...questions, ...release };
  const response: Answers<string> = await prompts(
    (Object.keys(questions) as Question[]).map((name) => ({
      name,
      message: `${name.toUpperCase()}: ${editable[name] ?? ''}`,
      type: 'text',
      validate: (value: string, answers: Record<string, unknown>) => {
        const single = validate(name, value);
        if (single !== true) return single;
        return validateCrossField(name, value, answers, release);
      },
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

/** Discogs credits several artists: which name goes in the folder, ARTIST and ALBUMARTIST. */
export interface ArtistChoice {
  /** Discogs' first credited artist (default). */
  first: string;
  /** Every credit joined as Discogs shows it ("/" as ", "). */
  credit?: string;
}

/**
 * Asks which artist name to use, as music-audit does: Discogs' first artist (Enter), all
 * credits, or a name typed in. Without several credits there is nothing to ask.
 */
export const artistChoicePrompt = async ({ first, credit }: ArtistChoice): Promise<string> => {
  if (!credit || credit === first || process.env.NO_PROMPT) return first;

  const { value } = await prompts({
    type: 'select',
    name: 'value',
    message: 'Artist name for folder and tags',
    choices: [
      { title: `${first} (first credited artist)`, value: first },
      { title: `${credit} (all credits)`, value: credit },
      { title: 'Type a name', value: '' },
    ],
    initial: 0,
  });
  if (value === undefined) exit();
  if (value) return value;

  const typed = await prompts({ type: 'text', name: 'value', message: 'Artist', initial: first });
  if (typed.value === undefined) exit();
  return removeDoubleSpace(`${typed.value}`).trim() || first;
};
