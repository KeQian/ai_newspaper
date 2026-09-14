import type { SourceHealthStatus } from './model';

const scheduleIntervalMs: Record<string, number> = {
  hourly: 60 * 60_000,
  every_2_hours: 2 * 60 * 60_000,
  daily_0500: 24 * 60 * 60_000,
};

export function deriveSourceHealth(
  source: {
    enabled: boolean;
    schedule: string;
    lastSuccessAt: Date | null;
    failureCount: number;
  },
  now = new Date(),
): SourceHealthStatus {
  if (source.failureCount >= 3) return 'failing';
  if (source.failureCount > 0) return 'degraded';
  if (!source.lastSuccessAt) return 'unknown';

  const interval = scheduleIntervalMs[source.schedule];
  if (
    source.enabled &&
    interval &&
    now.getTime() - source.lastSuccessAt.getTime() > interval * 2
  ) {
    return 'stale';
  }

  return 'healthy';
}
