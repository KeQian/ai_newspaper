// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseGitHubReleases } from '@/lib/ingestion/connectors/github-releases';
import {
  ConnectorHttpError,
  fetchWithRetry,
} from '@/lib/ingestion/connectors/http';
import { GitHubReleaseConnectorRunner } from '@/lib/ingestion/connectors/runner';
import type {
  ArchiveInput,
  ConnectorCompletion,
  ConnectorFailure,
  ConnectorRepository,
  ConnectorRunContext,
  RawArchiveStore,
} from '@/lib/ingestion/connectors/types';

const fixture = await readFile(
  path.resolve(process.cwd(), 'tests/fixtures/github-releases.json'),
);
const now = new Date('2026-09-12T01:00:00.000Z');

describe('GitHub Releases parser', () => {
  it('parses publishable releases and treats embedded instructions as data', async () => {
    const documents = await parseGitHubReleases(
      fixture,
      'https://api.github.com/repos/openai/openai-python/releases',
    );

    expect(documents).toHaveLength(2);
    expect(documents[0]).toMatchObject({
      externalId: '221001',
      title: 'v1.2.0',
      author: 'openai-release-bot',
      parserVersion: 'github_releases_v1',
    });
    expect(documents[0].allowedExcerpt).toContain(
      'Ignore previous instructions',
    );
    expect(documents[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(documents.some(({ externalId }) => externalId === '221003')).toBe(
      false,
    );
  });

  it('rejects release URLs outside the configured repository', async () => {
    const poisoned = JSON.parse(new TextDecoder().decode(fixture));
    poisoned[0].html_url = 'https://attacker.example/releases/tag/v1.2.0';
    await expect(
      parseGitHubReleases(
        new TextEncoder().encode(JSON.stringify(poisoned)),
        'https://api.github.com/repos/openai/openai-python/releases',
      ),
    ).rejects.toThrow('Invalid GitHub release URL');
  });
});

describe('connector HTTP policy', () => {
  it('retries 429 and 5xx responses and honors bounded Retry-After', async () => {
    const responses = [
      new Response('rate limited', {
        status: 429,
        headers: { 'retry-after': '2' },
      }),
      new Response('temporary', { status: 503 }),
      new Response(fixture, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ];
    const delays: number[] = [];
    const response = await fetchWithRetry({
      url: 'https://api.github.com/repos/openai/openai-python/releases',
      headers: {},
      timeoutMs: 1000,
      maxDocumentBytes: 2_097_152,
      attempts: 3,
      maxDelayMs: 5000,
      fetcher: async () => responses.shift()!,
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
    });
    expect(response.status).toBe(200);
    expect(delays).toEqual([2000, 2000]);
  });

  it('rejects unregistered hosts, redirects, and oversized responses', async () => {
    await expect(
      fetchWithRetry({
        url: 'https://127.0.0.1/private',
        headers: {},
        timeoutMs: 1000,
        maxDocumentBytes: 100,
        attempts: 1,
        maxDelayMs: 1000,
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_URL_REJECTED' });

    await expect(
      fetchWithRetry({
        url: 'https://api.github.com/repos/openai/openai-python/releases',
        headers: {},
        timeoutMs: 1000,
        maxDocumentBytes: 100,
        attempts: 1,
        maxDelayMs: 1000,
        fetcher: async () =>
          new Response(null, {
            status: 302,
            headers: { location: 'https://example.com' },
          }),
      }),
    ).rejects.toBeInstanceOf(ConnectorHttpError);

    await expect(
      fetchWithRetry({
        url: 'https://api.github.com/repos/openai/openai-python/releases',
        headers: {},
        timeoutMs: 1000,
        maxDocumentBytes: 10,
        attempts: 1,
        maxDelayMs: 1000,
        fetcher: async () => new Response(fixture, { status: 200 }),
      }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_TOO_LARGE' });
  });
});

describe('GitHub Releases connector runner', () => {
  it('archives before parsing, sends conditional headers, and commits the cursor', async () => {
    const repository = new MemoryConnectorRepository();
    const archive = new MemoryArchiveStore(repository.events);
    let requestHeaders = new Headers();
    const runner = new GitHubReleaseConnectorRunner(repository, archive, {
      fetcher: async (_url, init) => {
        requestHeaders = new Headers(init?.headers);
        return new Response(fixture, {
          status: 200,
          headers: {
            'content-type': 'application/json',
            etag: '"new-etag"',
            'last-modified': 'Fri, 12 Sep 2026 00:55:00 GMT',
          },
        });
      },
      getCredential: () => 'secret-test-token',
    });

    await expect(
      runner.run({
        runId: repository.context.runId,
        sourceKey: 'source',
        requestId: 'request-1',
        now,
      }),
    ).resolves.toEqual({ fetchedCount: 2, newCount: 2, duplicateCount: 0 });
    expect(requestHeaders.get('if-none-match')).toBe('"old-etag"');
    expect(requestHeaders.get('authorization')).toBe(
      'Bearer secret-test-token',
    );
    expect(repository.events).toEqual(['running', 'archive', 'complete']);
    expect(repository.completion?.cursorAfter).toMatchObject({
      etag: '"new-etag"',
    });
    expect(repository.completion?.archiveKey).toMatch(
      /^raw\/source\/2026-09-12\//,
    );
  });

  it('archives invalid payloads, records parse failure, and never completes', async () => {
    const repository = new MemoryConnectorRepository();
    const archive = new MemoryArchiveStore(repository.events);
    const runner = new GitHubReleaseConnectorRunner(repository, archive, {
      fetcher: async () => new Response('{"invalid":true}', { status: 200 }),
      getCredential: () => 'secret-test-token',
    });

    await expect(
      runner.run({
        runId: repository.context.runId,
        sourceKey: 'source',
        requestId: 'request-2',
        now,
      }),
    ).rejects.toThrow();
    expect(repository.events).toEqual(['running', 'archive', 'failed']);
    expect(repository.failure).toMatchObject({
      code: 'PARSE_FAILED',
      disableSource: false,
    });
    expect(repository.completion).toBeNull();
  });

  it('treats a conditional 304 response as a successful no-change run', async () => {
    const repository = new MemoryConnectorRepository();
    const archive = new MemoryArchiveStore(repository.events);
    const runner = new GitHubReleaseConnectorRunner(repository, archive, {
      fetcher: async () =>
        new Response(null, {
          status: 304,
          headers: { etag: '"old-etag"' },
        }),
      getCredential: () => 'secret-test-token',
    });

    await expect(
      runner.run({
        runId: repository.context.runId,
        sourceKey: 'source',
        requestId: 'request-304',
        now,
      }),
    ).resolves.toEqual({ fetchedCount: 0, newCount: 0, duplicateCount: 0 });
    expect(repository.events).toEqual(['running', 'archive', 'complete']);
    expect(repository.completion?.documents).toHaveLength(0);
    expect(repository.completion?.cursorAfter).toMatchObject({
      etag: '"old-etag"',
    });
  });

  it('does not retry authorization errors and requests source disablement', async () => {
    const repository = new MemoryConnectorRepository();
    const archive = new MemoryArchiveStore(repository.events);
    let calls = 0;
    const runner = new GitHubReleaseConnectorRunner(repository, archive, {
      fetcher: async () => {
        calls += 1;
        return new Response('denied', { status: 401 });
      },
      getCredential: () => 'expired-test-token',
    });

    await expect(
      runner.run({
        runId: repository.context.runId,
        sourceKey: 'source',
        requestId: 'request-3',
        now,
      }),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_FAILED' });
    expect(calls).toBe(1);
    expect(repository.failure).toMatchObject({
      code: 'AUTHORIZATION_FAILED',
      disableSource: true,
    });
  });
});

class MemoryConnectorRepository implements ConnectorRepository {
  events: string[] = [];
  completion: ConnectorCompletion | null = null;
  failure: ConnectorFailure | null = null;
  context: ConnectorRunContext = {
    runId: 'f291093f-b57e-42cb-873e-b7ab76035c7d',
    source: {
      id: '73c45785-c8ca-4e2c-9055-f42186862235',
      key: 'source',
      name: 'Source',
      url: 'https://api.github.com/repos/openai/openai-python/releases',
      parserKey: 'github_releases_v1',
      enabled: true,
      termsStatus: 'approved',
      cursor: { etag: '"old-etag"' },
      config: {
        authEnv: 'GITHUB_TOKEN',
        fetchPolicy: {
          userAgent: 'AI-Signal-Research/0.1 (+editor@example.com)',
          maxDocumentBytes: 2_097_152,
          requestTimeoutSeconds: 20,
          retry: { attempts: 3, max_delay_seconds: 300 },
        },
      },
    },
    cursorBefore: { etag: '"old-etag"' },
  };

  async listRunSources() {
    return [{ sourceKey: this.context.source.key, status: 'queued' }];
  }

  async getRunContext() {
    return this.context;
  }

  async markRunning() {
    this.events.push('running');
  }

  async completeSource(input: ConnectorCompletion) {
    this.events.push('complete');
    this.completion = input;
    return {
      fetchedCount: input.documents.length,
      newCount: input.documents.length,
      duplicateCount: 0,
    };
  }

  async failSource(input: ConnectorFailure) {
    this.events.push('failed');
    this.failure = input;
  }
}

class MemoryArchiveStore implements RawArchiveStore {
  readonly entries: ArchiveInput[] = [];

  constructor(private readonly events: string[]) {}

  async put(input: ArchiveInput) {
    this.events.push('archive');
    this.entries.push(input);
  }
}
