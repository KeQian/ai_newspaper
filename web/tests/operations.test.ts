// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { evaluateOperationsAlerts } from '@/lib/operations/alerts';
import {
  createOperationsStatusHandler,
  livenessResponse,
} from '@/lib/operations/http';
import { checkLaunchReadiness } from '@/lib/operations/launch-readiness';
import type { OperationsSnapshot } from '@/lib/operations/types';

const now = new Date('2026-09-14T01:00:00.000Z');
const healthySnapshot: OperationsSnapshot = {
  checkedAt: now,
  databaseReady: true,
  ingestion: { running: 0, failedLast24h: 0, partialLast24h: 0 },
  sources: { failing: 0, staleCore: 0 },
  outbox: { pending: 0, failed: 0, oldestAvailableAt: null },
  newsletter: { failedDeliveriesLast24h: 0, complainedLast24h: 0 },
};

describe('operations status', () => {
  it('keeps liveness dependency-free and protects detailed status', async () => {
    const live = livenessResponse(
      new Request('https://example.com/api/v1/health'),
    );
    expect(live.status).toBe(200);

    const handler = createOperationsStatusHandler({
      getExpectedToken: () => 'o'.repeat(32),
      createRepository: () => ({ snapshot: async () => healthySnapshot }),
      now: () => now,
    });
    expect(
      (await handler(new Request('https://example.com/status'))).status,
    ).toBe(401);
    const response = await handler(
      new Request('https://example.com/status', {
        headers: { authorization: `Bearer ${'o'.repeat(32)}` },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toMatchObject({
      checkedAt: now.toISOString(),
      alerts: [],
    });
  });

  it('maps measurable failures to documented alert severities', () => {
    const alerts = evaluateOperationsAlerts({
      ...healthySnapshot,
      sources: { failing: 2, staleCore: 1 },
      outbox: {
        pending: 3,
        failed: 1,
        oldestAvailableAt: new Date(now.getTime() - 16 * 60_000),
      },
      newsletter: { failedDeliveriesLast24h: 4, complainedLast24h: 1 },
    });
    expect(alerts.map(({ code, severity }) => [code, severity])).toEqual([
      ['CORE_SOURCE_STALE', 'SEV2'],
      ['NEWSLETTER_DELIVERY_FAILED', 'SEV2'],
      ['OUTBOX_FAILED', 'SEV2'],
      ['OUTBOX_BACKLOG', 'SEV2'],
      ['SOURCE_CONSECUTIVE_FAILURES', 'SEV3'],
      ['NEWSLETTER_COMPLAINT', 'SEV3'],
    ]);
  });
});

describe('launch readiness', () => {
  it('passes only explicit, recent, non-placeholder production approvals', () => {
    const input = validLaunchEnvironment();
    expect(checkLaunchReadiness(input, now)).toEqual({
      ready: true,
      blockers: [],
    });

    const unsafe = {
      ...input,
      PUBLIC_SITE_URL: 'https://www.example.com',
      LAUNCH_REGION_APPROVED: 'false',
      OPERATIONS_TOKEN: input.INGESTION_TOKEN,
    };
    expect(checkLaunchReadiness(unsafe, now)).toMatchObject({ ready: false });
    expect(checkLaunchReadiness(unsafe, now).blockers).toEqual(
      expect.arrayContaining([
        'PUBLIC_SITE_URL_PLACEHOLDER',
        'ENV_LAUNCH_REGION_APPROVED',
        'NEWSLETTER_PUBLIC_URL_MISMATCH',
        'SECRETS_MUST_BE_DISTINCT',
      ]),
    );
  });
});

function validLaunchEnvironment(): Record<string, string> {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@db.internal/app',
    PUBLIC_SITE_URL: 'https://aisignal.cn',
    PUBLIC_CONTACT_EMAIL: 'editorial@aisignal.cn',
    OIDC_ISSUER_URL: 'https://identity.aisignal.cn',
    OIDC_CLIENT_ID: 'ai-signal-admin',
    ADMIN_ALLOWED_EMAILS: 'admin@aisignal.cn',
    INGESTION_TOKEN: 'i'.repeat(32),
    OPERATIONS_TOKEN: 'o'.repeat(32),
    RAW_ARCHIVE_DIR: '/srv/archive',
    CANDIDATE_RESPONSE_DIR: '/srv/candidates',
    NEWSLETTER_PUBLIC_URL: 'https://aisignal.cn',
    NEWSLETTER_TOKEN_SECRET: 'n'.repeat(32),
    NEWSLETTER_FROM: 'AI Signal <newsletter@aisignal.cn>',
    EMAIL_API_URL: 'https://mail.aisignal.cn/messages',
    EMAIL_API_TOKEN: 'e'.repeat(24),
    EMAIL_PROVIDER_KEY: 'provider',
    EMAIL_WEBHOOK_SECRET: 'w'.repeat(32),
    ENABLE_DEV_AUTH: 'false',
    LAUNCH_REGION_APPROVED: 'true',
    LAUNCH_BRAND_APPROVED: 'true',
    LAUNCH_LEGAL_APPROVED: 'true',
    LAUNCH_OIDC_TESTED: 'true',
    LAUNCH_EMAIL_DOMAIN_VERIFIED: 'true',
    LAUNCH_BACKUP_RESTORE_TESTED_AT: '2026-09-13T00:00:00.000Z',
    LAUNCH_ALERTS_TESTED_AT: '2026-09-13T00:00:00.000Z',
  };
}
