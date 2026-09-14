import type {
  ContentDraftInput,
  ContentListQuery,
  ContentUpdateInput,
  CorrectionInput,
} from './model';

export type ContentSummary = {
  id: string;
  type: string;
  title: string;
  status: string;
  authorName: string;
  updatedAt: Date;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  sourceHealth: 'healthy' | 'warning' | 'missing';
  version: number;
};

export type ContentDetail = ContentSummary & {
  slug: string;
  dek: string;
  summary: string;
  body: Record<string, unknown>;
  verification: string;
  importance: number;
  actionability: number;
  seo: Record<string, unknown>;
  aiDisclosure: Record<string, unknown> | null;
  withdrawalReason: string | null;
  sources: Array<{
    id: string;
    rawDocumentId: string | null;
    title: string;
    publisher: string;
    url: string;
    reliability: string;
    relation: string;
  }>;
  topicIds: string[];
  revisions: Array<{
    revision: number;
    changeSummary: string;
    authorName: string;
    createdAt: Date;
  }>;
  corrections: Array<{
    description: string;
    authorName: string;
    correctedAt: Date;
  }>;
};

export type ContentMutationResult = {
  id: string;
  status: string;
  version: number;
};

export interface ContentRepository {
  list(
    query: ContentListQuery,
  ): Promise<{ items: ContentSummary[]; hasMore: boolean }>;
  get(id: string): Promise<ContentDetail | null>;
  create(input: {
    draft: ContentDraftInput;
    actorId: string;
    requestId: string;
    now: Date;
  }): Promise<ContentMutationResult>;
  update(input: {
    id: string;
    draft: ContentUpdateInput;
    actorId: string;
    requestId: string;
    now: Date;
  }): Promise<ContentMutationResult>;
  transition(input: {
    id: string;
    action:
      | { type: 'submit_review'; version: number }
      | { type: 'publish'; version: number; scheduledAt?: Date }
      | { type: 'cancel_schedule'; version: number }
      | { type: 'withdraw'; version: number; reason: string };
    actorId: string;
    requestId: string;
    now: Date;
  }): Promise<ContentMutationResult>;
  correct(input: {
    id: string;
    correction: CorrectionInput;
    actorId: string;
    requestId: string;
    now: Date;
  }): Promise<ContentMutationResult>;
}
