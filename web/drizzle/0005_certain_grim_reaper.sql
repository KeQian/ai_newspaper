CREATE TYPE "public"."ingestion_document_disposition" AS ENUM('new', 'changed', 'duplicate');--> statement-breakpoint
CREATE TABLE "candidate_entity_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"matched_entity_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_entity_suggestions_confidence_check" CHECK ("candidate_entity_suggestions"."confidence" between 0 and 1),
	CONSTRAINT "candidate_entity_suggestions_status_check" CHECK ("candidate_entity_suggestions"."status" in ('pending', 'matched', 'rejected')),
	CONSTRAINT "candidate_entity_suggestions_match_check" CHECK ("candidate_entity_suggestions"."status" <> 'matched' or "candidate_entity_suggestions"."matched_entity_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "candidate_generation_failures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"cluster_key" text NOT NULL,
	"raw_document_ids" uuid[] NOT NULL,
	"error_code" text NOT NULL,
	"validation_issues" text[] NOT NULL,
	"attempts" smallint NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"model_info" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_generation_failures_attempts_check" CHECK ("candidate_generation_failures"."attempts" between 1 and 2),
	CONSTRAINT "candidate_generation_failures_status_check" CHECK ("candidate_generation_failures"."status" in ('open', 'resolved'))
);
--> statement-breakpoint
CREATE TABLE "candidate_merge_suggestions" (
	"candidate_id" uuid NOT NULL,
	"target_event_id" uuid NOT NULL,
	"method" text NOT NULL,
	"score" numeric(4, 3) NOT NULL,
	"reasons" text[] NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_merge_suggestions_candidate_id_target_event_id_pk" PRIMARY KEY("candidate_id","target_event_id"),
	CONSTRAINT "candidate_merge_suggestions_score_check" CHECK ("candidate_merge_suggestions"."score" between 0 and 1),
	CONSTRAINT "candidate_merge_suggestions_status_check" CHECK ("candidate_merge_suggestions"."status" in ('pending', 'accepted', 'rejected')),
	CONSTRAINT "candidate_merge_suggestions_no_self_check" CHECK ("candidate_merge_suggestions"."candidate_id" <> "candidate_merge_suggestions"."target_event_id")
);
--> statement-breakpoint
CREATE TABLE "ingestion_run_documents" (
	"run_id" uuid NOT NULL,
	"raw_document_id" uuid NOT NULL,
	"observed_content_hash" text NOT NULL,
	"disposition" "ingestion_document_disposition" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingestion_run_documents_run_id_raw_document_id_pk" PRIMARY KEY("run_id","raw_document_id")
);
--> statement-breakpoint
ALTER TABLE "candidate_event_documents" ADD COLUMN "raw_content_hash" text;--> statement-breakpoint
UPDATE "candidate_event_documents" AS "relation"
SET "raw_content_hash" = "document"."content_hash"
FROM "raw_documents" AS "document"
WHERE "relation"."raw_document_id" = "document"."id";--> statement-breakpoint
ALTER TABLE "candidate_event_documents" ALTER COLUMN "raw_content_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "candidate_events" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "candidate_entity_suggestions" ADD CONSTRAINT "candidate_entity_suggestions_event_id_candidate_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."candidate_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_entity_suggestions" ADD CONSTRAINT "candidate_entity_suggestions_matched_entity_id_entities_id_fk" FOREIGN KEY ("matched_entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_generation_failures" ADD CONSTRAINT "candidate_generation_failures_run_id_ingestion_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ingestion_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_merge_suggestions" ADD CONSTRAINT "candidate_merge_suggestions_candidate_id_candidate_events_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_merge_suggestions" ADD CONSTRAINT "candidate_merge_suggestions_target_event_id_candidate_events_id_fk" FOREIGN KEY ("target_event_id") REFERENCES "public"."candidate_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_run_documents" ADD CONSTRAINT "ingestion_run_documents_run_id_ingestion_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ingestion_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_run_documents" ADD CONSTRAINT "ingestion_run_documents_raw_document_id_raw_documents_id_fk" FOREIGN KEY ("raw_document_id") REFERENCES "public"."raw_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_entity_suggestions_event_name_uidx" ON "candidate_entity_suggestions" USING btree ("event_id","entity_type","normalized_name");--> statement-breakpoint
CREATE INDEX "candidate_entity_suggestions_status_idx" ON "candidate_entity_suggestions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_generation_failures_run_cluster_uidx" ON "candidate_generation_failures" USING btree ("run_id","cluster_key");--> statement-breakpoint
CREATE INDEX "candidate_generation_failures_status_idx" ON "candidate_generation_failures" USING btree ("status");--> statement-breakpoint
CREATE INDEX "candidate_merge_suggestions_status_idx" ON "candidate_merge_suggestions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ingestion_run_documents_document_idx" ON "ingestion_run_documents" USING btree ("raw_document_id");--> statement-breakpoint
WITH "ranked_clusters" AS (
	SELECT "id", row_number() OVER (PARTITION BY "cluster_key" ORDER BY "created_at", "id") AS "position"
	FROM "candidate_events"
	WHERE "cluster_key" IS NOT NULL
)
UPDATE "candidate_events"
SET "cluster_key" = NULL
FROM "ranked_clusters"
WHERE "candidate_events"."id" = "ranked_clusters"."id"
	AND "ranked_clusters"."position" > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_events_cluster_key_uidx" ON "candidate_events" USING btree ("cluster_key") WHERE "candidate_events"."cluster_key" is not null;--> statement-breakpoint
ALTER TABLE "candidate_events" ADD CONSTRAINT "candidate_events_version_check" CHECK ("candidate_events"."version" > 0);
