import { Tag } from '../types';
import { warning } from './color.log';

export const tagFile = (path: string, { artist, album, trackName, fileType }: Tag) => {
  return warning(JSON.stringify({ artist, album, trackName, fileType }));
};
