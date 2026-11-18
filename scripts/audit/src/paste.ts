import { type NumberedTrack, numberTracklist } from './discogs.js';

export interface PastedTrack extends NumberedTrack {
  // "3:45", when the line ended with one.
  duration?: string;
}

// "3:45", "(3:45)", "[1:02:03]" at the end of a line.
const DURATION = /\s*[([]?(\d{1,2}:\d{2}(?::\d{2})?)[)\]]?\s*$/;
// The track's place, then a separator, then the title: "1. Title", "01 - Title", "1-03 Title",
// "CD2-03 Title", "d2t03 Title", "A1 Title", "B12) Title". A letter alone ("A Day in the Life")
// is no position.
const POSITION =
  /^((?:cd|disc)\s*\d+\s*[-./:]\s*\d+|\d+[-./:]\d+|d\d+t\d+|[a-z]{1,2}\d{1,2}|\d{1,3})(?:\s*[-–.:)]\s*|\s+)(\S.*)$/i;

function splitLine(line: string): { position: string; title: string; duration?: string } {
  const text = line.replace(/\t+/g, '  ').replace(/\s+/g, ' ').trim();
  const duration = text.match(DURATION)?.[1];
  const rest = duration ? text.replace(DURATION, '').trim() : text;
  const m = rest.match(POSITION);
  if (!m) return { position: '', title: rest, ...(duration ? { duration } : {}) };
  // "d2t03" → "2-03", which numberTracklist() reads as disc 2, track 3.
  const position = m[1].replace(/^d(\d+)t(\d+)$/i, '$1-$2').replace(/\s+/g, '');
  return { position, title: m[2].trim(), ...(duration ? { duration } : {}) };
}

// " - " parts every title starts with ("Yes - Roundabout", "Yes - South Side of the Sky").
function stripCommonPrefix(titles: string[]): string[] {
  if (titles.length < 2) return titles;
  const first = titles[0].split(/\s+[-–]\s+/)[0];
  const prefix = new RegExp(`^${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+[-–]\\s+(?=\\S)`, 'i');
  return titles.every((t) => prefix.test(t)) ? titles.map((t) => t.replace(prefix, '')) : titles;
}

// A tracklist pasted by the user, one line per track, for a folder of disc `folderDisc`.
// Positions are used when every line has one (as numberTracklist() reads Discogs
// positions: "3", "1-03", vinyl "A1" by order); else every line is a title, numbered by
// order (so "99 Problems" in a list of titles stays whole). A trailing duration is dropped.
export function parsePastedTracklist(lines: string[], folderDisc = 1): PastedTrack[] {
  const rows = lines.map((l) => l.trim()).filter(Boolean);
  if (rows.length === 0) return [];
  const split = rows.map(splitLine);
  const positioned = split.every((s) => s.position);
  const entries = positioned
    ? split
    : split.map((s, i) => ({ ...s, position: '', title: rows[i].replace(DURATION, '').replace(/\s+/g, ' ').trim() }));
  const titles = stripCommonPrefix(entries.map((e) => e.title));
  const numbered = numberTracklist(entries.map((e, i) => ({ position: e.position, title: titles[i] })));
  // One disc pasted for a "(Disc 2∕3)" folder: it is that disc.
  const oneDisc = numbered.every((t) => t.disc === 1);
  return numbered.map((t, i) => ({
    ...t,
    disc: oneDisc ? folderDisc : t.disc,
    ...(entries[i].duration ? { duration: entries[i].duration } : {}),
  }));
}
