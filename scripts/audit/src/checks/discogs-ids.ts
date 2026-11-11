import type { Issue, TrackInfo } from '../types.js';

// MP3s repaired by music-audit 81963c0/43bd432 got DISCOGS_MASTER_ID but lost
// DISCOGS_RELEASE_ID: id3v2 kept only the last TXXX frame of the write.
export function tracksMissingReleaseId(tracks: TrackInfo[]): TrackInfo[] {
  return tracks.filter((t) => t.ext === 'mp3' && t.tags.discogsMasterId && !t.tags.discogsReleaseId);
}

export function checkDiscogsIds(tracks: TrackInfo[]): Issue[] {
  const missing = tracksMissingReleaseId(tracks);
  if (missing.length === 0) return [];
  return [
    {
      severity: 'HIGH',
      code: 'MISSING_RELEASE_ID',
      message: `${missing.length} track(s) have a Discogs master ID but no release ID`,
    },
  ];
}

// The release ID the album was tagged from: the Discogs URL in a track's comment,
// else the Discogs-Release line in info.txt.
export function releaseIdFrom(tracks: TrackInfo[], infoTxt?: string): { id: string; source: string } | undefined {
  for (const t of tracks) {
    const m = t.tags.comment?.match(/discogs\.com\/release\/(\d+)/);
    if (m) return { id: m[1], source: 'comment' };
  }
  const m = infoTxt?.match(/^Discogs-Release:\s*(\d+)\s*$/m);
  return m ? { id: m[1], source: 'info.txt' } : undefined;
}
