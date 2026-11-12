import { AsyncLocalStorage } from 'node:async_hooks';

// Discogs counts requests per token (or per IP without one) over a moving 60-second
// window and answers 429 once the limit is used up: 60/min with a token, 25 without.
// Every response says where we are:
//   X-Discogs-Ratelimit            the limit
//   X-Discogs-Ratelimit-Used       requests in the current window
//   X-Discogs-Ratelimit-Remaining  what is left
// No Retry-After is sent on 429.
//
// RateLimiter keeps its own log of requests in the window and makes callers wait for a
// free slot before sending, so the background scan never bursts past the limit. The
// limit and the used count are taken from each response, which also covers requests
// made elsewhere with the same token. A 429 pauses every caller at once, with a growing
// pause, and logs once per pause instead of once per request.
//
// Interactive requests (run inside interactive()) have a few slots the background scan
// can't take, so a release fetched at a repair prompt isn't queued behind the scan.

export interface RateLimiterOptions {
  limit?: number;
  windowMs?: number;
  /** Slots only interactive requests may use. */
  reserve?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}

const interactiveScope = new AsyncLocalStorage<boolean>();

/** Runs fn with its Discogs requests ahead of the background scan's. */
export function interactive<T>(fn: () => Promise<T>): Promise<T> {
  return interactiveScope.run(true, fn);
}

export function isInteractive(): boolean {
  return interactiveScope.getStore() === true;
}

export class RateLimiter {
  limit: number;
  private readonly windowMs: number;
  private readonly reserve: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly log: (message: string) => void;
  private stamps: number[] = [];
  private pausedUntil = 0;
  private strikes = 0;
  // One queue per priority: callers wait in order, interactive ones don't wait for the scan.
  private queues: Record<'interactive' | 'background', Promise<void>> = {
    interactive: Promise.resolve(),
    background: Promise.resolve(),
  };

  constructor(opts: RateLimiterOptions = {}) {
    this.limit = opts.limit ?? 25;
    this.windowMs = opts.windowMs ?? 60_000;
    this.reserve = opts.reserve ?? 5;
    this.now = opts.now ?? (() => Date.now());
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.log = opts.log ?? (() => {});
  }

  /** Waits for a free slot in the window and claims it. */
  acquire(priority: boolean = isInteractive()): Promise<void> {
    const key = priority ? 'interactive' : 'background';
    const turn = this.queues[key].then(() => this.waitForSlot(priority));
    this.queues[key] = turn.catch(() => {});
    return turn;
  }

  /** Reads the limit and the server's used count from a response. */
  observe(headers: Headers): void {
    const limit = Number(headers.get('x-discogs-ratelimit'));
    if (Number.isInteger(limit) && limit > 0) this.limit = limit;
    const used = Number(headers.get('x-discogs-ratelimit-used'));
    if (!headers.has('x-discogs-ratelimit-used') || !Number.isInteger(used)) return;
    this.prune();
    // Requests we didn't make (another process with the same token) count as made now.
    const now = this.now();
    while (this.stamps.length < used) this.stamps.push(now);
  }

  succeeded(): void {
    this.strikes = 0;
  }

  /** Pauses every caller after a 429: 5s, 10s, 20s, 40s, then 60s. */
  rateLimited(retryAfterSeconds?: number): void {
    const wait =
      retryAfterSeconds && retryAfterSeconds > 0
        ? retryAfterSeconds * 1000
        : Math.min(5000 * 2 ** this.strikes, this.windowMs);
    this.strikes++;
    const until = this.now() + wait;
    if (until <= this.pausedUntil) return; // already paused at least that long
    if (this.pausedUntil <= this.now()) {
      this.log(`Discogs rate limit (${this.limit}/min) reached — pausing ${Math.round(wait / 1000)}s…`);
    }
    this.pausedUntil = until;
  }

  reset(): void {
    this.queues = { interactive: Promise.resolve(), background: Promise.resolve() };
    this.stamps = [];
    this.pausedUntil = 0;
    this.strikes = 0;
  }

  private prune(): void {
    const from = this.now() - this.windowMs;
    while (this.stamps.length > 0 && this.stamps[0] <= from) this.stamps.shift();
  }

  private async waitForSlot(priority: boolean): Promise<void> {
    for (;;) {
      const now = this.now();
      if (now < this.pausedUntil) {
        await this.sleep(this.pausedUntil - now);
        continue;
      }
      this.prune();
      // One slot of margin below the limit; the scan leaves `reserve` slots free as well.
      const cap = Math.max(1, this.limit - 1 - (priority ? 0 : this.reserve));
      if (this.stamps.length < cap) {
        this.stamps.push(now);
        return;
      }
      // Wait until enough requests have left the window to get under the cap.
      const freeAt = this.stamps[this.stamps.length - cap] + this.windowMs;
      await this.sleep(Math.max(freeAt - now, 1));
    }
  }
}
