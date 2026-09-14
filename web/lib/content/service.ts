import { nextContentCursor } from './drizzle-repository';
import type {
  ContentDraftInput,
  ContentListQuery,
  ContentUpdateInput,
  CorrectionInput,
} from './model';
import type { ContentRepository } from './types';

export class ContentService {
  constructor(private readonly repository: ContentRepository) {}

  async list(query: ContentListQuery) {
    const page = await this.repository.list(query);
    const items = page.items.slice(0, query.limit);
    return {
      items,
      hasMore: page.hasMore,
      nextCursor: nextContentCursor(items, page.hasMore),
    };
  }

  get(id: string) {
    return this.repository.get(id);
  }

  create(
    draft: ContentDraftInput,
    actorId: string,
    requestId: string,
    now = new Date(),
  ) {
    return this.repository.create({ draft, actorId, requestId, now });
  }

  update(
    id: string,
    draft: ContentUpdateInput,
    actorId: string,
    requestId: string,
    now = new Date(),
  ) {
    return this.repository.update({ id, draft, actorId, requestId, now });
  }

  transition(
    id: string,
    action: Parameters<ContentRepository['transition']>[0]['action'],
    actorId: string,
    requestId: string,
    now = new Date(),
  ) {
    return this.repository.transition({ id, action, actorId, requestId, now });
  }

  correct(
    id: string,
    correction: CorrectionInput,
    actorId: string,
    requestId: string,
    now = new Date(),
  ) {
    return this.repository.correct({
      id,
      correction,
      actorId,
      requestId,
      now,
    });
  }
}
