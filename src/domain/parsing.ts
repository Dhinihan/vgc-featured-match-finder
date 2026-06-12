import type { ExtractedPairing } from "./types";
import { normalizePlayerName } from "./normalize-player-name";

export type ParsedPlayerLabel = {
  displayName: string;
  country: string;
};

/** RN-02: formato preferido "Nome [CC]"; sem colchetes, country = "". */
export function parsePlayerLabel(raw: string): ParsedPlayerLabel {
  const trimmed = raw.trim();
  const bracketMatch = trimmed.match(/^(.+?)\s*\[([A-Za-z]{2,3})\]\s*$/);

  if (bracketMatch) {
    return {
      displayName: bracketMatch[1].trim(),
      country: bracketMatch[2].toUpperCase()
    };
  }

  return { displayName: trimmed, country: "" };
}

/** RN-03: pendente se null/undefined/vazio/"-"/"?"/"PENDING" (case-insensitive). */
export function isPendingResult(result: string | null | undefined): boolean {
  if (result === null || result === undefined || !result) {
    return true;
  }

  const normalized = result.trim().toUpperCase();
  return normalized === "" || normalized === "-" || normalized === "?" || normalized === "PENDING";
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return null;
}

/** RN-05: { wins, losses, ties } -> "W-L" ou "W-L-T"; null se 0-0-0. */
export function formatTournamentRecord(record: unknown): string | null {
  if (!record || typeof record !== "object") {
    return null;
  }

  const row = record as { wins?: unknown; losses?: unknown; ties?: unknown };
  const wins = parsePositiveInt(row.wins) ?? 0;
  const losses = parsePositiveInt(row.losses) ?? 0;
  const ties = parsePositiveInt(row.ties) ?? 0;

  if (wins === 0 && losses === 0 && ties === 0) {
    return null;
  }

  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

function formatMatchResult(result: unknown): string | null {
  if (typeof result !== "string") {
    return null;
  }

  const normalized = result.trim().toUpperCase();
  return isPendingResult(normalized) ? null : normalized;
}

type StandingsRow = Record<string, unknown>;

type RoundData = {
  name?: unknown;
  result?: unknown;
  table?: unknown;
};

export function parseStandingsPayload(payload: string): StandingsRow[] {
  const trimmed = payload.trim();
  if (!trimmed.startsWith("[")) {
    throw new Error("standings payload must be a JSON array");
  }
  return JSON.parse(trimmed) as StandingsRow[];
}

/** RN-11: maior rodada com resultado pendente; senao, maior rodada presente. */
export function detectCurrentRound(standings: StandingsRow[]): number {
  let maxRound = 0;
  let highestPendingRound = 0;

  for (const player of standings) {
    const rounds = player.rounds;
    if (!rounds || typeof rounds !== "object") {
      continue;
    }

    for (const [key, roundData] of Object.entries(rounds as Record<string, RoundData>)) {
      const roundNumber = Number.parseInt(key, 10);
      if (Number.isNaN(roundNumber)) {
        continue;
      }

      if (roundNumber > maxRound) {
        maxRound = roundNumber;
      }

      const result = roundData?.result;
      if (
        isPendingResult(typeof result === "string" ? result : result == null ? null : String(result)) &&
        roundNumber > highestPendingRound
      ) {
        highestPendingRound = roundNumber;
      }
    }
  }

  return highestPendingRound > 0 ? highestPendingRound : maxRound;
}

/** RN-12/RN-13: prefere a rodada mais avancada quando as fontes divergem. */
export function resolveCurrentRound(htmlRound: number | null, standingsRound: number): number {
  if (htmlRound === null) {
    return standingsRound;
  }

  if (standingsRound <= 0) {
    return htmlRound;
  }

  return Math.max(htmlRound, standingsRound);
}

function tournamentRecordKey(displayName: string, country: string): string {
  return `${normalizePlayerName(displayName)}:${(country || "*").toUpperCase()}`;
}

function buildTournamentRecordIndex(standings: StandingsRow[]): Map<string, string> {
  const index = new Map<string, string>();

  for (const playerRow of standings) {
    const label = parsePlayerLabel(String(playerRow.name ?? ""));
    const formatted = formatTournamentRecord(playerRow.record);

    if (formatted) {
      index.set(tournamentRecordKey(label.displayName, label.country), formatted);
    }
  }

  return index;
}

function lookupTournamentRecord(index: Map<string, string>, label: ParsedPlayerLabel): string | null {
  return index.get(tournamentRecordKey(label.displayName, label.country)) ?? null;
}

/**
 * Extrai os pairings de uma rodada dos standings.
 * RN-04 (BYE), RN-06 (dedupe por mesa + nomes ordenados), RN-07 (ordenacao por mesa).
 */
export function extractPairingsFromStandings(
  standings: StandingsRow[],
  roundNumber: number
): ExtractedPairing[] {
  const roundKey = String(roundNumber);
  const seen = new Set<string>();
  const pairings: ExtractedPairing[] = [];
  const recordIndex = buildTournamentRecordIndex(standings);

  for (const playerRow of standings) {
    const playerLabel = parsePlayerLabel(String(playerRow.name ?? ""));
    const rounds = playerRow.rounds as Record<string, RoundData> | undefined;
    const round = rounds?.[roundKey];

    if (!round) {
      continue;
    }

    const opponentRaw = String(round.name ?? "").trim();
    const isBye = opponentRaw.toUpperCase() === "BYE" || opponentRaw === "";
    // PokéData manda "table" como string com espacos (ex.: " 138 ").
    const tableNumber = parsePositiveInt(round.table) || null;
    const result = typeof round.result === "string" ? round.result : null;
    const playerSide = normalizePlayerName(playerLabel.displayName);

    if (isBye) {
      const byeKey = `bye:${playerSide}:${roundKey}`;
      if (seen.has(byeKey)) {
        continue;
      }
      seen.add(byeKey);

      pairings.push({
        tableNumber,
        playerA: {
          ...playerLabel,
          tournamentRecord:
            lookupTournamentRecord(recordIndex, playerLabel) ??
            formatTournamentRecord(playerRow.record)
        },
        playerB: null,
        result: result ?? "W",
        isPending: isPendingResult(result),
        isBye: true
      });
      continue;
    }

    const opponentLabel = parsePlayerLabel(opponentRaw);
    const opponentSide = normalizePlayerName(opponentLabel.displayName);
    const names = [playerSide, opponentSide].sort();
    const dedupeKey = `${tableNumber ?? 0}:${names[0]}:${names[1]}`;

    if (seen.has(dedupeKey) || playerSide > opponentSide) {
      continue;
    }

    seen.add(dedupeKey);

    pairings.push({
      tableNumber,
      playerA: {
        ...playerLabel,
        tournamentRecord: lookupTournamentRecord(recordIndex, playerLabel)
      },
      playerB: {
        ...opponentLabel,
        tournamentRecord: lookupTournamentRecord(recordIndex, opponentLabel)
      },
      result: formatMatchResult(result),
      isPending: isPendingResult(result),
      isBye: false
    });
  }

  return pairings.sort((a, b) => (a.tableNumber ?? 99999) - (b.tableNumber ?? 99999));
}
