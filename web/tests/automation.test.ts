// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { automationJobs } from '@/lib/automation/model';
import { AutomationService } from '@/lib/automation/service';
import type {
  AutomationRepository,
  AutomationSource,
} from '@/lib/automation/types';
import {
  dueScheduledWindows,
  isSourceScheduleDue,
  latestScheduledWindow,
} from '@/lib/automation/windows';

describe('automation windows', () => {
  it('aligns hourly and 05:00 Asia/Shanghai windows in UTC', () => {
    const now = new Date('2026-09-13T03:42:30.000Z');
    expect(
      latestScheduledWindow(
        automationJobs['developer-ecosystem-radar'],
        now,
      ).toISOString(),
    ).toBe('2026-09-13T03:00:00.000Z');
    expect(
      latestScheduledWindow(
        automationJobs['research-digest'],
        now,
      ).toISOString(),
    ).toBe('2026-09-12T21:00:00.000Z');
  });

  it('caps an hourly offline catch-up at the latest 24 windows', () => {
    const windows = dueScheduledWindows({
      definition: automationJobs['developer-ecosystem-radar'],
      now: new Date('2026-09-13T10:30:00.000Z'),
      latestScheduledAt: new Date('2026-09-10T00:00:00.000Z'),
    });
    expect(windows).toHaveLength(24);
    expect(windows[0]?.toISOString()).toBe('2026-09-12T11:00:00.000Z');
    expect(windows.at(-1)?.toISOString()).toBe('2026-09-13T10:00:00.000Z');
  });

  it('runs two-hour sources only on even Shanghai hours', () => {
    expect(
      isSourceScheduleDue(
        'every_2_hours',
        new Date('2026-09-13T02:00:00.000Z'),
      ),
    ).toBe(true);
    expect(
      isSourceScheduleDue(
        'every_2_hours',
        new Date('2026-09-13T03:00:00.000Z'),
      ),
    ).toBe(false);
  });
});

describe('automation orchestration', () => {
  it('releases the lease, reuses the deterministic run, and reports replay skips', async () => {
    const repository = new MemoryAutomationRepository([
      { key: 'source-a', schedule: 'hourly' },
    ]);
    const runs = new MemoryRunService();
    let executions = 0;
    const service = new AutomationService(repository, runs, async () => {
      executions += 1;
      return executions === 1
        ? { total: 1, succeeded: 1, failed: 0, skipped: 0, sources: [] }
        : { total: 1, succeeded: 0, failed: 0, skipped: 1, sources: [] };
    });
    const input = {
      jobKey: 'developer-ecosystem-radar' as const,
      holderId: 'holder-1',
      requestId: 'request-1',
      now: new Date('2026-09-13T03:30:00.000Z'),
    };

    await expect(service.runDue(input)).resolves.toMatchObject({
      recovered: 1,
      windows: [{ reused: false, status: 'completed', succeeded: 1 }],
    });
    repository.latest = null;
    await expect(
      service.runDue({ ...input, holderId: 'holder-2' }),
    ).resolves.toMatchObject({
      windows: [{ reused: true, status: 'completed', skipped: 1 }],
    });
    expect(repository.holder).toBeNull();
  });
});

class MemoryAutomationRepository implements AutomationRepository {
  holder: string | null = null;
  latest: Date | null = null;

  constructor(private readonly sources: AutomationSource[]) {}

  async acquireLease(input: { holderId: string }) {
    if (this.holder) return false;
    this.holder = input.holderId;
    return true;
  }

  async releaseLease(_jobKey: string, holderId: string) {
    if (this.holder === holderId) this.holder = null;
  }

  async recoverStaleSources() {
    return 1;
  }

  async latestScheduledAt() {
    return this.latest;
  }

  async listEligibleSources() {
    return this.sources;
  }
}

class MemoryRunService {
  private readonly keys = new Set<string>();

  async expectedIdempotencyKey(input: { scheduledAt: string }) {
    return input.scheduledAt;
  }

  async createOrResume(input: { scheduledAt: string }) {
    const reused = this.keys.has(input.scheduledAt);
    this.keys.add(input.scheduledAt);
    return {
      reused,
      run: { id: `run-${input.scheduledAt}` },
    };
  }
}
