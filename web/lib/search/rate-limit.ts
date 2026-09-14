import { sql } from 'drizzle-orm';

import type { Database } from '@/db/client';
import { apiRateLimits } from '@/db/schema';

import type { SearchRateLimiter } from './types';

export class MemorySearchRateLimiter implements SearchRateLimiter {
  private readonly buckets = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(
    private readonly limit = 60,
    private readonly windowMs = 60_000,
  ) {}

  async consume(key: string, now = new Date()) {
    const time = now.getTime();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= time) {
      this.buckets.set(key, { count: 1, resetAt: time + this.windowMs });
      return { allowed: true, retryAfter: 0 };
    }
    if (bucket.count >= this.limit)
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((bucket.resetAt - time) / 1000)),
      };
    bucket.count += 1;
    return { allowed: true, retryAfter: 0 };
  }
}

export class PostgresSearchRateLimiter implements SearchRateLimiter {
  constructor(
    private readonly database: Database,
    private readonly limit = 60,
    private readonly windowMs = 60_000,
    private readonly bucketName = 'public-search',
  ) {}

  async consume(key: string, now = new Date()) {
    const windowStart = new Date(
      Math.floor(now.getTime() / this.windowMs) * this.windowMs,
    );
    const expiresAt = new Date(windowStart.getTime() + this.windowMs * 2);
    const [bucket] = await this.database
      .insert(apiRateLimits)
      .values({
        bucket: this.bucketName,
        keyHash: key,
        windowStart,
        count: 1,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          apiRateLimits.bucket,
          apiRateLimits.keyHash,
          apiRateLimits.windowStart,
        ],
        set: {
          count: sql`${apiRateLimits.count} + 1`,
          updatedAt: now,
        },
      })
      .returning({ count: apiRateLimits.count });
    return {
      allowed: bucket.count <= this.limit,
      retryAfter: Math.max(
        1,
        Math.ceil(
          (windowStart.getTime() + this.windowMs - now.getTime()) / 1000,
        ),
      ),
    };
  }
}
