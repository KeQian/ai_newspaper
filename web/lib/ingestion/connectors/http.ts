export type ConnectorHttpResponse = {
  status: number;
  headers: Headers;
  body: Uint8Array;
};

export type ConnectorFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class ConnectorHttpError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly disableSource: boolean,
    readonly response?: ConnectorHttpResponse,
  ) {
    super(message);
    this.name = 'ConnectorHttpError';
  }
}

export async function fetchWithRetry(input: {
  url: string;
  headers: HeadersInit;
  timeoutMs: number;
  maxDocumentBytes: number;
  attempts: number;
  maxDelayMs: number;
  minimumRetryDelayMs?: number;
  fetcher?: ConnectorFetch;
  sleep?: (milliseconds: number) => Promise<void>;
}): Promise<ConnectorHttpResponse> {
  const fetcher = input.fetcher ?? fetch;
  const sleep =
    input.sleep ??
    ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));

  validateSourceUrl(input.url);

  for (let attempt = 1; attempt <= input.attempts; attempt += 1) {
    try {
      const response = await fetcher(input.url, {
        headers: input.headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(input.timeoutMs),
      });
      const body = await readBoundedBody(response, input.maxDocumentBytes);
      const result = {
        status: response.status,
        headers: response.headers,
        body,
      };

      if (response.status === 304 || response.ok) return result;
      if (response.status === 401 || response.status === 403) {
        throw new ConnectorHttpError(
          'AUTHORIZATION_FAILED',
          `Source authorization failed with HTTP ${response.status}`,
          true,
          result,
        );
      }
      if (response.status === 404 || response.status === 410) {
        throw new ConnectorHttpError(
          'SOURCE_REMOVED',
          `Source returned HTTP ${response.status}`,
          false,
          result,
        );
      }
      if (response.status === 429 || response.status >= 500) {
        if (attempt < input.attempts) {
          await sleep(
            retryDelay(
              response.headers,
              attempt,
              input.maxDelayMs,
              input.minimumRetryDelayMs ?? 0,
            ),
          );
          continue;
        }
        throw new ConnectorHttpError(
          response.status === 429 ? 'RATE_LIMITED' : 'UPSTREAM_FAILED',
          `Source returned HTTP ${response.status}`,
          false,
          result,
        );
      }
      throw new ConnectorHttpError(
        'UPSTREAM_REJECTED',
        `Source returned HTTP ${response.status}`,
        false,
        result,
      );
    } catch (error) {
      if (error instanceof ConnectorHttpError) throw error;
      if (attempt < input.attempts) {
        await sleep(
          Math.max(
            input.minimumRetryDelayMs ?? 0,
            Math.min(1000 * 2 ** (attempt - 1), input.maxDelayMs),
          ),
        );
        continue;
      }
      throw new ConnectorHttpError(
        'NETWORK_FAILED',
        'Source request failed',
        false,
      );
    }
  }

  throw new ConnectorHttpError(
    'NETWORK_FAILED',
    'Source request failed',
    false,
  );
}

export function validateSourceUrl(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !isAllowedEndpoint(url)
  ) {
    throw new ConnectorHttpError(
      'SOURCE_URL_REJECTED',
      'Source URL is not allowed',
      false,
    );
  }
  return url;
}

function isAllowedEndpoint(url: URL): boolean {
  if (url.hostname === 'api.github.com') {
    return (
      /^\/repos\/[^/]+\/[^/]+\/releases\/?$/.test(url.pathname) &&
      Array.from(url.searchParams).length === 0
    );
  }
  if (url.hostname === 'huggingface.co' && url.pathname === '/api/models') {
    return hasExactParameters(url, {
      sort: 'lastModified',
      direction: '-1',
      limit: '100',
    });
  }
  if (url.hostname === 'export.arxiv.org' && url.pathname === '/api/query') {
    const query = url.searchParams.get('search_query');
    return (
      typeof query === 'string' &&
      query.length <= 1000 &&
      /^[A-Za-z0-9:(). _-]+$/.test(query) &&
      hasExactParameters(url, {
        search_query: query,
        start: '0',
        max_results: '100',
        sortBy: 'lastUpdatedDate',
        sortOrder: 'descending',
      })
    );
  }
  return false;
}

function hasExactParameters(
  url: URL,
  expected: Record<string, string>,
): boolean {
  const entries = Array.from(url.searchParams.entries());
  return (
    entries.length === Object.keys(expected).length &&
    entries.every(([key, value]) => expected[key] === value)
  );
}

async function readBoundedBody(
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new ConnectorHttpError(
      'DOCUMENT_TOO_LARGE',
      'Source response is too large',
      false,
    );
  }
  const body = new Uint8Array(await response.arrayBuffer());
  if (body.byteLength > maximumBytes) {
    throw new ConnectorHttpError(
      'DOCUMENT_TOO_LARGE',
      'Source response is too large',
      false,
    );
  }
  return body;
}

function retryDelay(
  headers: Headers,
  attempt: number,
  maximumMs: number,
  minimumMs: number,
): number {
  const retryAfter = headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.max(minimumMs, Math.min(seconds * 1000, maximumMs));
    }
    const date = new Date(retryAfter);
    if (!Number.isNaN(date.getTime())) {
      return Math.max(
        minimumMs,
        Math.min(Math.max(0, date.getTime() - Date.now()), maximumMs),
      );
    }
  }
  return Math.max(minimumMs, Math.min(1000 * 2 ** (attempt - 1), maximumMs));
}
