import { Tag } from '../types';
import { warning } from './color.log';

export const tagFile = (path: string, tag: Tag): Promise<Tag> => {
  warning(JSON.stringify(tag));
  return Promise.resolve(tag);
};
