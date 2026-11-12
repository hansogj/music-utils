import { describe, expect, it } from 'vitest';

import { interactive, isInteractive, RateLimiter } from './rate-limit.js';

// A clock that only moves when the limiter sleeps.
function fakeClock() {
  const clock = { t: 0, slept: [] as number[] };
  return {
    clock,
    now: () => clock.t,
    sleep: async (ms: number) => {
      clock.slept.push(ms);
      clock.t += ms;
    },
  };
}

function headers(h: Record<string, string>): Headers {
  return new Headers(h);
}

describe('RateLimiter', () => {
  it('lets requests through until one below the limit, then waits for the window', async () => {
    const { clock, now, sleep } = fakeClock();
    const limiter = new RateLimiter({ limit: 5, reserve: 0, windowMs: 60_000, now, sleep });
    for (let i = 0; i < 4; i++) await limiter.acquire(false);
    expect(clock.slept).toEqual([]);
    await limiter.acquire(false);
    // The first request (t=0) leaves the window at 60s.
    expect(clock.t).toBe(60_000);
  });

  it('spreads requests made at different times', async () => {
    const { clock, now, sleep } = fakeClock();
    const limiter = new RateLimiter({ limit: 3, reserve: 0, windowMs: 60_000, now, sleep });
    await limiter.acquire(false); // t=0
    clock.t = 30_000;
    await limiter.acquire(false); // t=30s
    await limiter.acquire(false); // window full (cap 2) → waits for t=0 to expire
    expect(clock.t).toBe(60_000);
    await limiter.acquire(false); // waits for t=30s to expire
    expect(clock.t).toBe(90_000);
  });

  it('keeps reserved slots free for interactive requests', async () => {
    const { clock, now, sleep } = fakeClock();
    const limiter = new RateLimiter({ limit: 10, reserve: 3, now, sleep });
    for (let i = 0; i < 6; i++) await limiter.acquire(false); // background cap: 10 - 1 - 3
    await limiter.acquire(true);
    await limiter.acquire(true);
    await limiter.acquire(true);
    expect(clock.t).toBe(0);
    await limiter.acquire(true); // cap 9 reached
    expect(clock.t).toBe(60_000);
  });

  it('takes the limit from the response headers', async () => {
    const { clock, now, sleep } = fakeClock();
    const limiter = new RateLimiter({ limit: 25, reserve: 0, now, sleep });
    limiter.observe(headers({ 'x-discogs-ratelimit': '3', 'x-discogs-ratelimit-used': '0' }));
    expect(limiter.limit).toBe(3);
    await limiter.acquire(false);
    await limiter.acquire(false);
    await limiter.acquire(false);
    expect(clock.t).toBe(60_000);
  });

  it('counts requests made elsewhere with the same token', async () => {
    const { clock, now, sleep } = fakeClock();
    const limiter = new RateLimiter({ limit: 60, reserve: 0, now, sleep });
    await limiter.acquire(false);
    limiter.observe(headers({ 'x-discogs-ratelimit': '60', 'x-discogs-ratelimit-used': '59' }));
    clock.t = 1000;
    await limiter.acquire(false);
    expect(clock.t).toBe(60_000);
  });

  it('ignores responses without rate-limit headers', async () => {
    const { clock, now, sleep } = fakeClock();
    const limiter = new RateLimiter({ limit: 5, reserve: 0, now, sleep });
    limiter.observe(headers({}));
    expect(limiter.limit).toBe(5);
    await limiter.acquire(false);
    expect(clock.t).toBe(0);
  });

  it('pauses every caller after a 429, longer each time, logging once per pause', async () => {
    const { clock, now, sleep } = fakeClock();
    const log: string[] = [];
    const limiter = new RateLimiter({ limit: 60, now, sleep, log: (m) => log.push(m) });
    limiter.rateLimited();
    limiter.rateLimited(); // a second caller hits 429 during the pause: one message, longer pause
    expect(log).toHaveLength(1);
    expect(log[0]).toMatch(/60\/min.*pausing 5s/);
    await Promise.all([limiter.acquire(false), limiter.acquire(true)]);
    expect(clock.t).toBe(10_000);

    limiter.rateLimited();
    expect(log[1]).toMatch(/pausing 20s/);
    limiter.succeeded();
    limiter.rateLimited(); // still paused from the 20s: not shortened, not logged
    expect(log).toHaveLength(2);
  });

  it('caps the pause at the window and honours Retry-After', async () => {
    const { clock, now, sleep } = fakeClock();
    const limiter = new RateLimiter({ now, sleep });
    for (let i = 0; i < 10; i++) limiter.rateLimited();
    await limiter.acquire(false);
    expect(clock.t).toBe(60_000);

    limiter.reset();
    limiter.rateLimited(7);
    await limiter.acquire(false);
    expect(clock.t).toBe(67_000);
  });
});

describe('interactive', () => {
  it('marks requests made inside it, including after awaits', async () => {
    expect(isInteractive()).toBe(false);
    const seen = await interactive(async () => {
      await Promise.resolve();
      return isInteractive();
    });
    expect(seen).toBe(true);
    expect(isInteractive()).toBe(false);
  });
});
