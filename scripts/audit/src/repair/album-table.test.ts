import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AlbumAudit, DiscogsSearchResult } from '../types.js';
import { printAlbumTable } from './album-table.js';

const result = (id: number, format: string, matchScore?: number): DiscogsSearchResult => ({
  id,
  title: `Sacred Baboon ${id}`,
  releaseUrl: '',
  format: [format, 'Album'],
  ...(matchScore !== undefined ? { matchScore } : {}),
});

function shownWith(discogsResults: DiscogsSearchResult[]): string[] {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const audit = {
    layout: {
      artistName: 'Yezda Urfa',
      albumFolder: '1976 Sacred Baboon',
      albumPath: '/m/Y/Yezda Urfa/1976 Sacred Baboon',
    },
    tracks: [],
    issues: [],
    discogsResults,
  } as unknown as AlbumAudit;
  printAlbumTable(audit, []);
  // eslint-disable-next-line no-control-regex
  return log.mock.calls.map(([line]) => String(line).replace(/\x1b\[[0-9;]*m|\x1b\]8;[^\x07]*\x07/g, ''));
}

afterEach(() => vi.restoreAllMocks());

describe('printAlbumTable — Discogs hits', () => {
  it('stars the suggested (first) hit, also when a vinyl below it matches better, and shows formats', () => {
    const lines = shownWith([result(1, 'CD', 0.88), result(2, 'Vinyl', 0.92)]).filter((l) =>
      l.includes('Sacred Baboon '),
    );
    expect(lines).toEqual([
      expect.stringMatching(/★ \[1\] Sacred Baboon 1 · CD .*88%/),
      expect.stringMatching(/│ {3}\[2\] Sacred Baboon 2 · Vinyl .*92%/),
    ]);
  });

  it('stars nothing when the first hit has no score', () => {
    const lines = shownWith([result(1, 'CD'), result(2, 'Vinyl')]);
    expect(lines.join('\n')).not.toMatch(/★/);
  });
});
