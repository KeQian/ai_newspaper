import {
  CandidateDecisionError,
  decodeCandidateCursor,
  encodeCandidateCursor,
  type CandidateDecision,
  type CandidateListQuery,
} from './model';
import type { EditorialCandidateRepository } from './types';

export class EditorialCandidateService {
  constructor(private readonly repository: EditorialCandidateRepository) {}

  async list(query: CandidateListQuery, now = new Date()) {
    if (query.cursor) decodeCandidateCursor(query.cursor);
    const page = await this.repository.list(query, now);
    const visible = page.items.slice(0, query.limit);
    return {
      items: visible,
      hasMore: page.hasMore,
      nextCursor:
        page.hasMore && visible.length
          ? encodeCandidateCursor(visible.at(-1)!.createdAt, visible.at(-1)!.id)
          : null,
    };
  }

  get(id: string) {
    return this.repository.get(id);
  }

  decide(input: {
    id: string;
    decision: CandidateDecision;
    actorId: string;
    requestId: string;
    now?: Date;
  }) {
    if (
      input.decision.action === 'merge' &&
      input.decision.targetId === input.id
    ) {
      throw new CandidateDecisionError('A candidate cannot merge into itself');
    }
    return this.repository.decide({ ...input, now: input.now ?? new Date() });
  }
}
