import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// music-audit runs from the checkout (never published), so its version is the commit that
// runs: "a94e58a (main, 2026-11-25)". Without git (or outside a checkout) package.json's.

const here = path.dirname(fileURLToPath(import.meta.url));

// The checkout's top folder: the nearest folder above `dir` with a .git (a folder, or a
// file in a worktree).
function checkoutOf(dir: string): string | undefined {
  for (let d = dir; ; d = path.dirname(d)) {
    if (existsSync(path.join(d, '.git'))) return d;
    if (path.dirname(d) === d) return undefined;
  }
}

function packageVersion(): string {
  const pkg = JSON.parse(readFileSync(path.join(here, '..', 'package.json'), 'utf8')) as { version: string };
  return pkg.version;
}

/** The running code's version: commit, branch and commit date; else package.json's version. */
export function auditVersion(dir = here): string {
  const top = checkoutOf(dir);
  if (top) {
    // safe.directory: under sudo the checkout belongs to another user, and git refuses it.
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', `safe.directory=${top}`, '-C', top, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    try {
      const [commit, date] = git('log', '-1', '--format=%h %cs').split(' ');
      const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
      return `${commit} (${branch}, ${date})`;
    } catch {
      // no git on PATH, or not a repository after all
    }
  }
  return packageVersion();
}
