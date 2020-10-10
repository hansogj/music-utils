import prompts, { Answers } from 'prompts';

import { Release } from '../types';
import { exit, info, json } from './color.log';

const verify = async (release: Partial<Release>): Promise<Partial<Release>> => {
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

const userDefinedRelease = async (release: Partial<Release>): Promise<Partial<Release>> => {
  info('Type new record data. Leave blanc to keep data');

  const questions: Release = {
    artist: '',
    album: '',
    year: '',
    discnumber: '1',
    noOfDiscs: '1',
  };
  const response: Answers<string> = await prompts(
    Object.entries({ ...questions, ...release }).map(([name, value]) => ({
      name,
      message: `${name.toUpperCase()}: ${value}`,
      type: 'text', //= > (['artist', 'album'].includes(q) ? 'text' : 'number'),
    }))
  );

  return { ...release, ...response };
};

const udrAlbum = (release: Partial<Release>): Promise<Partial<Release>> =>
  userDefinedRelease(release)
    .then((udr) => verify(udr))
    .catch(() => udrAlbum(release));

export const albumPrompt = (album: Partial<Release>): Promise<Partial<Release>> =>
  verify(album).catch(() => udrAlbum(album));
