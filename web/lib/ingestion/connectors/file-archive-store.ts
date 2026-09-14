import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ArchiveInput, RawArchiveStore } from './types';

export class FileRawArchiveStore implements RawArchiveStore {
  constructor(private readonly rootDirectory: string) {
    if (!path.isAbsolute(rootDirectory)) {
      throw new Error('RAW_ARCHIVE_DIR must be an absolute path');
    }
  }

  async put(input: ArchiveInput): Promise<void> {
    const destination = path.resolve(this.rootDirectory, input.key);
    const relative = path.relative(this.rootDirectory, destination);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Invalid archive key');
    }

    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, input.body, { flag: 'wx' }).catch((error) => {
      if (isAlreadyExists(error)) return;
      throw error;
    });
    await writeFile(
      `${destination}.metadata.json`,
      JSON.stringify({ contentType: input.contentType, ...input.metadata }),
      { flag: 'wx' },
    ).catch((error) => {
      if (isAlreadyExists(error)) return;
      throw error;
    });
  }
}

function isAlreadyExists(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'EEXIST'
  );
}
