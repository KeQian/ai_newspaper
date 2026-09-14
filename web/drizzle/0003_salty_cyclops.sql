ALTER TABLE "source_feeds" ADD COLUMN "config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "source_feeds" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "source_feeds" ADD CONSTRAINT "source_feeds_version_check" CHECK ("source_feeds"."version" > 0);