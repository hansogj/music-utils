import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AlbumLayout } from './types.js';

// Each fake track holds its tags as JSON.
vi.mock('./tags.js', () => ({
  readTags: async (filePath: string) => {
    const raw = await fs.readFile(filePath, 'utf8');
    return raw === 'unreadable' ? { tags: {}, error: 'bad file' } : { tags: JSON.parse(raw) };
  },
}));

const searchDiscogs = vi.fn();
const fetchOriginalYear = vi.fn();
vi.mock('./discogs.js', () => ({
  searchDiscogs: (...args: unknown[]) => searchDiscogs(...args),
  fetchOriginalYear: (...args: unknown[]) => fetchOriginalYear(...args),
}));

const { auditAlbum, readTracks } = await import('./audit-album.js');

const TAGGED = { title: 'Song', artist: 'Band', album: 'Record', year: '1970', trackNo: '1' };

let root: string;
let layout: AlbumLayout;

async function track(name: string, tags: object | string) {
  await fs.writeFile(path.join(layout.albumPath, name), typeof tags === 'string' ? tags : JSON.stringify(tags));
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-album-'));
  const albumPath = path.join(root, 'B', 'Band', '1970 Record');
  await fs.mkdir(albumPath, { recursive: true });
  layout = { letterDir: 'B', artistName: 'Band', albumFolder: '1970 Record', albumPath };
  searchDiscogs.mockReset().mockResolvedValue([{ id: 1, title: 'Band - Record', releaseUrl: 'u' }]);
  fetchOriginalYear.mockReset();
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('readTracks', () => {
  it('reads tags and the name parsed from the file name, keeping read errors', async () => {
    await track('01 - Song.mp3', TAGGED);
    await track('02 - Other.flac', 'unreadable');
    await track('cover.jpg', '');
    const tracks = await readTracks(layout);
    expect(tracks.map((t) => [t.fileName, t.ext, t.parsedName, t.tagReadError])).toEqual([
      ['01 - Song.mp3', 'mp3', 'Song', undefined],
      ['02 - Other.flac', 'flac', 'Other', 'bad file'],
    ]);
  });
});

describe('auditAlbum', () => {
  it('passes a clean album without asking Discogs', async () => {
    await track('01 - Song.mp3', TAGGED);
    const audit = await auditAlbum(layout, { token: 't' });
    expect(audit.issues).toEqual([]);
    expect(audit.discogsResults).toBeUndefined();
    expect(searchDiscogs).not.toHaveBeenCalled();
  });

  it('groups tag issues per album', async () => {
    await track('01 - Song.mp3', { title: 'Song' });
    await track('02 - Other.mp3', {});
    const audit = await auditAlbum(layout);
    expect(audit.issues.map((i) => i.code)).toEqual(['NO_TAGS', 'MISSING_TAGS']);
  });

  it('searches Discogs for albums with issues, or always with searchAlways', async () => {
    await track('01 - Song.mp3', { title: 'Song' });
    const audit = await auditAlbum(layout, { token: 't' });
    expect(audit.discogsResults).toHaveLength(1);
    expect(searchDiscogs).toHaveBeenCalledWith('Band', '1970 Record', 't', ['Song']);

    await track('01 - Song.mp3', TAGGED);
    expect((await auditAlbum(layout, { token: 't', searchAlways: true })).discogsResults).toHaveLength(1);
  });

  it('does not search on a re-scan (search: false), with skipDiscogs, or without a token', async () => {
    await track('01 - Song.mp3', { title: 'Song' });
    await auditAlbum(layout, { token: 't', search: false });
    await auditAlbum(layout, { token: 't', skipDiscogs: true });
    await auditAlbum(layout);
    expect(searchDiscogs).not.toHaveBeenCalled();
  });

  it('ignores a failed Discogs search', async () => {
    await track('01 - Song.mp3', { title: 'Song' });
    searchDiscogs.mockRejectedValue(new Error('429'));
    expect((await auditAlbum(layout, { token: 't' })).discogsResults).toBeUndefined();
  });

  it('checks the original year only when asked to', async () => {
    await track('01 - Song.mp3', { ...TAGGED, discogsReleaseId: '99' });
    fetchOriginalYear.mockResolvedValue({ releaseId: '99', year: '1969', masterId: 5 });

    expect((await auditAlbum(layout, { token: 't' })).originalYear).toBeUndefined();
    expect(fetchOriginalYear).not.toHaveBeenCalled();

    const audit = await auditAlbum(layout, { token: 't', checkYears: true, search: false });
    expect(fetchOriginalYear).toHaveBeenCalledWith('99', 't');
    expect(audit.originalYear?.year).toBe('1969');
    expect(audit.issues.map((i) => i.code)).toContain('YEAR_NOT_ORIGINAL');
  });

  it('ignores a failed original-year lookup', async () => {
    await track('01 - Song.mp3', { ...TAGGED, discogsReleaseId: '99' });
    fetchOriginalYear.mockRejectedValue(new Error('500'));
    const audit = await auditAlbum(layout, { token: 't', checkYears: true });
    expect(audit.originalYear).toBeUndefined();
    expect(audit.issues).toEqual([]);
  });

  it('writes info.txt only with writeInfo, and never over an existing one', async () => {
    await track('01 - Song.mp3', TAGGED);
    const info = path.join(layout.albumPath, 'info.txt');

    await auditAlbum(layout);
    await expect(fs.access(info)).rejects.toThrow();

    await auditAlbum(layout, { writeInfo: true });
    await vi.waitFor(() => fs.access(info));
    expect(await fs.readFile(info, 'utf8')).toMatch(/^Band - Record \(1970\)/);

    await fs.writeFile(info, 'mine');
    await auditAlbum(layout, { writeInfo: true });
    expect(await fs.readFile(info, 'utf8')).toBe('mine');
  });
});
