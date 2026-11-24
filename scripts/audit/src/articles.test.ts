import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_ARTICLE_SORT, loadArticleSort, sortArtist, unsortArtist, withoutArticle } from './articles.js';

const on = { sortArticles: true, articles: ['the', 'los', 'le'] };

describe('sortArtist', () => {
  it("moves a leading article last when sortArticles is on, keeping the artist's casing and brackets", () => {
    expect(sortArtist('The Beatles', on)).toBe('Beatles, The');
    expect(sortArtist('the beatles', on)).toBe('beatles, the');
    expect(sortArtist('Los Lobos', on)).toBe('Lobos, Los');
    expect(sortArtist('The Dionysos [Canada]', on)).toBe('Dionysos, The [Canada]');
  });

  it('leaves the name alone when off, without an article, or already sorted', () => {
    expect(sortArtist('The Beatles', DEFAULT_ARTICLE_SORT)).toBe('The Beatles');
    expect(sortArtist('Theatre of Hate', on)).toBe('Theatre of Hate');
    expect(sortArtist('Beatles, The', on)).toBe('Beatles, The');
  });
});

describe('unsortArtist', () => {
  it('puts a trailing configured article first again, and nothing else', () => {
    expect(unsortArtist('Beatles, The [UK]', on)).toBe('The Beatles [UK]');
    expect(unsortArtist('Cow, Henry', on)).toBe('Cow, Henry');
    expect(unsortArtist('Crosby, Stills, Nash & Young', on)).toBe('Crosby, Stills, Nash & Young');
  });
});

describe('withoutArticle', () => {
  it('drops a leading or trailing configured article, whether sortArticles is on or not', () => {
    expect(withoutArticle('The Don Rendell / Ian Carr Quintet', on)).toBe('Don Rendell / Ian Carr Quintet');
    expect(withoutArticle('Doors, The', DEFAULT_ARTICLE_SORT)).toBe('Doors');
    expect(withoutArticle('The Dionysos [Canada]', on)).toBe('Dionysos [Canada]');
    expect(withoutArticle('Theatre of Hate', on)).toBe('Theatre of Hate');
  });
});

describe('loadArticleSort', () => {
  let cwd: string;
  let home: string;
  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'articles-cwd-'));
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'articles-home-'));
  });
  afterEach(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });
  const write = (dir: string, file: string, artist: object) =>
    fs.writeFileSync(path.join(dir, file), JSON.stringify({ artist }));

  it('uses the defaults without config files', () => {
    expect(loadArticleSort(cwd, home)).toEqual(DEFAULT_ARTICLE_SORT);
  });

  it('reads ~/.music-utilsrc.json, with ./music-utils.config.json first, per key', () => {
    write(home, '.music-utilsrc.json', { sortArticles: true, articles: ['the'] });
    expect(loadArticleSort(cwd, home)).toEqual({ sortArticles: true, articles: ['the'] });
    write(cwd, 'music-utils.config.json', { sortArticles: false });
    expect(loadArticleSort(cwd, home)).toEqual({ sortArticles: false, articles: ['the'] });
  });

  it('ignores a broken file or wrong types', () => {
    fs.writeFileSync(path.join(home, '.music-utilsrc.json'), '{ nope');
    write(cwd, 'music-utils.config.json', { sortArticles: 'yes', articles: [1] });
    expect(loadArticleSort(cwd, home)).toEqual(DEFAULT_ARTICLE_SORT);
  });
});
