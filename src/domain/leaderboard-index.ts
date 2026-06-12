import type { ChampionshipPointsMatch, ChampionshipPointsPlayer } from "./types";
import { countryCodesMatch } from "./normalize-country";
import {
  abbreviatedLastNameKeys,
  droppedSurnamePrefixes,
  firstLastKey,
  hasAbbreviatedLastName
} from "./match-player-keys";
import { normalizePlayerName } from "./normalize-player-name";

const WILDCARD_COUNTRY = "*";

export type LeaderboardIndex = {
  byNameCountry: Map<string, ChampionshipPointsPlayer[]>;
  byName: Map<string, ChampionshipPointsPlayer[]>;
  byTokenCountry: Map<string, ChampionshipPointsPlayer[]>;
  byToken: Map<string, ChampionshipPointsPlayer[]>;
  /** Entradas do ranking com sobrenome truncado ("Giuseppe M"), por nome normalizado. */
  byAbbreviatedName: Map<string, ChampionshipPointsPlayer[]>;
};

function nameCountryKey(normalizedName: string, country: string): string {
  return `${normalizedName}\0${country}`;
}

function pushToMap(
  map: Map<string, ChampionshipPointsPlayer[]>,
  key: string,
  player: ChampionshipPointsPlayer
): void {
  const bucket = map.get(key);
  if (bucket) {
    bucket.push(player);
    return;
  }
  map.set(key, [player]);
}

export function createLeaderboardIndex(leaderboard: ChampionshipPointsPlayer[]): LeaderboardIndex {
  const index: LeaderboardIndex = {
    byNameCountry: new Map(),
    byName: new Map(),
    byTokenCountry: new Map(),
    byToken: new Map(),
    byAbbreviatedName: new Map()
  };

  for (const player of leaderboard) {
    pushToMap(index.byNameCountry, nameCountryKey(player.normalizedName, player.country), player);
    pushToMap(index.byName, player.normalizedName, player);

    const tokenKey = firstLastKey(player.displayName);
    if (tokenKey.includes("|")) {
      pushToMap(index.byTokenCountry, nameCountryKey(tokenKey, player.country), player);
      pushToMap(index.byToken, tokenKey, player);
    }

    if (hasAbbreviatedLastName(player.displayName)) {
      pushToMap(index.byAbbreviatedName, player.normalizedName, player);
    }
  }

  return index;
}

/**
 * Match ambiguo: usa o maior CP entre os candidatos (decisao de produto:
 * preferimos falso positivo a esconder uma mesa relevante), mantendo o
 * status "ambiguous" para as estatisticas e o subtexto da tabela.
 */
function ambiguousResult(candidates: ChampionshipPointsPlayer[]): {
  championshipPoints: number | null;
  match: ChampionshipPointsMatch;
} {
  const highest = candidates.reduce((best, entry) =>
    entry.championshipPoints > best.championshipPoints ? entry : best
  );

  return {
    championshipPoints: highest.championshipPoints,
    match: { status: "ambiguous", candidates: candidates.map((entry) => entry.displayName) }
  };
}

/**
 * Resolve uma lista de candidatos preferindo o pais do jogador:
 * 1 candidato no pais -> match; senao 1 candidato total -> match;
 * multiplos -> ambiguo (maior CP); vazio -> null (segue o cascade).
 */
function resolveCandidates(
  candidates: ChampionshipPointsPlayer[],
  playerCountry: string
): { championshipPoints: number | null; match: ChampionshipPointsMatch } | null {
  if (candidates.length === 0) {
    return null;
  }

  const sameCountry =
    playerCountry === WILDCARD_COUNTRY
      ? []
      : candidates.filter((entry) => countryCodesMatch(entry.country, playerCountry));

  const pool = sameCountry.length > 0 ? sameCountry : candidates;

  if (pool.length === 1) {
    return {
      championshipPoints: pool[0].championshipPoints,
      match: { status: "normalized-name", leaderboardDisplayName: pool[0].displayName }
    };
  }

  return ambiguousResult(pool);
}

/** RN-17: exato nome+pais > ambiguo > nome normalizado > token primeiro|ultimo > not-found. */
export function matchPlayerWithLeaderboardIndex(
  displayName: string,
  country: string,
  index: LeaderboardIndex
): { championshipPoints: number | null; match: ChampionshipPointsMatch } {
  const normalizedName = normalizePlayerName(displayName);
  const playerCountry = country || WILDCARD_COUNTRY;

  const exactMatches = index.byNameCountry.get(nameCountryKey(normalizedName, playerCountry)) ?? [];

  if (exactMatches.length === 1) {
    return {
      championshipPoints: exactMatches[0].championshipPoints,
      match: { status: "exact", leaderboardDisplayName: exactMatches[0].displayName }
    };
  }

  if (exactMatches.length > 1) {
    return ambiguousResult(exactMatches);
  }

  const nameMatches = index.byName.get(normalizedName) ?? [];

  if (nameMatches.length === 1) {
    return {
      championshipPoints: nameMatches[0].championshipPoints,
      match: { status: "normalized-name", leaderboardDisplayName: nameMatches[0].displayName }
    };
  }

  if (nameMatches.length > 1) {
    return ambiguousResult(nameMatches);
  }

  const tokenKey = firstLastKey(displayName);
  if (tokenKey.includes("|")) {
    const tokenMatches = index.byTokenCountry.get(nameCountryKey(tokenKey, playerCountry)) ?? [];

    if (tokenMatches.length === 1) {
      return {
        championshipPoints: tokenMatches[0].championshipPoints,
        match: { status: "normalized-name", leaderboardDisplayName: tokenMatches[0].displayName }
      };
    }

    const tokenNameOnly = index.byToken.get(tokenKey) ?? [];
    if (tokenNameOnly.length === 1) {
      return {
        championshipPoints: tokenNameOnly[0].championshipPoints,
        match: { status: "normalized-name", leaderboardDisplayName: tokenNameOnly[0].displayName }
      };
    }

    if (tokenNameOnly.length > 1) {
      return ambiguousResult(tokenNameOnly);
    }
  }

  // Sobrenome truncado no ranking oficial: "Giuseppe Musicco" -> "Giuseppe M".
  // Da chave mais especifica para a menos; prefere o pais, aceita unico sem pais.
  for (const abbrevKey of abbreviatedLastNameKeys(displayName)) {
    const resolved = resolveCandidates(index.byAbbreviatedName.get(abbrevKey) ?? [], playerCountry);
    if (resolved) {
      return resolved;
    }
  }

  // Sobrenome extra omitido no ranking: "Alex Gomez Berna" -> "Álex Gomez".
  for (const prefix of droppedSurnamePrefixes(displayName)) {
    const resolved = resolveCandidates(index.byName.get(prefix) ?? [], playerCountry);
    if (resolved) {
      return resolved;
    }
  }

  return { championshipPoints: null, match: { status: "not-found" } };
}
