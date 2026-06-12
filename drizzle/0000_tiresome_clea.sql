CREATE TABLE "app_meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "championship_points_players" (
	"id" serial PRIMARY KEY NOT NULL,
	"snapshot_id" integer NOT NULL,
	"display_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"country" text NOT NULL,
	"championship_points" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "championship_points_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"division" text DEFAULT 'masters' NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"player_count" integer NOT NULL,
	"source_label" text NOT NULL,
	"calculation_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "event_round_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"division" text DEFAULT 'masters' NOT NULL,
	"round_number" integer NOT NULL,
	"source_fetched_at" timestamp with time zone NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"is_final" boolean DEFAULT false NOT NULL,
	"source_hash" text,
	"source_url" text,
	"raw_payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_event_id" text NOT NULL,
	"title" text NOT NULL,
	"division" text DEFAULT 'masters' NOT NULL,
	"current_round" integer DEFAULT 0 NOT NULL,
	"imported_round" integer DEFAULT 0 NOT NULL,
	"last_refresh_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone NOT NULL,
	"source_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pairings" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"round_number" integer NOT NULL,
	"table_number" integer,
	"player_a" jsonb NOT NULL,
	"player_b" jsonb,
	"result" text,
	"is_pending" boolean NOT NULL,
	"is_bye" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"round_number" integer,
	"pairing_count" integer,
	"unmatched_player_count" integer,
	"ambiguous_player_count" integer,
	"message" text
);
--> statement-breakpoint
ALTER TABLE "championship_points_players" ADD CONSTRAINT "championship_points_players_snapshot_id_championship_points_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."championship_points_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_round_snapshots" ADD CONSTRAINT "event_round_snapshots_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairings" ADD CONSTRAINT "pairings_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_runs" ADD CONSTRAINT "refresh_runs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_round_snapshots_key_idx" ON "event_round_snapshots" USING btree ("event_id","division","round_number");--> statement-breakpoint
CREATE UNIQUE INDEX "events_external_id_division_idx" ON "events" USING btree ("external_event_id","division");