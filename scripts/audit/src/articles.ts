import { readFileSync } from 'node:fs';
import path from 'node:path';

import { userHome } from './env.js';

// music-utils' `artist.sortArticles` / `artist.articles`, read from the same files as rip
// and `music-utils tag album` (packages/music-utils/src/config/load.ts — keep in sync):
// ./music-utils.config.json, then ~/.music-utilsrc.json, then the defaults. With
// sortArticles on, music-utils tags "The Beatles" as "Beatles, The" (artistSortable() in
// album/parse.path.ts) and leaves the folder's name as it is; music-audit expects the same.

export interface ArticleSort {
  sortArticles: boolean;
  articles: string[];
}

export const DEFAULT_ARTICLE_SORT: ArticleSort = {
  sortArticles: false,
  articles: ['the', 'los', 'il', 'la', 'el', 'le'],
};

type ArtistConfig = { artist?: Partial<ArticleSort> };

function readArtistConfig(file: string): Partial<ArticleSort> | undefined {
  try {
    return (JSON.parse(readFileSync(file, 'utf8')) as ArtistConfig).artist;
  } catch {
    return undefined; // missing or unreadable: music-utils skips a missing file too
  }
}

export function loadArticleSort(cwd = process.cwd(), home = userHome()): ArticleSort {
  const fromHome = readArtistConfig(path.join(home, '.music-utilsrc.json'));
  const fromProject = readArtistConfig(path.join(cwd, 'music-utils.config.json'));
  const sortArticles = fromProject?.sortArticles ?? fromHome?.sortArticles;
  const articles = fromProject?.articles ?? fromHome?.articles;
  return {
    sortArticles: typeof sortArticles === 'boolean' ? sortArticles : DEFAULT_ARTICLE_SORT.sortArticles,
    articles:
      Array.isArray(articles) && articles.every((a) => typeof a === 'string')
        ? articles
        : DEFAULT_ARTICLE_SORT.articles,
  };
}

let current: ArticleSort | undefined;

/** The run's setting, read once. */
export function articleSort(): ArticleSort {
  current ??= loadArticleSort();
  return current;
}

/** Tests: use this setting instead of the config files. */
export function setArticleSort(sort: ArticleSort | undefined): void {
  current = sort;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A name and its trailing brackets: "The Dionysos [Canada]" → "The Dionysos", " [Canada]".
function splitBrackets(name: string): [string, string] {
  const brackets = name.match(/(\s*\[[^\]]*\])+\s*$/)?.[0] ?? '';
  return [name.slice(0, name.length - brackets.length).trim(), brackets.trimEnd()];
}

/**
 * The name as music-utils tags it: "The Beatles" → "Beatles, The" when sortArticles is on
 * (articles in any case, the artist's own casing kept); the folder's brackets stay last
 * ("Dionysos, The [Canada]"). Unchanged when off or without a leading article.
 */
export function sortArtist(name: string, sort: ArticleSort = articleSort()): string {
  if (!sort.sortArticles) return name;
  const [plain, brackets] = splitBrackets(name);
  for (const article of sort.articles) {
    const m = plain.match(new RegExp(`^(${escape(article)}) (.+)$`, 'i'));
    if (m) return `${m[2]}, ${m[1]}${brackets}`;
  }
  return name;
}

/** "Beatles, The" → "The Beatles": only a trailing configured article moves (not "Cow, Henry"). */
export function unsortArtist(name: string, sort: ArticleSort = articleSort()): string {
  const [plain, brackets] = splitBrackets(name);
  for (const article of sort.articles) {
    const m = plain.match(new RegExp(`^(.+), (${escape(article)})$`, 'i'));
    if (m) return `${m[2]} ${m[1]}${brackets}`;
  }
  return name;
}

/** "The Doors", "Doors, The" → "Doors": the name without a leading or trailing configured article. */
export function withoutArticle(name: string, sort: ArticleSort = articleSort()): string {
  const [plain, brackets] = splitBrackets(unsortArtist(name, sort));
  for (const article of sort.articles) {
    const m = plain.match(new RegExp(`^${escape(article)} (.+)$`, 'i'));
    if (m) return `${m[1]}${brackets}`;
  }
  return name;
}
