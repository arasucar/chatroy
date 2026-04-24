CREATE TYPE "public"."script_run_status" AS ENUM('started', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "script_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"script_id" uuid NOT NULL,
	"invoked_by_user_id" uuid,
	"status" "script_run_status" DEFAULT 'started' NOT NULL,
	"resolved_command" text NOT NULL,
	"resolved_argv" jsonb NOT NULL,
	"params" jsonb NOT NULL,
	"stdout" text,
	"stderr" text,
	"exit_code" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "script_runs" ADD CONSTRAINT "script_runs_script_id_scripts_id_fk" FOREIGN KEY ("script_id") REFERENCES "public"."scripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_runs" ADD CONSTRAINT "script_runs_invoked_by_user_id_users_id_fk" FOREIGN KEY ("invoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "script_runs_script_id_idx" ON "script_runs" USING btree ("script_id");--> statement-breakpoint
CREATE INDEX "script_runs_invoked_by_user_id_idx" ON "script_runs" USING btree ("invoked_by_user_id");--> statement-breakpoint
CREATE INDEX "script_runs_created_at_idx" ON "script_runs" USING btree ("created_at");