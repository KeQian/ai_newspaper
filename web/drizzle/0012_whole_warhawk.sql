CREATE TABLE "automation_job_leases" (
	"job_key" text PRIMARY KEY NOT NULL,
	"holder_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "automation_job_leases_expires_idx" ON "automation_job_leases" USING btree ("expires_at");