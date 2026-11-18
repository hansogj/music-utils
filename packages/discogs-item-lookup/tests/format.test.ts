import { describe, expect, it } from 'vitest';
import { cleanArtistName, flattenTracklist, formatInfoTxt, infoTxtIdLines, joinArtistCredit } from '../src/format';

describe('cleanArtistName', () => {
  it("drops Discogs' (n) suffix", () => {
    expect(cleanArtistName('Dave Greenslade (2)')).toBe('Dave Greenslade');
    expect(cleanArtistName('Area')).toBe('Area');
  });
});

describe('joinArtistCredit', () => {
  it('joins the credited artists as Discogs shows them', () => {
    // Releases 8614313 and 4508999.
    expect(
      joinArtistCredit([
        { name: 'David Holland Quartet', join: '-' },
        { name: 'Dave Holland', join: ',' },
        { name: 'Sam Rivers', join: '' },
      ]),
    ).toBe('David Holland Quartet - Dave Holland, Sam Rivers');
    expect(
      joinArtistCredit([
        { name: 'Patrick Woodroffe', join: '/' },
        { name: 'Dave Greenslade (2)', join: '' },
      ]),
    ).toBe('Patrick Woodroffe, Dave Greenslade');
    expect(joinArtistCredit([{ name: 'A' }, { name: 'B' }])).toBe('A, B');
  });
});

describe('flattenTracklist', () => {
  it('keeps tracks, turns a suite (index) into one track and drops headings', () => {
    const flat = flattenTracklist([
      { position: '', title: 'CD 1', type_: 'heading' },
      { position: '1-4', title: 'Perpetual Change', type_: 'track' },
      {
        position: '',
        title: 'And You And I',
        type_: 'index',
        sub_tracks: [
          { position: '1-5.a', title: 'Cord Of Life', type_: 'track' },
          { position: '1-5.b', title: 'Eclipse', type_: 'track' },
        ],
      },
      { position: '', title: 'Empty index', type_: 'index' },
    ]);
    expect(flat.map((t) => [t.position, t.title])).toEqual([
      ['1-4', 'Perpetual Change'],
      ['1-5', 'And You And I'],
    ]);
  });

  it('takes a vinyl suite position from its first part', () => {
    const flat = flattenTracklist([
      { position: '', title: 'Suite', type_: 'index', sub_tracks: [{ position: 'B2a', title: 'x', type_: 'track' }] },
    ]);
    expect(flat[0].position).toBe('B2');
  });
});

describe('infoTxtIdLines', () => {
  it('writes release, master and disc as fixed Key: value lines', () => {
    expect(infoTxtIdLines({ releaseId: '9004392', masterId: 123456 }, { discNumber: '1', noOfDiscs: '2' })).toEqual([
      'Discogs-Release: 9004392',
      'Discogs-Master: 123456',
      'Disc: 1/2',
      '',
    ]);
  });

  it('leaves out the master line when the release has no master', () => {
    expect(infoTxtIdLines({ releaseId: '42' })).toEqual(['Discogs-Release: 42', '']);
  });
});

describe('formatInfoTxt', () => {
  it('writes header, reissue, country, songs with composers and durations, personnel and IDs', () => {
    const text = formatInfoTxt(
      {
        releaseId: '3422683',
        masterId: 1439,
        title: 'Deep Purple In Rock',
        year: 1970,
        releaseYear: 1989,
        country: 'Europe',
        tracklist: [
          {
            position: '1',
            title: 'Speed King',
            duration: '5:49',
            extraartists: [{ name: 'Ian Gillan (2)', role: 'Written-By' }],
          },
          { position: 'B1', title: 'Hard Lovin’ Man' },
        ],
        extraartists: [{ name: 'Roger Glover (2)', role: 'Bass' }],
      },
      'Deep Purple',
      { discNumber: 1, noOfDiscs: 1 },
    );
    expect(text.split('\n')).toEqual([
      'Deep Purple - Deep Purple In Rock (1970)',
      'Reissue: 1989',
      'EUROPE',
      '',
      'Songs',
      ` ${'1.'.padEnd(4)} ${'Speed King'.padEnd(40)} ${'Ian Gillan'.padEnd(24)} 5:49`,
      ` ${'B1.'.padEnd(4)} Hard Lovin’ Man`,
      '',
      `        ${'Roger Glover'.padEnd(32)}Bass`,
      '',
      'Discogs-Release: 3422683',
      'Discogs-Master: 1439',
      'Disc: 1/1',
      '',
    ]);
  });

  it("falls back to the release's first artist and leaves out what is missing", () => {
    expect(
      formatInfoTxt({ releaseId: '42', title: 'Tormato', year: '1978', artists: ['Yes'], tracklist: [] }, ''),
    ).toBe('Yes - Tormato (1978)\n\nDiscogs-Release: 42\n');
  });
});
