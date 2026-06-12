import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { events, pairings } from "@/db/schema";
import type {
  EventDashboard,
  Pairing,
  TournamentPlayer
} from "@/domain/types";
import {
  createLeaderboardIndex,
  matchPlayerWithLeaderboardIndex,
  type LeaderboardIndex
} from "@/domain/leaderboard-index";
import { normalizePlayerName } from "@/domain/normalize-player-name";
import { rankPairings } from "@/domain/scoring";
import { needsPairingsRefresh, resolveDisplayRound } from "@/domain/round-resolution";
import { latestCpSnapshot } from "./cp-import";

type StoredPlayer = {
  displayName: string;
  country: string;
  tournamentRecord: string | null;
};

function enrichPlayer(stored: StoredPlayer, index: LeaderboardIndex): TournamentPlayer {
  const { championshipPoints, match } = matchPlayerWithLeaderboardIndex(
    stored.displayName,
    stored.country,
    index
  );

  return {
    displayName: stored.displayName,
    normalizedName: normalizePlayerName(stored.displayName),
    country: stored.country,
    tournamentRecord: stored.tournamentRecord,
    championshipPoints,
    championshipPointsMatch: match
  };
}

const EMPTY_STATS = {
  totalPairings: 0,
  pendingPairings: 0,
  completedPairings: 0,
  unmatchedPlayers: 0,
  ambiguousPlayers: 0
};

/** Monta o dashboard apenas com dados locais (banco). Nenhuma chamada externa. */
export async function buildEventDashboard(externalEventId: string): Promise<EventDashboard> {
  const { meta: cpMeta, players: cpPlayers } = await latestCpSnapshot();

  const [event] = await db
    .select()
    .from(events)
    .where(and(eq(events.externalEventId, externalEventId), eq(events.division, "masters")));

  if (!event) {
    return {
      event: null,
      needsPairingsRefresh: false,
      rankedPairings: [],
      stats: EMPTY_STATS,
      championshipPoints: cpMeta
    };
  }

  const allRows = await db
    .select({ roundNumber: pairings.roundNumber })
    .from(pairings)
    .where(eq(pairings.eventId, event.id));

  const roundsWithPairings = [...new Set(allRows.map((row) => row.roundNumber))];
  const displayRound = resolveDisplayRound(event.currentRound, event.importedRound, roundsWithPairings);

  const rows =
    displayRound > 0
      ? await db
          .select()
          .from(pairings)
          .where(and(eq(pairings.eventId, event.id), eq(pairings.roundNumber, displayRound)))
      : [];

  const index = createLeaderboardIndex(cpPlayers);

  const domainPairings: Pairing[] = rows.map((row) => ({
    id: String(row.id),
    eventId: String(row.eventId),
    roundNumber: row.roundNumber,
    tableNumber: row.tableNumber,
    playerA: enrichPlayer(row.playerA as StoredPlayer, index),
    playerB: row.playerB ? enrichPlayer(row.playerB as StoredPlayer, index) : null,
    result: row.result,
    isPending: row.isPending,
    isBye: row.isBye
  }));

  const ranked = rankPairings(domainPairings);

  // RN-19: jogadores unicos com problema de match.
  const unmatched = new Set<string>();
  const ambiguous = new Set<string>();
  for (const pairing of ranked) {
    for (const player of [pairing.playerA, pairing.playerB]) {
      if (!player) {
        continue;
      }
      if (player.championshipPointsMatch.status === "not-found") {
        unmatched.add(player.normalizedName);
      }
      if (player.championshipPointsMatch.status === "ambiguous") {
        ambiguous.add(player.normalizedName);
      }
    }
  }

  return {
    event: {
      id: String(event.id),
      externalEventId: event.externalEventId,
      title: event.title,
      division: event.division,
      currentRound: event.currentRound,
      importedRound: event.importedRound,
      displayRound,
      lastRefreshAt: event.lastRefreshAt?.toISOString() ?? null,
      sourceUrl: event.sourceUrl
    },
    needsPairingsRefresh: needsPairingsRefresh(event.currentRound, displayRound, ranked.length),
    rankedPairings: ranked,
    stats: {
      totalPairings: ranked.length,
      pendingPairings: ranked.filter((pairing) => pairing.isPending).length,
      completedPairings: ranked.filter((pairing) => !pairing.isPending && pairing.result).length,
      unmatchedPlayers: unmatched.size,
      ambiguousPlayers: ambiguous.size
    },
    championshipPoints: cpMeta
  };
}
