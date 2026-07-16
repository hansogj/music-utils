import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DEFAULT_CONFIG } from './defaults';
import { loadConfig } from './load';

describe('loadConfig', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'music-utils-cfg-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns defaults when no config file exists', () => {
    const cfg = loadConfig(tempDir);
    expect(cfg.patterns.albumFolder).toBe(DEFAULT_CONFIG.patterns.albumFolder);
    expect(cfg.artist.sortArticles).toBe(true);
    expect(cfg.libraryRoot).toBeUndefined();
    expect(cfg.tracksFile).toBe(DEFAULT_CONFIG.tracksFile);
    expect(cfg.cover.filename).toBe('cover.jpg');
    expect(cfg.disc.separator).toBe('∕');
    expect(cfg.flac.compressionLevel).toBe(5);
  });

  it('overrides tracksFile from config file', () => {
    writeFileSync(join(tempDir, 'music-utils.config.json'), JSON.stringify({ tracksFile: 'my.tracks.txt' }));
    const cfg = loadConfig(tempDir);
    expect(cfg.tracksFile).toBe('my.tracks.txt');
  });

  it('throws ConfigError when a value has the wrong type', () => {
    writeFileSync(join(tempDir, 'music-utils.config.json'), JSON.stringify({ flac: { compressionLevel: 'banana' } }));
    expect(() => loadConfig(tempDir)).toThrow(/flac\.compressionLevel/);
  });

  it('merges cover/disc/flac partially without dropping other keys', () => {
    writeFileSync(
      join(tempDir, 'music-utils.config.json'),
      JSON.stringify({
        cover: { filename: 'folder.jpg' },
        disc: { separator: '-' },
        flac: { compressionLevel: 8 },
      }),
    );
    const cfg = loadConfig(tempDir);
    expect(cfg.cover.filename).toBe('folder.jpg');
    expect(cfg.disc.separator).toBe('-');
    expect(cfg.flac.compressionLevel).toBe(8);
    // Untouched:
    expect(cfg.artist.sortArticles).toBe(true);
  });

  it('picks up ./music-utils.config.json in cwd', () => {
    writeFileSync(
      join(tempDir, 'music-utils.config.json'),
      JSON.stringify({ libraryRoot: '/tmp/library', artist: { sortArticles: false } }),
    );
    const cfg = loadConfig(tempDir);
    expect(cfg.libraryRoot).toBe('/tmp/library');
    expect(cfg.artist.sortArticles).toBe(false);
    // Unspecified keys stay at defaults
    expect(cfg.artist.articles).toEqual(DEFAULT_CONFIG.artist.articles);
    expect(cfg.patterns.albumFolder).toBe(DEFAULT_CONFIG.patterns.albumFolder);
  });

  it('merges patterns partially without dropping unspecified keys', () => {
    writeFileSync(
      join(tempDir, 'music-utils.config.json'),
      JSON.stringify({ patterns: { albumFolder: '{album} ({year})' } }),
    );
    const cfg = loadConfig(tempDir);
    expect(cfg.patterns.albumFolder).toBe('{album} ({year})');
    expect(cfg.patterns.track).toBe(DEFAULT_CONFIG.patterns.track);
    expect(cfg.patterns.discSuffix).toBe(DEFAULT_CONFIG.patterns.discSuffix);
  });
});
