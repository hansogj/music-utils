import { ArtistSimilarity, Similarity } from './types';
import { findSimToOther, getArtistCombination, unify } from './utils';

export const findSimilaritiesAmongArtists = (
  dirA: string[],
  dirB: string[],
  threshold: number,
  ignore: string[],
  logger: typeof console,
  persist?: (artistSimilarity: ArtistSimilarity) => void,
): ArtistSimilarity[] => {
  const timerKey = 'find similarities among all artists';
  logger.time(timerKey);

  const result: ArtistSimilarity[] = dirA
    .filter((artist) => !ignore.includes(artist))
    .map((artist: string) => {
      const dirBFiltered = dirB.filter((d) => d !== artist);
      logger.timeLog(timerKey);
      const timerKeyArtist = `\tfind similarities to ${artist}`;
      logger.time(timerKeyArtist);
      const similarities: Similarity[] =
        artist.split(' ').length > 4
          ? findSimToOther(artist, dirBFiltered, threshold).filter((sim) => !(sim.combination === sim.other))
          : getArtistCombination(artist)
              .flatMap((artistCombination: string) => {
                logger.timeLog(timerKeyArtist);
                return findSimToOther(artistCombination, dirBFiltered, threshold);
              })
              .sort((a, b) => `${a.similarity}`.localeCompare(`${b.similarity}`))
              .reduce(unify, [])
              .defined()
              .reverse();

      logger.timeEnd(timerKeyArtist);
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      persist && similarities.length && persist({ artist, similarities });
      return { artist, similarities };
    });
  logger.timeEnd(timerKey);
  return result;
};
