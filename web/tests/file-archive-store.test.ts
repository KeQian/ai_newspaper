// @vitest-environment node

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { FileRawArchiveStore } from '@/lib/ingestion/connectors/file-archive-store';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('FileRawArchiveStore', () => {
  it('writes response bytes and metadata idempotently', async () => {
    const root = await makeTemporaryDirectory();
    const store = new FileRawArchiveStore(root);
    const input = {
      key: 'raw/source/2026-09-12/run/body.json',
      body: new TextEncoder().encode('{"ok":true}'),
      contentType: 'application/json',
      metadata: { sourceKey: 'source', requestId: 'request-1' },
    };

    await store.put(input);
    await store.put(input);

    const destination = path.join(root, input.key);
    await expect(readFile(destination, 'utf8')).resolves.toBe('{"ok":true}');
    await expect(
      readFile(`${destination}.metadata.json`, 'utf8').then(JSON.parse),
    ).resolves.toEqual({
      contentType: 'application/json',
      sourceKey: 'source',
      requestId: 'request-1',
    });
  });

  it('rejects archive keys that escape the configured root', async () => {
    const store = new FileRawArchiveStore(await makeTemporaryDirectory());

    await expect(
      store.put({
        key: '../escape.json',
        body: new Uint8Array(),
        contentType: 'application/json',
        metadata: {},
      }),
    ).rejects.toThrow('Invalid archive key');
  });

  it('requires an absolute archive root', () => {
    expect(() => new FileRawArchiveStore('relative/archive')).toThrow(
      'RAW_ARCHIVE_DIR must be an absolute path',
    );
  });
});

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'ai-signal-archive-'));
  temporaryDirectories.push(directory);
  return directory;
}
