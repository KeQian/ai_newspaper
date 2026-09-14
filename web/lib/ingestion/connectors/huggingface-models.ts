import { z } from 'zod';

import {
  cursorDate,
  normalizeText,
  sha256,
  truncateGraphemes,
  type ConnectorParseResult,
} from './parser';

const modelSchema = z
  .object({
    id: z.string().min(3).max(300),
    author: z.string().min(1).max(160).nullable().optional(),
    lastModified: z.string().datetime({ offset: true }),
    createdAt: z.string().datetime({ offset: true }).nullable().optional(),
    sha: z.string().min(7).max(100).nullable().optional(),
    pipeline_tag: z.string().min(1).max(120).nullable().optional(),
    tags: z.array(z.string().min(1).max(200)).max(200).optional(),
    downloads: z.number().int().nonnegative().optional(),
    likes: z.number().int().nonnegative().optional(),
    gated: z.union([z.boolean(), z.string()]).optional(),
  })
  .passthrough();

const modelsSchema = z.array(modelSchema).max(100);
const modelIdPattern =
  /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

export async function parseHuggingFaceModels(
  body: Uint8Array,
  cursor: Record<string, unknown>,
): Promise<ConnectorParseResult> {
  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(body);
  const models = modelsSchema.parse(JSON.parse(decoded));
  const previous = cursorDate(cursor);
  const seen = new Set<string>();
  const documents = [];
  let latest = previous;

  for (const model of models) {
    if (!modelIdPattern.test(model.id) || seen.has(model.id)) continue;
    seen.add(model.id);
    const updatedAt = new Date(model.lastModified);
    if (!latest || updatedAt > latest) latest = updatedAt;
    if (previous && updatedAt <= previous) continue;

    const canonicalUrl = huggingFaceModelUrl(model.id);
    const tags = (model.tags ?? [])
      .slice(0, 20)
      .map((tag) => normalizeText(tag, 100))
      .sort();
    const metadata = [
      model.pipeline_tag
        ? `Task: ${normalizeText(model.pipeline_tag, 120)}`
        : '',
      tags.length > 0 ? `Tags: ${tags.join(', ')}` : '',
      typeof model.downloads === 'number'
        ? `Downloads: ${model.downloads}`
        : '',
      typeof model.likes === 'number' ? `Likes: ${model.likes}` : '',
    ].filter(Boolean);
    const allowedExcerpt = metadata.length
      ? truncateGraphemes(metadata.join(' · '), 1000)
      : null;
    const contentHash = await sha256(
      JSON.stringify({
        id: model.id,
        updatedAt: updatedAt.toISOString(),
        sha: model.sha ?? null,
        pipelineTag: model.pipeline_tag ?? null,
        tags,
        gated: model.gated ?? null,
      }),
    );

    documents.push({
      externalId: model.id,
      canonicalUrl,
      title: normalizeText(model.id, 300),
      author: model.author ?? model.id.split('/')[0],
      publishedAt: updatedAt,
      language: 'en',
      contentHash,
      allowedExcerpt,
      parserVersion: 'huggingface_models_v1',
    });
  }

  return {
    documents,
    observedCount: models.length,
    cursor: latest ? { latestUpdatedAt: latest.toISOString() } : {},
  };
}

function huggingFaceModelUrl(modelId: string): string {
  const segments = modelId.split('/').map(encodeURIComponent);
  return `https://huggingface.co/${segments.join('/')}`;
}
