export type ConnectorSource = {
  id: string;
  key: string;
  name: string;
  url: string;
  parserKey: string;
  enabled: boolean;
  termsStatus: string;
  cursor: Record<string, unknown>;
  config: Record<string, unknown>;
};

export type ParsedRawDocument = {
  externalId: string;
  canonicalUrl: string;
  title: string;
  author: string | null;
  publishedAt: Date | null;
  language: string;
  contentHash: string;
  allowedExcerpt: string | null;
  parserVersion: string;
};

export type ConnectorRunContext = {
  runId: string;
  source: ConnectorSource;
  cursorBefore: Record<string, unknown>;
};

export type ConnectorCompletion = {
  runId: string;
  sourceId: string;
  cursorAfter: Record<string, unknown>;
  documents: readonly ParsedRawDocument[];
  archiveKey: string;
  fetchedAt: Date;
  httpEtag: string | null;
  httpLastModified: string | null;
};

export type ConnectorFailure = {
  runId: string;
  sourceId: string;
  code: string;
  detail: string;
  archiveKey: string | null;
  disableSource: boolean;
  requestId: string;
  failedAt: Date;
};

export interface ConnectorRepository {
  listRunSources(
    runId: string,
  ): Promise<Array<{ sourceKey: string; status: string }>>;
  getRunContext(runId: string, sourceKey: string): Promise<ConnectorRunContext>;
  markRunning(runId: string, sourceId: string, startedAt: Date): Promise<void>;
  completeSource(input: ConnectorCompletion): Promise<{
    fetchedCount: number;
    newCount: number;
    duplicateCount: number;
  }>;
  failSource(input: ConnectorFailure): Promise<void>;
}

export type ArchiveInput = {
  key: string;
  body: Uint8Array;
  contentType: string;
  metadata: Record<string, string>;
};

export interface RawArchiveStore {
  put(input: ArchiveInput): Promise<void>;
}
