CREATE TABLE "search_documents" (
	"content_id" uuid PRIMARY KEY NOT NULL,
	"content_type" "content_type" NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"body_text" text NOT NULL,
	"entity_text" text DEFAULT '' NOT NULL,
	"search_text" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "search_documents" ADD CONSTRAINT "search_documents_content_id_content_items_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "search_documents_type_published_idx" ON "search_documents" USING btree ("content_type","published_at");--> statement-breakpoint
CREATE INDEX "search_documents_fts_idx" ON "search_documents" USING gin (to_tsvector('simple', "search_text"));
--> statement-breakpoint
INSERT INTO "search_documents" (
	"content_id", "content_type", "title", "summary", "body_text", "entity_text", "search_text", "published_at", "created_at", "updated_at"
)
SELECT
	c."id",
	c."content_type",
	c."title",
	c."summary",
	c."body"::text,
	COALESCE(names."entity_text", ''),
	concat_ws(' ', c."title", c."summary", c."body"::text, names."entity_text"),
	c."published_at",
	now(),
	now()
FROM "content_items" c
LEFT JOIN LATERAL (
	SELECT string_agg(DISTINCT label, ' ') AS "entity_text"
	FROM (
		SELECT concat_ws(' ', e."canonical_name", e."name_zh", e."name_en") AS label
		FROM "content_topics" ct
		INNER JOIN "entities" e ON e."id" = ct."entity_id"
		WHERE ct."content_id" = c."id"
		UNION ALL
		SELECT ea."alias" AS label
		FROM "content_topics" ct
		INNER JOIN "entity_aliases" ea ON ea."entity_id" = ct."entity_id"
		WHERE ct."content_id" = c."id"
	) labels
) names ON true
WHERE c."status" IN ('published', 'updated') AND c."published_at" IS NOT NULL;
