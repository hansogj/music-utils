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

  it('takes a "/" in the tag for the " - " a folder name has instead', () => {
    expect(codes('The Don Rendell - Ian Carr Quintet', { albumArtist: 'The Don Rendell / Ian Carr Quintet' })).toEqual(
      [],
    );
    expect(codes('AC - DC', { artist: 'AC/DC' })).toEqual([]);
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

  describe('with music-utils artist.sortArticles on', () => {
    const sorted = { sortArticles: true, articles: ['the', 'le'] };
    const sortedCodes = (artist: string, ...tags: TrackTags[]) =>
      checkArtistFolder(layout(artist), tags.map(track), sorted).map((i) => [i.code, i.message, i.suggestion]);

    it('expects the article last, as music-utils tags it', () => {
      expect(sortedCodes('The Beatles', { albumArtist: 'Beatles, The' })).toEqual([]);
      expect(sortedCodes('Beatles, The', { albumArtist: 'Beatles, The' })).toEqual([]);
      expect(sortedCodes('The Dionysos [Canada]', { albumArtist: 'Dionysos, The [Canada]' })).toEqual([]);
      expect(sortedCodes('Henry Cow', { albumArtist: 'Henry Cow' })).toEqual([]);
    });

    it('reports the plain name, and the repair writes the sorted one', () => {
      expect(sortedCodes('The Beatles', { albumArtist: 'The Beatles' })).toEqual([
        [
          'ARTIST_TAG_INVERTED',
          'Artist tag "The Beatles" should be "Beatles, The" (artist.sortArticles is on)',
          'Write "Beatles, The" to the artist tags',
        ],
      ]);
    });

    it("suggests the plain folder name when moving to the tags' artist", () => {
      expect(sortedCodes('Beatles Tribute', { albumArtist: 'Rolling Stones, The' })[0][2]).toBe(
        'Write "Beatles Tribute" to the artist tags, or move the album to "The Rolling Stones"',
      );
    });
  });

  it('reports the tag of a sorted folder name in plain order', () => {
    expect(codes('Beatles, The', { albumArtist: 'The Beatles' }).map((c) => c[0])).toEqual(['ARTIST_TAG_INVERTED']);
  });

  it('skips Various Artists and albums without artist tags', () => {
    expect(codes('Various Artists', { artist: 'Yes' })).toEqual([]);
    expect(codes('Yes', { title: 'Roundabout' })).toEqual([]);
  });
});
