import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { auditVersion } from './version.js';

describe('auditVersion', () => {
  it('is the commit, branch and commit date in a checkout', () => {
    // CI checks out a detached HEAD: the branch is then "HEAD".
    expect(auditVersion()).toMatch(/^[0-9a-f]{7,} \(\S+, \d{4}-\d\d-\d\d\)$/);
  });

  it("is package.json's version outside a checkout", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-version-'));
    try {
      const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
      expect(auditVersion(dir)).toBe(pkg.version);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
