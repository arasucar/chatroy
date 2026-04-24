ALTER TABLE "runs" ADD COLUMN "tools_used" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "search_enabled" boolean DEFAULT true NOT NULL;