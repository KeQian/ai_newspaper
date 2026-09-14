import { sql } from 'drizzle-orm';
import {
  AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
};

export const sourceType = pgEnum('source_type', [
  'api',
  'rss',
  'atom',
  'web',
  'github',
  'manual',
]);
export const reliability = pgEnum('reliability', [
  's0',
  's1',
  's2',
  's3',
  's4',
]);
export const termsStatus = pgEnum('terms_status', [
  'approved',
  'review',
  'restricted',
]);
export const retentionPolicy = pgEnum('retention_policy', [
  'metadata',
  'excerpt',
  'full_authorized',
]);
export const runStatus = pgEnum('run_status', [
  'queued',
  'running',
  'partial',
  'succeeded',
  'failed',
  'cancelled',
]);
export const runSourceStatus = pgEnum('run_source_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
  'skipped',
]);
export const rawDocumentStatus = pgEnum('raw_document_status', [
  'active',
  'changed',
  'removed',
  'parse_failed',
]);
export const ingestionDocumentDisposition = pgEnum(
  'ingestion_document_disposition',
  ['new', 'changed', 'duplicate'],
);
export const candidateStatus = pgEnum('candidate_status', [
  'new',
  'processing',
  'review',
  'merged',
  'rejected',
  'published',
]);
export const verification = pgEnum('verification', [
  'confirmed',
  'developing',
  'unverified',
]);
export const documentRelation = pgEnum('document_relation', [
  'primary',
  'corroborating',
  'signal',
]);
export const entityType = pgEnum('entity_type', [
  'company',
  'product',
  'model',
  'person',
  'topic',
]);
export const entityStatus = pgEnum('entity_status', [
  'active',
  'renamed',
  'acquired',
  'closed',
  'deprecated',
]);
export const contentType = pgEnum('content_type', [
  'news',
  'briefing',
  'analysis',
]);
export const contentStatus = pgEnum('content_status', [
  'draft',
  'in_review',
  'scheduled',
  'published',
  'updated',
  'withdrawn',
]);
export const subscriberStatus = pgEnum('subscriber_status', [
  'pending',
  'active',
  'unsubscribed',
  'bounced',
  'complained',
]);
export const issueStatus = pgEnum('issue_status', [
  'draft',
  'scheduled',
  'sending',
  'sent',
  'failed',
  'cancelled',
]);
export const deliveryStatus = pgEnum('delivery_status', [
  'queued',
  'sent',
  'delivered',
  'bounced',
  'complained',
  'failed',
]);
export const adminStatus = pgEnum('admin_status', [
  'active',
  'suspended',
  'disabled',
]);
export const outboxStatus = pgEnum('outbox_status', [
  'pending',
  'processing',
  'processed',
  'failed',
]);

export const sourceFeeds = pgTable(
  'source_feeds',
  {
    id: uuid().primaryKey().defaultRandom(),
    key: text().notNull(),
    name: text().notNull(),
    sourceType: sourceType('source_type').notNull(),
    reliability: reliability().notNull(),
    url: text().notNull(),
    enabled: boolean().notNull().default(true),
    schedule: text().notNull(),
    parserKey: text('parser_key').notNull(),
    termsStatus: termsStatus('terms_status').notNull(),
    retentionPolicy: retentionPolicy('retention_policy').notNull(),
    config: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    cursor: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    failureCount: integer('failure_count').notNull().default(0),
    version: integer().notNull().default(1),
    owner: text().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('source_feeds_key_uidx').on(table.key),
    index('source_feeds_enabled_schedule_idx').on(
      table.enabled,
      table.schedule,
    ),
    check('source_feeds_failure_count_check', sql`${table.failureCount} >= 0`),
    check('source_feeds_version_check', sql`${table.version} > 0`),
  ],
);

export const ingestionRuns = pgTable(
  'ingestion_runs',
  {
    id: uuid().primaryKey().defaultRandom(),
    jobKey: text('job_key').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    status: runStatus().notNull().default('queued'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    fetchedCount: integer('fetched_count').notNull().default(0),
    newCount: integer('new_count').notNull().default(0),
    duplicateCount: integer('duplicate_count').notNull().default(0),
    errorCount: integer('error_count').notNull().default(0),
    errorSummary: text('error_summary'),
    promptVersion: text('prompt_version'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('ingestion_runs_idempotency_key_uidx').on(table.idempotencyKey),
    index('ingestion_runs_job_scheduled_idx').on(
      table.jobKey,
      table.scheduledAt,
    ),
    index('ingestion_runs_status_scheduled_idx').on(
      table.status,
      table.scheduledAt,
    ),
    check(
      'ingestion_runs_counts_check',
      sql`${table.fetchedCount} >= 0 and ${table.newCount} >= 0 and ${table.duplicateCount} >= 0 and ${table.errorCount} >= 0`,
    ),
  ],
);

export const automationJobLeases = pgTable(
  'automation_job_leases',
  {
    jobKey: text('job_key').primaryKey(),
    holderId: text('holder_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [index('automation_job_leases_expires_idx').on(table.expiresAt)],
);

export const ingestionRunSources = pgTable(
  'ingestion_run_sources',
  {
    runId: uuid('run_id')
      .notNull()
      .references(() => ingestionRuns.id, { onDelete: 'restrict' }),
    sourceFeedId: uuid('source_feed_id')
      .notNull()
      .references(() => sourceFeeds.id, { onDelete: 'restrict' }),
    status: runSourceStatus().notNull().default('queued'),
    cursorBefore: jsonb('cursor_before').$type<Record<string, unknown>>(),
    cursorAfter: jsonb('cursor_after').$type<Record<string, unknown>>(),
    archiveObjectKey: text('archive_object_key'),
    fetchedCount: integer('fetched_count').notNull().default(0),
    newCount: integer('new_count').notNull().default(0),
    errorCode: text('error_code'),
    errorDetail: text('error_detail'),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.sourceFeedId] }),
    index('ingestion_run_sources_source_status_idx').on(
      table.sourceFeedId,
      table.status,
    ),
    check(
      'ingestion_run_sources_counts_check',
      sql`${table.fetchedCount} >= 0 and ${table.newCount} >= 0`,
    ),
    check(
      'ingestion_run_sources_cursor_commit_check',
      sql`${table.cursorAfter} is null or ${table.status} = 'succeeded'`,
    ),
  ],
);

export const rawDocuments = pgTable(
  'raw_documents',
  {
    id: uuid().primaryKey().defaultRandom(),
    sourceFeedId: uuid('source_feed_id')
      .notNull()
      .references(() => sourceFeeds.id, { onDelete: 'restrict' }),
    externalId: text('external_id'),
    canonicalUrl: text('canonical_url').notNull(),
    title: text().notNull(),
    author: text(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
    language: text().notNull(),
    contentHash: text('content_hash').notNull(),
    allowedExcerpt: text('allowed_excerpt'),
    rawObjectKey: text('raw_object_key'),
    httpEtag: text('http_etag'),
    httpLastModified: text('http_last_modified'),
    parserVersion: text('parser_version').notNull(),
    status: rawDocumentStatus().notNull().default('active'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('raw_documents_source_external_uidx')
      .on(table.sourceFeedId, table.externalId)
      .where(sql`${table.externalId} is not null`),
    uniqueIndex('raw_documents_source_url_hash_uidx')
      .on(table.sourceFeedId, table.canonicalUrl, table.contentHash)
      .where(sql`${table.externalId} is null`),
    index('raw_documents_canonical_url_idx').on(table.canonicalUrl),
    index('raw_documents_content_hash_idx').on(table.contentHash),
    index('raw_documents_source_fetched_idx').on(
      table.sourceFeedId,
      table.fetchedAt,
    ),
  ],
);

export const ingestionRunDocuments = pgTable(
  'ingestion_run_documents',
  {
    runId: uuid('run_id')
      .notNull()
      .references(() => ingestionRuns.id, { onDelete: 'restrict' }),
    rawDocumentId: uuid('raw_document_id')
      .notNull()
      .references(() => rawDocuments.id, { onDelete: 'restrict' }),
    observedContentHash: text('observed_content_hash').notNull(),
    disposition: ingestionDocumentDisposition().notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.rawDocumentId] }),
    index('ingestion_run_documents_document_idx').on(table.rawDocumentId),
  ],
);

export const entities = pgTable(
  'entities',
  {
    id: uuid().primaryKey().defaultRandom(),
    entityType: entityType('entity_type').notNull(),
    slug: text().notNull(),
    canonicalName: text('canonical_name').notNull(),
    nameZh: text('name_zh'),
    nameEn: text('name_en'),
    description: text(),
    officialUrl: text('official_url'),
    status: entityStatus().notNull().default('active'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    mergedIntoId: uuid('merged_into_id').references(
      (): AnyPgColumn => entities.id,
      {
        onDelete: 'restrict',
      },
    ),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('entities_slug_uidx').on(table.slug),
    index('entities_type_status_idx').on(table.entityType, table.status),
    check(
      'entities_merge_target_check',
      sql`${table.status} <> 'deprecated' or ${table.mergedIntoId} is not null`,
    ),
    check(
      'entities_no_self_merge_check',
      sql`${table.mergedIntoId} is null or ${table.mergedIntoId} <> ${table.id}`,
    ),
  ],
);

export const entityAliases = pgTable(
  'entity_aliases',
  {
    id: uuid().primaryKey().defaultRandom(),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    alias: text().notNull(),
    normalizedAlias: text('normalized_alias').notNull(),
    language: text().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('entity_aliases_entity_normalized_uidx').on(
      table.entityId,
      table.normalizedAlias,
    ),
    index('entity_aliases_normalized_idx').on(table.normalizedAlias),
  ],
);

export const candidateEvents = pgTable(
  'candidate_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    title: text().notNull(),
    factSummary: text('fact_summary').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }),
    status: candidateStatus().notNull().default('new'),
    verification: verification().notNull().default('unverified'),
    importance: smallint().notNull(),
    actionability: smallint().notNull(),
    novelty: smallint().notNull(),
    confidence: numeric({ precision: 4, scale: 3 }).notNull(),
    riskFlags: text('risk_flags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    clusterKey: text('cluster_key'),
    mergedIntoId: uuid('merged_into_id').references(
      (): AnyPgColumn => candidateEvents.id,
      {
        onDelete: 'restrict',
      },
    ),
    deferredUntil: timestamp('deferred_until', { withTimezone: true }),
    modelInfo: jsonb('model_info').$type<Record<string, unknown>>(),
    version: integer().notNull().default(1),
    ...timestamps,
  },
  (table) => [
    index('candidate_events_status_importance_occurred_idx').on(
      table.status,
      table.importance,
      table.occurredAt,
    ),
    index('candidate_events_review_queue_idx').on(
      table.status,
      table.deferredUntil,
      table.createdAt,
    ),
    index('candidate_events_cluster_key_idx').on(table.clusterKey),
    uniqueIndex('candidate_events_cluster_key_uidx')
      .on(table.clusterKey)
      .where(sql`${table.clusterKey} is not null`),
    check(
      'candidate_events_importance_check',
      sql`${table.importance} between 1 and 5`,
    ),
    check(
      'candidate_events_actionability_check',
      sql`${table.actionability} between 1 and 5`,
    ),
    check(
      'candidate_events_novelty_check',
      sql`${table.novelty} between 1 and 5`,
    ),
    check(
      'candidate_events_confidence_check',
      sql`${table.confidence} between 0 and 1`,
    ),
    check('candidate_events_version_check', sql`${table.version} > 0`),
    check(
      'candidate_events_merge_target_check',
      sql`${table.status} <> 'merged' or ${table.mergedIntoId} is not null`,
    ),
    check(
      'candidate_events_no_self_merge_check',
      sql`${table.mergedIntoId} is null or ${table.mergedIntoId} <> ${table.id}`,
    ),
  ],
);

export const candidateEventDocuments = pgTable(
  'candidate_event_documents',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => candidateEvents.id, { onDelete: 'cascade' }),
    rawDocumentId: uuid('raw_document_id')
      .notNull()
      .references(() => rawDocuments.id, { onDelete: 'restrict' }),
    rawContentHash: text('raw_content_hash').notNull(),
    relation: documentRelation().notNull(),
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.eventId, table.rawDocumentId] })],
);

export const candidateEventEntities = pgTable(
  'candidate_event_entities',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => candidateEvents.id, { onDelete: 'cascade' }),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'restrict' }),
    confidence: numeric({ precision: 4, scale: 3 }).notNull(),
    confirmedByEditor: boolean('confirmed_by_editor').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.entityId] }),
    check(
      'candidate_event_entities_confidence_check',
      sql`${table.confidence} between 0 and 1`,
    ),
  ],
);

export const candidateEntitySuggestions = pgTable(
  'candidate_entity_suggestions',
  {
    id: uuid().primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => candidateEvents.id, { onDelete: 'cascade' }),
    entityType: entityType('entity_type').notNull(),
    name: text().notNull(),
    normalizedName: text('normalized_name').notNull(),
    confidence: numeric({ precision: 4, scale: 3 }).notNull(),
    matchedEntityId: uuid('matched_entity_id').references(() => entities.id, {
      onDelete: 'restrict',
    }),
    status: text().notNull().default('pending'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('candidate_entity_suggestions_event_name_uidx').on(
      table.eventId,
      table.entityType,
      table.normalizedName,
    ),
    index('candidate_entity_suggestions_status_idx').on(table.status),
    check(
      'candidate_entity_suggestions_confidence_check',
      sql`${table.confidence} between 0 and 1`,
    ),
    check(
      'candidate_entity_suggestions_status_check',
      sql`${table.status} in ('pending', 'matched', 'rejected')`,
    ),
    check(
      'candidate_entity_suggestions_match_check',
      sql`${table.status} <> 'matched' or ${table.matchedEntityId} is not null`,
    ),
  ],
);

export const candidateMergeSuggestions = pgTable(
  'candidate_merge_suggestions',
  {
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidateEvents.id, { onDelete: 'cascade' }),
    targetEventId: uuid('target_event_id')
      .notNull()
      .references(() => candidateEvents.id, { onDelete: 'cascade' }),
    method: text().notNull(),
    score: numeric({ precision: 4, scale: 3 }).notNull(),
    reasons: text().array().notNull(),
    status: text().notNull().default('pending'),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.candidateId, table.targetEventId] }),
    index('candidate_merge_suggestions_status_idx').on(table.status),
    check(
      'candidate_merge_suggestions_score_check',
      sql`${table.score} between 0 and 1`,
    ),
    check(
      'candidate_merge_suggestions_status_check',
      sql`${table.status} in ('pending', 'accepted', 'rejected')`,
    ),
    check(
      'candidate_merge_suggestions_no_self_check',
      sql`${table.candidateId} <> ${table.targetEventId}`,
    ),
  ],
);

export const candidateGenerationFailures = pgTable(
  'candidate_generation_failures',
  {
    id: uuid().primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => ingestionRuns.id, { onDelete: 'restrict' }),
    clusterKey: text('cluster_key').notNull(),
    rawDocumentIds: uuid('raw_document_ids').array().notNull(),
    errorCode: text('error_code').notNull(),
    validationIssues: text('validation_issues').array().notNull(),
    attempts: smallint().notNull(),
    status: text().notNull().default('open'),
    modelInfo: jsonb('model_info').$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('candidate_generation_failures_run_cluster_uidx').on(
      table.runId,
      table.clusterKey,
    ),
    index('candidate_generation_failures_status_idx').on(table.status),
    check(
      'candidate_generation_failures_attempts_check',
      sql`${table.attempts} between 1 and 2`,
    ),
    check(
      'candidate_generation_failures_status_check',
      sql`${table.status} in ('open', 'resolved')`,
    ),
  ],
);

export const adminUsers = pgTable(
  'admin_users',
  {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull(),
    displayName: text('display_name').notNull(),
    status: adminStatus().notNull().default('active'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex('admin_users_email_uidx').on(table.email)],
);

export const roles = pgTable(
  'roles',
  {
    id: uuid().primaryKey().defaultRandom(),
    key: text().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('roles_key_uidx').on(table.key),
    check(
      'roles_key_check',
      sql`${table.key} in ('editor', 'chief_editor', 'admin')`,
    ),
  ],
);

export const adminIdentities = pgTable(
  'admin_identities',
  {
    id: uuid().primaryKey().defaultRandom(),
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'restrict' }),
    issuer: text().notNull(),
    subject: text().notNull(),
    emailAtLink: text('email_at_link').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('admin_identities_issuer_subject_uidx').on(
      table.issuer,
      table.subject,
    ),
    uniqueIndex('admin_identities_admin_issuer_uidx').on(
      table.adminUserId,
      table.issuer,
    ),
  ],
);

export const adminSessions = pgTable(
  'admin_sessions',
  {
    id: uuid().primaryKey().defaultRandom(),
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'restrict' }),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => adminIdentities.id, { onDelete: 'restrict' }),
    tokenHash: text('token_hash').notNull(),
    authenticatedAt: timestamp('authenticated_at', {
      withTimezone: true,
    }).notNull(),
    mfaVerifiedAt: timestamp('mfa_verified_at', {
      withTimezone: true,
    }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('admin_sessions_token_hash_uidx').on(table.tokenHash),
    index('admin_sessions_user_expires_idx').on(
      table.adminUserId,
      table.expiresAt,
    ),
    index('admin_sessions_active_idx')
      .on(table.expiresAt)
      .where(sql`${table.revokedAt} is null`),
    check(
      'admin_sessions_expiry_check',
      sql`${table.expiresAt} > ${table.authenticatedAt}`,
    ),
    check(
      'admin_sessions_mfa_time_check',
      sql`${table.mfaVerifiedAt} >= ${table.authenticatedAt} and ${table.mfaVerifiedAt} <= ${table.expiresAt}`,
    ),
  ],
);

export const adminUserRoles = pgTable(
  'admin_user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.userId, table.roleId] })],
);

export const contentItems = pgTable(
  'content_items',
  {
    id: uuid().primaryKey().defaultRandom(),
    contentType: contentType('content_type').notNull(),
    slug: text().notNull(),
    status: contentStatus().notNull().default('draft'),
    verification: verification().notNull().default('unverified'),
    title: text().notNull(),
    dek: text().notNull(),
    summary: text().notNull(),
    body: jsonb().$type<Record<string, unknown>>().notNull(),
    importance: smallint().notNull(),
    actionability: smallint().notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    withdrawalReason: text('withdrawal_reason'),
    currentRevision: integer('current_revision').notNull().default(1),
    authorId: uuid('author_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'restrict' }),
    aiDisclosure: jsonb('ai_disclosure').$type<Record<string, unknown>>(),
    seo: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('content_items_slug_uidx').on(table.slug),
    index('content_items_status_type_published_idx').on(
      table.status,
      table.contentType,
      table.publishedAt,
    ),
    check(
      'content_items_importance_check',
      sql`${table.importance} between 1 and 5`,
    ),
    check(
      'content_items_actionability_check',
      sql`${table.actionability} between 1 and 5`,
    ),
    check('content_items_revision_check', sql`${table.currentRevision} >= 1`),
    check(
      'content_items_publication_time_check',
      sql`${table.status} not in ('published', 'updated') or ${table.publishedAt} is not null`,
    ),
    check(
      'content_items_withdrawal_reason_check',
      sql`${table.status} <> 'withdrawn' or ${table.withdrawalReason} is not null`,
    ),
  ],
);

export const contentRevisions = pgTable(
  'content_revisions',
  {
    id: uuid().primaryKey().defaultRandom(),
    contentId: uuid('content_id')
      .notNull()
      .references(() => contentItems.id, { onDelete: 'restrict' }),
    revision: integer().notNull(),
    snapshot: jsonb().$type<Record<string, unknown>>().notNull(),
    changeSummary: text('change_summary').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('content_revisions_content_revision_uidx').on(
      table.contentId,
      table.revision,
    ),
    check('content_revisions_revision_check', sql`${table.revision} >= 1`),
  ],
);

export const contentCandidateEvents = pgTable(
  'content_candidate_events',
  {
    contentId: uuid('content_id')
      .notNull()
      .references(() => contentItems.id, { onDelete: 'restrict' }),
    candidateEventId: uuid('candidate_event_id')
      .notNull()
      .references(() => candidateEvents.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.contentId, table.candidateEventId] }),
  ],
);

export const contentSources = pgTable(
  'content_sources',
  {
    id: uuid().primaryKey().defaultRandom(),
    contentId: uuid('content_id')
      .notNull()
      .references(() => contentItems.id, { onDelete: 'restrict' }),
    rawDocumentId: uuid('raw_document_id').references(() => rawDocuments.id, {
      onDelete: 'restrict',
    }),
    url: text().notNull(),
    title: text().notNull(),
    publisher: text().notNull(),
    sourceType: sourceType('source_type').notNull(),
    reliability: reliability().notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    accessedAt: timestamp('accessed_at', { withTimezone: true }).notNull(),
    relation: documentRelation().notNull(),
    ...timestamps,
  },
  (table) => [
    index('content_sources_content_idx').on(table.contentId),
    index('content_sources_raw_document_idx').on(table.rawDocumentId),
  ],
);

export const contentTopics = pgTable(
  'content_topics',
  {
    contentId: uuid('content_id')
      .notNull()
      .references(() => contentItems.id, { onDelete: 'restrict' }),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.contentId, table.entityId] }),
    index('content_topics_entity_content_idx').on(
      table.entityId,
      table.contentId,
    ),
  ],
);

export const searchDocuments = pgTable(
  'search_documents',
  {
    contentId: uuid('content_id')
      .primaryKey()
      .references(() => contentItems.id, { onDelete: 'cascade' }),
    contentType: contentType('content_type').notNull(),
    title: text().notNull(),
    summary: text().notNull(),
    bodyText: text('body_text').notNull(),
    entityText: text('entity_text').notNull().default(''),
    searchText: text('search_text').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    index('search_documents_type_published_idx').on(
      table.contentType,
      table.publishedAt,
    ),
    // Keep the expression here as well as in the migration so schema drift
    // checks retain the PostgreSQL full-text index used by English queries.
    index('search_documents_fts_idx').using(
      'gin',
      sql`to_tsvector('simple', ${table.searchText})`,
    ),
  ],
);

export const apiRateLimits = pgTable(
  'api_rate_limits',
  {
    bucket: text().notNull(),
    keyHash: text('key_hash').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer().notNull().default(1),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.bucket, table.keyHash, table.windowStart] }),
    index('api_rate_limits_expires_idx').on(table.expiresAt),
    check('api_rate_limits_count_check', sql`${table.count} > 0`),
  ],
);

export const correctionNotes = pgTable(
  'correction_notes',
  {
    id: uuid().primaryKey().defaultRandom(),
    contentId: uuid('content_id')
      .notNull()
      .references(() => contentItems.id, { onDelete: 'restrict' }),
    description: text().notNull(),
    correctedAt: timestamp('corrected_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (table) => [
    index('correction_notes_content_corrected_idx').on(
      table.contentId,
      table.correctedAt,
    ),
  ],
);

export const slugRedirects = pgTable(
  'slug_redirects',
  {
    id: uuid().primaryKey().defaultRandom(),
    oldPath: text('old_path').notNull(),
    newPath: text('new_path').notNull(),
    reason: text().notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('slug_redirects_old_path_uidx').on(table.oldPath)],
);

export const newsletterSubscribers = pgTable(
  'newsletter_subscribers',
  {
    id: uuid().primaryKey().defaultRandom(),
    emailNormalized: text('email_normalized').notNull(),
    emailDisplay: text('email_display').notNull(),
    status: subscriberStatus().notNull().default('pending'),
    confirmTokenHash: text('confirm_token_hash'),
    confirmExpiresAt: timestamp('confirm_expires_at', { withTimezone: true }),
    unsubscribeTokenHash: text('unsubscribe_token_hash').notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('newsletter_subscribers_email_uidx').on(table.emailNormalized),
    uniqueIndex('newsletter_subscribers_unsubscribe_token_uidx').on(
      table.unsubscribeTokenHash,
    ),
    check(
      'newsletter_subscribers_pending_token_check',
      sql`${table.status} <> 'pending' or (${table.confirmTokenHash} is not null and ${table.confirmExpiresAt} is not null)`,
    ),
  ],
);

export const newsletterSubscriptionRequests = pgTable(
  'newsletter_subscription_requests',
  {
    keyHash: text('key_hash').primaryKey(),
    emailHash: text('email_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    index('newsletter_subscription_requests_expires_idx').on(table.expiresAt),
  ],
);

export const newsletterIssues = pgTable(
  'newsletter_issues',
  {
    id: uuid().primaryKey().defaultRandom(),
    issueDate: date('issue_date').notNull(),
    subject: text().notNull(),
    preheader: text().notNull(),
    body: jsonb().$type<Record<string, unknown>>().notNull(),
    status: issueStatus().notNull().default('draft'),
    version: integer().notNull().default(1),
    sendIdempotencyKeyHash: text('send_idempotency_key_hash'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('newsletter_issues_issue_date_uidx').on(table.issueDate),
    uniqueIndex('newsletter_issues_send_idempotency_uidx')
      .on(table.sendIdempotencyKeyHash)
      .where(sql`${table.sendIdempotencyKeyHash} is not null`),
    check('newsletter_issues_version_check', sql`${table.version} > 0`),
  ],
);

export const newsletterIssueContents = pgTable(
  'newsletter_issue_contents',
  {
    issueId: uuid('issue_id')
      .notNull()
      .references(() => newsletterIssues.id, { onDelete: 'restrict' }),
    contentId: uuid('content_id')
      .notNull()
      .references(() => contentItems.id, { onDelete: 'restrict' }),
    position: integer().notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.issueId, table.contentId] }),
    uniqueIndex('newsletter_issue_contents_position_uidx').on(
      table.issueId,
      table.position,
    ),
    check(
      'newsletter_issue_contents_position_check',
      sql`${table.position} >= 0`,
    ),
  ],
);

export const newsletterDeliveries = pgTable(
  'newsletter_deliveries',
  {
    id: uuid().primaryKey().defaultRandom(),
    issueId: uuid('issue_id')
      .notNull()
      .references(() => newsletterIssues.id, { onDelete: 'restrict' }),
    subscriberId: uuid('subscriber_id')
      .notNull()
      .references(() => newsletterSubscribers.id, { onDelete: 'restrict' }),
    providerMessageId: text('provider_message_id'),
    status: deliveryStatus().notNull().default('queued'),
    lastEventAt: timestamp('last_event_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    errorCode: text('error_code'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('newsletter_deliveries_issue_subscriber_uidx').on(
      table.issueId,
      table.subscriberId,
    ),
    uniqueIndex('newsletter_deliveries_provider_message_uidx')
      .on(table.providerMessageId)
      .where(sql`${table.providerMessageId} is not null`),
    index('newsletter_deliveries_status_event_idx').on(
      table.status,
      table.lastEventAt,
    ),
  ],
);

export const newsletterEmailEvents = pgTable(
  'newsletter_email_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    provider: text().notNull(),
    providerEventId: text('provider_event_id').notNull(),
    providerMessageId: text('provider_message_id').notNull(),
    eventType: text('event_type').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('newsletter_email_events_provider_event_uidx').on(
      table.provider,
      table.providerEventId,
    ),
    index('newsletter_email_events_message_idx').on(table.providerMessageId),
  ],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid().primaryKey().defaultRandom(),
    actorId: uuid('actor_id').references(() => adminUsers.id, {
      onDelete: 'restrict',
    }),
    action: text().notNull(),
    objectType: text('object_type').notNull(),
    objectId: uuid('object_id').notNull(),
    before: jsonb().$type<Record<string, unknown>>(),
    after: jsonb().$type<Record<string, unknown>>(),
    requestId: text('request_id').notNull(),
    ...timestamps,
  },
  (table) => [
    index('audit_logs_object_created_idx').on(
      table.objectType,
      table.objectId,
      table.createdAt,
    ),
    index('audit_logs_actor_created_idx').on(table.actorId, table.createdAt),
    index('audit_logs_request_id_idx').on(table.requestId),
  ],
);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    eventType: text('event_type').notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    status: outboxStatus().notNull().default('pending'),
    attempts: integer().notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('outbox_events_status_available_idx').on(
      table.status,
      table.availableAt,
    ),
    check('outbox_events_attempts_check', sql`${table.attempts} >= 0`),
  ],
);

export type SourceFeed = typeof sourceFeeds.$inferSelect;
export type NewSourceFeed = typeof sourceFeeds.$inferInsert;
export type RawDocument = typeof rawDocuments.$inferSelect;
export type CandidateEvent = typeof candidateEvents.$inferSelect;
export type ContentItem = typeof contentItems.$inferSelect;
