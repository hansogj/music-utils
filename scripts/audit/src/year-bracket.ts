import { albumBaseOfFolder } from './disc-split.js';

// When a repair changes a folder's year, the old one often still means something: the
// concert of a bootleg released later, or the recording of an album released years after.
// It can be kept as an aux bracket in the folder name (never in the ALBUM tag):
// "1997 Madrigal Mystery Tour [live 1978]".

export type OldYearChoice = '' | 'l' | 'r' | 'c';

// The bracket text for an answer: l → "live 1978", r → "rec. 1978", c → the user's text.
// Lower case, and nothing a folder name on SMB can't hold (no ":" or brackets).
export function oldYearBracket(choice: string, oldYear: string, custom = ''): string | undefined {
  switch (choice.trim().toLowerCase()) {
    case 'l':
      return `live ${oldYear}`;
    case 'r':
      return `rec. ${oldYear}`;
    case 'c': {
      const text = custom
        .replace(/[[\]{}:/\\*?"<>|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return text || undefined;
    }
    default:
      return undefined;
  }
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

// The disc folders of one set share an answer: same artist, same title without year and disc.
export function albumSetKey(artist: string, folder: string): string {
  return `${artist.trim().toLowerCase()}|${albumBaseOfFolder(folder)}`;
}
