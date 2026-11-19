import { type ArticleSort, articleSort, sortArtist, unsortArtist } from '../articles.js';
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

// The same artist with the article or the name order elsewhere: "Doors, the" for "The Doors",
// "The Beatles" for "Beatles, The". Brackets aside, but a missing bracket alone doesn't count.
function reordered(tag: string, folder: string): boolean {
  const plainTag = withoutBrackets(tag);
  const plainFolder = withoutBrackets(folder);
  if (same(plainTag, plainFolder)) return false;
  return same(uninvert(plainTag) ?? plainTag, uninvert(plainFolder) ?? plainFolder);
}

// The album artist the tags should hold for this artist folder: the folder's name, brackets
// included ("Dionysos [Canada]"), so same-named artists stay apart in a player; with
// music-utils' artist.sortArticles on, with its article last ("Beatles, The"), as rip and
// `music-utils tag album` write it.
export function expectedArtistTag(folder: string, sort: ArticleSort = articleSort()): string {
  return sortArtist(folder, sort);
}

// At least one track's album artist (ALBUMARTIST, else ARTIST) is the expected name. Players
// group by the tag. When no track agrees: ARTIST_TAG_INVERTED when a tag is the same name in
// another order ("Doors, the"; "The Beatles" while sortArticles wants "Beatles, The"), else
// ARTIST_FOLDER_MISMATCH. Report and ask: a leader's folder holding the band's album is fine.
export function checkArtistFolder(layout: AlbumLayout, tracks: TrackInfo[], sort = articleSort()): Issue[] {
  const folder = layout.artistName;
  if (/^various( artists)?$/i.test(withoutBrackets(folder))) return [];
  const expected = expectedArtistTag(folder, sort);
  const names = [...new Set(tracks.map(albumArtistOf).filter((n): n is string => !!n))];
  if (names.length === 0 || names.some((n) => same(n, expected))) return [];

  const inverted = names.find((n) => reordered(n, folder) || reordered(n, expected));
  if (inverted)
    return [
      {
        severity: 'MODERATE',
        code: 'ARTIST_TAG_INVERTED',
        message:
          expected === folder
            ? `Artist tag "${inverted}" is the folder's name inverted: "${folder}"`
            : `Artist tag "${inverted}" should be "${expected}" (artist.sortArticles is on)`,
        suggestion: `Write "${expected}" to the artist tags`,
      },
    ];
  const tagged = commonAlbumArtist(tracks)!;
  return [
    {
      severity: 'MODERATE',
      code: 'ARTIST_FOLDER_MISMATCH',
      message: `Artist folder "${folder}" differs from the album artist in the tags: "${tagged}"`,
      suggestion: `Write "${expected}" to the artist tags, or move the album to "${unsortArtist(tagged, sort)}"`,
    },
  ];
}
