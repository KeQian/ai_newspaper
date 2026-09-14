import type { SearchQuery } from './model';
import type { SearchRepository } from './types';

export class SearchService {
  constructor(private readonly repository: SearchRepository) {}

  async search(query: SearchQuery) {
    const page = await this.repository.search(query);
    const last = page.items.at(-1);
    return {
      query: query.q,
      ...page,
      nextCursor:
        page.hasMore && last
          ? encodeCursor({
              score: last.score,
              publishedAt: last.publishedAt,
              id: last.id,
            })
          : null,
    };
  }
}

export function encodeCursor(input: {
  score: number;
  publishedAt: Date;
  id: string;
}) {
  return btoa(`${input.score}|${input.publishedAt.toISOString()}|${input.id}`)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

export function decodeCursor(value: string) {
  try {
    const standard = value.replaceAll('-', '+').replaceAll('_', '/');
    const [rawScore, rawDate, id, ...extra] = atob(
      standard.padEnd(Math.ceil(standard.length / 4) * 4, '='),
    ).split('|');
    const score = Number(rawScore);
    const publishedAt = new Date(rawDate);
    if (
      extra.length ||
      !Number.isFinite(score) ||
      Number.isNaN(publishedAt.getTime()) ||
      !/^[0-9a-f-]{36}$/i.test(id)
    )
      throw new Error();
    return { score, publishedAt, id };
  } catch {
    throw new Error('Invalid cursor');
  }
}
