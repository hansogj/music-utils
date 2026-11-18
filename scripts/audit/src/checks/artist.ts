import type { AlbumLayout, Issue, TrackInfo } from '../types.js';

// Names compared as written (NFC, case aside): "Ytre Suløens" and "Ytre Suloens" differ.
const same = (a: string, b: string) => a.normalize('NFC').toLowerCase() === b.normalize('NFC').toLowerCase();

// "Doors, the" → "the Doors", "Cow, Henry" → "Henry Cow"; undefined when there's no comma.
export function uninvert(name: string): string | undefined {
  const m = name.trim().match(/^(.+?),\s*([^,]+)$/);
  return m ? `${m[2].trim()} ${m[1].trim()}` : undefined;
}

// A track's album artist: ALBUMARTIST, else ARTIST.
export function albumArtistOf(t: TrackInfo): string | undefined {
  return (t.tags.albumArtist || t.tags.artist)?.trim() || undefined;
}

// The album artist the tags give most often.
export function commonAlbumArtist(tracks: TrackInfo[]): string | undefined {
  const counts = new Map<string, number>();
  for (const t of tracks) {
    const name = albumArtistOf(t);
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

// The folder's name without its own brackets: "Dionysos [Canada]" → "Dionysos".
const withoutBrackets = (name: string) => name.replace(/(\s*\[[^\]]*\])+\s*$/, '').trim();

// The artist folder names the album artist the tags give (ALBUMARTIST, else ARTIST), on at
// least one track; the folder's brackets included ("Dionysos [Canada]"), so same-named
// artists stay apart in a player. Players group by the tag. When no track agrees:
// ARTIST_TAG_INVERTED when a tag is the folder's name inverted ("Doors, the"), else
// ARTIST_FOLDER_MISMATCH. Report and ask: a leader's folder holding the band's album is fine.
export function checkArtistFolder(layout: AlbumLayout, tracks: TrackInfo[]): Issue[] {
  const folder = layout.artistName;
  if (/^various( artists)?$/i.test(withoutBrackets(folder))) return [];
  const names = [...new Set(tracks.map(albumArtistOf).filter((n): n is string => !!n))];
  if (names.length === 0 || names.some((n) => same(n, folder))) return [];

  const inverted = names.find((n) => {
    const plain = uninvert(n);
    return plain !== undefined && (same(plain, folder) || same(plain, withoutBrackets(folder)));
  });
  if (inverted)
    return [
      {
        severity: 'MODERATE',
        code: 'ARTIST_TAG_INVERTED',
        message: `Artist tag "${inverted}" is the folder's name inverted: "${folder}"`,
        suggestion: `Write "${folder}" to the artist tags`,
      },
    ];
  const tagged = commonAlbumArtist(tracks)!;
  return [
    {
      severity: 'MODERATE',
      code: 'ARTIST_FOLDER_MISMATCH',
      message: `Artist folder "${folder}" differs from the album artist in the tags: "${tagged}"`,
      suggestion: `Write "${folder}" to the artist tags, or move the album to "${tagged}"`,
    },
  ];
}
