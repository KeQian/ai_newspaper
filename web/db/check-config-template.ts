import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { requiredLaunchEnvironmentKeys } from '@/lib/operations/launch-readiness';

const source = await readFile(
  path.resolve(process.cwd(), '.env.example'),
  'utf8',
);
const keys = new Set(
  source
    .split(/\r?\n/u)
    .filter((line) => /^[A-Z][A-Z0-9_]*=/u.test(line))
    .map((line) => line.slice(0, line.indexOf('='))),
);
const runtimeProvidedKeys = new Set(['NODE_ENV']);
const missing = requiredLaunchEnvironmentKeys.filter(
  (key) => !runtimeProvidedKeys.has(key) && !keys.has(key),
);
const exposedSecrets = [...keys].filter(
  (key) =>
    /(?:TOKEN|SECRET|DATABASE_URL)/u.test(key) &&
    /^(?:NEXT_PUBLIC|PUBLIC_)/u.test(key),
);
if (missing.length || exposedSecrets.length) {
  throw new Error(
    `Invalid production configuration template: missing=${missing.join(',')}; exposed=${exposedSecrets.join(',')}`,
  );
}
console.log(
  JSON.stringify({
    event: 'production_config_template.checked',
    keys: keys.size,
  }),
);
