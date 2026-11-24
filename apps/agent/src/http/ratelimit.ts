import type { Context } from 'hono';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface Window {
  hits: number[];
  windowMs: number;
}

export const AUTH_EMAIL_RATE = { limit: 3, windowMs: 60 * 60_000 } as const;
export const AUTH_IP_RATE = { limit: 10, windowMs: 60 * 60_000 } as const;

/** A process-local sliding window. One agent process owns all HTTP traffic. */
export class SlidingWindowRateLimiter {
  private readonly windows = new Map<string, Window>();
  private nextSweepAt = 0;

  constructor(private readonly now: () => number = Date.now) {}

  check(key: string, limit: number, windowMs: number): RateLimitResult {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Rate limit must be positive');
    if (!Number.isSafeInteger(windowMs) || windowMs < 1) {
      throw new Error('Rate window must be positive');
    }
    const current = this.now();
    if (current >= this.nextSweepAt) {
      this.sweep(current);
      this.nextSweepAt = current + windowMs;
    }

    let window = this.windows.get(key);
    if (!window) {
      window = { hits: [], windowMs };
      this.windows.set(key, window);
    }
    const cutoff = current - window.windowMs;
    window.hits = window.hits.filter((hit) => hit > cutoff);

    if (window.hits.length >= limit) {
      const oldest = window.hits[0];
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil(((oldest ?? current) + window.windowMs - current) / 1000),
        ),
      };
    }

    window.hits.push(current);
    return { allowed: true, remaining: limit - window.hits.length, retryAfterSeconds: 0 };
  }

  reset(key?: string): void {
    if (key === undefined) this.windows.clear();
    else this.windows.delete(key);
  }

  private sweep(current: number): void {
    for (const [key, window] of this.windows) {
      const cutoff = current - window.windowMs;
      window.hits = window.hits.filter((hit) => hit > cutoff);
      if (window.hits.length === 0) this.windows.delete(key);
    }
  }
}

export function clientIp(context: Context): string {
  const forwarded = context.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded && forwarded.length <= 128 && !/[\s/]/.test(forwarded)) return forwarded;
  const realIp = context.req.header('x-real-ip')?.trim();
  if (realIp && realIp.length <= 128 && !/[\s/]/.test(realIp)) return realIp;
  return 'unknown';
}
