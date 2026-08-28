import { fetchWithRetry } from "./http";
import type { ExtractedPairing } from "@/domain/types";
import { formatTournamentRecord, parsePlayerLabel } from "@/domain/parsing";

const RK9_PAIRINGS_BASE = "https://rk9.gg/pairings/";

export function pairingsPageUrl(externalEventId: string): string {
  return `${RK9_PAIRINGS_BASE}${externalEventId}`;
}

export function roundPairingsUrl(externalEventId: string, pod: number, round: number): string {
  return `${RK9_PAIRINGS_BASE}${externalEventId}?pod=${pod}&rnd=${round}`;
}

export type Rk9EventMeta = {
  title: string;
  /** Numero do pod da divisao Masters (varia por evento; ex.: P2 -> 2). */
  mastersPod: number;
  /** Rodada atual da divisao Masters, conforme o label "Masters in Round N". */
  currentRound: number;
};

/** Metadados da pagina de pairings: <h4 class="mb-0">2026 ... Championship</h4>. */
const TITLE_RE = /<h4 class="mb-0">([\s\S]*?)<\/h4>/;
/** Pill de divisao: <a ... aria-controls="P2" ...>Masters in Round 1</a>. */
const DIVISION_PILL_RE = /<a[^>]*aria-controls="P(\d+)"[^>]*>([^<]*)<\/a>/g;
/** Células de partida: id="cell-<pod>-<rnd>-<table>-<side>" (side 1/2=players, 3=mesa). */
const CELL_RE = /id="cell-(\d+)-(\d+)-(\d+)-(\d)"/g;

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function cleanFragmentText(raw: string): string {
  return decodeHtmlEntities(raw.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** Extrai metadados (titulo, pod Masters, rodada atual) do HTML da pagina de pairings. */
export function parseEventMeta(html: string): Rk9EventMeta | null {
  const titleMatch = html.match(TITLE_RE);
  if (!titleMatch) {
    return null;
  }

  let mastersPod: number | null = null;
  let currentRound = 0;

  for (const match of html.matchAll(DIVISION_PILL_RE)) {
    const pod = Number.parseInt(match[1], 10);
    const label = cleanFragmentText(match[2]);
    if (!/^masters/i.test(label)) {
      continue;
    }

    mastersPod = pod;
    const roundMatch = label.match(/Round\s+(\d+)/i);
    if (roundMatch) {
      currentRound = Number.parseInt(roundMatch[1], 10);
    }
    break;
  }

  if (mastersPod === null) {
    return null;
  }

  return { title: cleanFragmentText(titleMatch[1]), mastersPod, currentRound };
}

export async function fetchRk9EventMeta(externalEventId: string): Promise<Rk9EventMeta> {
  const response = await fetchWithRetry(
    pairingsPageUrl(externalEventId),
    { cache: "no-store" },
    { label: `pairings RK9 (${externalEventId})` }
  );
  if (!response.ok) {
    throw new Error(`RK9 pairings retornou ${response.status} para o evento ${externalEventId}`);
  }

  const meta = parseEventMeta(await response.text());
  if (!meta) {
    throw new Error(
      `não foi possível extrair metadados do evento ${externalEventId} (divisão Masters ausente?)`
    );
  }
  return meta;
}

type PlayerBlock = {
  displayName: string;
  country: string;
  tournamentRecord: string | null;
  isWinner: boolean;
  isTie: boolean;
};

type MatchAccumulator = {
  playerA: PlayerBlock | null;
  playerB: PlayerBlock | null;
  tableNumber: number | null;
};

function parseRecord(block: string): string | null {
  // Eventos atuais: <span class="record" data-wins="1" data-losses="0" data-ties="0" ...>.
  const dataMatch = block.match(/data-wins="(\d+)"\s+data-losses="(\d+)"\s+data-ties="(\d+)"/);
  if (dataMatch) {
    return formatTournamentRecord({
      wins: Number.parseInt(dataMatch[1], 10),
      losses: Number.parseInt(dataMatch[2], 10),
      ties: Number.parseInt(dataMatch[3], 10)
    });
  }

  // Eventos antigos: texto inline "(0-1-0) 0 pts".
  const inlineMatch = block.match(/\((\d+)-(\d+)-(\d+)\)/);
  if (inlineMatch) {
    return formatTournamentRecord({
      wins: Number.parseInt(inlineMatch[1], 10),
      losses: Number.parseInt(inlineMatch[2], 10),
      ties: Number.parseInt(inlineMatch[3], 10)
    });
  }

  return null;
}

function parsePlayerCell(block: string): PlayerBlock | null {
  const nameMatch = block.match(/<span class="name">([\s\S]*?)<\/span>/);
  if (!nameMatch) {
    return null;
  }

  const label = parsePlayerLabel(cleanFragmentText(nameMatch[1]));
  if (!label.displayName) {
    return null;
  }

  const classAttr = block.match(/class="([^"]*)"/)?.[1] ?? "";
  return {
    ...label,
    tournamentRecord: parseRecord(block),
    isWinner: /\bwinner\b/.test(classAttr),
    isTie: /\btie\b/.test(classAttr)
  };
}

/**
 * Parseia o fragmento de pairings do RK9 (pagina base ou ?pod=N&rnd=N) e devolve as
 * partidas do pod/rodada pedidos. As celulas "cell-<pod>-<rnd>-<table>-<side>" chegam
 * em ordem player1, mesa, player2; celulas sem as duas players (header) sao ignoradas.
 */
export function parseRoundPairings(html: string, pod: number, round: number): ExtractedPairing[] {
  const pairings: ExtractedPairing[] = [];
  let current: MatchAccumulator | null = null;

  const flush = () => {
    if (!current?.playerA) {
      current = null;
      return;
    }

    const { playerA, playerB, tableNumber } = current;
    const isBye = playerB === null;
    let result: string | null = null;
    if (playerA.isTie || playerB?.isTie) {
      result = "T";
    } else if (playerA.isWinner) {
      result = "W";
    } else if (playerB?.isWinner) {
      result = "L";
    }

    pairings.push({
      tableNumber,
      playerA: {
        displayName: playerA.displayName,
        country: playerA.country,
        tournamentRecord: playerA.tournamentRecord
      },
      playerB: playerB
        ? {
            displayName: playerB.displayName,
            country: playerB.country,
            tournamentRecord: playerB.tournamentRecord
          }
        : null,
      // BYE sem marcacao explicita vale vitoria (RN-04), como no fluxo PokéData.
      result: isBye ? result ?? "W" : result,
      isPending: result === null,
      isBye
    });
    current = null;
  };

  const cells = [...html.matchAll(CELL_RE)];
  for (let index = 0; index < cells.length; index += 1) {
    const [, cellPod, cellRound, , side] = cells[index];
    if (Number.parseInt(cellPod, 10) !== pod || Number.parseInt(cellRound, 10) !== round) {
      continue;
    }

    const blockStart = cells[index].index! + cells[index][0].length;
    const blockEnd = index + 1 < cells.length ? cells[index + 1].index! : html.length;
    const block = html.slice(blockStart, blockEnd);

    if (side === "1") {
      flush();
      current = { playerA: parsePlayerCell(block), playerB: null, tableNumber: null };
    } else if (side === "3") {
      if (current) {
        current.tableNumber =
          Number.parseInt(block.match(/tablenumber[^>]*>\s*(\d+)/)?.[1] ?? "", 10) || null;
      }
    } else if (side === "2") {
      if (current) {
        current.playerB = parsePlayerCell(block);
      }
      flush();
    }
  }
  flush();

  // RN-07: ordenacao por mesa.
  return pairings.sort((a, b) => (a.tableNumber ?? 99999) - (b.tableNumber ?? 99999));
}

export type Rk9RoundFetch = {
  pairings: ExtractedPairing[];
  rawHtml: string;
  sourceUrl: string;
  fetchedAt: Date;
};

export async function fetchRk9RoundPairings(
  externalEventId: string,
  pod: number,
  round: number
): Promise<Rk9RoundFetch> {
  const sourceUrl = roundPairingsUrl(externalEventId, pod, round);
  const response = await fetchWithRetry(
    sourceUrl,
    { cache: "no-store" },
    { label: `pairings RK9 ${externalEventId} (pod ${pod}, rodada ${round})` }
  );
  if (!response.ok) {
    throw new Error(`RK9 pairings retornou ${response.status} para o evento ${externalEventId}`);
  }

  const rawHtml = await response.text();
  return { pairings: parseRoundPairings(rawHtml, pod, round), rawHtml, sourceUrl, fetchedAt: new Date() };
}
