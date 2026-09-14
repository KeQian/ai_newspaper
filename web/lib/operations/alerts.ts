import type { OperationsAlert, OperationsSnapshot } from './types';

export function evaluateOperationsAlerts(
  snapshot: OperationsSnapshot,
): OperationsAlert[] {
  const alerts: OperationsAlert[] = [];
  if (!snapshot.databaseReady) {
    alerts.push({
      code: 'DATABASE_UNAVAILABLE',
      severity: 'SEV1',
      value: 1,
      message: '事实数据库不可用。',
    });
  }
  if (snapshot.sources.staleCore > 0) {
    alerts.push({
      code: 'CORE_SOURCE_STALE',
      severity: 'SEV2',
      value: snapshot.sources.staleCore,
      message: '核心来源超过 2 小时未成功。',
    });
  }
  if (snapshot.newsletter.failedDeliveriesLast24h > 0) {
    alerts.push({
      code: 'NEWSLETTER_DELIVERY_FAILED',
      severity: 'SEV2',
      value: snapshot.newsletter.failedDeliveriesLast24h,
      message: 'Newsletter 投递出现失败。',
    });
  }
  if (snapshot.outbox.failed > 0) {
    alerts.push({
      code: 'OUTBOX_FAILED',
      severity: 'SEV2',
      value: snapshot.outbox.failed,
      message: 'Outbox 存在失败事件。',
    });
  }
  if (
    snapshot.outbox.pending > 0 &&
    snapshot.outbox.oldestAvailableAt &&
    snapshot.checkedAt.getTime() - snapshot.outbox.oldestAvailableAt.getTime() >
      15 * 60_000
  ) {
    alerts.push({
      code: 'OUTBOX_BACKLOG',
      severity: 'SEV2',
      value: snapshot.outbox.pending,
      message: 'Outbox 最旧可执行事件已积压超过 15 分钟。',
    });
  }
  if (snapshot.sources.failing > 0) {
    alerts.push({
      code: 'SOURCE_CONSECUTIVE_FAILURES',
      severity: 'SEV3',
      value: snapshot.sources.failing,
      message: '来源连续失败至少 3 次。',
    });
  }
  if (
    snapshot.ingestion.failedLast24h > 0 ||
    snapshot.ingestion.partialLast24h > 0
  ) {
    alerts.push({
      code: 'INGESTION_DEGRADED',
      severity: 'SEV3',
      value:
        snapshot.ingestion.failedLast24h + snapshot.ingestion.partialLast24h,
      message: '24 小时内存在失败或部分成功的采集任务。',
    });
  }
  if (snapshot.newsletter.complainedLast24h > 0) {
    alerts.push({
      code: 'NEWSLETTER_COMPLAINT',
      severity: 'SEV3',
      value: snapshot.newsletter.complainedLast24h,
      message: '24 小时内收到 Newsletter 投诉事件。',
    });
  }
  return alerts;
}
