import { defined } from 'array.defined';
import prompts, { Answers } from 'prompts';

import { Release } from '../types';
import { exit, info, json } from './color.log';

const questions: Release = {
  artist: '',
  album: '',
  year: undefined,
  discNumber: '1',
  noOfDiscs: '1',
  aux: '',
};

const isNumberic = (name: string) =>
  Object.keys(questions)
    .filter((_, i) => [2, 3, 4].includes(i))
    .includes(name);

const validate = (name: string, value: string) => {
  if (isNumberic(name)) {
    return value === '' || /^\d+$/.test(value) ? true : 'Numeric input only';
  }

  return true;
};

const verifyPrompt = async (release: Partial<Release>): Promise<Partial<Release>> => {
  json(release);
  const response: Answers<string> = await prompts({
    type: 'text',
    name: 'value',
    message: 'Is this right info? Y/N?',
    validate: (value: string) =>
      ['y', 'n', 'yes', 'no'].includes(value.toLowerCase()) ? true : `You have to respons YES or NO`,
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
  info('Type new record data. Leave blanc to keep data');

  const response: Answers<string> = await prompts(
    Object.entries({ ...questions, ...release }).map(([name, originalValue]) => ({
      name,
      message: `${name.toUpperCase()}: ${originalValue}`,
      type: 'text',
      validate: (value) => validate(name, value),
    }))
  );

  return {
    ...release,
    ...Object.entries(response).reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // eslint-disable-next-line
      (resu: any, [key, val]) => (defined(val) && (resu[key] = `${val}`), resu),
      {} as Partial<Release>
    ),
  };
};

export const userDefinedRelease = (release: Partial<Release>): Promise<Partial<Release>> =>
  userDefinedPrompt(release)
    .then((udr) => verifyPrompt(udr))
    .catch(() => userDefinedRelease(release));

export const albumPrompt = (album: Partial<Release>): Promise<Partial<Release>> =>
  verifyPrompt(album).catch(() => userDefinedRelease(album));
