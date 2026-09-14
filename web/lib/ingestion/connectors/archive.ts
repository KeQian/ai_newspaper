import type { RawArchiveStore } from './types';

export function createRawArchiveKey(input: {
  sourceKey: string;
  runId: string;
  fetchedAt: Date;
  bodyHash: string;
  extension?: 'json' | 'xml' | 'bin';
}): string {
  const date = input.fetchedAt.toISOString().slice(0, 10);
  return `raw/${input.sourceKey}/${date}/${input.runId}/${input.bodyHash}.${input.extension ?? 'json'}`;
}

export class R2RawArchiveStore implements RawArchiveStore {
  constructor(private readonly bucket: R2Bucket) {}

  async put(input: Parameters<RawArchiveStore['put']>[0]): Promise<void> {
    await this.bucket.put(input.key, input.body, {
      httpMetadata: { contentType: input.contentType },
      customMetadata: input.metadata,
    });
  }
}
