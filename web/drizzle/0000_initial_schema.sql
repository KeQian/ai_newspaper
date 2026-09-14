CREATE TYPE "public"."admin_status" AS ENUM('active', 'suspended', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."candidate_status" AS ENUM('new', 'processing', 'review', 'merged', 'rejected', 'published');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('draft', 'in_review', 'scheduled', 'published', 'updated', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."content_type" AS ENUM('news', 'briefing', 'analysis');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed');--> statement-breakpoint
CREATE TYPE "public"."document_relation" AS ENUM('primary', 'corroborating', 'signal');--> statement-breakpoint
CREATE TYPE "public"."entity_status" AS ENUM('active', 'renamed', 'acquired', 'closed', 'deprecated');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('company', 'product', 'model', 'person', 'topic');--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'processing', 'processed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."raw_document_status" AS ENUM('active', 'changed', 'removed', 'parse_failed');--> statement-breakpoint
CREATE TYPE "public"."reliability" AS ENUM('s0', 's1', 's2', 's3', 's4');--> statement-breakpoint
CREATE TYPE "public"."retention_policy" AS ENUM('metadata', 'excerpt', 'full_authorized');--> statement-breakpoint
CREATE TYPE "public"."run_source_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'running', 'partial', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('api', 'rss', 'atom', 'web', 'github', 'manual');--> statement-breakpoint
CREATE TYPE "public"."subscriber_status" AS ENUM('pending', 'active', 'unsubscribed', 'bounced', 'complained');--> statement-breakpoint
CREATE TYPE "public"."terms_status" AS ENUM('approved', 'review', 'restricted');--> statement-breakpoint
CREATE TYPE "public"."verification" AS ENUM('confirmed', 'developing', 'unverified');--> statement-breakpoint
CREATE TABLE "admin_user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"status" "admin_status" DEFAULT 'active' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"object_type" text NOT NULL,
	"object_id" uuid NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"request_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_event_documents" (
	"event_id" uuid NOT NULL,
	"raw_document_id" uuid NOT NULL,
	"relation" "document_relation" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_event_documents_event_id_raw_document_id_pk" PRIMARY KEY("event_id","raw_document_id")
);
--> statement-breakpoint
CREATE TABLE "candidate_event_entities" (
	"event_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"confirmed_by_editor" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_event_entities_event_id_entity_id_pk" PRIMARY KEY("event_id","entity_id"),
	CONSTRAINT "candidate_event_entities_confidence_check" CHECK ("candidate_event_entities"."confidence" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "candidate_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"fact_summary" text NOT NULL,
	"occurred_at" timestamp with time zone,
	"status" "candidate_status" DEFAULT 'new' NOT NULL,
	"verification" "verification" DEFAULT 'unverified' NOT NULL,
	"importance" smallint NOT NULL,
	"actionability" smallint NOT NULL,
	"novelty" smallint NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"risk_flags" text[] DEFAULT '{}'::text[] NOT NULL,
	"cluster_key" text,
	"merged_into_id" uuid,
	"model_info" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_events_importance_check" CHECK ("candidate_events"."importance" between 1 and 5),
	CONSTRAINT "candidate_events_actionability_check" CHECK ("candidate_events"."actionability" between 1 and 5),
	CONSTRAINT "candidate_events_novelty_check" CHECK ("candidate_events"."novelty" between 1 and 5),
	CONSTRAINT "candidate_events_confidence_check" CHECK ("candidate_events"."confidence" between 0 and 1),
	CONSTRAINT "candidate_events_merge_target_check" CHECK ("candidate_events"."status" <> 'merged' or "candidate_events"."merged_into_id" is not null),
	CONSTRAINT "candidate_events_no_self_merge_check" CHECK ("candidate_events"."merged_into_id" is null or "candidate_events"."merged_into_id" <> "candidate_events"."id")
);
--> statement-breakpoint
CREATE TABLE "content_candidate_events" (
	"content_id" uuid NOT NULL,
	"candidate_event_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_candidate_events_content_id_candidate_event_id_pk" PRIMARY KEY("content_id","candidate_event_id")
);
--> statement-breakpoint
CREATE TABLE "content_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_type" "content_type" NOT NULL,
	"slug" text NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"verification" "verification" DEFAULT 'unverified' NOT NULL,
	"title" text NOT NULL,
	"dek" text NOT NULL,
	"summary" text NOT NULL,
	"body" jsonb NOT NULL,
	"importance" smallint NOT NULL,
	"actionability" smallint NOT NULL,
	"published_at" timestamp with time zone,
	"scheduled_at" timestamp with time zone,
	"withdrawal_reason" text,
	"current_revision" integer DEFAULT 1 NOT NULL,
	"author_id" uuid NOT NULL,
	"ai_disclosure" jsonb,
	"seo" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_items_importance_check" CHECK ("content_items"."importance" between 1 and 5),
	CONSTRAINT "content_items_actionability_check" CHECK ("content_items"."actionability" between 1 and 5),
	CONSTRAINT "content_items_revision_check" CHECK ("content_items"."current_revision" >= 1),
	CONSTRAINT "content_items_publication_time_check" CHECK ("content_items"."status" not in ('published', 'updated') or "content_items"."published_at" is not null),
	CONSTRAINT "content_items_withdrawal_reason_check" CHECK ("content_items"."status" <> 'withdrawn' or "content_items"."withdrawal_reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "content_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"change_summary" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_revisions_revision_check" CHECK ("content_revisions"."revision" >= 1)
);
--> statement-breakpoint
CREATE TABLE "content_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_id" uuid NOT NULL,
	"raw_document_id" uuid,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"publisher" text NOT NULL,
	"source_type" "source_type" NOT NULL,
	"reliability" "reliability" NOT NULL,
	"published_at" timestamp with time zone,
	"accessed_at" timestamp with time zone NOT NULL,
	"relation" "document_relation" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_topics" (
	"content_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_topics_content_id_entity_id_pk" PRIMARY KEY("content_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "correction_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_id" uuid NOT NULL,
	"description" text NOT NULL,
	"corrected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"slug" text NOT NULL,
	"canonical_name" text NOT NULL,
	"name_zh" text,
	"name_en" text,
	"description" text,
	"official_url" text,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"verified_at" timestamp with time zone,
	"merged_into_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entities_merge_target_check" CHECK ("entities"."status" <> 'deprecated' or "entities"."merged_into_id" is not null),
	CONSTRAINT "entities_no_self_merge_check" CHECK ("entities"."merged_into_id" is null or "entities"."merged_into_id" <> "entities"."id")
);
--> statement-breakpoint
CREATE TABLE "entity_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"normalized_alias" text NOT NULL,
	"language" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_run_sources" (
	"run_id" uuid NOT NULL,
	"source_feed_id" uuid NOT NULL,
	"status" "run_source_status" DEFAULT 'queued' NOT NULL,
	"cursor_before" jsonb,
	"cursor_after" jsonb,
	"fetched_count" integer DEFAULT 0 NOT NULL,
	"new_count" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingestion_run_sources_run_id_source_feed_id_pk" PRIMARY KEY("run_id","source_feed_id"),
	CONSTRAINT "ingestion_run_sources_counts_check" CHECK ("ingestion_run_sources"."fetched_count" >= 0 and "ingestion_run_sources"."new_count" >= 0),
	CONSTRAINT "ingestion_run_sources_cursor_commit_check" CHECK ("ingestion_run_sources"."cursor_after" is null or "ingestion_run_sources"."status" = 'succeeded')
);
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_key" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"fetched_count" integer DEFAULT 0 NOT NULL,
	"new_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"error_summary" text,
	"prompt_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingestion_runs_counts_check" CHECK ("ingestion_runs"."fetched_count" >= 0 and "ingestion_runs"."new_count" >= 0 and "ingestion_runs"."duplicate_count" >= 0 and "ingestion_runs"."error_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "newsletter_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"provider_message_id" text,
	"status" "delivery_status" DEFAULT 'queued' NOT NULL,
	"last_event_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_issue_contents" (
	"issue_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "newsletter_issue_contents_issue_id_content_id_pk" PRIMARY KEY("issue_id","content_id"),
	CONSTRAINT "newsletter_issue_contents_position_check" CHECK ("newsletter_issue_contents"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "newsletter_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_date" date NOT NULL,
	"subject" text NOT NULL,
	"preheader" text NOT NULL,
	"body" jsonb NOT NULL,
	"status" "issue_status" DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_normalized" text NOT NULL,
	"email_display" text NOT NULL,
	"status" "subscriber_status" DEFAULT 'pending' NOT NULL,
	"confirm_token_hash" text,
	"confirm_expires_at" timestamp with time zone,
	"unsubscribe_token_hash" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "newsletter_subscribers_pending_token_check" CHECK ("newsletter_subscribers"."status" <> 'pending' or ("newsletter_subscribers"."confirm_token_hash" is not null and "newsletter_subscribers"."confirm_expires_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_events_attempts_check" CHECK ("outbox_events"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "raw_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_feed_id" uuid NOT NULL,
	"external_id" text,
	"canonical_url" text NOT NULL,
	"title" text NOT NULL,
	"author" text,
	"published_at" timestamp with time zone,
	"fetched_at" timestamp with time zone NOT NULL,
	"language" text NOT NULL,
	"content_hash" text NOT NULL,
	"allowed_excerpt" text,
	"raw_object_key" text,
	"http_etag" text,
	"http_last_modified" text,
	"parser_version" text NOT NULL,
	"status" "raw_document_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slug_redirects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"old_path" text NOT NULL,
	"new_path" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_feeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"source_type" "source_type" NOT NULL,
	"reliability" "reliability" NOT NULL,
	"url" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"schedule" text NOT NULL,
	"parser_key" text NOT NULL,
	"terms_status" "terms_status" NOT NULL,
	"retention_policy" "retention_policy" NOT NULL,
	"cursor" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_success_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"owner" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_feeds_failure_count_check" CHECK ("source_feeds"."failure_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_user_id_admin_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_admin_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_event_documents" ADD CONSTRAINT "candidate_event_documents_event_id_candidate_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."candidate_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_event_documents" ADD CONSTRAINT "candidate_event_documents_raw_document_id_raw_documents_id_fk" FOREIGN KEY ("raw_document_id") REFERENCES "public"."raw_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_event_entities" ADD CONSTRAINT "candidate_event_entities_event_id_candidate_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."candidate_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_event_entities" ADD CONSTRAINT "candidate_event_entities_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_events" ADD CONSTRAINT "candidate_events_merged_into_id_candidate_events_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."candidate_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_candidate_events" ADD CONSTRAINT "content_candidate_events_content_id_content_items_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_candidate_events" ADD CONSTRAINT "content_candidate_events_candidate_event_id_candidate_events_id_fk" FOREIGN KEY ("candidate_event_id") REFERENCES "public"."candidate_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_author_id_admin_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_content_id_content_items_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_sources" ADD CONSTRAINT "content_sources_content_id_content_items_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_sources" ADD CONSTRAINT "content_sources_raw_document_id_raw_documents_id_fk" FOREIGN KEY ("raw_document_id") REFERENCES "public"."raw_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_topics" ADD CONSTRAINT "content_topics_content_id_content_items_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_topics" ADD CONSTRAINT "content_topics_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_notes" ADD CONSTRAINT "correction_notes_content_id_content_items_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_notes" ADD CONSTRAINT "correction_notes_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_merged_into_id_entities_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_aliases" ADD CONSTRAINT "entity_aliases_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_run_sources" ADD CONSTRAINT "ingestion_run_sources_run_id_ingestion_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ingestion_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_run_sources" ADD CONSTRAINT "ingestion_run_sources_source_feed_id_source_feeds_id_fk" FOREIGN KEY ("source_feed_id") REFERENCES "public"."source_feeds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_deliveries" ADD CONSTRAINT "newsletter_deliveries_issue_id_newsletter_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."newsletter_issues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_deliveries" ADD CONSTRAINT "newsletter_deliveries_subscriber_id_newsletter_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."newsletter_subscribers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_issue_contents" ADD CONSTRAINT "newsletter_issue_contents_issue_id_newsletter_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."newsletter_issues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_issue_contents" ADD CONSTRAINT "newsletter_issue_contents_content_id_content_items_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_documents" ADD CONSTRAINT "raw_documents_source_feed_id_source_feeds_id_fk" FOREIGN KEY ("source_feed_id") REFERENCES "public"."source_feeds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_email_uidx" ON "admin_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "audit_logs_object_created_idx" ON "audit_logs" USING btree ("object_type","object_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_created_idx" ON "audit_logs" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_request_id_idx" ON "audit_logs" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "candidate_events_status_importance_occurred_idx" ON "candidate_events" USING btree ("status","importance","occurred_at");--> statement-breakpoint
CREATE INDEX "candidate_events_cluster_key_idx" ON "candidate_events" USING btree ("cluster_key");--> statement-breakpoint
CREATE UNIQUE INDEX "content_items_slug_uidx" ON "content_items" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "content_items_status_type_published_idx" ON "content_items" USING btree ("status","content_type","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "content_revisions_content_revision_uidx" ON "content_revisions" USING btree ("content_id","revision");--> statement-breakpoint
CREATE INDEX "content_sources_content_idx" ON "content_sources" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "content_sources_raw_document_idx" ON "content_sources" USING btree ("raw_document_id");--> statement-breakpoint
CREATE INDEX "content_topics_entity_content_idx" ON "content_topics" USING btree ("entity_id","content_id");--> statement-breakpoint
CREATE INDEX "correction_notes_content_corrected_idx" ON "correction_notes" USING btree ("content_id","corrected_at");--> statement-breakpoint
CREATE UNIQUE INDEX "entities_slug_uidx" ON "entities" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "entities_type_status_idx" ON "entities" USING btree ("entity_type","status");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_aliases_entity_normalized_uidx" ON "entity_aliases" USING btree ("entity_id","normalized_alias");--> statement-breakpoint
CREATE INDEX "entity_aliases_normalized_idx" ON "entity_aliases" USING btree ("normalized_alias");--> statement-breakpoint
CREATE INDEX "ingestion_run_sources_source_status_idx" ON "ingestion_run_sources" USING btree ("source_feed_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_runs_idempotency_key_uidx" ON "ingestion_runs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "ingestion_runs_job_scheduled_idx" ON "ingestion_runs" USING btree ("job_key","scheduled_at");--> statement-breakpoint
CREATE INDEX "ingestion_runs_status_scheduled_idx" ON "ingestion_runs" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_deliveries_issue_subscriber_uidx" ON "newsletter_deliveries" USING btree ("issue_id","subscriber_id");--> statement-breakpoint
CREATE INDEX "newsletter_deliveries_status_event_idx" ON "newsletter_deliveries" USING btree ("status","last_event_at");--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_issue_contents_position_uidx" ON "newsletter_issue_contents" USING btree ("issue_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_issues_issue_date_uidx" ON "newsletter_issues" USING btree ("issue_date");--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_subscribers_email_uidx" ON "newsletter_subscribers" USING btree ("email_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_subscribers_unsubscribe_token_uidx" ON "newsletter_subscribers" USING btree ("unsubscribe_token_hash");--> statement-breakpoint
CREATE INDEX "outbox_events_status_available_idx" ON "outbox_events" USING btree ("status","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_documents_source_external_uidx" ON "raw_documents" USING btree ("source_feed_id","external_id") WHERE "raw_documents"."external_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "raw_documents_source_url_hash_uidx" ON "raw_documents" USING btree ("source_feed_id","canonical_url","content_hash") WHERE "raw_documents"."external_id" is null;--> statement-breakpoint
CREATE INDEX "raw_documents_canonical_url_idx" ON "raw_documents" USING btree ("canonical_url");--> statement-breakpoint
CREATE INDEX "raw_documents_content_hash_idx" ON "raw_documents" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "raw_documents_source_fetched_idx" ON "raw_documents" USING btree ("source_feed_id","fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_key_uidx" ON "roles" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "slug_redirects_old_path_uidx" ON "slug_redirects" USING btree ("old_path");--> statement-breakpoint
CREATE UNIQUE INDEX "source_feeds_key_uidx" ON "source_feeds" USING btree ("key");--> statement-breakpoint
CREATE INDEX "source_feeds_enabled_schedule_idx" ON "source_feeds" USING btree ("enabled","schedule");