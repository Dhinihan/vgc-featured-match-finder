import type { Pairing, RankedPairing } from "./types";

/** RN-20: CP ausente conta como 1 na relevancia (cpA x cpB), nao 0. */
function cpForScoring(cp: number | null): number {
  return cp ?? 1;
}

export function scorePairing(pairing: Pairing): RankedPairing {
  if (!pairing.playerB || pairing.isBye) {
    return { ...pairing, importanceScore: 0, scoreStatus: "bye" };
  }

  const cpA = pairing.playerA.championshipPoints;
  const cpB = pairing.playerB.championshipPoints;

  return {
    ...pairing,
    importanceScore: cpForScoring(cpA) * cpForScoring(cpB),
    scoreStatus: cpA === null || cpB === null ? "missing-player-cp" : "complete"
  };
}

/** RN-23: decrescente por score; empate por mesa ascendente. */
export function rankPairings(pairings: Pairing[]): RankedPairing[] {
  return pairings.map(scorePairing).sort((a, b) => {
    if (b.importanceScore !== a.importanceScore) {
      return b.importanceScore - a.importanceScore;
    }
    return (
      (a.tableNumber ?? Number.MAX_SAFE_INTEGER) - (b.tableNumber ?? Number.MAX_SAFE_INTEGER)
    );
  });
}
