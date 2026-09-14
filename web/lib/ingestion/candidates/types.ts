import type { CandidateOutput } from './model';

export type CandidateDocument = {
  id: string;
  title: string;
  allowedExcerpt: string | null;
  canonicalUrl: string;
  publishedAt: Date | null;
  contentHash: string;
  sourceName: string;
  sourceReliability: string;
};

export type CandidateDocumentGroup = {
  contentHash: string;
  documents: CandidateDocument[];
};

export type CandidateModelInput = {
  schemaVersion: '1.0';
  attempt: 1 | 2;
  promptVersion: string;
  instructions: readonly string[];
  documents: ReadonlyArray<{
    id: string;
    title: string;
    excerpt: string | null;
    url: string;
    publishedAt: string | null;
    source: string;
    reliability: string;
    trust: 'untrusted_external_data';
  }>;
  previousValidationIssues: readonly string[];
};

export type CandidateModelResult = {
  output: unknown;
  model: string;
  provider: string;
};

export interface CandidateModelAdapter {
  generate(input: CandidateModelInput): Promise<CandidateModelResult>;
}

export type RecentCandidate = {
  id: string;
  title: string;
  occurredAt: Date | null;
  entityNames: string[];
};

export interface CandidateRepository {
  listPendingGroups(
    runId: string,
    limit: number,
  ): Promise<CandidateDocumentGroup[]>;
  attachToExistingCandidate(input: {
    clusterKey: string;
    documents: readonly CandidateDocument[];
    now: Date;
  }): Promise<string | null>;
  createCandidate(input: {
    runId: string;
    clusterKey: string;
    output: CandidateOutput;
    documents: readonly CandidateDocument[];
    riskFlags: readonly string[];
    modelInfo: Record<string, unknown>;
    now: Date;
  }): Promise<{ id: string; created: boolean }>;
  recordGenerationFailure(input: {
    runId: string;
    clusterKey: string;
    rawDocumentIds: readonly string[];
    errorCode: 'CANDIDATE_OUTPUT_INVALID' | 'CANDIDATE_MODEL_FAILED';
    issues: readonly string[];
    attempts: number;
    modelInfo: Record<string, unknown>;
    now: Date;
  }): Promise<void>;
  listRecentCandidates(input: {
    candidateId: string;
    occurredAt: Date | null;
    now: Date;
  }): Promise<RecentCandidate[]>;
  saveMergeSuggestions(input: {
    candidateId: string;
    suggestions: ReadonlyArray<{
      targetEventId: string;
      score: number;
      reasons: string[];
    }>;
    now: Date;
  }): Promise<void>;
}
