// @vitest-environment node

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { loadCandidateResponseBundle } from '@/lib/ingestion/candidates/file-model-adapter';

const directories: string[] = [];
const documentId = '10000000-0000-4000-8000-000000000001';

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('candidate response file adapter', () => {
  it('loads a bounded response bundle and selects output by document set', async () => {
    const root = await temporaryDirectory();
    const file = path.join(root, 'response.json');
    await writeFile(
      file,
      JSON.stringify({
        schemaVersion: '1.0',
        promptVersion: 'candidate-v1',
        provider: 'codex',
        model: 'configured-codex-model',
        groups: [
          {
            rawDocumentIds: [documentId],
            outputs: [{ first: 'invalid' }, { second: 'candidate-output' }],
          },
        ],
      }),
    );
    const bundle = await loadCandidateResponseBundle(file, root);
    const result = await bundle.adapter.generate({
      schemaVersion: '1.0',
      attempt: 2,
      promptVersion: bundle.promptVersion,
      instructions: [],
      documents: [
        {
          id: documentId,
          title: 'Title',
          excerpt: null,
          url: 'https://example.com',
          publishedAt: null,
          source: 'Source',
          reliability: 's0',
          trust: 'untrusted_external_data',
        },
      ],
      previousValidationIssues: [],
    });
    expect(result).toMatchObject({
      output: { second: 'candidate-output' },
      provider: 'codex',
    });
  });

  it('rejects files outside the configured response directory', async () => {
    const parent = await temporaryDirectory();
    const allowed = path.join(parent, 'allowed');
    await mkdir(allowed);
    const file = path.join(parent, 'outside.json');
    await writeFile(file, '{}');
    await expect(loadCandidateResponseBundle(file, allowed)).rejects.toThrow(
      'outside the allowed directory',
    );
  });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'ai-signal-candidate-'));
  directories.push(directory);
  return directory;
}
