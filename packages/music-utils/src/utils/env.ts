import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import * as dotenv from 'dotenv';

// Shared with scripts/audit — keep the two in sync.
export const SHARED_ENV_PATH = path.join('.config', 'music-utils', '.env');

// Under sudo HOME is usually /root, so resolve the invoking user's home from /etc/passwd.
export const userHome = (env: NodeJS.ProcessEnv = process.env, passwd = '/etc/passwd'): string => {
  const sudoUser = env['SUDO_USER'];
  if (!sudoUser || process.getuid?.() !== 0) return homedir();

  try {
    const entry = readFileSync(passwd, 'utf8')
      .split('\n')
      .map((line) => line.split(':'))
      .find(([name]) => name === sudoUser);
    return entry?.[5] || homedir();
  } catch {
    return homedir();
  }
};

/** Loads `~/.config/music-utils/.env` (the invoking user's home, also under sudo). Already-set vars win. */
export const loadEnv = (): string => {
  const envPath = path.join(userHome(), SHARED_ENV_PATH);
  dotenv.config({ path: envPath, quiet: true });
  return envPath;
};
