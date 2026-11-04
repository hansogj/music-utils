import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadEnv, SHARED_ENV_PATH, userHome } from './env.js';

function passwdWith(line: string): string {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'env-test-')), 'passwd');
  writeFileSync(file, `root:x:0:0:root:/root:/bin/bash\n${line}\n`);
  return file;
}

describe('userHome', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns homedir when not running under sudo', () => {
    expect(userHome({})).toBe(os.homedir());
  });

  it('ignores SUDO_USER when the process is not root', () => {
    vi.spyOn(process as { getuid: () => number }, 'getuid').mockReturnValue(1001);
    expect(userHome({ SUDO_USER: 'alice' }, passwdWith('alice:x:1001:1001::/home/alice:/bin/bash'))).toBe(os.homedir());
  });

  it("returns the sudo user's home when running as root", () => {
    vi.spyOn(process as { getuid: () => number }, 'getuid').mockReturnValue(0);
    expect(userHome({ SUDO_USER: 'alice' }, passwdWith('alice:x:1001:1001::/home/alice:/bin/bash'))).toBe(
      '/home/alice',
    );
  });

  it('falls back to homedir when the sudo user is unknown or passwd is unreadable', () => {
    vi.spyOn(process as { getuid: () => number }, 'getuid').mockReturnValue(0);
    expect(userHome({ SUDO_USER: 'bob' }, passwdWith('alice:x:1001:1001::/home/alice:/bin/bash'))).toBe(os.homedir());
    expect(userHome({ SUDO_USER: 'alice' }, '/nonexistent/passwd')).toBe(os.homedir());
  });
});

describe('loadEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env['AUDIT_TEST_A'];
    delete process.env['AUDIT_TEST_B'];
  });

  it('loads the shared env file without overriding already-set vars', () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'env-home-'));
    const envFile = path.join(home, SHARED_ENV_PATH);
    mkdirSync(path.dirname(envFile), { recursive: true });
    writeFileSync(envFile, 'AUDIT_TEST_A=from-file\nAUDIT_TEST_B=from-file\n');
    process.env['AUDIT_TEST_B'] = 'preset';
    vi.stubEnv('HOME', home);

    expect(loadEnv()).toBe(envFile);
    expect(process.env['AUDIT_TEST_A']).toBe('from-file');
    expect(process.env['AUDIT_TEST_B']).toBe('preset');
  });
});
