// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createInternalIngestionHandlers } from '@/lib/ingestion/internal-http';
import type {
  IngestionRunRepository,
  StoredIngestionRun,
} from '@/lib/ingestion/repository';
import { createIngestionIdempotencyKey } from '@/lib/ingestion/run-idempotency';
import { IngestionRunService } from '@/lib/ingestion/run-service';
import { deriveSourceHealth } from '@/lib/ingestion/source-health';
import {
  mapRegistrySources,
  parseSourceRegistry,
} from '@/lib/ingestion/source-registry';

const now = new Date('2026-09-11T08:00:00.000Z');
const token = 'a-secure-ingestion-token-with-32-characters';
const input = {
  jobKey: 'official-source-radar',
  scheduledAt: '2026-09-11T08:00:00.000Z',
  sources: ['github-openai-python-releases'],
};

describe('source registry', () => {
  it('strictly validates and maps the production registry', async () => {
    const yaml = await readFile(
      path.resolve(process.cwd(), '../docs/07_SOURCE_REGISTRY.yaml'),
      'utf8',
    );
    const registry = parseSourceRegistry(yaml);
    const sources = mapRegistrySources(registry);

    expect(sources).toHaveLength(20);
    expect(sources[0]).toMatchObject({
      key: 'github-openai-python-releases',
      enabled: true,
      termsStatus: 'approved',
      retentionPolicy: 'excerpt',
    });
    expect(
      sources.find(({ key }) => key === 'huggingface-models'),
    ).toMatchObject({ enabled: false, termsStatus: 'review' });
    expect(sources[0].config).toMatchObject({
      organization: 'OpenAI',
      authEnv: 'GITHUB_TOKEN',
      fetchPolicy: { respectRobots: true, requestTimeoutSeconds: 20 },
    });
  }, 15_000);

  it('rejects insecure endpoints, duplicate ids, and unknown fields', () => {
    const base = `
version: 1
defaults:
  timezone: Asia/Shanghai
  user_agent: Test Agent (+test@example.com)
  respect_robots: true
  max_document_bytes: 1000
  request_timeout_seconds: 10
  retry: { attempts: 2, strategy: exponential, max_delay_seconds: 10 }
sources:
  - id: duplicate
    name: Test
    organization: Test
    category: test
    source_type: api
    reliability: s0
    endpoint: http://example.com/api
    parser: test_v1
    schedule: hourly
    retention: metadata_and_excerpt
    terms_status: approved_api
    publication_policy: candidate_only
    enabled: true
    owner: editorial
    unexpected: value
  - id: duplicate
    name: Again
    organization: Test
    category: test
    source_type: api
    reliability: s0
    endpoint: https://example.com/api
    parser: test_v1
    schedule: hourly
    retention: metadata_and_excerpt
    terms_status: approved_api
    publication_policy: candidate_only
    enabled: true
    owner: editorial
restricted_sources: []
notes: []`;
    expect(() => parseSourceRegistry(base)).toThrow();
  });
});

describe('source health', () => {
  it.each([
    [0, null, 'unknown'],
    [1, now, 'degraded'],
    [3, now, 'failing'],
    [0, new Date('2026-09-11T07:00:00Z'), 'healthy'],
    [0, new Date('2026-09-11T05:59:59Z'), 'stale'],
  ] as const)(
    'derives failures=%s lastSuccess=%s as %s',
    (failureCount, lastSuccessAt, expected) => {
      expect(
        deriveSourceHealth(
          { enabled: true, schedule: 'hourly', lastSuccessAt, failureCount },
          now,
        ),
      ).toBe(expected);
    },
  );
});

describe('ingestion run idempotency', () => {
  it('is stable across source order and changes across scheduling windows', async () => {
    const first = await createIngestionIdempotencyKey({
      ...input,
      sources: ['b', 'a'],
    });
    const reordered = await createIngestionIdempotencyKey({
      ...input,
      sources: ['a', 'b'],
    });
    const later = await createIngestionIdempotencyKey({
      ...input,
      scheduledAt: '2026-09-11T09:00:00.000Z',
      sources: ['a', 'b'],
    });
    expect(first).toBe(reordered);
    expect(first).not.toBe(later);
  });

  it('authenticates, validates the key, and returns the existing run on replay', async () => {
    const repository = new MemoryRunRepository();
    const service = new IngestionRunService(repository);
    const key = await service.expectedIdempotencyKey(input);
    const handlers = createInternalIngestionHandlers(
      () => service,
      () => token,
      () => now,
    );

    const unauthorized = await handlers.POST(makeRequest(key, 'wrong-token'));
    expect(unauthorized.status).toBe(401);

    const invalidKey = await handlers.POST(makeRequest('wrong-key', token));
    expect(invalidKey.status).toBe(409);

    const first = await handlers.POST(makeRequest(key, token));
    const replay = await handlers.POST(makeRequest(key, token));
    expect(first.status).toBe(202);
    expect(replay.status).toBe(202);
    expect(await first.json()).toMatchObject({ reused: false });
    expect(await replay.json()).toMatchObject({ reused: true });
    expect(repository.runs).toHaveLength(1);
  });
});

class MemoryRunRepository implements IngestionRunRepository {
  runs: StoredIngestionRun[] = [];

  async createOrGetRun(value: {
    jobKey: string;
    idempotencyKey: string;
    scheduledAt: Date;
  }) {
    const existing = this.runs.find(
      ({ idempotencyKey }) => idempotencyKey === value.idempotencyKey,
    );
    if (existing) return { run: existing, reused: true };
    const run: StoredIngestionRun = {
      id: crypto.randomUUID(),
      jobKey: value.jobKey,
      idempotencyKey: value.idempotencyKey,
      status: 'queued',
      scheduledAt: value.scheduledAt,
      startedAt: null,
      finishedAt: null,
      fetchedCount: 0,
      newCount: 0,
      duplicateCount: 0,
      errorCount: 0,
      errorSummary: null,
    };
    this.runs.push(run);
    return { run, reused: false };
  }

  async listRuns() {
    return this.runs;
  }

  async getRun() {
    return null;
  }
}

function makeRequest(idempotencyKey: string, bearerToken: string): Request {
  return new Request('https://example.com/api/v1/internal/ingestion/runs', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${bearerToken}`,
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify(input),
  });
}
