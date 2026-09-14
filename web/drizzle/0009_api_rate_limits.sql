CREATE TABLE "api_rate_limits" (
	"bucket" text NOT NULL,
	"key_hash" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_rate_limits_bucket_key_hash_window_start_pk" PRIMARY KEY("bucket","key_hash","window_start"),
	CONSTRAINT "api_rate_limits_count_check" CHECK ("api_rate_limits"."count" > 0)
);
--> statement-breakpoint
CREATE INDEX "api_rate_limits_expires_idx" ON "api_rate_limits" USING btree ("expires_at");