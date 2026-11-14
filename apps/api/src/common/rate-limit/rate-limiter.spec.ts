import { FixedWindowLimiter } from './rate-limiter.js';

describe('FixedWindowLimiter', () => {
  it('allows up to the limit in a window, then rejects', () => {
    const limiter = new FixedWindowLimiter();
    const results = [1, 2, 3, 4].map(() => limiter.hit('u1', 3, 60_000, 1_000));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
    expect(results[3]!.retryAfterSeconds).toBe(60);
  });

  it('counts each key separately', () => {
    const limiter = new FixedWindowLimiter();
    expect(limiter.hit('u1', 1, 60_000, 0).allowed).toBe(true);
    expect(limiter.hit('u2', 1, 60_000, 0).allowed).toBe(true);
    expect(limiter.hit('u1', 1, 60_000, 0).allowed).toBe(false);
  });

  it('starts a new window once the old one ends', () => {
    const limiter = new FixedWindowLimiter();
    limiter.hit('u1', 1, 60_000, 0);
    expect(limiter.hit('u1', 1, 60_000, 59_999)).toMatchObject({
      allowed: false,
      retryAfterSeconds: 1,
    });
    expect(limiter.hit('u1', 1, 60_000, 60_000).allowed).toBe(true);
  });

  it('sweeps expired windows once many keys are tracked', () => {
    const limiter = new FixedWindowLimiter();
    for (let i = 0; i <= 10_000; i += 1) limiter.hit(`k${i}`, 5, 1_000, 0);
    expect(limiter.size).toBe(10_001);
    limiter.hit('fresh', 5, 1_000, 5_000);
    expect(limiter.size).toBe(1);
  });
});
