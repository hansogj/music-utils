import { albumBaseOfFolder } from './disc-split.js';

// When a repair changes a folder's year, the old one often still means something: the
// concert of a bootleg released later, or the recording of an album released years after.
// It can be kept as an aux bracket in the folder name (never in the ALBUM tag):
// "1997 Madrigal Mystery Tour [live 1978]".

// What to do with the folder's brackets: add one more after them (l, r), or replace them
// all with the text the user edited (c).
export type OldYearAnswer = { mode: 'append'; text: string } | { mode: 'replace'; aux: string };

// Nothing a folder name on SMB can't hold, and no brackets inside a bracket.
function cleanBracketText(s: string): string {
  return s
    .replace(/[[\]{}:/\\*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// l → "live 1978", r → "rec. 1978" (lower case); anything else → no bracket.
export function oldYearBracket(choice: string, oldYear: string): OldYearAnswer | undefined {
  switch (choice.trim().toLowerCase()) {
    case 'l':
      return { mode: 'append', text: `live ${oldYear}` };
    case 'r':
      return { mode: 'append', text: `rec. ${oldYear}` };
    default:
      return undefined;
  }
}

// The folder's brackets as they are ("[FLAC] [Bonus Disc]"), or '' — the text "c" starts from.
export function auxPartOf(folder: string): string {
  return (folder.match(/\[[^\]]*\]/g) ?? []).join(' ');
}

// What "c" was edited to, as the folder's new bracket part: "[FLAC] [live 1979]" stays as
// brackets; plain text ("Philadelphia 1979") becomes one bracket, also next to brackets
// ("[FLAC] bootleg" → "[FLAC] [bootleg]"); '' removes them all.
export function customAux(input: string): string {
  const parts = (input.match(/\[[^\]]*\]?|[^[]+/g) ?? []).map((g) => cleanBracketText(g));
  return parts
    .filter(Boolean)
    .map((p) => `[${p}]`)
    .join(' ');
}

// The folder name with " [text]" added last: after the disc part and any brackets it has
// ("1997 Title (Disc 1∕2) [FLAC] [live 1978]"). A bracket it already has isn't added again.
export function withAuxBracket(folder: string, text: string | undefined): string {
  if (!text) return folder;
  const has = (folder.match(/\[([^\]]*)\]/g) ?? []).some(
    (b) => b.slice(1, -1).trim().toLowerCase() === text.toLowerCase(),
  );
  return has ? folder : `${folder.trimEnd()} [${text}]`;
}

// The folder name with its brackets replaced by `aux` (after the disc part).
export function withAuxPart(folder: string, aux: string): string {
  const bare = folder
    .replace(/\s*\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return aux ? `${bare} ${aux}` : bare;
}

export function applyOldYear(folder: string, answer: OldYearAnswer | undefined): string {
  if (!answer) return folder;
  return answer.mode === 'append' ? withAuxBracket(folder, answer.text) : withAuxPart(folder, answer.aux);
}

// "[live 1978]" / "[FLAC] [live 1978]" / "no bracket", for the screen.
export function describeOldYear(answer: OldYearAnswer | undefined): string {
  if (!answer) return 'no bracket';
  if (answer.mode === 'append') return `[${answer.text}]`;
  return answer.aux ? `brackets ${answer.aux}` : 'no brackets';
}

// The disc folders of one set share an answer: same artist, same title without year and disc.
export function albumSetKey(artist: string, folder: string): string {
  return `${artist.trim().toLowerCase()}|${albumBaseOfFolder(folder)}`;
}
