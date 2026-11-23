import { beforeEach } from 'vitest';

import { DEFAULT_ARTICLE_SORT, setArticleSort } from './articles.js';
import { setCollection } from './collection.js';

// Tests don't read ./music-utils.config.json or ~/.music-utilsrc.json: sortArticles off,
// unless a test sets it. Nor the user's Discogs collection CSV: none, unless a test sets one.
beforeEach(() => {
  setArticleSort(DEFAULT_ARTICLE_SORT);
  setCollection(undefined);
});
