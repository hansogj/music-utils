import { readFileSync } from 'fs';
import path from 'path';

import { packageVersion } from './version';

describe('packageVersion', () => {
  it("is music-utils' package.json version", () => {
    const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
    expect(pkg.name).toBe('@hansogj/music-utils');
    expect(packageVersion()).toBe(pkg.version);
    expect(packageVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
