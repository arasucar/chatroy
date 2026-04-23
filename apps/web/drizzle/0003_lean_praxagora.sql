CREATE TYPE "public"."run_provider" AS ENUM('local', 'remote');--> statement-breakpoint
CREATE TYPE "public"."run_route" AS ENUM('chat', 'escalate');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('started', 'completed', 'blocked', 'failed');--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"route" "run_route" NOT NULL,
	"provider" "run_provider" NOT NULL,
	"status" "run_status" DEFAULT 'started' NOT NULL,
	"model" text,
	"decision_reason" text,
	"request_excerpt" text NOT NULL,
	"response_excerpt" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "runs_conversation_id_idx" ON "runs" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "runs_user_id_idx" ON "runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "runs_created_at_idx" ON "runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "runs_status_idx" ON "runs" USING btree ("status");