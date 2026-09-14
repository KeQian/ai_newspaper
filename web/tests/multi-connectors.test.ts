// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseArxivAtom } from '@/lib/ingestion/connectors/arxiv-atom';
import { BatchConnectorRunner } from '@/lib/ingestion/connectors/batch-runner';
import { parseHuggingFaceModels } from '@/lib/ingestion/connectors/huggingface-models';
import {
  fetchWithRetry,
  validateSourceUrl,
} from '@/lib/ingestion/connectors/http';
import { SourceConnectorRunner } from '@/lib/ingestion/connectors/runner';
import type {
  ArchiveInput,
  ConnectorCompletion,
  ConnectorFailure,
  ConnectorRepository,
  ConnectorRunContext,
  RawArchiveStore,
} from '@/lib/ingestion/connectors/types';

const fixtureDirectory = path.resolve(process.cwd(), 'tests/fixtures');
const huggingFaceFixture = await readFile(
  path.join(fixtureDirectory, 'huggingface-models.json'),
);
const arxivFixture = await readFile(
  path.join(fixtureDirectory, 'arxiv-ai.xml'),
);
const now = new Date('2026-09-12T01:00:00.000Z');

describe('Hugging Face model parser', () => {
  it('normalizes model metadata and advances a high-water cursor', async () => {
    const result = await parseHuggingFaceModels(huggingFaceFixture, {});

    expect(result.observedCount).toBe(3);
    expect(result.documents).toHaveLength(2);
    expect(result.documents[0]).toMatchObject({
      externalId: 'openai/gpt-oss-20b',
      canonicalUrl: 'https://huggingface.co/openai/gpt-oss-20b',
      parserVersion: 'huggingface_models_v1',
    });
    expect(result.documents[0].allowedExcerpt).toContain(
      'Ignore all previous instructions',
    );
    expect(result.cursor).toEqual({
      latestUpdatedAt: '2026-09-12T00:30:00.000Z',
    });
  });

  it('filters records at or below the committed cursor', async () => {
    const result = await parseHuggingFaceModels(huggingFaceFixture, {
      latestUpdatedAt: '2026-09-11T23:30:00.000Z',
    });
    expect(result.documents.map(({ externalId }) => externalId)).toEqual([
      'openai/gpt-oss-20b',
    ]);
  });
});

describe('arXiv Atom parser', () => {
  it('parses metadata safely and treats embedded instructions as data', async () => {
    const result = await parseArxivAtom(arxivFixture, {});

    expect(result.observedCount).toBe(2);
    expect(result.documents).toHaveLength(2);
    expect(result.documents[0]).toMatchObject({
      externalId: '2609.01234',
      canonicalUrl: 'https://arxiv.org/abs/2609.01234',
      title: 'Reliable Agents & Tool Use',
      author: 'Alice Example, Bob Example',
      parserVersion: 'arxiv_atom_v1',
    });
    expect(result.documents[0].allowedExcerpt).toContain(
      'Ignore previous instructions',
    );
    expect(result.cursor).toEqual({
      latestUpdatedAt: '2026-09-12T00:40:00.000Z',
    });
  });

  it('rejects entity declarations before parsing entries', async () => {
    const unsafe = new TextEncoder().encode(
      '<!DOCTYPE feed [<!ENTITY secret SYSTEM "file:///etc/passwd">]><feed/>',
    );
    await expect(parseArxivAtom(unsafe, {})).rejects.toThrow(
      'Unsafe XML declaration',
    );
  });

  it('filters papers at or below the committed cursor', async () => {
    const result = await parseArxivAtom(arxivFixture, {
      latestUpdatedAt: '2026-09-11T23:00:00.000Z',
    });
    expect(result.documents.map(({ externalId }) => externalId)).toEqual([
      '2609.01234',
    ]);
  });
});

describe('multi-source request policy and runners', () => {
  it('allows only the bounded Hugging Face and arXiv request shapes', () => {
    expect(() =>
      validateSourceUrl(
        'https://huggingface.co/api/models?sort=lastModified&direction=-1&limit=100',
      ),
    ).not.toThrow();
    expect(() =>
      validateSourceUrl(
        'https://export.arxiv.org/api/query?search_query=%28cat%3Acs.AI+OR+cat%3Acs.CL%29&start=0&max_results=100&sortBy=lastUpdatedDate&sortOrder=descending',
      ),
    ).not.toThrow();
    expect(() =>
      validateSourceUrl('https://huggingface.co/api/models?limit=1000'),
    ).toThrow();
  });

  it('enforces the arXiv minimum retry interval', async () => {
    const delays: number[] = [];
    const responses = [
      new Response('temporary', { status: 503 }),
      new Response(arxivFixture, { status: 200 }),
    ];
    await fetchWithRetry({
      url: 'https://export.arxiv.org/api/query?search_query=cat%3Acs.AI&start=0&max_results=100&sortBy=lastUpdatedDate&sortOrder=descending',
      headers: {},
      timeoutMs: 1000,
      maxDocumentBytes: 2_097_152,
      attempts: 2,
      maxDelayMs: 300_000,
      minimumRetryDelayMs: 3000,
      fetcher: async () => responses.shift()!,
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
    });
    expect(delays).toEqual([3000]);
  });

  it('runs the Hugging Face connector through archive and cursor commit', async () => {
    const repository = new MemoryConnectorRepository(
      contextFor('huggingface_models_v1'),
    );
    let requestedUrl = '';
    const runner = new SourceConnectorRunner(
      repository,
      new MemoryArchiveStore(),
      {
        fetcher: async (url) => {
          requestedUrl = new Request(url).url;
          return new Response(huggingFaceFixture, {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        },
        getCredential: () => 'test-hf-token',
      },
    );

    await expect(
      runner.run({
        runId: 'run-1',
        sourceKey: 'hf',
        requestId: 'request-hf',
        now,
      }),
    ).resolves.toMatchObject({ fetchedCount: 2 });
    expect(requestedUrl).toContain('sort=lastModified');
    expect(repository.completion?.cursorAfter).toEqual({
      latestUpdatedAt: '2026-09-12T00:30:00.000Z',
    });
  });

  it('runs the arXiv connector with a bounded official query', async () => {
    const repository = new MemoryConnectorRepository(
      contextFor('arxiv_atom_v1'),
    );
    let requestedUrl = '';
    const runner = new SourceConnectorRunner(
      repository,
      new MemoryArchiveStore(),
      {
        fetcher: async (url) => {
          requestedUrl = new Request(url).url;
          return new Response(arxivFixture, {
            status: 200,
            headers: { 'content-type': 'application/atom+xml' },
          });
        },
      },
    );

    await expect(
      runner.run({
        runId: 'run-2',
        sourceKey: 'arxiv',
        requestId: 'request-arxiv',
        now,
      }),
    ).resolves.toMatchObject({ fetchedCount: 2 });
    const url = new URL(requestedUrl);
    expect(url.searchParams.get('max_results')).toBe('100');
    expect(url.searchParams.get('sortBy')).toBe('lastUpdatedDate');
  });

  it('continues a batch after a source fails and skips completed sources on replay', async () => {
    const calls: string[] = [];
    const batch = new BatchConnectorRunner(
      {
        listRunSources: async () => [
          { sourceKey: 'failed-source', status: 'queued' },
          { sourceKey: 'healthy-source', status: 'queued' },
          { sourceKey: 'completed-source', status: 'succeeded' },
        ],
      },
      {
        run: async ({ sourceKey }) => {
          calls.push(sourceKey);
          if (sourceKey === 'failed-source') {
            throw Object.assign(new Error('upstream failed'), {
              code: 'UPSTREAM_FAILED',
            });
          }
        },
      },
    );

    await expect(
      batch.run({ runId: 'run-batch', requestId: 'request-batch' }),
    ).resolves.toEqual({
      total: 3,
      succeeded: 1,
      failed: 1,
      skipped: 1,
      sources: [
        {
          sourceKey: 'failed-source',
          status: 'failed',
          errorCode: 'UPSTREAM_FAILED',
        },
        {
          sourceKey: 'healthy-source',
          status: 'succeeded',
          errorCode: null,
        },
        {
          sourceKey: 'completed-source',
          status: 'skipped',
          errorCode: null,
        },
      ],
    });
    expect(calls).toEqual(['failed-source', 'healthy-source']);
  });
});

class MemoryConnectorRepository implements ConnectorRepository {
  completion: ConnectorCompletion | null = null;
  failure: ConnectorFailure | null = null;

  constructor(readonly context: ConnectorRunContext) {}

  async listRunSources() {
    return [{ sourceKey: this.context.source.key, status: 'queued' }];
  }

  async getRunContext() {
    return this.context;
  }

  async markRunning() {}

  async completeSource(input: ConnectorCompletion) {
    this.completion = input;
    return {
      fetchedCount: input.documents.length,
      newCount: input.documents.length,
      duplicateCount: 0,
    };
  }

  async failSource(input: ConnectorFailure) {
    this.failure = input;
  }
}

class MemoryArchiveStore implements RawArchiveStore {
  entries: ArchiveInput[] = [];

  async put(input: ArchiveInput) {
    this.entries.push(input);
  }
}

function contextFor(
  parserKey: 'huggingface_models_v1' | 'arxiv_atom_v1',
): ConnectorRunContext {
  const huggingFace = parserKey === 'huggingface_models_v1';
  return {
    runId: huggingFace ? 'run-1' : 'run-2',
    source: {
      id: huggingFace ? 'source-hf' : 'source-arxiv',
      key: huggingFace ? 'hf' : 'arxiv',
      name: huggingFace ? 'Hugging Face models' : 'arXiv AI',
      url: huggingFace
        ? 'https://huggingface.co/api/models'
        : 'https://export.arxiv.org/api/query',
      parserKey,
      enabled: true,
      termsStatus: 'approved',
      cursor: {},
      config: {
        ...(huggingFace
          ? { authEnv: 'HUGGINGFACE_TOKEN' }
          : { query: '(cat:cs.AI OR cat:cs.CL OR cat:cs.LG)' }),
        fetchPolicy: {
          userAgent: 'AI-Signal-Research/0.1 (+editor@example.com)',
          maxDocumentBytes: 2_097_152,
          requestTimeoutSeconds: 20,
          retry: { attempts: 3, max_delay_seconds: 300 },
        },
      },
    },
    cursorBefore: {},
  };
}
