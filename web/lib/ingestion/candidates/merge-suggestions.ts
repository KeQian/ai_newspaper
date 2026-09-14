import { normalizeEntityName } from './model';
import type { RecentCandidate } from './types';

const maximumTimeDistanceMs = 72 * 60 * 60 * 1000;

export function suggestCandidateMerges(
  candidate: {
    title: string;
    occurredAt: Date | null;
    entityNames: readonly string[];
  },
  recent: readonly RecentCandidate[],
): Array<{ targetEventId: string; score: number; reasons: string[] }> {
  const candidateEntities = new Set(
    candidate.entityNames.map(normalizeEntityName).filter(Boolean),
  );
  const titleTokens = tokenize(candidate.title);

  return recent
    .flatMap((target) => {
      if (!withinTimeWindow(candidate.occurredAt, target.occurredAt)) return [];
      const sharedEntities = target.entityNames
        .map(normalizeEntityName)
        .filter((name) => candidateEntities.has(name));
      if (sharedEntities.length === 0) return [];
      const titleScore = jaccard(titleTokens, tokenize(target.title));
      if (titleScore < 0.55) return [];
      const score = Math.min(1, titleScore * 0.8 + 0.2);
      return [
        {
          targetEventId: target.id,
          score: Number(score.toFixed(3)),
          reasons: ['shared_entity', 'similar_title', 'within_72_hours'],
        },
      ];
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 10);
}

function withinTimeWindow(left: Date | null, right: Date | null): boolean {
  if (!left || !right) return false;
  return Math.abs(left.getTime() - right.getTime()) <= maximumTimeDistanceMs;
}

function tokenize(value: string): Set<string> {
  const normalized = value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  if (!normalized) return new Set();
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length > 1) return new Set(words);
  const characters = Array.from(words[0]);
  if (characters.length < 2) return new Set(characters);
  return new Set(
    characters
      .slice(0, -1)
      .map((character, index) => `${character}${characters[index + 1]}`),
  );
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  const intersection = Array.from(left).filter((token) =>
    right.has(token),
  ).length;
  const union = new Set([...left, ...right]).size;
  return intersection / union;
}
