import '../utils/polyfills';

import { defined } from '@hansogj/array.utils/lib/defined';

import { getAlbumDirectory, parseAlbumInfo } from '../album/parse.path';
import { renameFolder } from '../utils/path';
import { artistPrompt } from '../utils/prompt';
import { toLowerCase } from '../utils/string';

export const getArtistFolderName = (): Promise<string> => {
  const dirName = getAlbumDirectory();
  const { artist: target } = parseAlbumInfo(dirName);

  const [album, src, ...rest] = `${dirName}`.split('/').reverse();
  const root = rest.reverse().join('/');
  const shouldPrompt = defined(src) && defined(target) && toLowerCase(src) !== toLowerCase(target);

  return (
    shouldPrompt
      ? artistPrompt(src, target)
          .then(() => renameFolder(src, target, root).then(() => target))
          .catch(() => src)
      : Promise.resolve(target)
  ).then((artistName) => [root, artistName, album].join('/'));
};
