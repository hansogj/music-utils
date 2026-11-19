import { beforeEach } from 'vitest';

import { DEFAULT_ARTICLE_SORT, setArticleSort } from './articles.js';

// Tests don't read ./music-utils.config.json or ~/.music-utilsrc.json: sortArticles off,
// unless a test sets it.
beforeEach(() => setArticleSort(DEFAULT_ARTICLE_SORT));
