import "./http";
import type { RecentEvent } from "@/domain/types";

const INDEX_URL = "https://www.pokedata.ovh/standingsVGC/";

export function eventStandingsUrl(externalEventId: string): string {
  return `${INDEX_URL}${externalEventId}/masters/${externalEventId}_Masters.json`;
}

export function eventPageUrl(externalEventId: string): string {
  return `${INDEX_URL}${externalEventId}/`;
}

const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11
};

export type IndexedEvent = {
  externalEventId: string;
  title: string;
  startsAt: Date | null;
  endsAt: Date | null;
  sourceUrl: string;
};

/**
 * Parseia "June 12-14, 2026", "March 30-April 1, 2026" ou "June 7, 2026" (UTC).
 * Retorna null quando o formato nao e reconhecido.
 */
export function parseEventDateRange(raw: string): { start: Date; end: Date } | null {
  const match = raw.match(/([A-Za-z]+)\s+(\d{1,2})(?:\s*-\s*(?:([A-Za-z]+)\s+)?(\d{1,2}))?,\s*(\d{4})/);
  if (!match) {
    return null;
  }

  const startMonth = MONTHS[match[1].toLowerCase()];
  if (startMonth === undefined) {
    return null;
  }

  const year = Number.parseInt(match[5], 10);
  const startDay = Number.parseInt(match[2], 10);
  const endMonth = match[3] ? MONTHS[match[3].toLowerCase()] : startMonth;
  const endDay = match[4] ? Number.parseInt(match[4], 10) : startDay;

  if (endMonth === undefined) {
    return null;
  }

  return {
    start: new Date(Date.UTC(year, startMonth, startDay, 0, 0, 0)),
    // Fim do ultimo dia do evento.
    end: new Date(Date.UTC(year, endMonth, endDay, 23, 59, 59))
  };
}

/** Extrai eventos dos botoes do indice: onclick="location.href='0000190/'" + titulo com data. */
export function parseEventIndexHtml(html: string): IndexedEvent[] {
  const events: IndexedEvent[] = [];
  const buttonPattern =
    /onclick="location\.href='(\d+)\/?'"[^>]*>([\s\S]*?)<\/button>/g;

  for (const match of html.matchAll(buttonPattern)) {
    const externalEventId = match[1];
    const text = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!text) {
      continue;
    }

    const range = parseEventDateRange(text);
    const title = text.replace(/\s*-\s*[A-Za-z]+\s+\d{1,2}.*$/, "").trim() || text;

    events.push({
      externalEventId,
      title,
      startsAt: range?.start ?? null,
      endsAt: range?.end ?? null,
      sourceUrl: eventPageUrl(externalEventId)
    });
  }

  return events;
}

export async function fetchEventIndex(): Promise<IndexedEvent[]> {
  const response = await fetch(INDEX_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`PokéData index returned ${response.status}`);
  }
  return parseEventIndexHtml(await response.text());
}

/**
 * RN-08: janela de atividade. Considera o evento recente se "agora" estiver entre
 * o inicio do evento e o fim do ultimo dia + windowHours. Eventos sem data ficam fora.
 */
export function filterRecentEvents(
  indexed: IndexedEvent[],
  windowHours: number,
  now: Date = new Date()
): RecentEvent[] {
  const recent: RecentEvent[] = [];

  for (const event of indexed) {
    if (!event.startsAt || !event.endsAt) {
      continue;
    }

    const windowEnd = new Date(event.endsAt.getTime() + windowHours * 3_600_000);
    if (now < event.startsAt || now > windowEnd) {
      continue;
    }

    // Atividade estimada: agora, limitado ao fim do evento.
    const lastActivityAt = now < event.endsAt ? now : event.endsAt;

    recent.push({
      externalEventId: event.externalEventId,
      title: event.title,
      division: "masters",
      lastActivityAt: lastActivityAt.toISOString(),
      sourceUrl: event.sourceUrl
    });
  }

  return recent;
}

export async function fetchEventStandings(
  externalEventId: string
): Promise<{ payload: string; sourceUrl: string; fetchedAt: Date }> {
  const sourceUrl = eventStandingsUrl(externalEventId);
  const response = await fetch(sourceUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`PokéData standings returned ${response.status} for event ${externalEventId}`);
  }

  return { payload: await response.text(), sourceUrl, fetchedAt: new Date() };
}
