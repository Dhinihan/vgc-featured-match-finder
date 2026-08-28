import { db } from "@/db/client";
import { events } from "@/db/schema";
import { fetchRk9EventMeta, pairingsPageUrl } from "@/sources/rk9";

export type RegisteredEvent = {
  externalEventId: string;
  title: string;
  currentRound: number;
  sourceUrl: string;
};

const RK9_EVENT_ID_RE = /^[A-Za-z0-9_-]{5,64}$/;

export function isValidRk9EventId(externalEventId: string): boolean {
  return RK9_EVENT_ID_RE.test(externalEventId);
}

/**
 * Cadastra (ou atualiza) um evento a partir do ID RK9 de pairings
 * (ex.: WCS02wAQpCIaqFmXxER4 em rk9.gg/pairings/WCS02wAQpCIaqFmXxER4).
 * Substitui o indice PokéData como forma de descoberta de eventos.
 */
export async function registerEvent(externalEventId: string): Promise<RegisteredEvent> {
  const id = externalEventId.trim();
  if (!isValidRk9EventId(id)) {
    throw new Error(`ID de evento RK9 inválido: "${externalEventId}"`);
  }

  const meta = await fetchRk9EventMeta(id);
  const now = new Date();

  await db
    .insert(events)
    .values({
      externalEventId: id,
      title: meta.title,
      division: "masters",
      currentRound: meta.currentRound,
      importedRound: 0,
      lastActivityAt: now,
      sourceUrl: pairingsPageUrl(id)
    })
    .onConflictDoUpdate({
      target: [events.externalEventId, events.division],
      set: {
        title: meta.title,
        currentRound: meta.currentRound,
        lastActivityAt: now,
        sourceUrl: pairingsPageUrl(id)
      }
    });

  return {
    externalEventId: id,
    title: meta.title,
    currentRound: meta.currentRound,
    sourceUrl: pairingsPageUrl(id)
  };
}
