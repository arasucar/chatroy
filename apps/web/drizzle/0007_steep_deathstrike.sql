CREATE TYPE "public"."script_param_type" AS ENUM('enum', 'string', 'number', 'boolean');--> statement-breakpoint
CREATE TABLE "scripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"command" text NOT NULL,
	"argv_template" jsonb NOT NULL,
	"params_schema" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scripts_name_unique_idx" ON "scripts" USING btree ("name");--> statement-breakpoint
CREATE INDEX "scripts_enabled_idx" ON "scripts" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "scripts_created_by_user_id_idx" ON "scripts" USING btree ("created_by_user_id");