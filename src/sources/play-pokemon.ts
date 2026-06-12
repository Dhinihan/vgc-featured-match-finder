import "./http";
import type { ChampionshipPointsPlayer } from "@/domain/types";
import { normalizePlayerName } from "@/domain/normalize-player-name";

const BASE_URL = "https://api.play.pokemon.com/services/spar/leaderboards/";

/** Periodo do ranking VG Masters global 2026 (ver PRD 4.1). */
const VG_MASTERS_GLOBAL_2026 = {
  product: "vg",
  region: "global",
  region_type: "global",
  division: "masters",
  period: "a0a3bb4a4c7a75628526ebbc7eb61d26",
  point_type: "championship",
  sort_by: "ranking_order:asc"
};

const PAGE_SIZE = 300;
const MAX_PAGES = 100;

type LeaderboardRow = {
  display_name?: string;
  player_country_code?: string;
  player_country?: string;
  primary_point_total?: number;
  calculation_date?: string;
};

type LeaderboardResponse = {
  results?: LeaderboardRow[];
  count?: number;
  next?: string | null;
};

export type ChampionshipPointsImport = {
  players: ChampionshipPointsPlayer[];
  calculationDate: string | null;
  sourceLabel: string;
};

export async function fetchChampionshipPoints(): Promise<ChampionshipPointsImport> {
  const players: ChampionshipPointsPlayer[] = [];
  let calculationDate: string | null = null;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = new URL(BASE_URL);
    for (const [key, value] of Object.entries(VG_MASTERS_GLOBAL_2026)) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set("page_size", String(PAGE_SIZE));
    url.searchParams.set("page", String(page));

    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Play! Pokémon API returned ${response.status} on page ${page}`);
    }

    const data = (await response.json()) as LeaderboardResponse;
    const rows = data.results ?? [];

    for (const row of rows) {
      const displayName = (row.display_name ?? "").trim();
      const points = row.primary_point_total;

      if (!displayName || typeof points !== "number") {
        continue;
      }

      if (!calculationDate && row.calculation_date) {
        calculationDate = row.calculation_date;
      }

      players.push({
        displayName,
        normalizedName: normalizePlayerName(displayName),
        country: (row.player_country_code ?? row.player_country ?? "").trim().toUpperCase(),
        championshipPoints: Math.max(0, Math.floor(points))
      });
    }

    if (!data.next || rows.length === 0) {
      break;
    }
  }

  return {
    players,
    calculationDate,
    sourceLabel: "play-pokemon-api:vg-masters-global-2026"
  };
}
