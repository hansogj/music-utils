/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-plusplus */
/* eslint-disable no-param-reassign */
import { defined } from '@hansogj/array.utils/lib/defined';
import fs from 'fs';

import findSimilarArtists from '../similarities';
import { ArtistSimilarity } from '../similarities/types';
import { getCommandLineArgs } from '../utils/cmd.options';
import { info } from '../utils/color.log';
import { execute } from '../utils/execute';

const { dirA, dirB, threshold, fileName, ignore = [], quiet } = getCommandLineArgs();

const logger = quiet
  ? { ...global.console, time: () => {}, timeLog: () => {}, timeEnd: () => {}, info: () => {} }
  : console;

const writeToFile = (content: string) => fileName && fs.appendFileSync(fileName, content);
const format = (content: any) => `${JSON.stringify(content, null, 4)}`;

const appendArtistSimilarity = ({ artist, similarities }: ArtistSimilarity) =>
  artist && writeToFile(`${format({ artist, similarities })},`);

if (fileName) fs.writeFileSync(fileName, '');
writeToFile('[\n');
Promise.all([
  execute<string>(`find ${dirA} -maxdepth 1 -type d`),
  execute<string>(`find  ${dirB} -maxdepth 2 -mindepth 2 -type d`),
])
  .then((dirs: string[]) => dirs.map((dir) => dir.split(/\n/).defined()))
  .then(([lsDirA, lsDirB]: string[][]) => {
    findSimilarArtists(lsDirA, lsDirB, threshold, ignore, logger, fileName ? appendArtistSimilarity : undefined)
      .filter(({ similarities }) => defined(similarities))
      .forEach(({ artist, similarities }) => {
        info(artist);
        // eslint-disable-next-line no-console
        console.table(similarities);
      });
  })
  .finally(() => {
    if (fileName) writeToFile('\n]');
  });
