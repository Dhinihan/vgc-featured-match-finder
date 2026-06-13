import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { db } from "@/db/client";
import { fetchEventIndex } from "@/sources/pokedata";
import { listRecentEvents } from "./recent-events";

vi.mock("@/db/client", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn()
  }
}));

vi.mock("@/env", () => ({
  env: {
    recentEventsTtlSeconds: () => 600,
    recentEventsWindowHours: () => 36
  }
}));

vi.mock("@/sources/pokedata", () => ({
  fetchEventIndex: vi.fn(),
  filterRecentEvents: vi.fn(() => [])
}));

type CachedEventRow = {
  externalEventId: string;
  title: string;
  division: string;
  lastActivityAt: Date;
  sourceUrl: string | null;
};

function mockDbReads(metaRows: Array<{ value: string }>, eventRows: CachedEventRow[]) {
  const orderBy = vi.fn().mockResolvedValue(eventRows);
  const where = vi.fn().mockResolvedValueOnce(metaRows).mockReturnValueOnce({ orderBy });
  const from = vi.fn().mockReturnValue({ where });

  (db.select as unknown as Mock).mockReturnValue({ from });
}

describe("listRecentEvents", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T12:00:00.000Z"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    (db.select as unknown as Mock).mockReset();
    (db.insert as unknown as Mock).mockReset();
    (fetchEventIndex as unknown as Mock).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("responde com eventos do banco quando a revalidacao do PokéData falha", async () => {
    (fetchEventIndex as unknown as Mock).mockRejectedValue(new Error("ETIMEDOUT"));
    mockDbReads(
      [{ value: "2026-06-13T11:00:00.000Z" }],
      [
        {
          externalEventId: "0000190",
          title: "2026 North America Pokémon VGC International Championships",
          division: "masters",
          lastActivityAt: new Date("2026-06-13T10:30:00.000Z"),
          sourceUrl: "https://www.pokedata.ovh/standingsVGC/0000190/"
        }
      ]
    );

    await expect(listRecentEvents()).resolves.toEqual([
      {
        externalEventId: "0000190",
        title: "2026 North America Pokémon VGC International Championships",
        division: "masters",
        lastActivityAt: "2026-06-13T10:30:00.000Z",
        sourceUrl: "https://www.pokedata.ovh/standingsVGC/0000190/"
      }
    ]);

    expect(fetchEventIndex).toHaveBeenCalledOnce();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("usando cache do banco")
    );
  });
});
