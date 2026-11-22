import type { Issue, TrackInfo } from '../types.js';
import { parseTrackNames } from './names.js';

// The whole title, qualifiers included: "Sweet Dreams" and "Sweet Dreams (Original Mix)",
// or "(Live)" and "(Demo)", are different tracks. Only the same title twice is a duplicate.
function titleKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[’'`´]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// The title of each track: its TITLE tag, else the name from the file, also when the
// file has no track number ("The Frim-Fram Sauce.mp3", a stray second copy).
function titlesOf(tracks: TrackInfo[], fromNames: ReturnType<typeof parseTrackNames>): string[] {
  return tracks.map((t, i) => (t.tags.title ?? t.parsedName ?? fromNames[i].title ?? '').trim());
}

const toNumber = (s: string | undefined) => {
  const n = parseInt(s ?? '', 10);
  return Number.isNaN(n) ? undefined : n;
};

// "disc:no" of a track: its TRACKNUMBER (and DISCNUMBER) tag, else the number its file name
// starts with ("06 - …", "d2t06 …"); undefined when it has neither.
function numberKey(t: TrackInfo, fromName: ReturnType<typeof parseTrackNames>[number]): string | undefined {
  const tagged = toNumber(t.tags.trackNo);
  const no = tagged ?? fromName.no;
  if (no === undefined) return undefined;
  const disc = (tagged !== undefined ? toNumber(t.tags.discNumber) : fromName.disc) ?? 1;
  return `${disc}:${no}`;
}

// The same song on one album more than once, each on its own track number ("06 - Visan I
// Sommaren", "12 - Visan I Sommaren"): fine, no duplicate. A copy without a number, or two
// on the same number, is one.
function ownNumbers(keys: Array<string | undefined>): boolean {
  return keys.every((k) => k !== undefined) && new Set(keys).size === keys.length;
}

const hasNumberPrefix = (fileName: string) => /^(?:d\d+t)?\d{1,3}(?!\d)/i.test(fileName);

// How much a file looks like the stray copy: no track number in its name, no TITLE tag.
function extraScore(t: TrackInfo): number {
  return (hasNumberPrefix(t.fileName) ? 0 : 2) + (t.tags.title ? 0 : 1);
}

// The copies that look like extras: those scoring above the best-looking one.
export function likelyExtras(group: TrackInfo[]): TrackInfo[] {
  const best = Math.min(...group.map(extraScore));
  return group.filter((t) => extraScore(t) > best);
}

export function checkDuplicates(tracks: TrackInfo[]): Issue[] {
  const fromNames = parseTrackNames(tracks.map((t) => t.fileName));
  const titles = titlesOf(tracks, fromNames);
  const byTitle = new Map<string, { title: string; tracks: TrackInfo[]; numbers: Array<string | undefined> }>();

  tracks.forEach((track, i) => {
    const key = titleKey(titles[i]);
    if (!key) return;
    const entry = byTitle.get(key) ?? { title: titles[i], tracks: [], numbers: [] };
    entry.tracks.push(track);
    entry.numbers.push(numberKey(track, fromNames[i]));
    byTitle.set(key, entry);
  });

  return [...byTitle.values()]
    .filter(({ tracks: group, numbers }) => group.length > 1 && !ownNumbers(numbers))
    .map(({ title, tracks: group }) => {
      const extras = likelyExtras(group);
      const files = group.map((t) => t.fileName).join(', ');
      const extra = extras.length > 0 ? ` — likely extra copy: ${extras.map((t) => t.fileName).join(', ')}` : '';
      return {
        severity: 'MODERATE' as const,
        code: 'DUPLICATE_TRACKS',
        message: `Duplicate track name "${title}" appears ${group.length}×: ${files}${extra}`,
        suggestion:
          extras.length > 0
            ? `Move the extra copy out of the album if it is a second rip of the same track`
            : `Remove the extra copy, or add a qualifier such as (Live) or (Demo) to the title if it is another version`,
      };
    });
}
