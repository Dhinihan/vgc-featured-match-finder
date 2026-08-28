import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { db } from "@/db/client";
import { listRecentEvents } from "./recent-events";

vi.mock("@/db/client", () => ({
  db: {
    select: vi.fn()
  }
}));

vi.mock("@/env", () => ({
  env: {
    recentEventsWindowHours: () => 36
  }
}));

type EventRow = {
  externalEventId: string;
  title: string;
  division: string;
  lastActivityAt: Date;
  sourceUrl: string | null;
};

function mockDbReads(eventRows: EventRow[]) {
  const orderBy = vi.fn().mockResolvedValue(eventRows);
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  (db.select as unknown as Mock).mockReturnValue({ from });
}

describe("listRecentEvents", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T12:00:00.000Z"));
    (db.select as unknown as Mock).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("responde com os eventos cadastrados no banco", async () => {
    mockDbReads([
      {
        externalEventId: "WCS02wAQpCIaqFmXxER4",
        title: "2026 Pokémon VGC World Championship",
        division: "masters",
        lastActivityAt: new Date("2026-06-13T10:30:00.000Z"),
        sourceUrl: "https://rk9.gg/pairings/WCS02wAQpCIaqFmXxER4"
      }
    ]);

    await expect(listRecentEvents()).resolves.toEqual([
      {
        externalEventId: "WCS02wAQpCIaqFmXxER4",
        title: "2026 Pokémon VGC World Championship",
        division: "masters",
        lastActivityAt: "2026-06-13T10:30:00.000Z",
        sourceUrl: "https://rk9.gg/pairings/WCS02wAQpCIaqFmXxER4"
      }
    ]);
  });

  it("nao faz chamadas externas (indice PokéData removido)", async () => {
    mockDbReads([]);
    await expect(listRecentEvents()).resolves.toEqual([]);
  });
});
