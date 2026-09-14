CREATE TABLE "admin_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"email_at_link" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"identity_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"authenticated_at" timestamp with time zone NOT NULL,
	"mfa_verified_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_sessions_expiry_check" CHECK ("admin_sessions"."expires_at" > "admin_sessions"."authenticated_at"),
	CONSTRAINT "admin_sessions_mfa_time_check" CHECK ("admin_sessions"."mfa_verified_at" >= "admin_sessions"."authenticated_at" and "admin_sessions"."mfa_verified_at" <= "admin_sessions"."expires_at")
);
--> statement-breakpoint
ALTER TABLE "admin_identities" ADD CONSTRAINT "admin_identities_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_identity_id_admin_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."admin_identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_identities_issuer_subject_uidx" ON "admin_identities" USING btree ("issuer","subject");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_identities_admin_issuer_uidx" ON "admin_identities" USING btree ("admin_user_id","issuer");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_sessions_token_hash_uidx" ON "admin_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "admin_sessions_user_expires_idx" ON "admin_sessions" USING btree ("admin_user_id","expires_at");--> statement-breakpoint
CREATE INDEX "admin_sessions_active_idx" ON "admin_sessions" USING btree ("expires_at") WHERE "admin_sessions"."revoked_at" is null;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_key_check" CHECK ("roles"."key" in ('editor', 'chief_editor', 'admin'));