import { z } from 'zod';

import { createRawArchiveKey } from './archive';
import { parseArxivAtom } from './arxiv-atom';
import { parseGitHubReleases } from './github-releases';
import { parseHuggingFaceModels } from './huggingface-models';
import {
  ConnectorHttpError,
  fetchWithRetry,
  type ConnectorFetch,
  type ConnectorHttpResponse,
} from './http';
import type { ConnectorRepository, RawArchiveStore } from './types';
import type { ConnectorParseResult } from './parser';

const fetchPolicySchema = z.object({
  userAgent: z.string().min(10).max(300),
  maxDocumentBytes: z.number().int().positive().max(10_485_760),
  requestTimeoutSeconds: z.number().int().min(1).max(60),
  retry: z.object({
    attempts: z.number().int().min(1).max(5),
    max_delay_seconds: z.number().int().min(1).max(900),
  }),
});

const sourceConfigSchema = z.object({
  authEnv: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]*$/)
    .optional(),
  query: z.string().min(1).max(1000).optional(),
  fetchPolicy: fetchPolicySchema,
});

const supportedParsers = new Set([
  'github_releases_v1',
  'huggingface_models_v1',
  'arxiv_atom_v1',
]);

export class SourceConnectorRunner {
  constructor(
    private readonly repository: ConnectorRepository,
    private readonly archiveStore: RawArchiveStore,
    private readonly options: {
      fetcher?: ConnectorFetch;
      sleep?: (milliseconds: number) => Promise<void>;
      getCredential?: (environmentName: string) => string | undefined;
    } = {},
  ) {}

  async run(input: {
    runId: string;
    sourceKey: string;
    requestId: string;
    now?: Date;
  }): Promise<{
    fetchedCount: number;
    newCount: number;
    duplicateCount: number;
  }> {
    const fetchedAt = input.now ?? new Date();
    const context = await this.repository.getRunContext(
      input.runId,
      input.sourceKey,
    );
    if (
      !context.source.enabled ||
      context.source.termsStatus !== 'approved' ||
      !supportedParsers.has(context.source.parserKey)
    ) {
      throw new Error('Source is not runnable by this connector');
    }

    await this.repository.markRunning(
      context.runId,
      context.source.id,
      fetchedAt,
    );

    try {
      const configResult = sourceConfigSchema.safeParse(context.source.config);
      if (!configResult.success) {
        throw new ConnectorRunError(
          'SOURCE_CONFIG_INVALID',
          'Source connector configuration is invalid',
        );
      }
      const config = configResult.data;
      if (config.fetchPolicy.userAgent.includes('contact@example.com')) {
        throw new ConnectorRunError(
          'SOURCE_CONTACT_NOT_CONFIGURED',
          'Source contact must be configured before fetching',
        );
      }
      const response = await fetchWithRetry({
        url: requestUrl(context.source.url, context.source.parserKey, config),
        headers: requestHeaders(
          context.source.parserKey,
          config,
          context.cursorBefore,
          this.options,
        ),
        timeoutMs: config.fetchPolicy.requestTimeoutSeconds * 1000,
        maxDocumentBytes: config.fetchPolicy.maxDocumentBytes,
        attempts: config.fetchPolicy.retry.attempts,
        maxDelayMs: config.fetchPolicy.retry.max_delay_seconds * 1000,
        minimumRetryDelayMs:
          context.source.parserKey === 'arxiv_atom_v1' ? 3000 : 0,
        fetcher: this.options.fetcher,
        sleep: this.options.sleep,
      });
      const archiveKey = await archiveResponse(
        this.archiveStore,
        context.source.key,
        context.runId,
        fetchedAt,
        response,
      );

      if (response.status === 304) {
        return this.repository.completeSource({
          runId: context.runId,
          sourceId: context.source.id,
          cursorAfter: cursorAfter(context.cursorBefore, response),
          documents: [],
          archiveKey,
          fetchedAt,
          httpEtag: response.headers.get('etag'),
          httpLastModified: response.headers.get('last-modified'),
        });
      }

      let parsed: ConnectorParseResult;
      try {
        parsed = await parseResponse(
          context.source.parserKey,
          response.body,
          context.source.url,
          context.cursorBefore,
        );
      } catch {
        throw new ConnectorRunError(
          'PARSE_FAILED',
          'Source response failed schema validation',
          archiveKey,
        );
      }
      if (parsed.observedCount === 0) {
        throw new ConnectorRunError(
          'EMPTY_RESULT',
          'Parser returned no publishable releases',
          archiveKey,
        );
      }

      return this.repository.completeSource({
        runId: context.runId,
        sourceId: context.source.id,
        cursorAfter: cursorAfter(context.cursorBefore, response, parsed.cursor),
        documents: parsed.documents,
        archiveKey,
        fetchedAt,
        httpEtag: response.headers.get('etag'),
        httpLastModified: response.headers.get('last-modified'),
      });
    } catch (error) {
      const failure = await normalizeFailure(
        error,
        this.archiveStore,
        context.source.key,
        context.runId,
        fetchedAt,
      );
      await this.repository.failSource({
        runId: context.runId,
        sourceId: context.source.id,
        code: failure.code,
        detail: failure.detail,
        archiveKey: failure.archiveKey,
        disableSource: failure.disableSource,
        requestId: input.requestId,
        failedAt: fetchedAt,
      });
      throw error;
    }
  }
}

export class GitHubReleaseConnectorRunner extends SourceConnectorRunner {}

function requestHeaders(
  parserKey: string,
  config: z.infer<typeof sourceConfigSchema>,
  cursor: Record<string, unknown>,
  options: { getCredential?: (environmentName: string) => string | undefined },
): Headers {
  const headers = new Headers({ 'User-Agent': config.fetchPolicy.userAgent });
  if (parserKey === 'github_releases_v1') {
    headers.set('Accept', 'application/vnd.github+json');
    headers.set('X-GitHub-Api-Version', '2022-11-28');
  } else if (parserKey === 'arxiv_atom_v1') {
    headers.set('Accept', 'application/atom+xml');
  } else {
    headers.set('Accept', 'application/json');
  }
  if (typeof cursor.etag === 'string')
    headers.set('If-None-Match', cursor.etag);
  if (typeof cursor.lastModified === 'string') {
    headers.set('If-Modified-Since', cursor.lastModified);
  }
  if (config.authEnv) {
    const credential = options.getCredential?.(config.authEnv);
    if (!credential) {
      throw new ConnectorRunError(
        'CREDENTIAL_MISSING',
        `Credential ${config.authEnv} is not configured`,
      );
    }
    headers.set('Authorization', `Bearer ${credential}`);
  }
  return headers;
}

function cursorAfter(
  before: Record<string, unknown>,
  response: ConnectorHttpResponse,
  parserCursor: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...before,
    ...parserCursor,
    ...(response.headers.get('etag')
      ? { etag: response.headers.get('etag') }
      : {}),
    ...(response.headers.get('last-modified')
      ? { lastModified: response.headers.get('last-modified') }
      : {}),
  };
}

function requestUrl(
  endpoint: string,
  parserKey: string,
  config: z.infer<typeof sourceConfigSchema>,
): string {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new ConnectorRunError(
      'SOURCE_URL_REJECTED',
      'Source endpoint is not a valid URL',
    );
  }
  if (url.search || url.hash || url.username || url.password || url.port) {
    throw new ConnectorRunError(
      'SOURCE_URL_REJECTED',
      'Source endpoint contains unsupported URL components',
    );
  }
  if (parserKey === 'github_releases_v1') return url.toString();
  if (parserKey === 'huggingface_models_v1') {
    if (url.hostname !== 'huggingface.co' || url.pathname !== '/api/models') {
      throw new ConnectorRunError(
        'SOURCE_URL_REJECTED',
        'Hugging Face endpoint is not allowed',
      );
    }
    url.searchParams.set('sort', 'lastModified');
    url.searchParams.set('direction', '-1');
    url.searchParams.set('limit', '100');
    return url.toString();
  }
  if (parserKey === 'arxiv_atom_v1') {
    if (
      url.hostname !== 'export.arxiv.org' ||
      url.pathname !== '/api/query' ||
      !config.query
    ) {
      throw new ConnectorRunError(
        'SOURCE_URL_REJECTED',
        'arXiv endpoint or query is not allowed',
      );
    }
    url.searchParams.set('search_query', config.query);
    url.searchParams.set('start', '0');
    url.searchParams.set('max_results', '100');
    url.searchParams.set('sortBy', 'lastUpdatedDate');
    url.searchParams.set('sortOrder', 'descending');
    return url.toString();
  }
  throw new ConnectorRunError(
    'PARSER_UNSUPPORTED',
    'Source parser is not supported',
  );
}

async function parseResponse(
  parserKey: string,
  body: Uint8Array,
  endpoint: string,
  cursor: Record<string, unknown>,
): Promise<ConnectorParseResult> {
  if (parserKey === 'github_releases_v1') {
    const documents = await parseGitHubReleases(body, endpoint);
    return { documents, observedCount: documents.length, cursor: {} };
  }
  if (parserKey === 'huggingface_models_v1') {
    return parseHuggingFaceModels(body, cursor);
  }
  if (parserKey === 'arxiv_atom_v1') return parseArxivAtom(body, cursor);
  throw new Error('Unsupported parser');
}

async function archiveResponse(
  store: RawArchiveStore,
  sourceKey: string,
  runId: string,
  fetchedAt: Date,
  response: ConnectorHttpResponse,
): Promise<string> {
  const bodyHash = await hashBytes(response.body);
  const contentType =
    response.headers.get('content-type') ?? 'application/octet-stream';
  const key = createRawArchiveKey({
    sourceKey,
    runId,
    fetchedAt,
    bodyHash,
    extension: archiveExtension(contentType),
  });
  await store.put({
    key,
    body: response.body,
    contentType,
    metadata: {
      status: String(response.status),
      fetchedAt: fetchedAt.toISOString(),
      ...(response.headers.get('etag')
        ? { etag: response.headers.get('etag')! }
        : {}),
      ...(response.headers.get('last-modified')
        ? { lastModified: response.headers.get('last-modified')! }
        : {}),
    },
  });
  return key;
}

function archiveExtension(contentType: string): 'json' | 'xml' | 'bin' {
  const normalized = contentType.toLowerCase();
  if (normalized.includes('json')) return 'json';
  if (normalized.includes('xml') || normalized.includes('atom')) return 'xml';
  return 'bin';
}

async function normalizeFailure(
  error: unknown,
  store: RawArchiveStore,
  sourceKey: string,
  runId: string,
  failedAt: Date,
): Promise<{
  code: string;
  detail: string;
  archiveKey: string | null;
  disableSource: boolean;
}> {
  if (error instanceof ConnectorHttpError) {
    let archiveKey: string | null = null;
    if (error.response) {
      try {
        archiveKey = await archiveResponse(
          store,
          sourceKey,
          runId,
          failedAt,
          error.response,
        );
      } catch {
        archiveKey = null;
      }
    }
    return {
      code: error.code,
      detail: archiveKey
        ? error.message
        : `${error.message}; diagnostic archive unavailable`,
      archiveKey,
      disableSource: error.disableSource,
    };
  }
  if (error instanceof ConnectorRunError) {
    return {
      code: error.code,
      detail: error.message,
      archiveKey: error.archiveKey ?? null,
      disableSource: false,
    };
  }
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return {
      code: 'PARSE_FAILED',
      detail: 'Source response failed schema validation',
      archiveKey: null,
      disableSource: false,
    };
  }
  return {
    code: 'CONNECTOR_FAILED',
    detail: 'Connector execution failed',
    archiveKey: null,
    disableSource: false,
  };
}

class ConnectorRunError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly archiveKey?: string,
  ) {
    super(message);
    this.name = 'ConnectorRunError';
  }
}

async function hashBytes(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
