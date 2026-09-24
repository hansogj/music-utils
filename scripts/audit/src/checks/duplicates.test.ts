import { describe, it, expect } from 'vitest';
import { checkDuplicates } from './duplicates.js';
import type { TrackInfo } from '../types.js';

function track(title: string, fileName = `${title}.flac`): TrackInfo {
  return {
    filePath: `/music/${fileName}`,
    fileName,
    ext: 'flac',
    tags: { title },
    parsedName: title,
  };
}

describe('checkDuplicates', () => {
  it('returns no issues for unique track titles', () => {
    const tracks = [track('Come Together'), track('Something'), track('Octopus Garden')];
    expect(checkDuplicates(tracks)).toHaveLength(0);
  });

  it('returns DUPLICATE_TRACKS for two tracks with the same title', () => {
    const tracks = [track('Loser', '04 - Loser.flac'), track('Loser', '05 - Loser.flac')];
    const issues = checkDuplicates(tracks);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('DUPLICATE_TRACKS');
    expect(issues[0].severity).toBe('MODERATE');
    expect(issues[0].message).toContain('Loser');
  });

  it('does not flag [Live] variant as duplicate', () => {
    const tracks = [track('Loser'), track('Loser [Live]')];
    expect(checkDuplicates(tracks)).toHaveLength(0);
  });

  it('does not flag [Remix] variant as duplicate', () => {
    const tracks = [track('Loser'), track('Loser [Remix]')];
    expect(checkDuplicates(tracks)).toHaveLength(0);
  });

  it('does not flag [Demo] variant as duplicate', () => {
    const tracks = [track('Loser'), track('Loser [Demo]')];
    expect(checkDuplicates(tracks)).toHaveLength(0);
  });

  it('does not flag (Acoustic) variant as duplicate', () => {
    const tracks = [track('Loser'), track('Loser (Acoustic)')];
    expect(checkDuplicates(tracks)).toHaveLength(0);
  });

  it('does not flag (Alternate Take) as duplicate', () => {
    const tracks = [track('Soul Suckin Jerk'), track('Soul Suckin Jerk (Alternate Take)')];
    expect(checkDuplicates(tracks)).toHaveLength(0);
  });

  it('flags only true dupes in a mix of dupes and variants', () => {
    const tracks = [
      track('Soul Suckin Jerk', '04 - Soul Suckin Jerk.flac'),
      track('Soul Suckin Jerk', '05 - Soul Suckin Jerk Alt.flac'),
      track('Soul Suckin Jerk (Live)', '06 - Soul Suckin Jerk Live.flac'),
    ];
    const issues = checkDuplicates(tracks);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('2×');
  });

  it('returns no issues for an empty track list', () => {
    expect(checkDuplicates([])).toHaveLength(0);
  });

  it('returns no issues when tracks have no title', () => {
    const tracksNoTitle: TrackInfo[] = [
      { filePath: '/a.flac', fileName: 'a.flac', ext: 'flac', tags: {}, parsedName: undefined },
      { filePath: '/b.flac', fileName: 'b.flac', ext: 'flac', tags: {}, parsedName: undefined },
    ];
    expect(checkDuplicates(tracksNoTitle)).toHaveLength(0);
  });

  it('lists filenames of true duplicates in the message', () => {
    const tracks = [track('Loser', '04 - Loser.flac'), track('Loser', '05 - Loser 2.flac')];
    const issues = checkDuplicates(tracks);
    expect(issues[0].message).toContain('04 - Loser.flac');
    expect(issues[0].message).toContain('05 - Loser 2.flac');
  });
});
