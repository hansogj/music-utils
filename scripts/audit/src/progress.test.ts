import { afterEach, describe, expect, it, vi } from 'vitest';

import { CLEAR_LINE, LiveProgress, progressBar } from './progress.js';
import { AuditStream, scanLine } from './repair.js';
import type { AlbumAudit } from './types.js';

function fakeOut(isTTY: boolean, columns = 120) {
  const writes: string[] = [];
  return { writes, out: { isTTY, columns, write: (s: string) => writes.push(s) > 0 } };
}

describe('progressBar', () => {
  it.each([
    [0, 340, '▕░░░░░░░░░░▏ 0/340  0%'],
    [17, 340, '▕█░░░░░░░░░▏ 17/340  5%'],
    [170, 340, '▕█████░░░░░▏ 170/340  50%'],
    [340, 340, '▕██████████▏ 340/340  100%'],
  ])('%i of %i', (done, total, expected) => {
    expect(progressBar(done, total, 10)).toBe(expected);
  });

  it('shows an empty scan as complete, and never overflows', () => {
    expect(progressBar(0, 0, 4)).toBe('▕████▏ 0/0  100%');
    expect(progressBar(5, 3, 4)).toBe('▕████▏ 5/3  100%');
  });
});

describe('LiveProgress', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('redraws one line on a terminal and erases it when stopped', () => {
    vi.useFakeTimers();
    const { writes, out } = fakeOut(true);
    let done = 0;
    const live = new LiveProgress('albums', () => ({ done, total: 4 }), out, 100).start();
    expect(writes[0]).toMatch(/^\r\x1b\[K {2}⠋ ▕░+▏ 0\/4 {2}0% albums$/);
    done = 2;
    vi.advanceTimersByTime(100);
    expect(writes[1]).toContain('2/4  50% albums');
    live.stop();
    expect(writes.at(-1)).toBe(CLEAR_LINE);
    vi.advanceTimersByTime(1000);
    expect(writes).toHaveLength(3); // no redraws after stop
  });

  it('cuts the line to the terminal width', () => {
    const { writes, out } = fakeOut(true, 20);
    new LiveProgress('albums', () => ({ done: 1, total: 2 }), out).render();
    expect(writes[0].length).toBe(CLEAR_LINE.length + 19);
  });

  it('writes nothing when stderr is not a terminal', () => {
    const { writes, out } = fakeOut(false);
    const live = new LiveProgress('albums', () => ({ done: 1, total: 2 }), out).start();
    live.render();
    live.stop();
    expect(writes).toEqual([]);
  });
});

describe('scan progress in repair mode', () => {
  it('counts scanned albums and knows when next() will wait', async () => {
    const stream = new AuditStream(3);
    expect(stream.waiting).toBe(true);
    stream.scanned();
    stream.scanned();
    stream.push({} as AlbumAudit);
    expect(stream.progress).toEqual({ done: 2, total: 3 });
    expect(stream.waiting).toBe(false);
    await stream.next();
    expect(stream.waiting).toBe(true);
    stream.close();
    expect(stream.waiting).toBe(false);
  });

  it('shows the bar while scanning and the total when done', () => {
    expect(scanLine({ done: 120, total: 340 })).toMatch(/^ {3}Scan ▕█+░+▏ 120\/340 {2}35%$/);
    expect(scanLine({ done: 340, total: 340 })).toBe('   Scan done: 340 albums');
    expect(scanLine({ done: 1, total: 1 })).toBe('   Scan done: 1 album');
  });
});
