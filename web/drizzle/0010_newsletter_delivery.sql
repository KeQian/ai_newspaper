CREATE TABLE "newsletter_email_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"provider_message_id" text NOT NULL,
	"event_type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_subscription_requests" (
	"key_hash" text PRIMARY KEY NOT NULL,
	"email_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "newsletter_issues" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_email_events_provider_event_uidx" ON "newsletter_email_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "newsletter_email_events_message_idx" ON "newsletter_email_events" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "newsletter_subscription_requests_expires_idx" ON "newsletter_subscription_requests" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_deliveries_provider_message_uidx" ON "newsletter_deliveries" USING btree ("provider_message_id") WHERE "newsletter_deliveries"."provider_message_id" is not null;--> statement-breakpoint
ALTER TABLE "newsletter_issues" ADD CONSTRAINT "newsletter_issues_version_check" CHECK ("newsletter_issues"."version" > 0);