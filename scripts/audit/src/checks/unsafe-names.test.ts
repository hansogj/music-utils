import { describe, expect, it } from 'vitest';

import type { AlbumLayout, TrackInfo } from '../types.js';
import { checkUnsafeNames, fromSfm, safeAlbumFolder, safeArtistFolder, safeFileName } from './unsafe-names.js';

const layout = (artistName: string, albumFolder: string): AlbumLayout => ({
  letterDir: artistName.charAt(0),
  artistName,
  albumFolder,
  albumPath: `/m/${artistName}/${albumFolder}`,
});
const track = (fileName: string): TrackInfo => ({
  filePath: `/x/${fileName}`,
  fileName,
  ext: 'flac',
  tags: {},
  parsedName: undefined,
});
const check = (artist: string, album: string, files: string[] = []) =>
  checkUnsafeNames(layout(artist, album), files.map(track)).map((i) => [i.code, i.suggestion]);

describe('checkUnsafeNames', () => {
  it('reports an album folder with ":", "?" or a trailing dot, offering the safe name', () => {
    expect(check('Klaus Badelt', '2003 Pirates Of The Caribbean: The Curse Of The Black Pearl')).toEqual([
      ['UNSAFE_FOLDER_NAME', 'Rename to "2003 Pirates Of The Caribbean - The Curse Of The Black Pearl"'],
    ]);
    expect(check('Dexter Gordon', '1961 Dexter Calling...')).toEqual([
      ['UNSAFE_FOLDER_NAME', 'Rename to "1961 Dexter Calling"'],
    ]);
    expect(check('Tim Buckley', '1970 How Long This Time? Live 1970')).toEqual([
      ['UNSAFE_FOLDER_NAME', 'Rename to "1970 How Long This Time Live 1970"'],
    ]);
  });

  it('lets an artist folder keep its trailing dots, not its quotes', () => {
    expect(check('I.P.A.', '2009 It Is Possible')).toEqual([]);
    expect(check('Richard "Groove" Holmes', '1966 Soul Message')).toEqual([
      ['UNSAFE_ARTIST_NAME', 'Rename to "Richard Groove Holmes"'],
    ]);
  });

  it('reports the file names once for the album', () => {
    expect(
      check('Yes', '1972 Close To The Edge', ['01 - Close To The Edge: I.flac', '02 - And You And I.flac']),
    ).toEqual([['UNSAFE_FILE_NAME', 'Rename to "01 - Close To The Edge - I.flac"']]);
  });

  it('reads the private-use characters a Synology share stores (run on the NAS itself)', () => {
    expect(fromSfm('Pirates\uF022 The Curse\uF029')).toBe('Pirates: The Curse.');
    expect(check('Klaus Badelt', '2003 Pirates Of The Caribbean\uF022 The Curse')).toEqual([
      ['UNSAFE_FOLDER_NAME', 'Rename to "2003 Pirates Of The Caribbean - The Curse"'],
    ]);
  });

  it('is quiet for safe names', () => {
    expect(check('The Doors', '1967 The Doors (Disc 1∕2) [FLAC]', ['01 - Break On Through.flac'])).toEqual([]);
  });
});

describe('safe names', () => {
  it('as the renames make them', () => {
    expect(safeArtistFolder('AC/DC')).toBe('AC - DC');
    expect(safeAlbumFolder('1961 Dexter Calling . . .')).toBe('1961 Dexter Calling');
    expect(safeFileName('03 - What?.mp3')).toBe('03 - What.mp3');
  });
});
