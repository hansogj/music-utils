import { DISC_LABEL, DISC_NO_SPLIT } from '../constants';
import type { Release, Track } from '../types';
import { DEFAULT_CONFIG } from './defaults';
import { renderAlbumFolder, renderArtistFolder, renderTemplate, renderTrackName } from './render';
import type { Config } from './schema';

describe('renderTemplate', () => {
  it('substitutes tokens from vars', () => {
    expect(renderTemplate('{a}-{b}', { a: 'x', b: 'y' })).toBe('x-y');
  });
  it('missing keys resolve to empty string', () => {
    expect(renderTemplate('{a}{missing}{c}', { a: '1', c: '3' })).toBe('13');
  });
  it('unknown tokens with undefined values become empty', () => {
    expect(renderTemplate('{a}', { a: undefined })).toBe('');
  });
  it('leaves non-token text untouched', () => {
    expect(renderTemplate('literal', {})).toBe('literal');
  });
});

describe('renderAlbumFolder', () => {
  const release: Partial<Release> = { artist: 'Led Zeppelin', album: 'IV', year: '1971' };

  it('renders single-disc default template', () => {
    expect(renderAlbumFolder(release, DEFAULT_CONFIG)).toBe('1971 IV');
  });

  it('appends discSuffix when noOfDiscs > 1', () => {
    expect(renderAlbumFolder({ ...release, discNumber: '1', noOfDiscs: '2' }, DEFAULT_CONFIG)).toBe(
      `1971 IV (${DISC_LABEL} 1${DISC_NO_SPLIT}2)`,
    );
  });

  it('omits discSuffix when noOfDiscs equals 1', () => {
    expect(renderAlbumFolder({ ...release, discNumber: '1', noOfDiscs: '1' }, DEFAULT_CONFIG)).toBe('1971 IV');
  });

  it('appends auxSuffix when aux present', () => {
    expect(renderAlbumFolder({ ...release, aux: 'remaster' }, DEFAULT_CONFIG)).toBe('1971 IV [remaster]');
  });

  it('honors an overridden template', () => {
    const cfg: Config = {
      ...DEFAULT_CONFIG,
      patterns: { ...DEFAULT_CONFIG.patterns, albumFolder: '{album} - {year}' },
    };
    expect(renderAlbumFolder(release, cfg)).toBe('IV - 1971');
  });
});

describe('renderArtistFolder', () => {
  it('uses the artist token by default', () => {
    expect(renderArtistFolder({ artist: 'Magma' }, DEFAULT_CONFIG)).toBe('Magma');
  });
});

describe('renderTrackName', () => {
  const track: Partial<Track> = { trackName: 'Rock And Roll', trackNo: '01' };

  it('renders single-disc track template', () => {
    expect(renderTrackName(track, { noOfDiscs: '1' }, DEFAULT_CONFIG)).toBe('01 Rock And Roll');
  });

  it('renders multi-disc track template when noOfDiscs > 1', () => {
    expect(renderTrackName({ ...track, discNumber: '2' }, { noOfDiscs: '2' }, DEFAULT_CONFIG)).toBe(
      'd2t01. Rock And Roll',
    );
  });

  it('falls back to release.discNumber when track has none', () => {
    expect(renderTrackName(track, { discNumber: '1', noOfDiscs: '2' }, DEFAULT_CONFIG)).toBe('d1t01. Rock And Roll');
  });

  it('honors a template that references {artist}', () => {
    const cfg: Config = {
      ...DEFAULT_CONFIG,
      patterns: { ...DEFAULT_CONFIG.patterns, track: '{trackNo} {artist} - {title}' },
    };
    expect(renderTrackName(track, { artist: 'Zep', noOfDiscs: '1' }, cfg)).toBe('01 Zep - Rock And Roll');
  });
});
