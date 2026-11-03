CREATE TABLE "discovery_check" (
	"user_id" text PRIMARY KEY NOT NULL,
	"login" text NOT NULL,
	"source" text NOT NULL,
	"found" jsonb,
	"error" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_pref" ADD COLUMN "weekly_discovery" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "discovery_check" ADD CONSTRAINT "discovery_check_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;