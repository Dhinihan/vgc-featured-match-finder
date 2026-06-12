import { describe, expect, it } from "vitest";
import { filterRecentEvents, parseEventDateRange, parseEventIndexHtml } from "./pokedata";

const INDEX_SAMPLE = `
<div class="flex-parent jc-center"><button onclick="location.href='0000190/'" type="button" style="width:90%">2026 North America Pokémon VGC International Championships
 - June 12-14, 2026</button></div><br>
<div class="flex-parent jc-center"><button onclick="location.href='0000189/'" type="button" style="width:90%">2026 Turin Pokémon VGC Cup
 - June 6-7, 2026</button></div><br>
`;

describe("parseEventIndexHtml", () => {
  it("extrai id, titulo e datas dos botoes do indice", () => {
    const parsed = parseEventIndexHtml(INDEX_SAMPLE);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].externalEventId).toBe("0000190");
    expect(parsed[0].title).toBe("2026 North America Pokémon VGC International Championships");
    expect(parsed[0].startsAt?.toISOString()).toBe("2026-06-12T00:00:00.000Z");
    expect(parsed[0].endsAt?.toISOString()).toBe("2026-06-14T23:59:59.000Z");
  });
});

describe("parseEventDateRange", () => {
  it("aceita intervalo no mesmo mes, entre meses e dia unico", () => {
    expect(parseEventDateRange("June 12-14, 2026")?.start.getUTCDate()).toBe(12);
    expect(parseEventDateRange("March 30-April 1, 2026")?.end.getUTCMonth()).toBe(3);
    expect(parseEventDateRange("June 7, 2026")?.end.getUTCDate()).toBe(7);
    expect(parseEventDateRange("sem data")).toBeNull();
  });
});

describe("RN-08 filterRecentEvents", () => {
  it("mantem eventos em andamento ou encerrados dentro da janela", () => {
    const parsed = parseEventIndexHtml(INDEX_SAMPLE);
    const duringEvent = new Date("2026-06-13T12:00:00Z");
    const recent = filterRecentEvents(parsed, 36, duringEvent);
    expect(recent.map((event) => event.externalEventId)).toEqual(["0000190"]);

    const wellAfter = new Date("2026-06-20T12:00:00Z");
    expect(filterRecentEvents(parsed, 36, wellAfter)).toHaveLength(0);
  });
});
