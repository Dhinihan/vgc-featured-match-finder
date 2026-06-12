import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { eventRoundSnapshots, events, pairings, refreshRuns } from "@/db/schema";
import type { EventDashboard, ExtractedPairing } from "@/domain/types";
import {
  detectCurrentRound,
  extractPairingsFromStandings,
  parseStandingsPayload
} from "@/domain/parsing";
import { env } from "@/env";
import { fetchEventStandings } from "@/sources/pokedata";
import { buildEventDashboard } from "./dashboard";

export type RefreshResult = {
  dashboard: EventDashboard;
  roundNumber: number;
  pairingCount: number;
  pairingsFromCache: boolean;
  message: string;
};

function payloadHash(payload: string): string {
  return createHash("sha256").update(payload).digest("hex");
}

async function replaceRoundPairings(
  eventId: number,
  roundNumber: number,
  extracted: ExtractedPairing[]
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(pairings)
      .where(and(eq(pairings.eventId, eventId), eq(pairings.roundNumber, roundNumber)));

    if (extracted.length > 0) {
      await tx.insert(pairings).values(
        extracted.map((pairing) => ({
          eventId,
          roundNumber,
          tableNumber: pairing.tableNumber,
          playerA: pairing.playerA,
          playerB: pairing.playerB,
          result: pairing.result,
          isPending: pairing.isPending,
          isBye: pairing.isBye
        }))
      );
    }
  });
}

/**
 * Atualiza as partidas de um evento (RN-30), cache-first conforme DEPLOYMENT.md:
 * - snapshot fresco da rodada atual evita nova chamada externa;
 * - rodada final ja importada nao e reimportada (a menos de `force`);
 * - nunca busca CP externo aqui (RN-31).
 */
export async function refreshEventPairings(
  externalEventId: string,
  options: { force?: boolean } = {}
): Promise<RefreshResult> {
  const force = options.force ?? false;

  const [event] = await db
    .select()
    .from(events)
    .where(and(eq(events.externalEventId, externalEventId), eq(events.division, "masters")));

  if (!event) {
    throw new Error(`evento ${externalEventId} não encontrado; carregue a lista de recentes antes`);
  }

  const [run] = await db
    .insert(refreshRuns)
    .values({ eventId: event.id, status: "running" })
    .returning({ id: refreshRuns.id });

  try {
    const now = new Date();

    // Cache-first: snapshot fresco e não-final da rodada atual dispensa chamada externa.
    if (!force && event.currentRound > 0) {
      const [snapshot] = await db
        .select()
        .from(eventRoundSnapshots)
        .where(
          and(
            eq(eventRoundSnapshots.eventId, event.id),
            eq(eventRoundSnapshots.roundNumber, event.currentRound)
          )
        );

      const fresh =
        snapshot &&
        now.getTime() - snapshot.sourceFetchedAt.getTime() < env.activeRoundTtlSeconds() * 1000;

      if (fresh) {
        const dashboard = await buildEventDashboard(externalEventId);
        const pairingCount = dashboard.stats.totalPairings;
        await finishRun(run.id, event.currentRound, pairingCount, dashboard, "cache fresco; sem chamada externa");
        return {
          dashboard,
          roundNumber: event.currentRound,
          pairingCount,
          pairingsFromCache: true,
          message: `Rodada ${event.currentRound} ainda fresca (cache); ${pairingCount} partidas.`
        };
      }
    }

    const { payload, sourceUrl, fetchedAt } = await fetchEventStandings(externalEventId);
    const standings = parseStandingsPayload(payload);
    const standingsRound = detectCurrentRound(standings);
    const currentRound = Math.max(standingsRound, event.currentRound);

    // RN-16: tenta a rodada alvo; se vazia, retrocede ate achar pairings.
    let targetRound = currentRound;
    let extracted: ExtractedPairing[] = [];
    while (targetRound >= 1) {
      extracted = extractPairingsFromStandings(standings, targetRound);
      if (extracted.length > 0) {
        break;
      }
      targetRound -= 1;
    }

    if (targetRound < 1 || extracted.length === 0) {
      throw new Error(`nenhuma partida encontrada para a rodada ${currentRound}`);
    }

    const [existingSnapshot] = await db
      .select()
      .from(eventRoundSnapshots)
      .where(
        and(
          eq(eventRoundSnapshots.eventId, event.id),
          eq(eventRoundSnapshots.roundNumber, targetRound)
        )
      );

    let pairingsFromCache = false;

    if (existingSnapshot?.isFinal && !force) {
      // Rodada concluida ja importada: snapshot estavel, nao reimporta (DEPLOYMENT).
      pairingsFromCache = true;
    } else {
      const isFinal = extracted.every((pairing) => !pairing.isPending);
      const snapshotValues = {
        sourceFetchedAt: fetchedAt,
        importedAt: now,
        expiresAt: isFinal ? null : new Date(now.getTime() + env.activeRoundTtlSeconds() * 1000),
        isFinal,
        sourceHash: payloadHash(payload),
        sourceUrl,
        rawPayload: extracted
      };

      if (existingSnapshot) {
        await db
          .update(eventRoundSnapshots)
          .set(snapshotValues)
          .where(eq(eventRoundSnapshots.id, existingSnapshot.id));
      } else {
        await db.insert(eventRoundSnapshots).values({
          eventId: event.id,
          division: "masters",
          roundNumber: targetRound,
          ...snapshotValues
        });
      }

      await replaceRoundPairings(event.id, targetRound, extracted);
    }

    await db
      .update(events)
      .set({
        currentRound,
        importedRound: Math.max(event.importedRound, targetRound),
        lastRefreshAt: now,
        lastActivityAt: now
      })
      .where(eq(events.id, event.id));

    const dashboard = await buildEventDashboard(externalEventId);
    await finishRun(run.id, targetRound, extracted.length, dashboard, force ? "forced" : null);

    return {
      dashboard,
      roundNumber: targetRound,
      pairingCount: extracted.length,
      pairingsFromCache,
      message: `Rodada ${targetRound}: ${extracted.length} partidas importadas. CP no banco: ${dashboard.championshipPoints.playerCount}.`
    };
  } catch (error) {
    await db
      .update(refreshRuns)
      .set({
        status: "error",
        finishedAt: new Date(),
        message: error instanceof Error ? error.message : String(error)
      })
      .where(eq(refreshRuns.id, run.id));
    throw error;
  }
}

async function finishRun(
  runId: number,
  roundNumber: number,
  pairingCount: number,
  dashboard: EventDashboard,
  message: string | null
): Promise<void> {
  await db
    .update(refreshRuns)
    .set({
      status: "success",
      finishedAt: new Date(),
      roundNumber,
      pairingCount,
      unmatchedPlayerCount: dashboard.stats.unmatchedPlayers,
      ambiguousPlayerCount: dashboard.stats.ambiguousPlayers,
      message
    })
    .where(eq(refreshRuns.id, runId));
}
