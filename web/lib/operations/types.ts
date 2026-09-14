export type OperationsSnapshot = {
  checkedAt: Date;
  databaseReady: boolean;
  ingestion: {
    running: number;
    failedLast24h: number;
    partialLast24h: number;
  };
  sources: {
    failing: number;
    staleCore: number;
  };
  outbox: {
    pending: number;
    failed: number;
    oldestAvailableAt: Date | null;
  };
  newsletter: {
    failedDeliveriesLast24h: number;
    complainedLast24h: number;
  };
};

export type OperationsAlert = {
  code: string;
  severity: 'SEV1' | 'SEV2' | 'SEV3';
  value: number;
  message: string;
};

export interface OperationsRepository {
  snapshot(now: Date): Promise<OperationsSnapshot>;
}
