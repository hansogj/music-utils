import { type AlbumAudit } from '../types.js';

// The repair log event and the background scan queue (AuditStream).

export interface RepairEvent {
  ts: string;
  session: string;
  album: string;
  issue: string;
  severity: string;
  action: string;
  result: 'fixed' | 'skipped' | 'failed' | 'no-action';
  error?: string;
}

// ── streaming audit queue ────────────────────────────────────────────────────

export class AuditStream {
  private buffer: AlbumAudit[] = [];
  private waiter?: () => void;
  private closed = false;
  /** Albums scanned so far (`done` of `total` found by the walk); albums to repair found so
   *  far (`found`) and handed out (`taken`, the number of the album being repaired). */
  progress: Required<ScanProgress> = { done: 0, total: 0, found: 0, taken: 0 };

  constructor(total = 0) {
    this.progress.total = total;
  }

  /** One more album scanned (whether or not it has issues). */
  scanned(): void {
    this.progress.done++;
  }

  /** True while nothing is ready and the scan is still running: next() will wait. */
  get waiting(): boolean {
    return this.buffer.length === 0 && !this.closed;
  }

  push(audit: AlbumAudit): void {
    this.progress.found++;
    this.buffer.push(audit);
    this.waiter?.();
    this.waiter = undefined;
  }

  close(): void {
    this.closed = true;
    this.waiter?.();
  }

  async next(): Promise<AlbumAudit | null> {
    while (this.buffer.length === 0 && !this.closed) {
      await new Promise<void>((r) => {
        this.waiter = r;
      });
    }
    const audit = this.buffer.shift();
    if (!audit) return null;
    this.progress.taken++;
    return audit;
  }
}

// "Scan ▕████░░░░▏ 120/340  35%" while the background scan runs, then the total.
export interface ScanProgress {
  done: number;
  total: number;
  found?: number;
  taken?: number;
}
