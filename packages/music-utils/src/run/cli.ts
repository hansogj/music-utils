#!/usr/bin/env node
import '../utils/polyfills';

const isFlag = (s?: string) => !s || s.startsWith('-');
const [, , ...rawArgs] = process.argv;

// Parse cmd and optional sub, consuming only recognised 2-token pairs
let idx = 0;
const cmd = !isFlag(rawArgs[idx]) ? rawArgs[idx++] : undefined;
const potentialSub = !isFlag(rawArgs[idx]) ? rawArgs[idx] : undefined;

const TWO_TOKEN_COMMANDS = new Set([
  'tag album',
  'tag tracks',
  'tag bulk',
  'cover album',
  'cover bulk',
  'audit repair',
  'audit retag',
]);
const twoTokenKey = cmd && potentialSub ? `${cmd} ${potentialSub}` : undefined;
const sub = twoTokenKey && TWO_TOKEN_COMMANDS.has(twoTokenKey) ? (idx++, potentialSub) : undefined;

// Strip subcommand tokens so getCommandLineArgs() sees only flags downstream
process.argv.splice(2, idx);

// ── Help ─────────────────────────────────────────────────────────────────────

function printHelp(context?: string) {
  const hint = context ? `\nUnknown subcommand for '${context}'. ` : '';
  process.stdout.write(`${hint}
Usage: mu          <command> [subcommand] [options]
       music-utils <command> [subcommand] [options]

Commands:
  rip                              Rip a CD and tag tracks from Discogs
  tag album    [-a DIR]            Tag an album from folder/path structure
  tag tracks   [-a DIR] [-f FILE]  Tag tracks from a tracklist file
  tag bulk     [DIR]               Tag all album subdirectories in DIR
  cover        [-a DIR] [-r ID] [-Q]  Fetch album cover from Discogs
  cover album  [-a DIR]            Fetch cover and tag album (combined)
  cover bulk   [DIR]               Fetch covers for all albums in DIR
  sync         [-a DIR]            Rename track files to match tags
  similarities [-A DIR] [-B DIR] [-T N]  Find similar artists across two libraries
  audit        [--root DIR] [--token T]  Audit music library for issues
  audit repair [--root DIR] [--token T]  Interactive repair mode
  audit retag  [--root DIR] [--token T]  Repair + retag all albums via Discogs
  completion   [bash]              Print shell completion script
  help                             Show this help
`);
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

async function main() {
  switch (cmd) {
    case 'rip':
      await import('./rip.js');
      break;

    case 'tag':
      switch (sub) {
        case 'album':
          await import('./tag.album.js');
          break;
        case 'tracks':
          await import('./tag.tracks.js');
          break;
        case 'bulk':
          await import('./bulk.tag.album.js');
          break;
        default:
          printHelp('tag');
      }
      break;

    case 'cover':
      switch (sub) {
        case 'album':
          await import('./tag.cover.album.js');
          break;
        case 'bulk':
          await import('./bulk.cover.photo.js');
          break;
        default:
          await import('./cover.photo.js');
      }
      break;

    case 'sync':
      await import('./sync.track.names.js');
      break;

    case 'similarities':
      await import('./similarities.js');
      break;

    case 'audit': {
      const { spawnSync } = await import('child_process');
      const auditArgs = process.argv.slice(2);
      if (sub === 'repair') auditArgs.unshift('--repair');
      else if (sub === 'retag') auditArgs.unshift('--retag');
      const result = spawnSync('music-audit', auditArgs, { stdio: 'inherit' });
      if (result.error) {
        process.stderr.write(`mu audit: music-audit not found in PATH. Install it separately.\n`);
        process.exit(1);
      }
      process.exit(result.status ?? 0);
    }

    case 'completion':
      await import('./completion.js');
      break;

    case 'help':
    case undefined:
      printHelp();
      break;

    default:
      process.stderr.write(`Unknown command: ${cmd}\n`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
