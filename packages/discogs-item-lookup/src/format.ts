// Pure helpers shared by music-utils (rip) and music-audit: how a Discogs release's
// artists, tracklist and info.txt are written. No network, no environment: also
// published as `@hansogj/discogs-item-lookup/format`.

export interface DiscogsCredit {
  name: string;
  role: string;
}

export interface DiscogsRawTrack {
  position: string;
  title: string;
  type_: string;
  duration?: string;
  extraartists?: DiscogsCredit[];
  sub_tracks?: DiscogsRawTrack[];
}

/** Drops a Discogs disambiguation suffix: "Dave Greenslade (2)" → "Dave Greenslade". */
export function cleanArtistName(name: string): string {
  return name.replace(/\s*\(\d+\)\s*$/, '').trim();
}

/**
 * Every credited artist joined as Discogs shows them, each with its `join` before the next
 * ("David Holland Quartet - Dave Holland, Sam Rivers"). "/" and a missing join become ", "
 * ("Patrick Woodroffe, Dave Greenslade"): the name goes in a folder name too.
 */
export function joinArtistCredit(artists: Array<{ name: string; join?: string }>): string {
  return artists
    .map((a, i) => {
      if (i === artists.length - 1) return cleanArtistName(a.name);
      const join = a.join?.trim().replace(/^\/$/, ',') || ',';
      return `${cleanArtistName(a.name)}${join === ',' ? ', ' : ` ${join} `}`;
    })
    .join('');
}

/**
 * The release's tracks as files on a disc. An "index" entry (a suite such as "And You And I",
 * listed with its parts as sub-tracks and no position of its own) is one file: it keeps its
 * title and takes its position from the first part ("1-5.a" → "1-5", "B2a" → "B2").
 * Headings are dropped.
 */
export function flattenTracklist<T extends DiscogsRawTrack>(tracklist: T[]): T[] {
  return tracklist.flatMap((t) => {
    if (t.type_ === 'track') return [t];
    if (t.type_ !== 'index' || !t.sub_tracks?.length) return [];
    const position = t.position?.trim() || t.sub_tracks[0].position.trim().replace(/\.?[a-z]$/, '');
    return [{ ...t, type_: 'track', position }];
  });
}

export interface InfoTxtTrack {
  position: string;
  title: string;
  duration?: string;
  extraartists?: DiscogsCredit[];
}

export interface InfoTxtRelease {
  releaseId: string;
  masterId?: number;
  /** Album title (the master's). */
  title?: string;
  /** Original year (the master's). */
  year?: string | number;
  /** This pressing's year; shown as "Reissue:" when it differs. */
  releaseYear?: string | number;
  country?: string;
  /** Flattened tracklist (see flattenTracklist()). */
  tracklist: InfoTxtTrack[];
  /** Release personnel. */
  extraartists?: DiscogsCredit[];
  artists?: string[];
}

export interface InfoTxtDisc {
  discNumber: string | number;
  noOfDiscs: string | number;
}

function padCol(s: string, width: number): string {
  return s.length >= width ? s + '  ' : s.padEnd(width);
}

/** Fixed `Key: value` lines at the end of info.txt, for scripts. */
export function infoTxtIdLines(release: Pick<InfoTxtRelease, 'releaseId' | 'masterId'>, disc?: InfoTxtDisc): string[] {
  return [
    `Discogs-Release: ${release.releaseId}`,
    ...(release.masterId ? [`Discogs-Master: ${release.masterId}`] : []),
    ...(disc ? [`Disc: ${disc.discNumber}/${disc.noOfDiscs}`] : []),
    '',
  ];
}

/**
 * The info.txt text for an album tagged from a Discogs release: "Artist - Title (year)",
 * reissue year and country, the songs with composers and durations, the personnel, then
 * the `Discogs-Release:` / `Discogs-Master:` / `Disc:` lines.
 * @param artistName The artist chosen for the album's folder and tags: the header says the same.
 */
export function formatInfoTxt(release: InfoTxtRelease, artistName: string, disc?: InfoTxtDisc): string {
  const artist = artistName || release.artists?.[0] || '';
  const album = release.title ?? '';
  const year = release.year ? String(release.year) : '';
  const releaseYear = release.releaseYear ? String(release.releaseYear) : '';

  const lines: string[] = [];
  lines.push([artist, album].filter(Boolean).join(' - ') + (year ? ` (${year})` : ''));
  if (releaseYear && releaseYear !== '0' && releaseYear !== year) lines.push(`Reissue: ${releaseYear}`);
  if (release.country) lines.push(release.country.toUpperCase());
  lines.push('');

  if (release.tracklist.length > 0) {
    lines.push('Songs');
    for (const track of release.tracklist) {
      const posMatch = track.position.match(/^(?:\d+[-./:])?(\d+)$/);
      const num = posMatch ? parseInt(posMatch[1], 10) : 0;
      const numStr = num ? `${num}.` : `${track.position}.`;
      const composers = (track.extraartists ?? [])
        .filter((a) => /written|compos|music|lyric/i.test(a.role))
        .map((a) => cleanArtistName(a.name))
        .join(', ');
      const parts: string[] = [padCol(numStr, 4), padCol(track.title, 40)];
      if (composers) parts.push(padCol(composers, 24));
      if (track.duration) parts.push(track.duration);
      lines.push(' ' + parts.join(' ').trimEnd());
    }
    lines.push('');
  }

  const personnel = (release.extraartists ?? []).filter((a) => a.name && a.role);
  if (personnel.length > 0) {
    for (const p of personnel) {
      lines.push(`        ${padCol(cleanArtistName(p.name), 32)}${p.role}`);
    }
    lines.push('');
  }

  lines.push(...infoTxtIdLines(release, disc));
  return lines.join('\n');
}
