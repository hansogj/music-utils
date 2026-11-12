import { localNumbering, parseTrackNames } from './checks/names.js';
import type { NumberedTrack } from './discogs.js';
import { dice } from './similarity.js';

// Characters a file name can't hold. A path separator or colon inside a title
// ("Opening/Siberian Khatru", "Title: Part 2") becomes " - ", the rest are dropped.
export function sanitizeFilename(s: string): string {
  return s
    .replace(/\s*[/\\:]\s*/g, ' - ')
    .replace(/[*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s-]+|[\s-]+$/g, '')
    .trim();
}

// The release track for each local file. By disc and track number when every file finds
// one; else by order (a single folder holding a 2-CD release: local track 12 is CD 2 track 1).
export function pairWithRelease(
  local: Array<{ disc: number; no: number }>,
  tracks: NumberedTrack[],
): Array<NumberedTrack | undefined> {
  const keyed = local.map((l) => tracks.find((t) => t.disc === l.disc && t.no === l.no));
  if (keyed.every(Boolean) && new Set(keyed).size === keyed.length) return keyed;
  const ranks = local
    .map((l, i) => ({ ...l, i }))
    .sort((a, b) => a.disc - b.disc || a.no - b.no)
    .map((l) => l.i);
  const paired: Array<NumberedTrack | undefined> = [];
  ranks.forEach((i, rank) => (paired[i] = tracks[rank]));
  return paired;
}

// Why the pairing looks wrong, if it does: several files given the same title, or most
// of them none. Then the titles are shown and the user decides.
export function pairingProblem(titles: Array<string | undefined>): string | undefined {
  const named = titles.filter((t): t is string => !!t);
  const counts = new Map<string, number>();
  for (const t of named) counts.set(t.toLowerCase(), (counts.get(t.toLowerCase()) ?? 0) + 1);
  const repeated = [...counts.values()].filter((n) => n > 1).reduce((a, b) => a + b, 0);
  if (repeated > 0) return `${repeated} files would get a title another file also gets`;
  if (titles.length > 1 && titles.length - named.length > titles.length / 2)
    return `${titles.length - named.length} of ${titles.length} files match no release track`;
  return undefined;
}

export interface Rename {
  old: string;
  new: string;
}

// The renames, unless two files would end up with one name, or a new name is already a
// file in the folder: then none, so no rename can overwrite another file.
export function checkRenames(renames: Rename[], allFiles: string[]): { ok: Rename[]; clash?: string[] } {
  // Case-insensitive: the library sits on CIFS. A file that moves away still holds its
  // name until its own turn, so its old name is taken too.
  const taken = new Set(allFiles.map((f) => f.toLowerCase()));
  const seen = new Map<string, number>();
  for (const r of renames) seen.set(r.new.toLowerCase(), (seen.get(r.new.toLowerCase()) ?? 0) + 1);
  const clash = [
    ...new Set(
      renames
        .filter(
          (r) =>
            seen.get(r.new.toLowerCase())! > 1 ||
            (taken.has(r.new.toLowerCase()) && r.new.toLowerCase() !== r.old.toLowerCase()),
        )
        .map((r) => r.new),
    ),
  ];
  return clash.length > 0 ? { ok: [], clash } : { ok: renames };
}

export interface PlannedFile {
  disc: number;
  no: number;
  track?: NumberedTrack;
  // A second copy of this file (by index): not tagged, reported for the user to move out.
  extraOf?: number;
}

// A file without a track number must match a release title this well to be placed by it.
const MIN_STRAY_MATCH = 0.8;

// Which release track each file is. Numbered files are paired as in pairWithRelease();
// a file without a number ("April Showers.mp3" beside "03 - April Showers.mp3") is placed
// by its title. When that release track already has a file, it is an extra copy: it gets
// no track number past the release's length, and the album's total stays the release's.
export function planPairing(
  fileNames: string[],
  localTitles: string[],
  tracks: NumberedTrack[],
  folderDisc = 1,
): PlannedFile[] {
  const parsed = parseTrackNames(fileNames);
  const indices = fileNames.map((_, i) => i);
  const numbered = indices.filter((i) => parsed[i].no !== undefined);
  const strays = indices.filter((i) => parsed[i].no === undefined);
  const keys = new Set(numbered.map((i) => `${parsed[i].disc ?? folderDisc}:${parsed[i].no}`));
  if (strays.length === 0 || numbered.length === 0 || keys.size !== numbered.length) {
    const local = localNumbering(fileNames, folderDisc);
    const paired = pairWithRelease(local, tracks);
    return local.map((l, i) => ({ ...l, track: paired[i] }));
  }

  const local = numbered.map((i) => ({ disc: parsed[i].disc ?? folderDisc, no: parsed[i].no! }));
  const paired = pairWithRelease(local, tracks);
  const plan: PlannedFile[] = [];
  const owner = new Map<NumberedTrack, number>();
  numbered.forEach((fileIndex, k) => {
    plan[fileIndex] = { ...local[k], track: paired[k] };
    if (paired[k]) owner.set(paired[k]!, fileIndex);
  });
  const used = new Set(local.map((l) => `${l.disc}:${l.no}`));
  let next = Math.max(0, ...local.map((l) => l.no));
  const freeNo = (no: number) => {
    if (!used.has(`${folderDisc}:${no}`)) return no;
    while (used.has(`${folderDisc}:${++next}`));
    return next;
  };

  for (const i of strays) {
    const title = localTitles[i] || parsed[i].title || '';
    const best = tracks
      .map((t) => ({ t, score: dice(title, t.title) }))
      .reduce<{ t?: NumberedTrack; score: number }>((a, b) => (b.score > a.score ? b : a), { score: 0 });
    if (best.t && best.score >= MIN_STRAY_MATCH) {
      const copyOf = owner.get(best.t);
      if (copyOf !== undefined) {
        plan[i] = { ...plan[copyOf], track: undefined, extraOf: copyOf };
        continue;
      }
      const no = freeNo(best.t.disc === folderDisc ? best.t.no : tracks.indexOf(best.t) + 1);
      used.add(`${folderDisc}:${no}`);
      owner.set(best.t, i);
      plan[i] = { disc: folderDisc, no, track: best.t };
    } else {
      const no = freeNo(next + 1);
      used.add(`${folderDisc}:${no}`);
      plan[i] = { disc: folderDisc, no };
    }
  }
  return plan;
}
