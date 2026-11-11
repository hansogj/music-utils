import { describe, expect, it } from 'vitest';

import type { TrackInfo, TrackTags } from '../types.js';
import { checkDiscogsIds, releaseIdFrom, tracksMissingReleaseId } from './discogs-ids.js';

const track = (fileName: string, tags: TrackTags, ext: 'mp3' | 'flac' = 'mp3'): TrackInfo => ({
  filePath: `/a/${fileName}`,
  fileName,
  ext,
  tags,
  parsedName: undefined,
});

describe('checkDiscogsIds', () => {
  it('flags mp3s with a master ID but no release ID, once per album', () => {
    const tracks = [
      track('01.mp3', { discogsMasterId: '245487' }),
      track('02.mp3', { discogsMasterId: '245487' }),
      track('03.mp3', { discogsMasterId: '245487', discogsReleaseId: '4376665' }),
      track('04.mp3', {}),
    ];
    expect(tracksMissingReleaseId(tracks).map((t) => t.fileName)).toEqual(['01.mp3', '02.mp3']);
    expect(checkDiscogsIds(tracks)).toEqual([
      {
        severity: 'HIGH',
        code: 'MISSING_RELEASE_ID',
        message: '2 track(s) have a Discogs master ID but no release ID',
      },
    ]);
  });

  it('leaves FLAC alone (metaflac kept both IDs) and passes complete albums', () => {
    expect(checkDiscogsIds([track('01.flac', { discogsMasterId: '1' }, 'flac')])).toEqual([]);
    expect(checkDiscogsIds([track('01.mp3', { discogsMasterId: '1', discogsReleaseId: '2' })])).toEqual([]);
  });
});

describe('releaseIdFrom', () => {
  it('reads the Discogs URL in a comment first', () => {
    const tracks = [track('01.mp3', {}), track('02.mp3', { comment: 'https://www.discogs.com/release/4376665' })];
    expect(releaseIdFrom(tracks, 'Discogs-Release: 1\n')).toEqual({ id: '4376665', source: 'comment' });
  });

  it('falls back to the Discogs-Release line in info.txt', () => {
    const info = 'Yezda Urfa - Sacred Baboon (1989)\n\nDiscogs-Release: 4376665\nDiscogs-Master: 245487\nDisc: 1/1\n';
    expect(releaseIdFrom([track('01.mp3', { comment: 'ripped by me' })], info)).toEqual({
      id: '4376665',
      source: 'info.txt',
    });
  });

  it('returns undefined with nothing to go on', () => {
    expect(releaseIdFrom([track('01.mp3', {})])).toBeUndefined();
    expect(releaseIdFrom([track('01.mp3', {})], 'no ids here')).toBeUndefined();
  });
});
