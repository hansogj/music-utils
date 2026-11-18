import { describe, expect, it } from 'vitest';

import type { AlbumLayout, TrackInfo, TrackTags } from '../types.js';
import { checkArtistFolder, uninvert } from './artist.js';

const layout = (artistName: string): AlbumLayout => ({
  letterDir: artistName.charAt(0),
  artistName,
  albumFolder: '1970 Record',
  albumPath: `/m/${artistName}/1970 Record`,
});
const track = (tags: TrackTags): TrackInfo => ({
  filePath: '/x',
  fileName: 'x.mp3',
  ext: 'mp3',
  tags,
  parsedName: undefined,
});
const codes = (artist: string, ...tags: TrackTags[]) =>
  checkArtistFolder(layout(artist), tags.map(track)).map((i) => [i.code, i.message]);

describe('uninvert', () => {
  it.each([
    ['Doors, the', 'the Doors'],
    ['Orme, le', 'le Orme'],
    ['Tyner, McCoy', 'McCoy Tyner'],
    ['Henry Cow', undefined],
  ])('%s', (name, expected) => expect(uninvert(name)).toBe(expected));
});

describe('checkArtistFolder', () => {
  it('passes when a track names the folder (case aside), by ALBUMARTIST or else ARTIST', () => {
    expect(codes('The Doors', { albumArtist: 'the doors' })).toEqual([]);
    expect(codes('The Doors', { artist: 'The Doors' })).toEqual([]);
    // One track with the folder's name is enough (a guest elsewhere).
    expect(codes('Frank Zappa', { artist: 'Frank Zappa' }, { artist: 'Frank Zappa & Beefheart' })).toEqual([]);
  });

  it('compares the folder with its brackets: the tags carry them', () => {
    expect(codes('Dionysos [Canada]', { albumArtist: 'Dionysos [Canada]' })).toEqual([]);
    expect(codes('Dionysos [Canada]', { albumArtist: 'Dionysos' })).toEqual([
      [
        'ARTIST_FOLDER_MISMATCH',
        'Artist folder "Dionysos [Canada]" differs from the album artist in the tags: "Dionysos"',
      ],
    ]);
  });

  it('reports a different artist, leaders and bands too', () => {
    expect(codes('In Cahoots', { albumArtist: 'Phil Miller' }, { albumArtist: 'Phil Miller' })).toEqual([
      ['ARTIST_FOLDER_MISMATCH', 'Artist folder "In Cahoots" differs from the album artist in the tags: "Phil Miller"'],
    ]);
  });

  it('keeps diacritics apart, after NFC', () => {
    expect(codes('Ytre Suløens Jass-Ensemble', { artist: 'Ytre Suloens Jass-Ensemble' })).toHaveLength(1);
    expect(codes('Goran Kajfeš', { artist: 'Goran Kajfeš' })).toEqual([]); // š decomposed
  });

  it('reports an inverted name on its own', () => {
    expect(codes('The Doors', { albumArtist: 'Doors, the' })).toEqual([
      ['ARTIST_TAG_INVERTED', 'Artist tag "Doors, the" is the folder\'s name inverted: "The Doors"'],
    ]);
    expect(codes('Henry Cow [UK]', { artist: 'Cow, Henry' }).map((c) => c[0])).toEqual(['ARTIST_TAG_INVERTED']);
    // Inverted, but another name: a mismatch.
    expect(codes('Frank Zappa', { artist: 'Mothers of Invention, the' }).map((c) => c[0])).toEqual([
      'ARTIST_FOLDER_MISMATCH',
    ]);
  });

  it('skips Various Artists and albums without artist tags', () => {
    expect(codes('Various Artists', { artist: 'Yes' })).toEqual([]);
    expect(codes('Yes', { title: 'Roundabout' })).toEqual([]);
  });
});
