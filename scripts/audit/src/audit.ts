import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

import { walkLibrary, listMusicFiles } from './walk.js';
import { readTags } from './tags.js';
import { parseNameFromFilename } from './checks/names.js';
import { checkFolderFormat } from './checks/folder.js';
import { checkTags } from './checks/tags.js';
import { checkNameTagMatch } from './checks/names.js';
import { checkDuplicates } from './checks/duplicates.js';
import { searchDiscogs } from './discogs.js';
import { printReport } from './report.js';
import type { AlbumAudit, AlbumLayout, AuditReport, Issue, Severity, TrackInfo } from './types.js';

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

// ---------------------------------------------------------------------------
// Track reading
// ---------------------------------------------------------------------------

async function readTracks(layout: AlbumLayout): Promise<TrackInfo[]> {
  const files = await listMusicFiles(layout.albumPath);
  const tracks: TrackInfo[] = [];

  for (const { name, ext } of files) {
    const filePath = path.join(layout.albumPath, name);
    const { tags, error } = await readTags(filePath, ext);
    tracks.push({
      filePath,
      fileName: name,
      ext,
      tags,
      parsedName: parseNameFromFilename(name),
      tagReadError: error,
    });
  }

  return tracks;
}

// ---------------------------------------------------------------------------
// Album audit
// ---------------------------------------------------------------------------

async function auditAlbum(
  layout: AlbumLayout,
  token: string | undefined,
  skipDiscogs: boolean,
): Promise<AlbumAudit> {
  const tracks = await readTracks(layout);
  const issues: Issue[] = [];

  issues.push(...checkFolderFormat(layout));
  for (const t of tracks) issues.push(...checkTags(t));
  for (const t of tracks) issues.push(...checkNameTagMatch(t));
  issues.push(...checkDuplicates(tracks));

  let discogsResults = undefined;
  if (!skipDiscogs && token && issues.length > 0) {
    try {
      discogsResults = await searchDiscogs(layout.artistName, layout.albumFolder, token);
    } catch {
      // Discogs rate-limit or network — silently skip per-album
    }
  }

  return { layout, tracks, issues, discogsResults };
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

async function main() {
  // pnpm run audit -- --root ... injects a bare '--' into argv; strip it
  const args = process.argv.slice(2).filter((a) => a !== '--');

  if (hasFlag(args, 'help') || args.includes('-h')) {
    console.log(`
Usage: pnpm audit -- [options]

Options:
  --root=<path>       Root of music library (default: cwd)
  --token=<token>     Discogs personal access token (or set DISCOGS_TOKEN env)
  --no-discogs        Skip Discogs API calls entirely
  --json              Output raw JSON instead of formatted report
  --help, -h          Show this help

Example (against test data, no Discogs):
  pnpm audit -- --root=../../packages/music-utils/test-data/raw --no-discogs

Example (real library with Discogs suggestions):
  pnpm audit -- --root=/mnt/music --token=YOUR_TOKEN
`);
    return;
  }

  const root = path.resolve(getArg(args, 'root') ?? process.cwd());
  const token = getArg(args, 'token') ?? process.env['DISCOGS_TOKEN'];
  const skipDiscogs = hasFlag(args, 'no-discogs') || !token;
  const jsonOutput = hasFlag(args, 'json');

  try {
    await fs.access(root);
  } catch {
    console.error(`Root directory not found: ${root}`);
    process.exit(1);
  }

  if (!skipDiscogs && !token) {
    console.warn('No DISCOGS_TOKEN — run with --no-discogs or set the env var to get Discogs suggestions.');
  }

  process.stderr.write(`Scanning ${root} ...\n`);

  const layouts = await walkLibrary(root);
  process.stderr.write(`Found ${layouts.length} album(s). Running checks`);

  const audits: AlbumAudit[] = [];
  for (const layout of layouts) {
    const audit = await auditAlbum(layout, token, skipDiscogs);
    audits.push(audit);
    process.stderr.write(audit.issues.length > 0 ? '!' : '.');
  }
  process.stderr.write('\n');

  const report: AuditReport = {
    root,
    date: new Date().toISOString().slice(0, 10),
    audits,
    summary: buildSummary(audits),
  };

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
