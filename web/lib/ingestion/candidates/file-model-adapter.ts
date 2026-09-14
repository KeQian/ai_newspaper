import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import type {
  CandidateModelAdapter,
  CandidateModelInput,
  CandidateModelResult,
} from './types';

const maximumBundleBytes = 2_097_152;
const responseGroupSchema = z
  .object({
    rawDocumentIds: z.array(z.string().uuid()).min(1).max(50),
    outputs: z.array(z.unknown()).min(1).max(2),
  })
  .strict();
const responseBundleSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    promptVersion: z.string().min(1).max(120),
    provider: z.literal('codex'),
    model: z.string().min(1).max(200),
    groups: z.array(responseGroupSchema).min(1).max(100),
  })
  .strict();

export class FileCandidateModelAdapter implements CandidateModelAdapter {
  private readonly groups: Map<string, unknown[]>;

  constructor(
    private readonly provider: string,
    private readonly model: string,
    groups: ReadonlyArray<{ rawDocumentIds: string[]; outputs: unknown[] }>,
  ) {
    this.groups = new Map();
    for (const group of groups) {
      const key = documentSetKey(group.rawDocumentIds);
      if (this.groups.has(key)) {
        throw new Error('Candidate response groups must be unique');
      }
      this.groups.set(key, group.outputs);
    }
  }

  async generate(input: CandidateModelInput): Promise<CandidateModelResult> {
    const outputs = this.groups.get(
      documentSetKey(input.documents.map(({ id }) => id)),
    );
    if (!outputs) throw new Error('Candidate response group is missing');
    return {
      output: outputs[input.attempt - 1] ?? outputs.at(-1),
      provider: this.provider,
      model: this.model,
    };
  }
}

export async function loadCandidateResponseBundle(
  filePath: string,
  rootDirectory: string,
): Promise<{
  promptVersion: string;
  adapter: FileCandidateModelAdapter;
}> {
  if (!path.isAbsolute(filePath) || !path.isAbsolute(rootDirectory)) {
    throw new Error('Candidate response paths must be absolute');
  }
  const [resolvedFile, resolvedRoot] = await Promise.all([
    realpath(filePath),
    realpath(rootDirectory),
  ]);
  const relative = path.relative(resolvedRoot, resolvedFile);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(
      'Candidate response bundle is outside the allowed directory',
    );
  }
  const information = await stat(resolvedFile);
  if (!information.isFile() || information.size > maximumBundleBytes) {
    throw new Error('Candidate response bundle is invalid or too large');
  }
  const bundle = responseBundleSchema.parse(
    JSON.parse(await readFile(resolvedFile, 'utf8')),
  );
  for (const group of bundle.groups) {
    if (new Set(group.rawDocumentIds).size !== group.rawDocumentIds.length) {
      throw new Error('Candidate response document ids must be unique');
    }
  }
  return {
    promptVersion: bundle.promptVersion,
    adapter: new FileCandidateModelAdapter(
      bundle.provider,
      bundle.model,
      bundle.groups,
    ),
  };
}

function documentSetKey(documentIds: readonly string[]): string {
  return [...documentIds].sort().join('\n');
}
