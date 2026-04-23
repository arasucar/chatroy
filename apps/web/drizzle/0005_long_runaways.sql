CREATE TYPE "public"."remote_provider" AS ENUM('openai');--> statement-breakpoint
CREATE TABLE "user_provider_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "remote_provider" NOT NULL,
	"encrypted_api_key" text NOT NULL,
	"key_hint" text NOT NULL,
	"default_model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "provider_response_id" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "input_tokens" integer;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "output_tokens" integer;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "total_tokens" integer;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "estimated_cost_usd" double precision;--> statement-breakpoint
ALTER TABLE "user_provider_keys" ADD CONSTRAINT "user_provider_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_provider_keys_user_provider_unique_idx" ON "user_provider_keys" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "user_provider_keys_user_id_idx" ON "user_provider_keys" USING btree ("user_id");