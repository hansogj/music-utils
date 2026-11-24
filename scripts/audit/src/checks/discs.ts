import type { SiblingDisc } from '../disc-siblings.js';
import type { Issue, TrackInfo } from '../types.js';

// A track's disc and disc count from its tags: DISCNUMBER "2/1" (MP3 TPOS alike), or "2"
// with TOTALDISCS / DISCTOTAL "1".
export function discOfTags(t: TrackInfo): { disc: number; of: number } | undefined {
  const [no, total] = (t.tags.discNumber ?? '').split('/');
  const disc = parseInt(no, 10);
  const of = parseInt(total ?? t.tags.noOfDiscs ?? '', 10);
  return Number.isFinite(disc) && Number.isFinite(of) ? { disc, of } : undefined;
}

// DISC_ABOVE_TOTAL: a disc number above its total ("2/1": the disc from an old file name,
// the total from the release). Repair writes the number Discogs tagging would (discNumbers()).
export function checkDiscNumbers(tracks: TrackInfo[]): Issue[] {
  const wrong = tracks.filter((t) => {
    const d = discOfTags(t);
    return d !== undefined && d.disc > d.of;
  });
  if (wrong.length === 0) return [];
  const example = discOfTags(wrong[0])!;
  return [
    {
      severity: 'MODERATE',
      code: 'DISC_ABOVE_TOTAL',
      message: `${wrong.length} track(s) have a disc number above the disc count (${wrong[0].fileName}: ${example.disc}/${example.of})`,
      suggestion: 'Write the disc number the folder gives (1/1 unless it is a "(Disc n∕m)" folder)',
    },
  ];
}

// MIXED_SET_RELEASE: the disc folders of one set tagged from different Discogs releases
// (Live In Detroit: disc 1 from one release, disc 2 from another). The release most of the
// set has is right — on a tie, the lowest disc's — and the discs without it get the issue.
export function checkSetReleases(disc: number, releaseId: string | undefined, siblings: SiblingDisc[]): Issue[] {
  if (!releaseId) return [];
  const set = [{ disc, releaseId }, ...siblings.filter((s) => s.releaseId)].sort((a, b) => a.disc - b.disc);
  const counts = new Map<string, number>();
  for (const s of set) counts.set(s.releaseId!, (counts.get(s.releaseId!) ?? 0) + 1);
  if (counts.size < 2) return [];
  const most = Math.max(...counts.values());
  const setRelease = set.find((s) => counts.get(s.releaseId!) === most)!;
  if (setRelease.releaseId === releaseId) return [];
  return [
    {
      severity: 'MODERATE',
      code: 'MIXED_SET_RELEASE',
      message: `This disc is tagged from Discogs release r${releaseId}, Disc ${setRelease.disc} of the set from r${setRelease.releaseId}`,
      suggestion: `Tag this disc from r${setRelease.releaseId} too`,
    },
  ];
}
