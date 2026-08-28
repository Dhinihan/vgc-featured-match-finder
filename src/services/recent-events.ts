import { eq, gte, and, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { events } from "@/db/schema";
import type { RecentEvent } from "@/domain/types";
import { env } from "@/env";

async function readRecentEventsFromDb(now: Date): Promise<RecentEvent[]> {
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

/**
 * Lista torneios Masters recentes (RN-08). A descoberta de eventos passou a ser o
 * cadastro manual por ID RK9 (POST /api/events) — nao ha mais indice externo;
 * eventos ativados pelo refresh seguem visiveis dentro da janela de atividade.
 */
export async function listRecentEvents(): Promise<RecentEvent[]> {
  return readRecentEventsFromDb(new Date());
}
