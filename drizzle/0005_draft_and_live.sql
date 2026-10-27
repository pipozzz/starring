ALTER TABLE "profile" ADD COLUMN "live" jsonb;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
-- profiles already public keep showing exactly what they show today
UPDATE "profile" SET "live" = "data", "published_at" = "updated_at" WHERE "published" = true;
