import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parse } from 'yaml';
import { z } from 'zod';

const contractSchema = z.object({
  openapi: z.literal('3.1.0'),
  paths: z.record(z.record(z.unknown())),
  components: z.object({
    schemas: z.record(z.unknown()),
    responses: z.record(z.unknown()),
    securitySchemes: z.record(z.unknown()),
  }),
});

const contract = contractSchema.parse(
  parse(
    await readFile(
      path.resolve(process.cwd(), '../docs/06_API_CONTRACT.yaml'),
      'utf8',
    ),
  ),
);
const requiredPaths = [
  '/health',
  '/content',
  '/search',
  '/newsletter/subscriptions',
  '/admin/session',
  '/admin/audit',
  '/internal/ingestion/runs',
  '/internal/operations/status',
];
const missing = requiredPaths.filter((entry) => !contract.paths[entry]);
if (missing.length)
  throw new Error(`Contract paths missing: ${missing.join(', ')}`);
console.log(
  JSON.stringify({
    event: 'api_contract.checked',
    paths: Object.keys(contract.paths).length,
  }),
);
