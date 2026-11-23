import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  collectionCsvPath,
  collectionFromCsv,
  getCollection,
  isDigitalFormat,
  ownedReleasesOf,
  parseCsv,
  setCollection,
} from './collection.js';

// The columns of Discogs' collection export, in its order; made-up rows.
const HEADER =
  'Catalog#,Artist,Title,Label,Format,Rating,Released,release_id,CollectionFolder,Date Added,' +
  'Collection Media Condition,Collection Sleeve Condition,Collection Origin,Collection Placement,' +
  'Collection Subfolder,Collection Notes';
const row = (artist: string, title: string, format: string, id: number, released = '1990', folder = 'CD Shelf') =>
  [
    'X-1',
    artist,
    title,
    'Label',
    format,
    '',
    released,
    String(id),
    folder,
    '2020-01-01 10:00:00',
    '',
    '',
    '',
    '',
    '',
    '',
  ]
    .map((f) => (/[",\n]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f))
    .join(',');
const csv = (...rows: string[]) => [HEADER, ...rows].join('\n') + '\n';

afterEach(() => {
  vi.unstubAllEnvs();
  setCollection(undefined);
});

describe('parseCsv', () => {
  it('reads quoted fields with commas, quotes and newlines, and CRLF line ends', () => {
    expect(parseCsv('a,"b, c","say ""hi""","two\nlines"\r\nd,e,f,g\r\n')).toEqual([
      ['a', 'b, c', 'say "hi"', 'two\nlines'],
      ['d', 'e', 'f', 'g'],
    ]);
  });
});

describe('isDigitalFormat', () => {
  it('counts CDs (any number, HDCD, CDr, SACD), DVD-Audio and File', () => {
    const digital = ['CD, Album, RE', '2xCD, Comp', 'HDCD, Album', 'CDr, Album', 'SACD, Hybrid', 'DVD, DVD-Audio'];
    expect(digital.map(isDigitalFormat)).toEqual(digital.map(() => true));
    expect(isDigitalFormat('File, FLAC, Album')).toBe(true);
  });

  it('leaves out vinyl, singles, cassettes and video DVDs', () => {
    const other = ['LP, Album', '2xLP + Box', '7", Single', '12", 45 RPM', 'Cass, Album', 'DVD, NTSC'];
    expect(other.map(isDigitalFormat)).toEqual(other.map(() => false));
  });
});

describe('collectionFromCsv', () => {
  it('keeps the digital releases once each, without Discogs numbers or a 0 year', () => {
    const c = collectionFromCsv(
      csv(
        row('Nucleus (3)', 'Elastic Rock', '2xCD, Album, RE', 11),
        row('Nucleus (3)', 'Elastic Rock', 'LP, Album', 12, '1970', 'LP Shelf'),
        row('Sigur Rós', 'Ágætis Byrjun', 'CD, Album, Dig', 13, '0'),
        row('Sigur Rós', 'Ágætis Byrjun', 'CD, Album, Dig', 13, '0', 'Dupes'),
      ),
    );
    expect(c.releases).toEqual([
      { releaseId: 11, artist: 'Nucleus', title: 'Elastic Rock', format: 'CD', year: '1990' },
      { releaseId: 13, artist: 'Sigur Rós', title: 'Ágætis Byrjun', format: 'CD' },
    ]);
    expect([c.has(11), c.has(12), c.has(13)]).toEqual([true, false, true]);
  });

  it('reads an export that starts with a byte order mark', () => {
    expect(collectionFromCsv('﻿' + csv(row('A', 'B', 'CD', 1))).has(1)).toBe(true);
  });
});

describe('ownedReleasesOf', () => {
  const c = collectionFromCsv(
    csv(
      row('Andy Summers, Robert Fripp', 'I Advance Masked', 'CD, Album, RE', 21),
      row('Dionysos (3)', 'Western Sous La Neige', 'CD, Album', 22),
      row('Yes', 'Fragile (Remastered)', 'CD, Album, RE', 23),
      row('Yes', 'Fragile', 'File, FLAC', 24),
      row('Yes', 'Close To The Edge', 'CD, Album', 25),
    ),
  );
  const ids = (artist: string, title: string) => ownedReleasesOf(c, artist, title).map((r) => r.releaseId);

  it('matches artist and title, case and punctuation aside', () => {
    expect(ids('Andy Summers & Robert Fripp', 'I Advance Masked')).toEqual([21]);
    expect(ids('YES', 'close to the edge')).toEqual([25]);
  });

  it('leaves out the artist folder’s brackets and Discogs’ numbers, and the title’s parentheses', () => {
    expect(ids('Dionysos [Canada]', 'Western Sous La Neige')).toEqual([22]);
    expect(ids('Yes', 'Fragile')).toEqual([23, 24]);
  });

  it('finds nothing for another album or an empty name', () => {
    expect(ids('Yes', 'Relayer')).toEqual([]);
    expect(ids('', 'Fragile')).toEqual([]);
  });
});

describe('collectionCsvPath / getCollection', () => {
  const home = () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'collection-test-'));
    vi.stubEnv('HOME', dir);
    vi.stubEnv('DISCOGS_COLLECTION_CSV', '');
    mkdirSync(path.join(dir, '.config', 'music-utils'), { recursive: true });
    return path.join(dir, '.config', 'music-utils');
  };

  it('takes DISCOGS_COLLECTION_CSV when set', () => {
    vi.stubEnv('DISCOGS_COLLECTION_CSV', '/somewhere/mine.csv');
    expect(collectionCsvPath()).toBe('/somewhere/mine.csv');
  });

  it('else the newest Discogs export in ~/.config/music-utils', () => {
    const dir = home();
    expect(collectionCsvPath()).toBeUndefined();
    writeFileSync(path.join(dir, 'me-collection-20250101-1000.csv'), csv());
    writeFileSync(path.join(dir, 'me-collection-20261123-0623.csv'), csv());
    writeFileSync(path.join(dir, 'notes.csv'), '');
    utimesSync(path.join(dir, 'me-collection-20250101-1000.csv'), new Date(2025, 0, 1), new Date(2025, 0, 1));
    expect(collectionCsvPath()).toBe(path.join(dir, 'me-collection-20261123-0623.csv'));
  });

  it('reads the CSV once per run, and is undefined without one', () => {
    const dir = home();
    setCollection(null);
    expect(getCollection()).toBeUndefined();
    setCollection(null);
    writeFileSync(path.join(dir, 'me-collection-20261123-0623.csv'), csv(row('A', 'B', 'CD', 31)));
    expect(getCollection()?.has(31)).toBe(true);
    writeFileSync(path.join(dir, 'me-collection-20261123-0623.csv'), csv());
    expect(getCollection()?.has(31)).toBe(true);
  });
});
