export type AuditFilters = {
  action?: string;
  objectType?: string;
  actorId?: string;
  requestId?: string;
  from?: Date;
  to?: Date;
  limit: number;
  before?: { createdAt: Date; id: string };
};

export type AuditRecord = {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  objectType: string;
  objectId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  requestId: string;
  createdAt: Date;
};

export interface AuditRepository {
  list(input: AuditFilters): Promise<AuditRecord[]>;
}
