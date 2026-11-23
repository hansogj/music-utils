import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { userHome } from './env.js';

// The user's Discogs collection, from the CSV export Discogs offers (Collection → Export):
// no requests, so the rate limit stays for the scan. Only digital releases count: the
// library holds digital versions, an LP in the collection says nothing about the files.

export interface OwnedRelease {
  releaseId: number;
  artist: string; // Discogs' numbers dropped: "Nucleus (3)" → "Nucleus"
  title: string;
  format: string; // the first format, its count dropped: "2xCD, Album" → "CD"
  year?: string;
}

export interface Collection {
  releases: OwnedRelease[];
  has(releaseId: number): boolean;
}

// The export's Format column: "CD, Album, RE", "2xCD, Comp", "HDCD, Album", "DVD, DVD-Audio",
// "2xLP + Box". A CD (2xCD, HDCD, CDr, SACD), a DVD-Audio or a download counts as digital.
// Shared with the search results' formats (discogs.ts isDigital()).
export const DIGITAL_FORMATS = new Set(['CD', 'CDr', 'HDCD', 'SACD', 'DVD-Audio', 'File']);
const formatParts = (format: string) =>
  format
    .split(/\s*,\s*|\s+\+\s+/)
    .map((p) => p.trim().replace(/^\d+x/, ''))
    .filter(Boolean);
export const isDigitalFormat = (format: string) => formatParts(format).some((p) => DIGITAL_FORMATS.has(p));

// RFC 4180: fields in double quotes may hold commas, newlines and "" for a quote.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') field += text[++i];
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',') endField();
    else if (c === '\n') endRow();
    else if (c !== '\r') field += c;
  }
  if (field || row.length > 0) endRow();
  return rows.filter((r) => r.some((f) => f.trim()));
}

const withoutDiscogsNumber = (artist: string) => artist.replace(/\s*\(\d+\)/g, '').trim();

export function collectionFromCsv(text: string): Collection {
  const [header = [], ...rows] = parseCsv(text.replace(/^\uFEFF/, ''));
  const col = (name: string) => header.indexOf(name);
  const [id, artist, title, format, released] = ['release_id', 'Artist', 'Title', 'Format', 'Released'].map(col);
  const byId = new Map<number, OwnedRelease>();
  for (const r of rows) {
    const releaseId = Number(r[id]);
    if (!releaseId || byId.has(releaseId) || !isDigitalFormat(r[format] ?? '')) continue;
    const year = r[released]?.trim();
    byId.set(releaseId, {
      releaseId,
      artist: withoutDiscogsNumber(r[artist] ?? ''),
      title: (r[title] ?? '').trim(),
      format: formatParts(r[format] ?? '').find((p) => DIGITAL_FORMATS.has(p)) ?? '',
      ...(year && year !== '0' ? { year } : {}),
    });
  }
  return { releases: [...byId.values()], has: (releaseId) => byId.has(releaseId) };
}

// DISCOGS_COLLECTION_CSV (shared .env or environment), else the newest Discogs export
// ("hansogj-collection-20261123-0623.csv") in ~/.config/music-utils/.
export function collectionCsvPath(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const set = env['DISCOGS_COLLECTION_CSV']?.trim();
  if (set) return set;
  const dir = path.join(userHome(env), '.config', 'music-utils');
  try {
    return readdirSync(dir)
      .filter((f) => /-collection-.*\.csv$/i.test(f))
      .map((f) => path.join(dir, f))
      .map((p) => ({ p, mtime: statSync(p).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)[0]?.p;
  } catch {
    return undefined;
  }
}

let loaded: Collection | undefined | null = null; // null = not read yet

// The collection, read once per run; undefined without a CSV (or one that can't be read).
export function getCollection(): Collection | undefined {
  if (loaded !== null) return loaded;
  const file = collectionCsvPath();
  try {
    loaded = file ? collectionFromCsv(readFileSync(file, 'utf8')) : undefined;
  } catch {
    loaded = undefined;
  }
  return loaded;
}

// Tests: a collection of their own, or none (undefined); null reads the CSV again.
export function setCollection(collection: Collection | undefined | null): void {
  loaded = collection;
}

// Case, punctuation and Discogs' numbers aside; any script's letters count.
const key = (s: string) =>
  withoutDiscogsNumber(s)
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');

// The owned digital releases of an album: artist and title as the folder names them
// ("Dionysos [Canada]": brackets left out; the title without year, parentheses and brackets,
// compared with the collection's title likewise).
export function ownedReleasesOf(collection: Collection, artist: string, albumTitle: string): OwnedRelease[] {
  const wantArtist = key(artist.replace(/(\s*\[[^\]]*\])+\s*$/, ''));
  const wantTitle = key(albumTitle);
  if (!wantArtist || !wantTitle) return [];
  return collection.releases.filter(
    (r) => key(r.artist) === wantArtist && key(r.title.replace(/\s*\([^)]+\)\s*/g, ' ')) === wantTitle,
  );
}
