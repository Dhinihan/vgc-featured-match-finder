import { describe, expect, it } from "vitest";
import { normalizePlayerName } from "./normalize-player-name";
import { countryCodesMatch, normalizeCountryCode } from "./normalize-country";
import {
  detectCurrentRound,
  extractPairingsFromStandings,
  formatTournamentRecord,
  isPendingResult,
  parsePlayerLabel,
  resolveCurrentRound
} from "./parsing";
import { createLeaderboardIndex, matchPlayerWithLeaderboardIndex } from "./leaderboard-index";
import { rankPairings, scorePairing } from "./scoring";
import { needsPairingsRefresh, resolveDisplayRound } from "./round-resolution";
import type { ChampionshipPointsPlayer, Pairing, TournamentPlayer } from "./types";

function cpPlayer(displayName: string, country: string, cp: number): ChampionshipPointsPlayer {
  return {
    displayName,
    normalizedName: normalizePlayerName(displayName),
    country,
    championshipPoints: cp
  };
}

function tournamentPlayer(displayName: string, cp: number | null): TournamentPlayer {
  return {
    displayName,
    normalizedName: normalizePlayerName(displayName),
    country: "US",
    tournamentRecord: null,
    championshipPoints: cp,
    championshipPointsMatch: cp === null ? { status: "not-found" } : { status: "exact", leaderboardDisplayName: displayName }
  };
}

function pairing(partial: Partial<Pairing> & { playerA: TournamentPlayer }): Pairing {
  return {
    id: "1",
    eventId: "1",
    roundNumber: 1,
    tableNumber: null,
    playerB: null,
    result: null,
    isPending: true,
    isBye: false,
    ...partial
  };
}

describe("RN-01 normalizePlayerName", () => {
  it("remove acentos, caixa e nao-alfanumericos", () => {
    expect(normalizePlayerName("João da Silva")).toBe("joaodasilva");
    expect(normalizePlayerName("  José-María O'Neill 3rd ")).toBe("josemariaoneill3rd");
  });
});

describe("RN-18 normalizeCountryCode", () => {
  it("canonicaliza US/UK/UAE", () => {
    expect(normalizeCountryCode("us")).toBe("USA");
    expect(normalizeCountryCode("USA")).toBe("USA");
    expect(normalizeCountryCode("UK")).toBe("GB");
    expect(normalizeCountryCode("GBR")).toBe("GB");
    expect(normalizeCountryCode("UAE")).toBe("AE");
  });

  it("vazio vira wildcard e casa com qualquer pais", () => {
    expect(countryCodesMatch("", "US")).toBe(true);
    expect(countryCodesMatch("US", "USA")).toBe(true);
    expect(countryCodesMatch("BR", "US")).toBe(false);
  });
});

describe("RN-02 parsePlayerLabel", () => {
  it("extrai nome e pais do formato 'Nome [CC]'", () => {
    expect(parsePlayerLabel("Patrick Minchey [US]")).toEqual({
      displayName: "Patrick Minchey",
      country: "US"
    });
    expect(parsePlayerLabel("Nicholas K [AUS]")).toEqual({
      displayName: "Nicholas K",
      country: "AUS"
    });
  });

  it("sem colchetes, country vazio", () => {
    expect(parsePlayerLabel("Fulano")).toEqual({ displayName: "Fulano", country: "" });
  });
});

describe("RN-03 isPendingResult", () => {
  it("null, vazio, '-', '?', 'PENDING' sao pendentes", () => {
    for (const value of [null, undefined, "", "-", "?", "pending", "PENDING"]) {
      expect(isPendingResult(value)).toBe(true);
    }
    expect(isPendingResult("W")).toBe(false);
    expect(isPendingResult("T")).toBe(false);
  });
});

describe("RN-05 formatTournamentRecord", () => {
  it("formata W-L e W-L-T", () => {
    expect(formatTournamentRecord({ wins: 3, losses: 1, ties: 0 })).toBe("3-1");
    expect(formatTournamentRecord({ wins: 3, losses: 1, ties: 2 })).toBe("3-1-2");
    expect(formatTournamentRecord({ wins: 0, losses: 0, ties: 0 })).toBeNull();
  });
});

describe("RN-17 match jogador -> CP", () => {
  const leaderboard = [
    cpPlayer("Patrick Minchey", "US", 800),
    cpPlayer("John Smith", "US", 500),
    cpPlayer("John Smith", "CA", 400),
    cpPlayer("Maria Jose Souza", "BR", 300)
  ];
  const index = createLeaderboardIndex(leaderboard);

  it("match exato nome+pais", () => {
    const result = matchPlayerWithLeaderboardIndex("Patrick Minchey", "US", index);
    expect(result.championshipPoints).toBe(800);
    expect(result.match.status).toBe("exact");
  });

  it("nome duplicado com pais distinto continua exato", () => {
    const result = matchPlayerWithLeaderboardIndex("John Smith", "CA", index);
    expect(result.championshipPoints).toBe(400);
    expect(result.match.status).toBe("exact");
  });

  it("nome duplicado sem pais resolve como ambiguo com o maior CP", () => {
    const result = matchPlayerWithLeaderboardIndex("John Smith", "", index);
    // decisao de produto: ambiguo assume o maior CP (preferimos falso positivo)
    expect(result.championshipPoints).toBe(500);
    expect(result.match.status).toBe("ambiguous");
  });

  it("match por nome normalizado quando pais diverge", () => {
    const result = matchPlayerWithLeaderboardIndex("Patrick Minchey", "BR", index);
    expect(result.championshipPoints).toBe(800);
    expect(result.match.status).toBe("normalized-name");
  });

  it("match por token primeiro|ultimo nome", () => {
    const result = matchPlayerWithLeaderboardIndex("Maria Souza", "BR", index);
    expect(result.championshipPoints).toBe(300);
    expect(result.match.status).toBe("normalized-name");
  });

  it("not-found quando nada casa", () => {
    const result = matchPlayerWithLeaderboardIndex("Inexistente Total", "US", index);
    expect(result.championshipPoints).toBeNull();
    expect(result.match.status).toBe("not-found");
  });
});

describe("fallbacks para nomes truncados da API oficial", () => {
  const leaderboard = [
    cpPlayer("Giuseppe M", "GB", 1531),
    cpPlayer("Giuseppe Alario", "IT", 813),
    cpPlayer("Francesco Pio P", "IT", 1428),
    cpPlayer("Álex Gomez", "ES", 1205),
    cpPlayer("Alex García", "ES", 25),
    cpPlayer("Nicholas K", "AU", 2120),
    cpPlayer("John S", "US", 700),
    cpPlayer("John Santos", "US", 650)
  ];
  const index = createLeaderboardIndex(leaderboard);

  it("sobrenome truncado, mesmo pais", () => {
    const result = matchPlayerWithLeaderboardIndex("Francesco Pio Pero", "IT", index);
    expect(result.championshipPoints).toBe(1428);
    expect(result.match.status).toBe("normalized-name");
  });

  it("sobrenome truncado, pais divergente, candidato unico", () => {
    const result = matchPlayerWithLeaderboardIndex("Giuseppe Musicco", "IT", index);
    expect(result.championshipPoints).toBe(1531);
    expect(result.match.status).toBe("normalized-name");
  });

  it("primeiro nome + inicial ('Nicholas K')", () => {
    const result = matchPlayerWithLeaderboardIndex("Nicholas Kan", "AU", index);
    expect(result.championshipPoints).toBe(2120);
    expect(result.match.status).toBe("normalized-name");
  });

  it("segundo sobrenome omitido no ranking", () => {
    const result = matchPlayerWithLeaderboardIndex("Alex Gomez Berna", "ES", index);
    expect(result.championshipPoints).toBe(1205);
    expect(result.match.status).toBe("normalized-name");
  });

  it("nao casa abreviado quando o jogador completo ja existe com o mesmo token", () => {
    // "John Santos" casa exato; "John Smith" cairia em "John S" via abreviacao.
    const exact = matchPlayerWithLeaderboardIndex("John Santos", "US", index);
    expect(exact.match.status).toBe("exact");

    const abbreviated = matchPlayerWithLeaderboardIndex("John Smith", "US", index);
    expect(abbreviated.championshipPoints).toBe(700);
    expect(abbreviated.match.status).toBe("normalized-name");
  });
});

describe("RN-20/21/22 scoring", () => {
  it("cpA x cpB com CP nulo = 1", () => {
    const scored = scorePairing(
      pairing({ playerA: tournamentPlayer("A", 800), playerB: tournamentPlayer("B", null) })
    );
    expect(scored.importanceScore).toBe(800);
    expect(scored.scoreStatus).toBe("missing-player-cp");

    const complete = scorePairing(
      pairing({ playerA: tournamentPlayer("A", 800), playerB: tournamentPlayer("B", 600) })
    );
    expect(complete.importanceScore).toBe(480000);
    expect(complete.scoreStatus).toBe("complete");
  });

  it("BYE recebe score 0", () => {
    const bye = scorePairing(pairing({ playerA: tournamentPlayer("A", 800), isBye: true }));
    expect(bye.importanceScore).toBe(0);
    expect(bye.scoreStatus).toBe("bye");
  });

  it("RN-23: ordena decrescente por score, empate por mesa", () => {
    const ranked = rankPairings([
      pairing({
        id: "low",
        tableNumber: 1,
        playerA: tournamentPlayer("A", 1200),
        playerB: tournamentPlayer("B", 100)
      }),
      pairing({
        id: "high",
        tableNumber: 9,
        playerA: tournamentPlayer("C", 800),
        playerB: tournamentPlayer("D", 600)
      }),
      pairing({
        id: "tie-late-table",
        tableNumber: 5,
        playerA: tournamentPlayer("E", 1200),
        playerB: tournamentPlayer("F", 100)
      })
    ]);

    // produto, nao soma: 800x600 > 1200x100
    expect(ranked.map((entry) => entry.id)).toEqual(["high", "low", "tie-late-table"]);
  });
});

describe("RN-14 resolveDisplayRound", () => {
  it("segue a tabela de fallback do PRD", () => {
    expect(resolveDisplayRound(0, 3, [1, 2, 3])).toBe(3);
    expect(resolveDisplayRound(0, 0, [])).toBe(0);
    expect(resolveDisplayRound(5, 0, [])).toBe(5);
    expect(resolveDisplayRound(5, 4, [3, 4, 5])).toBe(5);
    expect(resolveDisplayRound(6, 4, [3, 4])).toBe(4);
    // sem rodada <= live, usa a maior rodada disponivel (passo 5)
    expect(resolveDisplayRound(2, 4, [3, 4])).toBe(4);
  });
});

describe("RN-15 needsPairingsRefresh", () => {
  it("true com zero pairings ou displayRound atrasado", () => {
    expect(needsPairingsRefresh(0, 0, 0)).toBe(false);
    expect(needsPairingsRefresh(3, 0, 0)).toBe(true);
    expect(needsPairingsRefresh(3, 2, 10)).toBe(true);
    expect(needsPairingsRefresh(3, 3, 10)).toBe(false);
  });
});

describe("RN-12 resolveCurrentRound", () => {
  it("prefere a rodada mais avancada", () => {
    expect(resolveCurrentRound(null, 4)).toBe(4);
    expect(resolveCurrentRound(5, 0)).toBe(5);
    expect(resolveCurrentRound(3, 4)).toBe(4);
  });
});

describe("parsing de standings (formato PokéData)", () => {
  const standings = [
    {
      name: "Patrick Minchey [US]",
      placing: 1,
      record: { wins: 3, losses: 0, ties: 0 },
      rounds: {
        "1": { name: "Dylan Matthews [US]", result: "W", table: " 138 " },
        "2": { name: "Zachary Lauth [US]", result: null, table: " 61 " }
      }
    },
    {
      name: "Dylan Matthews [US]",
      placing: 2,
      record: { wins: 2, losses: 1, ties: 0 },
      rounds: {
        "1": { name: "Patrick Minchey [US]", result: "L", table: " 138 " },
        "2": { name: "BYE", result: "W", table: " 0 " }
      }
    }
  ];

  it("RN-11: detecta rodada atual (maior pendente)", () => {
    expect(detectCurrentRound(standings)).toBe(2);
  });

  it("RN-04/06: extrai, deduplica e detecta BYE", () => {
    const round1 = extractPairingsFromStandings(standings, 1);
    expect(round1).toHaveLength(1);
    expect(round1[0].tableNumber).toBe(138);
    expect(round1[0].isPending).toBe(false);
    expect(round1[0].playerA.tournamentRecord).toBe("2-1");
    expect(round1[0].playerB?.tournamentRecord).toBe("3-0");

    const round2 = extractPairingsFromStandings(standings, 2);
    const bye = round2.find((entry) => entry.isBye);
    expect(bye?.playerB).toBeNull();
    const live = round2.find((entry) => !entry.isBye);
    expect(live?.isPending).toBe(true);
    expect(live?.tableNumber).toBe(61);
  });
});
