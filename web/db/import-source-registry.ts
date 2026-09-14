import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { createDatabase } from './client';
import { DrizzleIngestionRepository } from '../lib/ingestion/drizzle-repository';
import { SourceRegistryService } from '../lib/ingestion/source-service';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const registryPath = path.resolve(
  process.cwd(),
  process.argv[2] ?? '../docs/07_SOURCE_REGISTRY.yaml',
);
const yaml = await readFile(registryPath, 'utf8');
const service = new SourceRegistryService(
  new DrizzleIngestionRepository(createDatabase(databaseUrl)),
);
const result = await service.importYaml(yaml, `source-import-${randomUUID()}`);

console.log(JSON.stringify(result));
