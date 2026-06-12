import { eq, gte, and, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { appMeta, events } from "@/db/schema";
import type { RecentEvent } from "@/domain/types";
import { env } from "@/env";
import { fetchEventIndex, filterRecentEvents } from "@/sources/pokedata";

const META_KEY = "recent_events_fetched_at";

async function indexCacheIsFresh(now: Date): Promise<boolean> {
  const [row] = await db.select().from(appMeta).where(eq(appMeta.key, META_KEY));
  if (!row) {
    return false;
  }

  const fetchedAt = new Date(String(row.value));
  return now.getTime() - fetchedAt.getTime() < env.recentEventsTtlSeconds() * 1000;
}

async function refreshIndexCache(now: Date): Promise<void> {
  const indexed = await fetchEventIndex();
  const recent = filterRecentEvents(indexed, env.recentEventsWindowHours(), now);

  for (const event of recent) {
    await db
      .insert(events)
      .values({
        externalEventId: event.externalEventId,
        title: event.title,
        division: event.division,
        lastActivityAt: new Date(event.lastActivityAt),
        sourceUrl: event.sourceUrl
      })
      .onConflictDoUpdate({
        target: [events.externalEventId, events.division],
        set: {
          title: event.title,
          lastActivityAt: new Date(event.lastActivityAt),
          sourceUrl: event.sourceUrl
        }
      });
  }

  await db
    .insert(appMeta)
    .values({ key: META_KEY, value: now.toISOString(), updatedAt: now })
    .onConflictDoUpdate({ target: appMeta.key, set: { value: now.toISOString(), updatedAt: now } });
}

/**
 * Lista torneios Masters recentes (RN-08), cache-first: revalida o indice PokéData
 * no maximo a cada RECENT_EVENTS_TTL_SECONDS e responde sempre a partir do banco.
 */
export async function listRecentEvents(): Promise<RecentEvent[]> {
  const now = new Date();

  if (!(await indexCacheIsFresh(now))) {
    await refreshIndexCache(now);
  }

  const windowStart = new Date(now.getTime() - env.recentEventsWindowHours() * 3_600_000);

  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.division, "masters"), gte(events.lastActivityAt, windowStart)))
    .orderBy(desc(events.lastActivityAt));

  return rows.map((row) => ({
    externalEventId: row.externalEventId,
    title: row.title,
    division: row.division,
    lastActivityAt: row.lastActivityAt.toISOString(),
    sourceUrl: row.sourceUrl ?? ""
  }));
}
