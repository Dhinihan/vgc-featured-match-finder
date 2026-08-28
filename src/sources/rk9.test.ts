import { describe, expect, it } from "vitest";
import {
  parseEventMeta,
  parseRoundPairings,
  pairingsPageUrl,
  roundPairingsUrl
} from "./rk9";

const META_HTML = `
<html><body><div id="content"><div class="container-fluid">
<div class="d-flex justify-content-between"><h3 class="mb-0">Tournament Pairings</h3>
<h4 class="mb-0">2026 Pokémon VGC World Championship</h4></div>
<ul class="nav nav-pills" role="tablist">
<li class="nav-item"><a class="nav-link active" id="P2-tab" data-toggle="tab" href="#P2" role="tab" aria-controls="P2" aria-selected="false">Masters in Round 3</a></li>
<li class="nav-item"><a class="nav-link " id="P9-tab" data-toggle="tab" href="#P9" role="tab" aria-controls="P9" aria-selected="false">Senior in Round 2</a></li>
<li class="nav-item"><a class="nav-link " id="P0-tab" data-toggle="tab" href="#P0" role="tab" aria-controls="P0" aria-selected="false">Junior in Round 2</a></li>
</ul>
</div></div></body></html>`;

const ROUND_HTML = `
<div class="row row-cols-3 match no-gutter complete">
<div id="cell-2-1-129-1" class="col-5 text-center player player1 winner outcome     ">
<span class="name">Adria<br> Rodriguez Pol [ES]<br></span>
<span class="record" data-wins="1" data-losses="0" data-ties="0" data-points="3"></span><br></div>
<div id="cell-2-1-129-3" class="col-2 text-center  "> Table<br><span class="tablenumber "> 129 </span><br></div>
<div id="cell-2-1-129-2" class="col-5 text-center player player2 loser    ">
<span class="name">Ruben<br> Gianzini [IT]<br></span>
<span class="record" data-wins="0" data-losses="1" data-ties="0" data-points="0"></span><br></div></div>
<div class="row row-cols-3 match no-gutter ">
<div id="cell-2-1-130-1" class="col-5 text-center player player1 winner outcome     ">
<span class="name">Justin<br> Cerioni [IT]<br></span>
<span class="record" data-wins="1" data-losses="0" data-ties="0" data-points="3"></span><br></div>
<div id="cell-2-1-130-3" class="col-2 text-center  "> Table<br><span class="tablenumber "> 130 </span><br></div>
<div id="cell-2-1-130-2" class="col-5 text-center player player2      "></div></div>
<div class="row row-cols-3 match no-gutter complete">
<div id="cell-2-1-7-1" class="col-5 text-center player player1 loser   ">
<span class="name">Rasmus<br> W.</span> (0-1-0) 0 pts <br></div>
<div id="cell-2-1-7-3" class="col-2 text-center  "> Table<br><span class="tablenumber "> 7 </span><br></div>
<div id="cell-2-1-7-2" class="col-5 text-center player player2 winner    ">
<span class="name">Erik<br> Brander [SE]</span> (1-0-0) 3 pts <br></div></div>
<div class="row row-cols-3 match no-gutter complete">
<div id="cell-2-1-8-1" class="col-5 text-center player player1  tie   ">
<span class="name">Ana<br> Silva [BR]</span> (0-0-1) 1 pts <br></div>
<div id="cell-2-1-8-3" class="col-2 text-center  "> Table<br><span class="tablenumber "> 8 </span><br></div>
<div id="cell-2-1-8-2" class="col-5 text-center player player2  tie   ">
<span class="name">John<br> O&#39;Brien [US]</span> (0-0-1) 1 pts <br></div></div>
<div class="row row-cols-3 match no-gutter complete">
<div id="cell-9-1-11-1" class="col-5 text-center player player1 winner   ">
<span class="name">Other<br> Pod [US]</span> (1-0-0) 3 pts <br></div>
<div id="cell-9-1-11-3" class="col-2 text-center  "> Table<br><span class="tablenumber "> 11 </span><br></div>
<div id="cell-9-1-11-2" class="col-5 text-center player player2 loser   ">
<span class="name">Other<br> Loser [CA]</span> (0-1-0) 0 pts <br></div></div>
<div class="row row-cols-3 match no-gutter complete">
<div id="cell-2-2-50-1" class="col-5 text-center player player1 winner   ">
<span class="name">Other<br> Round [US]</span> (1-0-0) 3 pts <br></div>
<div id="cell-2-2-50-3" class="col-2 text-center  "> Table<br><span class="tablenumber "> 50 </span><br></div>
<div id="cell-2-2-50-2" class="col-5 text-center player player2 loser   ">
<span class="name">Other<br> Round B [CA]</span> (0-1-0) 0 pts <br></div></div>
`;

describe("parseEventMeta", () => {
  it("extrai titulo, pod Masters e rodada atual das pills", () => {
    expect(parseEventMeta(META_HTML)).toEqual({
      title: "2026 Pokémon VGC World Championship",
      mastersPod: 2,
      currentRound: 3
    });
  });

  it("retorna null quando nao ha pills de divisao Masters", () => {
    expect(
      parseEventMeta("<h4 class=\"mb-0\">Evento</h4><a aria-controls=\"P9\">Senior in Round 1</a>")
    ).toBeNull();
    expect(parseEventMeta("<html></html>")).toBeNull();
  });
});

describe("parseRoundPairings", () => {
  it("extrai partidas do pod/rodada pedidos, com resultado, mesa e record", () => {
    const pairings = parseRoundPairings(ROUND_HTML, 2, 1);

    expect(pairings).toHaveLength(4);
    expect(pairings[0]).toEqual({
      tableNumber: 7,
      playerA: { displayName: "Rasmus W.", country: "", tournamentRecord: "0-1" },
      playerB: { displayName: "Erik Brander", country: "SE", tournamentRecord: "1-0" },
      result: "L",
      isPending: false,
      isBye: false
    });
    expect(pairings[1]).toEqual({
      tableNumber: 8,
      playerA: { displayName: "Ana Silva", country: "BR", tournamentRecord: "0-0-1" },
      playerB: { displayName: "John O'Brien", country: "US", tournamentRecord: "0-0-1" },
      result: "T",
      isPending: false,
      isBye: false
    });
    expect(pairings[2]).toEqual({
      tableNumber: 129,
      playerA: { displayName: "Adria Rodriguez Pol", country: "ES", tournamentRecord: "1-0" },
      playerB: { displayName: "Ruben Gianzini", country: "IT", tournamentRecord: "0-1" },
      result: "W",
      isPending: false,
      isBye: false
    });
    // Partida pendente: sem classes de resultado.
    expect(pairings[3]).toEqual({
      tableNumber: 130,
      playerA: { displayName: "Justin Cerioni", country: "IT", tournamentRecord: "1-0" },
      playerB: null,
      result: "W",
      isPending: false,
      isBye: true
    });
  });

  it("ignora celulas de outros pods e rodadas", () => {
    const pairings = parseRoundPairings(ROUND_HTML, 2, 2);
    expect(pairings).toHaveLength(1);
    expect(pairings[0].tableNumber).toBe(50);
    expect(pairings[0].result).toBe("W");
  });

  it("retorna lista vazia quando o pod/rodada nao tem partidas", () => {
    expect(parseRoundPairings(ROUND_HTML, 3, 9)).toEqual([]);
  });

  it("ordena por mesa (RN-07) mesmo com entrada fora de ordem", () => {
    const pairings = parseRoundPairings(ROUND_HTML, 2, 1);
    const tables = pairings.map((pairing) => pairing.tableNumber);
    expect(tables).toEqual([...tables].sort((a, b) => (a ?? 0) - (b ?? 0)));
  });
});

describe("urls", () => {
  it("monta urls de pagina e rodada", () => {
    expect(pairingsPageUrl("WCS02wAQpCIaqFmXxER4")).toBe(
      "https://rk9.gg/pairings/WCS02wAQpCIaqFmXxER4"
    );
    expect(roundPairingsUrl("WCS02wAQpCIaqFmXxER4", 2, 3)).toBe(
      "https://rk9.gg/pairings/WCS02wAQpCIaqFmXxER4?pod=2&rnd=3"
    );
  });
});
