import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const destination = '/deployment/.env.server';
if (!existsSync(destination)) {
  const template = readFileSync('/deployment/.env.production', 'utf8');
  const retained = template.split('\n').filter((line) => !/^(IMAGE_TAG|DATABASE_URL|PUBLIC_SITE_URL|NEWSLETTER_PUBLIC_URL|POSTGRES_PASSWORD)=/.test(line));
  retained.push('IMAGE_TAG=server-pg-v1', `POSTGRES_PASSWORD=${randomBytes(32).toString('hex')}`, 'PUBLIC_SITE_URL=http://127.0.0.1:4180', 'NEWSLETTER_PUBLIC_URL=http://127.0.0.1:4180');
  writeFileSync(destination, retained.join('\n') + '\n', { mode: 0o600, flag: 'wx' });
}
console.log('Server environment ready; secrets not displayed.');
