import type { CandidateDecision, CandidateListQuery } from './model';

export type CandidateListItem = {
  id: string;
  title: string;
  factSummary: string;
  occurredAt: Date | null;
  status: string;
  verification: string;
  importance: number;
  actionability: number;
  confidence: number;
  riskFlags: string[];
  sourceCount: number;
  primarySource: string | null;
  deferredUntil: Date | null;
  createdAt: Date;
  version: number;
};

export type CandidateDetail = CandidateListItem & {
  novelty: number;
  modelInfo: Record<string, unknown> | null;
  documents: Array<{
    id: string;
    title: string;
    url: string;
    excerpt: string | null;
    publisher: string;
    reliability: string;
    relation: string;
    publishedAt: Date | null;
  }>;
  entities: Array<{
    id: string;
    name: string;
    type: string;
    confidence: number;
    confirmed: boolean;
  }>;
  entitySuggestions: Array<{
    id: string;
    name: string;
    type: string;
    confidence: number;
    status: string;
  }>;
  mergeSuggestions: Array<{
    targetId: string;
    title: string;
    score: number;
    reasons: string[];
    status: string;
  }>;
};

export type CandidateDecisionResult = {
  id: string;
  status: string;
  version: number;
  draftId?: string;
};

export interface EditorialCandidateRepository {
  list(
    query: CandidateListQuery,
    now: Date,
  ): Promise<{ items: CandidateListItem[]; hasMore: boolean }>;
  get(id: string): Promise<CandidateDetail | null>;
  decide(input: {
    id: string;
    decision: CandidateDecision;
    actorId: string;
    requestId: string;
    now: Date;
  }): Promise<CandidateDecisionResult>;
}
