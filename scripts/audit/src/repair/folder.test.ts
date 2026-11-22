import { describe, expect, it } from 'vitest';

import { normName } from './folder.js';

describe('normName', () => {
  it('ignores case and punctuation', () => {
    expect(normName("Give'em Hell")).toBe(normName('Give Em Hell'));
    expect(normName('Kaada & Mike Patton')).toBe(normName('Kaada, Mike Patton'));
  });

  it('keeps letters of every script, ø and é included', () => {
    expect(normName('Hunden Tok Hønene Våre')).not.toBe(normName('Hunden Tok Hnene Vre'));
    expect(normName('Кино')).not.toBe(normName('Аквариум'));
    expect(normName('Кино')).toBe('кино');
  });

  it('reads a decomposed é as the composed one', () => {
    expect(normName('Café'.normalize('NFD'))).toBe(normName('Café'));
  });
});
