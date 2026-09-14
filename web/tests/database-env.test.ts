import { describe, expect, it } from 'vitest';

import { parseDatabaseEnvironment } from '@/db/env';

describe('database environment', () => {
  it('accepts a PostgreSQL URL', () => {
    expect(
      parseDatabaseEnvironment({
        DATABASE_URL: 'postgresql://user:pass@db.example.com/app',
      }),
    ).toEqual({ DATABASE_URL: 'postgresql://user:pass@db.example.com/app' });
  });

  it.each([
    '',
    'https://db.example.com/app',
    'postgres://user:pass@db.example.com/app',
  ])('rejects unsupported DATABASE_URL %j', (DATABASE_URL) => {
    expect(() => parseDatabaseEnvironment({ DATABASE_URL })).toThrow();
  });
});
