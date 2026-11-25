import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';

import { envFlag, loadEnv } from './env.js';
loadEnv();

import { auditAlbum } from './audit-album.js';
import { AuditLogger } from './logger.js';
import { LiveProgress } from './progress.js';
import { AuditStream, runRepair } from './repair.js';
import { printReport } from './report.js';
import { serveReport } from './server.js';
import type { AlbumAudit, AlbumLayout, AuditReport, Severity } from './types.js';
import { auditVersion } from './version.js';
import { walkLibrary } from './walk.js';

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

function getArg(args: string[], flag: string): string | undefined {
  // --flag=value form
  const eqHit = args.find((a) => a.startsWith(`--${flag}=`));
  if (eqHit) return eqHit.slice(`--${flag}=`.length);
  // --flag value form (next token that isn't itself a flag)
  const idx = args.indexOf(`--${flag}`);
  if (idx >= 0 && idx + 1 < args.length && !args[idx + 1].startsWith('-')) {
    return args[idx + 1];
  }
  return undefined;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(`--${flag}`);
}

function auditLogPath(suffix: string): string {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return path.join(os.homedir(), '.local', 'share', 'music-audit', `${yyyy}.${mm}.${dd}.${hh}.${min}-${suffix}.log`);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function buildSummary(audits: AlbumAudit[]) {
  const count = (sev: Severity) => audits.reduce((n, a) => n + a.issues.filter((i) => i.severity === sev).length, 0);
  return {
    albumsScanned: audits.length,
    tracksScanned: audits.reduce((n, a) => n + a.tracks.length, 0),
    albumsWithIssues: audits.filter((a) => a.issues.length > 0).length,
    issuesBySeverity: { SEVERE: count('SEVERE'), HIGH: count('HIGH'), MODERATE: count('MODERATE') },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const TOKEN_HELP = `
Discogs needs a personal access token. Make one at https://www.discogs.com/settings/developers
("Generate new token"), then either:
  - add  DISCOGS_TOKEN=<token>  to ~/.config/music-utils/.env  (read on every run), or
  - export DISCOGS_TOKEN=<token>, or
  - pass --token <token>.
`;

// No Discogs token: go on offline (no Discogs), or quit. Asked on stderr, so --json output
// stays clean; a run without a terminal to ask on goes on offline.
async function goOffline(): Promise<boolean> {
  if (!process.stdin.isTTY) {
    process.stderr.write('No DISCOGS_TOKEN — running offline (no Discogs).\n');
    return true;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question('No Discogs token found. [c] Continue offline (no Discogs)   [q] Quit: ');
    return answer.trim().toLowerCase() === 'c';
  } finally {
    rl.close();
  }
}

async function main() {
  // pnpm run audit -- --root ... injects a bare '--' into argv; strip it
  const args = process.argv.slice(2).filter((a) => a !== '--');

  if (hasFlag(args, 'version') || args.includes('-v')) {
    console.log(`music-audit ${auditVersion()}`);
    return;
  }

  if (hasFlag(args, 'help') || args.includes('-h')) {
    console.log(`music-audit ${auditVersion()}

Usage: music-audit [options]
       pnpm --filter @hansogj/music-audit run audit -- [options]

Options:
  --root=<path>       Root of music library (default: cwd)
  --token=<token>     Discogs personal access token (or set DISCOGS_TOKEN env var,
                      or add DISCOGS_TOKEN=... to ~/.config/music-utils/.env).
                      Without one you are asked whether to go on offline (no Discogs);
                      a run that can't ask (no terminal) goes on offline
  --check-years       Check that albums tagged with a Discogs release ID use the original
                      (master) year, not a reissue's. Sends every tagged release ID to
                      Discogs (cached after the first run). Default: off, or on when
                      MUSIC_AUDIT_CHECK_YEARS=true is set in ~/.config/music-utils/.env
  --no-check-years    Turn the year check off for this run, overriding the .env setting
  --no-covers         Skip the cover checks (cover.jpg in album and artist folders, and
                      whether it is the Discogs release's or master's cover)
  --repair            Interactive repair mode. An album without a Discogs release ID is tagged
                      from Discogs first (or a pasted tracklist), then its issues one by one
  --retag             Like --repair, and every album is offered a new Discogs tagging, also
                      one tagged from a release already (that release ID suggested)
  --ui                Serve audit report as HTML in browser at http://localhost:7171
  --json              Output raw JSON instead of formatted report (incompatible with --repair/--ui)
  --log[=<path>]      Append structured JSON Lines audit log (default: ~/.local/share/music-audit/YYYY.MM.dd.HH.mm-audit.log)

Report mode (no --repair/--retag) only reads; it never writes to the library.
  --help, -h          Show this help
  --version, -v       Show the version: the commit this checkout runs, its branch and date

Examples:
  # Audit only (no Discogs):
  DISCOGS_TOKEN= pnpm audit -- --root=../../packages/music-utils/test-data/raw

  # Audit with Discogs suggestions:
  music-audit --root ~/Music --token YOUR_TOKEN

  # Interactive repair (run as sudo if files are root-owned):
  sudo $(which pnpm) --filter @hansogj/music-audit run audit -- --repair --root /mnt/music --token YOUR_TOKEN
`);
    return;
  }

  const root = path.resolve(getArg(args, 'root') ?? process.cwd());
  const token = getArg(args, 'token') || process.env['DISCOGS_TOKEN'] || undefined;
  const skipDiscogs = !token;
  const retagMode = hasFlag(args, 'retag');
  const repairMode = hasFlag(args, 'repair') || retagMode;
  const uiMode = hasFlag(args, 'ui') && !repairMode;
  const jsonOutput = hasFlag(args, 'json') && !repairMode && !uiMode;
  const checkYears =
    !hasFlag(args, 'no-check-years') && (hasFlag(args, 'check-years') || envFlag('MUSIC_AUDIT_CHECK_YEARS'));
  const logPath = getArg(args, 'log') ?? (hasFlag(args, 'log') ? auditLogPath('audit') : undefined);
  const logger = logPath ? new AuditLogger(logPath) : undefined;

  try {
    await fs.access(root);
  } catch {
    console.error(`Root directory not found: ${root}`);
    process.exit(1);
  }

  if (!token && !(await goOffline())) {
    process.stderr.write(TOKEN_HELP);
    process.exit(1);
  }

  if (checkYears && skipDiscogs) {
    process.stderr.write('Year check skipped — it needs Discogs (no token).\n');
  }

  process.stderr.write(`Scanning ${root} ...\n`);

  const mode = retagMode ? 'retag' : repairMode ? 'repair' : 'audit';
  const checkCovers = !hasFlag(args, 'no-covers');
  const auditOpts = { token, skipDiscogs, searchAlways: retagMode, checkYears, checkCovers };
  // Repair tags an album without a release ID from Discogs first: search for it too.
  const repairOpts = { ...auditOpts, searchUntagged: true };
  await logger?.logSession(mode, root);

  const layouts = await walkLibrary(root);

  if (repairMode) {
    process.stderr.write(`Found ${layouts.length} album(s) — scanning in background.\n`);
    // Stream mode: scan in background while user interacts with found albums.
    const stream = new AuditStream(layouts.length);
    const allAudits: AlbumAudit[] = [];

    const scanTask = (async () => {
      for (const layout of layouts) {
        const audit = await auditAlbum(layout, { ...repairOpts, writeInfo: true });
        allAudits.push(audit);
        stream.scanned();
        await logger?.logAlbum(audit);
        if (retagMode || audit.issues.length > 0 || (token && !audit.releaseId)) stream.push(audit);
      }
      stream.close();
    })();

    // After each fix the album is scanned again (no new Discogs search) so later issues
    // reflect the files as they are now, not as they were before the fix.
    const reaudit = (layout: AlbumLayout) => auditAlbum(layout, { ...repairOpts, search: false });
    await runRepair(stream, token, { retag: retagMode, reaudit });
    await scanTask; // ensure scan finishes (may already be done)

    const summary = buildSummary(allAudits);
    await logger?.logSummary(summary);
  } else {
    const total = layouts.length;
    const audits: AlbumAudit[] = [];
    const live = new LiveProgress('albums', () => ({ done: audits.length, total })).start();
    for (const layout of layouts) {
      const audit = await auditAlbum(layout, auditOpts);
      audits.push(audit);
      await logger?.logAlbum(audit);
    }
    live.stop();
    const issues = audits.reduce((s, a) => s + a.issues.length, 0);
    process.stderr.write(`  ✓  ${total} album(s) scanned — ${issues} issue(s) found\n`);

    const summary = buildSummary(audits);
    await logger?.logSummary(summary);

    const report: AuditReport = {
      root,
      date: new Date().toISOString().slice(0, 10),
      audits,
      summary,
    };

    if (uiMode) {
      serveReport(report);
    } else if (jsonOutput) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printReport(report);
    }
  }
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
