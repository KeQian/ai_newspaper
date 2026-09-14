import { nextPublicCursor } from './drizzle-repository';
import type { PublicContentQuery } from './model';
import type { PublicContentRepository } from './types';

export class PublicContentService {
  constructor(private readonly repository: PublicContentRepository) {}

  async list(query: PublicContentQuery) {
    const page = await this.repository.list(query);
    return { ...page, nextCursor: nextPublicCursor(page.items, page.hasMore) };
  }

  findBySlug(slug: string) {
    return this.repository.findBySlug(slug);
  }

  findLatestByType(type: 'news' | 'briefing' | 'analysis') {
    return this.repository.findLatestByType(type);
  }

  findBriefingByDate(date: string) {
    return this.repository.findBriefingByDate(date);
  }

  listTopics() {
    return this.repository.listTopics();
  }

  async findTopicBySlug(slug: string) {
    const result = await this.repository.findTopicBySlug(slug);
    if (result.kind !== 'topic') return result;
    const content = await this.list({ topic: slug, limit: 20 });
    return { ...result, content };
  }
}
