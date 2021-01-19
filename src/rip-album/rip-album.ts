import { Release } from '../types';
import { exit, info } from '../utils/color.log';
import { albumPrompt } from '../utils/prompt';

export const ripAlbum = () => {
  albumPrompt({}).then(({ artist, album, year, discnumber, noOfDiscs }: Partial<Release>) => {
    const vitals = [artist, album, year].filter((tagInfo) => !tagInfo);

    if (vitals.length) {
      exit('Cannot rip album with missing vitals');
    }

    const discNumAsString = discnumber ? `(disc ${[discnumber, noOfDiscs].defined().join('/')})` : '';
    info(`mkdir : ./${artist}/${[year, album, discNumAsString].defined().join(' ')} `);
  });
};
