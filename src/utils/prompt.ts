import prompts, { Answers } from 'prompts';
import { isJSDocNamepathType } from 'typescript';

import { Release } from '../types';
import { info, json } from './color.log';

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
    process.exit(0);
  }

  if (/y/.test(response.value.toLowerCase())) {
    return release;
  }

  throw new Error('Not wanted metadata');
};

const userDefinedRelease = async (release: Partial<Release>): Promise<Partial<Release>> => {
  info('Type new record data. Leave blanc to keep data');
  const response: Answers<string> = await prompts(
    Object.entries(release).map(([name, value]) => ({
      name,
      message: `${name.toUpperCase()}: ${value}`,
      type: 'text', //= > (['artist', 'album'].includes(q) ? 'text' : 'number'),
    }))
  );

  return Object.keys(release).reduce((res, key: string) => {
    // @ts-ignore
    res[key] = response[key] || release[key];
    return res;
  }, {} as Partial<Release>);
};

const udrAlbum = (release: Partial<Release>): Promise<Partial<Release>> =>
  userDefinedRelease(release)
    .then((udr) => verify(udr))
    .catch(() => udrAlbum(release));

export const albumPrompt = (album: Partial<Release>): Promise<Partial<Release>> =>
  verify(album).catch(() => udrAlbum(album));
