import { emitKeypressEvents } from 'node:readline';

import chalk from 'chalk';

import { parseDiscogsRef } from '../discogs.js';
import { type DiscogsSearchResult } from '../types.js';
import { closeRl } from './prompt.js';

// The interactive Discogs release picker and release-ID parsing.

// " (1989, orig. 1970)" for a reissue, " (1970)" otherwise.
export function yearLabel(r: DiscogsSearchResult): string {
  if (!r.year) return r.originalYear ? ` (orig. ${r.originalYear})` : '';
  return r.originalYear && r.originalYear !== r.year ? ` (${r.year}, orig. ${r.originalYear})` : ` (${r.year})`;
}

// " · CD", " · Vinyl", " · File": the release's format as the search lists it first;
// " · in collection" for one the user owns (the Discogs collection CSV).
export function formatLabel(r: DiscogsSearchResult): string {
  return `${r.format?.[0] ? ` · ${r.format[0]}` : ''}${r.owned ? ' · in collection' : ''}`;
}

// Returns: selected release ID string, undefined = "enter different ID", null = Esc (go back)
export async function pickRelease(results: DiscogsSearchResult[]): Promise<string | null | undefined> {
  if (results.length === 0) return undefined;
  if (!process.stdin.isTTY) return undefined; // non-interactive — fall back to text input

  const items = [
    // ★ on the suggested hit: the first, as ranked by rankResults().
    ...results.map((r, i) => {
      const yr = yearLabel(r);
      const isBest = i === 0 && r.matchScore !== undefined;
      const score =
        r.matchScore !== undefined
          ? ` ${Math.round(r.matchScore * 100)}%${r.trackCount ? ` · ${r.trackCount}tr` : ''}`
          : '';
      return { id: String(r.id), label: `[${r.id}] ${r.title}${yr}${formatLabel(r)}`, score, isBest };
    }),
    { id: '', label: 'Enter a different release ID…', score: '', isBest: false },
  ];

  let idx = 0;

  const renderItem = (item: (typeof items)[0], active: boolean): string => {
    const cursor = active ? chalk.cyan('▶') : ' ';
    const star = item.isBest ? chalk.yellow('★') : ' ';
    const label = active ? chalk.bold.white(item.label) : chalk.white(item.label);
    const score = item.score ? chalk.dim(item.score) : '';
    return `  ${cursor} ${star} ${label}${score}`;
  };

  closeRl(); // release readline's stdin listener so raw mode has exclusive access

  process.stdin.setRawMode(true);
  emitKeypressEvents(process.stdin); // assemble escape sequences into named key events
  process.stdout.write('\x1b[?25l'); // hide cursor
  for (const [i, item] of items.entries()) process.stdout.write(renderItem(item, i === idx) + '\n');

  const redraw = () => {
    process.stdout.write(`\x1b[${items.length}A`);
    for (const [i, item] of items.entries()) process.stdout.write(`\x1b[2K${renderItem(item, i === idx)}\n`);
  };

  process.stdout.write(chalk.dim('  Select release (↑↓  Enter  Esc = back to menu):\n'));

  return new Promise<string | null | undefined>((resolve) => {
    let done = false;
    // Ignore any keypress events that fire in the first event-loop tick —
    // they are buffered input from the previous readline prompt, not user intent.
    let ready = false;
    setImmediate(() => {
      ready = true;
    });

    const cleanup = (result: string | null | undefined) => {
      if (done) return;
      done = true;
      process.stdin.off('keypress', onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause(); // hand control back; ask() recreates readline when needed
      process.stdout.write('\x1b[?25h'); // show cursor
      resolve(result);
    };

    const onKey = (_str: string | undefined, key: { name?: string; ctrl?: boolean }) => {
      if (!ready) return;
      try {
        if (key.name === 'up') {
          idx = (idx - 1 + items.length) % items.length;
          redraw();
        } else if (key.name === 'down') {
          idx = (idx + 1) % items.length;
          redraw();
        } else if (key.name === 'return') {
          process.stdout.write('\n');
          cleanup(items[idx].id || undefined); // undefined = "Enter different ID" row
        } else if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
          process.stdout.write('\n');
          cleanup(null); // null = go back to action menu
        }
      } catch (err) {
        cleanup(null);
        console.error(chalk.red(`  picker error: ${err instanceof Error ? err.message : String(err)}`));
      }
    };

    process.stdin.on('keypress', onKey);
    process.stdin.resume(); // 'keypress' is a custom event — resume() is needed to keep stdin flowing
  });
}

// ── parse helpers ─────────────────────────────────────────────────────────────

// Accepts: plain digits, r<id>, [r<id>], full release URLs.
// Rejects master IDs (m<id> / /master/<id>) with a clear message.
export function parseReleaseRef(raw: string) {
  const ref = parseDiscogsRef(raw);
  if (!ref)
    console.log(
      chalk.yellow(
        `  ⚠ Unrecognised format. Enter a release ID (4565937, r4565937), a master ID (m1439) or a Discogs URL.`,
      ),
    );
  return ref;
}
