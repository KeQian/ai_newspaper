import { z } from 'zod';

import type { ParsedRawDocument } from './types';
import { normalizeText, sha256, truncateGraphemes } from './parser';

const githubReleaseSchema = z
  .object({
    id: z.number().int().positive(),
    html_url: z.string().url(),
    name: z.string().max(500).nullable(),
    tag_name: z.string().min(1).max(300),
    body: z.string().max(200_000).nullable(),
    published_at: z.string().datetime({ offset: true }).nullable(),
    draft: z.boolean(),
    prerelease: z.boolean(),
    author: z
      .object({ login: z.string().min(1).max(100) })
      .nullable()
      .optional(),
  })
  .passthrough();

const githubReleasesSchema = z.array(githubReleaseSchema).max(100);

export async function parseGitHubReleases(
  body: Uint8Array,
  apiEndpoint: string,
): Promise<ParsedRawDocument[]> {
  const repository = repositoryFromEndpoint(apiEndpoint);
  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(body);
  const releases = githubReleasesSchema.parse(JSON.parse(decoded));
  const seen = new Set<number>();
  const documents: ParsedRawDocument[] = [];

  for (const release of releases) {
    if (release.draft || seen.has(release.id)) continue;
    seen.add(release.id);
    const canonicalUrl = validateReleaseUrl(release.html_url, repository);
    const title = normalizeText(release.name || release.tag_name, 500);
    const normalizedBody = normalizeText(release.body ?? '', 200_000);
    const allowedExcerpt = normalizedBody
      ? truncateGraphemes(normalizedBody, 1000)
      : null;
    const publishedAt = release.published_at
      ? new Date(release.published_at)
      : null;
    const contentHash = await sha256(
      JSON.stringify({
        canonicalUrl,
        title,
        author: release.author?.login ?? null,
        publishedAt: publishedAt?.toISOString() ?? null,
        body: normalizedBody,
      }),
    );

    documents.push({
      externalId: String(release.id),
      canonicalUrl,
      title,
      author: release.author?.login ?? null,
      publishedAt,
      language: 'en',
      contentHash,
      allowedExcerpt,
      parserVersion: 'github_releases_v1',
    });
  }

  return documents;
}

function repositoryFromEndpoint(endpoint: string): string {
  const url = new URL(endpoint);
  const match = url.pathname.match(/^\/repos\/([^/]+\/[^/]+)\/releases\/?$/);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'api.github.com' ||
    !match
  ) {
    throw new Error('Invalid GitHub releases endpoint');
  }
  return match[1].toLowerCase();
}

function validateReleaseUrl(value: string, repository: string): string {
  const url = new URL(value);
  const prefix = `/${repository}/releases/`;
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'github.com' ||
    !url.pathname.toLowerCase().startsWith(prefix) ||
    url.username ||
    url.password ||
    url.port
  ) {
    throw new Error('Invalid GitHub release URL');
  }
  url.hash = '';
  return url.toString();
}
