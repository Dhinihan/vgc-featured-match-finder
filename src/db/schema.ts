import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex
} from "drizzle-orm/pg-core";

export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    externalEventId: text("external_event_id").notNull(),
    title: text("title").notNull(),
    division: text("division").notNull().default("masters"),
    currentRound: integer("current_round").notNull().default(0),
    importedRound: integer("imported_round").notNull().default(0),
    lastRefreshAt: timestamp("last_refresh_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull(),
    sourceUrl: text("source_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [uniqueIndex("events_external_id_division_idx").on(table.externalEventId, table.division)]
);

export const eventRoundSnapshots = pgTable(
  "event_round_snapshots",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id),
    division: text("division").notNull().default("masters"),
    roundNumber: integer("round_number").notNull(),
    sourceFetchedAt: timestamp("source_fetched_at", { withTimezone: true }).notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    isFinal: boolean("is_final").notNull().default(false),
    sourceHash: text("source_hash"),
    sourceUrl: text("source_url"),
    /** Pairings normalizados extraidos dos standings da rodada. */
    rawPayload: jsonb("raw_payload").notNull()
  },
  (table) => [
    uniqueIndex("event_round_snapshots_key_idx").on(table.eventId, table.division, table.roundNumber)
  ]
);

export const pairings = pgTable(
  "pairings",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id),
    roundNumber: integer("round_number").notNull(),
    tableNumber: integer("table_number"),
    /** { displayName, country, tournamentRecord } — CP e match sao derivados na leitura. */
    playerA: jsonb("player_a").notNull(),
    playerB: jsonb("player_b"),
    result: text("result"),
    isPending: boolean("is_pending").notNull(),
    isBye: boolean("is_bye").notNull()
  }
);

export const championshipPointsSnapshots = pgTable("championship_points_snapshots", {
  id: serial("id").primaryKey(),
  division: text("division").notNull().default("masters"),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  playerCount: integer("player_count").notNull(),
  sourceLabel: text("source_label").notNull(),
  /** calculation_date informado pela API oficial. */
  calculationDate: timestamp("calculation_date", { withTimezone: true })
});

export const championshipPointsPlayers = pgTable("championship_points_players", {
  id: serial("id").primaryKey(),
  snapshotId: integer("snapshot_id")
    .notNull()
    .references(() => championshipPointsSnapshots.id),
  displayName: text("display_name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  country: text("country").notNull(),
  championshipPoints: integer("championship_points").notNull()
});

export const refreshRuns = pgTable("refresh_runs", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").references(() => events.id),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull().default("running"),
  roundNumber: integer("round_number"),
  pairingCount: integer("pairing_count"),
  unmatchedPlayerCount: integer("unmatched_player_count"),
  ambiguousPlayerCount: integer("ambiguous_player_count"),
  message: text("message")
});

/** Cache key/value simples para TTLs de fluxo (ex.: lista de eventos recentes). */
export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
