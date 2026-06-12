export type ChampionshipPointsPlayer = {
  displayName: string;
  normalizedName: string;
  country: string;
  championshipPoints: number;
};

export type ChampionshipPointsMatch =
  | { status: "exact"; leaderboardDisplayName: string }
  | { status: "normalized-name"; leaderboardDisplayName: string }
  | { status: "ambiguous"; candidates: string[] }
  | { status: "not-found" };

export type TournamentPlayer = {
  displayName: string;
  normalizedName: string;
  country: string;
  tournamentRecord: string | null;
  championshipPoints: number | null;
  championshipPointsMatch: ChampionshipPointsMatch;
};

export type Pairing = {
  id: string;
  eventId: string;
  roundNumber: number;
  tableNumber: number | null;
  playerA: TournamentPlayer;
  playerB: TournamentPlayer | null;
  result: string | null;
  isPending: boolean;
  isBye: boolean;
};

export type RankedPairing = Pairing & {
  importanceScore: number;
  scoreStatus: "complete" | "missing-player-cp" | "bye";
};

/** Pairing extraido dos standings, antes do enriquecimento com CP. */
export type ExtractedPairing = {
  tableNumber: number | null;
  playerA: { displayName: string; country: string; tournamentRecord: string | null };
  playerB: { displayName: string; country: string; tournamentRecord: string | null } | null;
  result: string | null;
  isPending: boolean;
  isBye: boolean;
};

export type ChampionshipPointsMeta = {
  playerCount: number;
  division: string;
  importedAt: string | null;
  calculationDate: string | null;
  sourceLabel: string | null;
};

export type EventSummary = {
  id: string;
  externalEventId: string;
  title: string;
  division: string;
  currentRound: number;
  importedRound: number;
  displayRound: number;
  lastRefreshAt: string | null;
  sourceUrl: string | null;
};

export type EventDashboard = {
  event: EventSummary | null;
  needsPairingsRefresh: boolean;
  rankedPairings: RankedPairing[];
  stats: {
    totalPairings: number;
    pendingPairings: number;
    completedPairings: number;
    unmatchedPlayers: number;
    ambiguousPlayers: number;
  };
  championshipPoints: ChampionshipPointsMeta;
};

export type RecentEvent = {
  externalEventId: string;
  title: string;
  division: string;
  lastActivityAt: string;
  sourceUrl: string;
};
