import { DEFAULT_CONFIG } from './defaults';
import type { Config } from './schema';
import { ConfigError, validateConfig } from './validate';

const cloneDefault = (): Config => JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as Config;

describe('validateConfig', () => {
  it('accepts the default config', () => {
    expect(() => validateConfig(DEFAULT_CONFIG)).not.toThrow();
  });

  it('accepts libraryRoot: undefined', () => {
    const cfg = cloneDefault();
    delete cfg.libraryRoot;
    expect(() => validateConfig(cfg)).not.toThrow();
  });

  describe('type errors', () => {
    it('rejects non-string tracksFile', () => {
      const cfg = { ...cloneDefault(), tracksFile: 42 as unknown as string };
      expect(() => validateConfig(cfg)).toThrow(ConfigError);
      expect(() => validateConfig(cfg)).toThrow(/tracksFile/);
    });

    it('rejects non-string pattern', () => {
      const cfg = cloneDefault();
      (cfg.patterns as unknown as Record<string, unknown>).albumFolder = null;
      expect(() => validateConfig(cfg)).toThrow(/patterns\.albumFolder/);
    });

    it('rejects non-boolean sortArticles', () => {
      const cfg = cloneDefault();
      (cfg.artist as unknown as Record<string, unknown>).sortArticles = 'yes';
      expect(() => validateConfig(cfg)).toThrow(/artist\.sortArticles/);
    });

    it('rejects non-array articles', () => {
      const cfg = cloneDefault();
      (cfg.artist as unknown as Record<string, unknown>).articles = 'the';
      expect(() => validateConfig(cfg)).toThrow(/artist\.articles/);
    });
  });

  describe('disc.separator', () => {
    it('rejects empty string', () => {
      const cfg = { ...cloneDefault(), disc: { separator: '' } };
      expect(() => validateConfig(cfg)).toThrow(/disc\.separator.*non-empty/);
    });

    it('rejects a value containing "/"', () => {
      const cfg = { ...cloneDefault(), disc: { separator: 'a/b' } };
      expect(() => validateConfig(cfg)).toThrow(/disc\.separator.*"\/"/);
    });

    it('accepts a plain hyphen', () => {
      const cfg = { ...cloneDefault(), disc: { separator: '-' } };
      expect(() => validateConfig(cfg)).not.toThrow();
    });
  });

  describe('flac.compressionLevel', () => {
    it('rejects a string like "banana"', () => {
      const cfg = cloneDefault();
      (cfg.flac as unknown as Record<string, unknown>).compressionLevel = 'banana';
      expect(() => validateConfig(cfg)).toThrow(/flac\.compressionLevel.*integer/);
    });

    it('rejects out-of-range values', () => {
      expect(() => validateConfig({ ...cloneDefault(), flac: { compressionLevel: -1 } })).toThrow(/0–8/);
      expect(() => validateConfig({ ...cloneDefault(), flac: { compressionLevel: 9 } })).toThrow(/0–8/);
    });

    it('rejects non-integer numbers', () => {
      expect(() => validateConfig({ ...cloneDefault(), flac: { compressionLevel: 5.5 } })).toThrow(/integer/);
    });

    it('accepts 0 through 8', () => {
      for (let i = 0; i <= 8; i += 1) {
        expect(() => validateConfig({ ...cloneDefault(), flac: { compressionLevel: i } })).not.toThrow();
      }
    });
  });
});
