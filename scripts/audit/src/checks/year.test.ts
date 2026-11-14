import { describe, expect, it } from 'vitest';

import type { AlbumLayout, OriginalYear, TrackInfo, TrackTags } from '../types.js';
import { checkOriginalYear, folderYear, originalYearLookupId, withFolderYear } from './year.js';

function layout(albumFolder = '1989 In Rock'): AlbumLayout {
  return { letterDir: 'D', artistName: 'Deep Purple', albumFolder, albumPath: `/music/D/Deep Purple/${albumFolder}` };
}

function track(tags: TrackTags = {}): TrackInfo {
  return { filePath: '/x/01.flac', fileName: '01 - Speed King.flac', ext: 'flac', tags, parsedName: 'Speed King' };
}

const reissue: OriginalYear = { releaseId: '3422683', year: '1970', releaseYear: '1989', masterId: 1439 };

describe('folderYear / withFolderYear', () => {
  it('reads and replaces the leading year', () => {
    expect(folderYear('1989 In Rock')).toBe('1989');
    expect(folderYear('In Rock')).toBeUndefined();
    expect(withFolderYear('1989 In Rock (Disc 1∕2) [Remaster]', '1970')).toBe('1970 In Rock (Disc 1∕2) [Remaster]');
    expect(withFolderYear('In Rock', '1970')).toBe('1970 In Rock');
  });
});

describe('originalYearLookupId', () => {
  it('returns undefined for albums without a Discogs release ID tag', () => {
    expect(originalYearLookupId(layout(), [track({ year: '1989' })])).toBeUndefined();
  });

  it('returns the release ID when the album is tagged with one', () => {
    expect(originalYearLookupId(layout(), [track({ year: '1989', discogsReleaseId: '3422683' })])).toBe('3422683');
  });

  it('skips the lookup when ORIGINALDATE, DATE and folder year already agree', () => {
    const tags = { year: '1970', originalYear: '1970', discogsReleaseId: '3422683' };
    expect(originalYearLookupId(layout('1970 In Rock'), [track(tags), track(tags)])).toBeUndefined();
  });

  it('still looks up when the folder year disagrees with ORIGINALDATE', () => {
    const tags = { year: '1970', originalYear: '1970', discogsReleaseId: '3422683' };
    expect(originalYearLookupId(layout('1989 In Rock'), [track(tags)])).toBe('3422683');
  });
});

describe('checkOriginalYear', () => {
  it('flags a reissue year in folder and tags', () => {
    const [issue] = checkOriginalYear(layout(), [track({ year: '1989' })], reissue);
    expect(issue).toMatchObject({ severity: 'HIGH', code: 'YEAR_NOT_ORIGINAL' });
    expect(issue.message).toBe('Year 1989 is not the original release year 1970 (master m1439)');
    expect(issue.suggestion).toBe('Set DATE/ORIGINALDATE to 1970 and rename folder to "1970 In Rock"');
  });

  it('flags a wrong tag year even when the folder is right', () => {
    const [issue] = checkOriginalYear(layout('1970 In Rock'), [track({ year: '1989-01-01' })], reissue);
    expect(issue.suggestion).toBe('Set DATE/ORIGINALDATE to 1970');
  });

  it('returns nothing when years already match the original', () => {
    expect(checkOriginalYear(layout('1970 In Rock'), [track({ year: '1970' })], reissue)).toEqual([]);
  });

  it('leaves a missing folder year to MISSING_YEAR_PREFIX', () => {
    expect(checkOriginalYear(layout('In Rock'), [track({ year: '1970' })], reissue)).toEqual([]);
  });

  it('names the release when there is no master', () => {
    const [issue] = checkOriginalYear(layout(), [track()], { releaseId: '42', year: '1970' });
    expect(issue.message).toContain('(release r42)');
  });

  it('returns nothing without an original year', () => {
    expect(checkOriginalYear(layout(), [track({ year: '1989' })], undefined)).toEqual([]);
    expect(checkOriginalYear(layout(), [track({ year: '1989' })], { releaseId: '1' })).toEqual([]);
  });
});
