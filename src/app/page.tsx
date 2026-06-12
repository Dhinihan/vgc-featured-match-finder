"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  EventDashboard,
  RankedPairing,
  RecentEvent,
  TournamentPlayer
} from "@/domain/types";

type FilterMode = "all" | "finished" | "pending" | "hide-missing" | "top10" | "top25";

const FILTERS: Array<{ mode: FilterMode; label: string }> = [
  { mode: "all", label: "Todas" },
  { mode: "finished", label: "Com placar" },
  { mode: "pending", label: "Somente pendentes" },
  { mode: "hide-missing", label: "Ocultar CP ausente" },
  { mode: "top10", label: "Top 10" },
  { mode: "top25", label: "Top 25" }
];

const SELECTED_EVENT_KEY = "vgc-selected-event";

/** RN-26: filtros aplicados sobre o ranking ja ordenado. */
function applyFilter(pairings: RankedPairing[], mode: FilterMode): RankedPairing[] {
  switch (mode) {
    case "finished":
      return pairings.filter((pairing) => !pairing.isPending && pairing.result);
    case "pending":
      return pairings.filter((pairing) => pairing.isPending);
    case "hide-missing":
      return pairings.filter((pairing) => pairing.scoreStatus !== "missing-player-cp");
    case "top10":
      return pairings.slice(0, 10);
    case "top25":
      return pairings.slice(0, 25);
    default:
      return pairings;
  }
}

/** RN-27 */
function resultLabel(pairing: RankedPairing): string {
  if (pairing.isBye) return "BYE";
  if (pairing.isPending) return "Pendente";
  if (pairing.result === "W") return "Vitória A";
  if (pairing.result === "L") return "Vitória B";
  if (pairing.result === "T") return "Empate";
  return pairing.result ?? "Pendente";
}

/** RN-29 */
function matchStatusLabel(player: TournamentPlayer): string {
  switch (player.championshipPointsMatch.status) {
    case "not-found":
      return "CP não encontrado";
    case "ambiguous":
      return "CP ambíguo";
    case "normalized-name":
      return "nome normalizado";
    case "exact":
      return "CP exato";
  }
}

/** RN-28 */
function cpLabel(player: TournamentPlayer | null, isBye: boolean): string {
  if (!player) return isBye ? "-" : "?";
  return player.championshipPoints === null
    ? "?"
    : player.championshipPoints.toLocaleString("pt-BR");
}

function relativeTime(iso: string | null, now: number): string {
  if (!iso) return "nunca";
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 10) return "agora mesmo";
  if (seconds < 60) return `há ${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `há ${hours} h`;
  return new Date(iso).toLocaleString("pt-BR");
}

function PlayerCell({ player, isBye }: { player: TournamentPlayer | null; isBye: boolean }) {
  if (!player) {
    return <td>{isBye ? "BYE" : "?"}</td>;
  }

  return (
    <td>
      {player.displayName}
      {player.country ? ` [${player.country}]` : ""}
      {player.tournamentRecord ? <span className="record-badge">{player.tournamentRecord}</span> : null}
      <span className="match-status">{matchStatusLabel(player)}</span>
    </td>
  );
}

export default function Home() {
  const [recentEvents, setRecentEvents] = useState<RecentEvent[] | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<EventDashboard | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [filter, setFilter] = useState<FilterMode>("top25");
  const [refreshing, setRefreshing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [adminSecret, setAdminSecret] = useState("");
  const [importingCp, setImportingCp] = useState(false);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Guarda contra respostas fora de ordem quando o usuario troca de torneio rapido.
  const selectionToken = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const loadEvents = useCallback(() => {
    setEventsError(null);
    setRecentEvents(null);
    fetch("/api/events")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "falha ao listar torneios");
        setRecentEvents(data.events);
      })
      .catch((error: Error) => {
        setRecentEvents([]);
        setEventsError(error.message);
      });
  }, []);

  useEffect(loadEvents, [loadEvents]);

  const refreshPairings = useCallback(
    async (externalEventId: string, token: number, auto: boolean) => {
      setRefreshing(true);
      setStatusMessage(auto ? "Carregando rodada atual…" : "Atualizando partidas…");
      setErrorMessage(null);

      try {
        const response = await fetch(`/api/events/${externalEventId}/refresh`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}"
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Falha na atualização.");
        if (selectionToken.current !== token) return;
        setDashboard(data.dashboard);
        setStatusMessage(data.message);
        setNow(Date.now());
      } catch (error) {
        if (selectionToken.current !== token) return;
        setStatusMessage(null);
        setErrorMessage(error instanceof Error ? error.message : "Falha na atualização.");
      } finally {
        if (selectionToken.current === token) setRefreshing(false);
      }
    },
    []
  );

  const selectEvent = useCallback(
    async (externalEventId: string) => {
      const token = ++selectionToken.current;
      setSelectedEventId(externalEventId);
      try {
        localStorage.setItem(SELECTED_EVENT_KEY, externalEventId);
      } catch {
        // storage indisponivel (modo privado etc.); selecao segue só em memoria
      }
      setStatusMessage(null);
      setErrorMessage(null);
      setDashboard(null);
      setDashboardLoading(true);

      try {
        const response = await fetch(`/api/events/${externalEventId}/dashboard`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "falha ao carregar dashboard");
        if (selectionToken.current !== token) return;
        setDashboard(data);
        setDashboardLoading(false);

        // Ergonomia: sem dados locais (ou rodada defasada), ja dispara a
        // atualizacao — o cache-first no servidor protege as fontes.
        if (data.stats.totalPairings === 0 || data.needsPairingsRefresh) {
          await refreshPairings(externalEventId, token, true);
        }
      } catch (error) {
        if (selectionToken.current !== token) return;
        setDashboardLoading(false);
        setErrorMessage(error instanceof Error ? error.message : "falha ao carregar dashboard");
      }
    },
    [refreshPairings]
  );

  // Restaura o ultimo torneio visto; com um unico torneio na lista, seleciona direto.
  useEffect(() => {
    if (!recentEvents || recentEvents.length === 0 || selectedEventId) return;

    let remembered: string | null = null;
    try {
      remembered = localStorage.getItem(SELECTED_EVENT_KEY);
    } catch {
      remembered = null;
    }

    const match = recentEvents.find((event) => event.externalEventId === remembered);
    if (match) {
      selectEvent(match.externalEventId);
    } else if (recentEvents.length === 1) {
      selectEvent(recentEvents[0].externalEventId);
    }
  }, [recentEvents, selectedEventId, selectEvent]);

  const manualRefresh = useCallback(() => {
    if (!selectedEventId || refreshing) return;
    refreshPairings(selectedEventId, selectionToken.current, false);
  }, [selectedEventId, refreshing, refreshPairings]);

  const importCp = useCallback(async () => {
    if (!adminSecret || importingCp) return;
    setImportingCp(true);
    setAdminMessage("Importando CP (pode levar ~1 min)…");

    try {
      const response = await fetch("/api/admin/import-cp", {
        method: "POST",
        headers: { "x-admin-secret": adminSecret }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "falha ao importar CP");
      setAdminMessage(`CP importado: ${data.playerCount} jogadores (snapshot #${data.snapshotId}).`);
      if (selectedEventId) {
        const response = await fetch(`/api/events/${selectedEventId}/dashboard`);
        if (response.ok) setDashboard(await response.json());
      }
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : "falha ao importar CP");
    } finally {
      setImportingCp(false);
    }
  }, [adminSecret, importingCp, selectedEventId]);

  const ranked = dashboard?.rankedPairings ?? [];
  const filtered = useMemo(() => applyFilter(ranked, filter), [ranked, filter]);
  const event = dashboard?.event ?? null;
  const cp = dashboard?.championshipPoints ?? null;
  const stats = dashboard?.stats;

  const roundLagging =
    event !== null && event.displayRound > 0 && event.displayRound < event.currentRound;

  const busy = refreshing || dashboardLoading;

  return (
    <main>
      <h1>VGC Featured Match Finder</h1>
      <p className="subtitle">Relevância por produto de Championship Points (CP A × CP B).</p>

      {cp && cp.playerCount === 0 ? (
        <div className="banner">
          Snapshot de CP vazio. Importe o ranking na seção de administração abaixo antes de avaliar
          relevância — sem CP, todas as partidas valem 1 × 1.
        </div>
      ) : null}

      <section className="panel">
        <h2>Torneios recentes (Masters)</h2>
        {eventsError ? (
          <p className="error">
            {eventsError}{" "}
            <button className="secondary inline" onClick={loadEvents}>
              Tentar de novo
            </button>
          </p>
        ) : null}
        {recentEvents === null ? <p className="muted">Carregando torneios…</p> : null}
        {recentEvents !== null && recentEvents.length === 0 && !eventsError ? (
          <p className="muted">Nenhum torneio com atividade recente.</p>
        ) : null}
        <div className="event-list">
          {(recentEvents ?? []).map((recent) => (
            <button
              key={recent.externalEventId}
              className={recent.externalEventId === selectedEventId ? "selected" : ""}
              onClick={() => selectEvent(recent.externalEventId)}
              disabled={busy && recent.externalEventId === selectedEventId}
            >
              {recent.title}
              <span className="muted"> — #{recent.externalEventId}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="event-grid">
          <div>
            <h2>
              {event
                ? event.title
                : dashboardLoading
                  ? "Carregando evento…"
                  : "Nenhum evento configurado"}
            </h2>
            <p className="muted">
              {event
                ? `#${event.externalEventId} · divisão ${event.division}`
                : dashboardLoading
                  ? ""
                  : "Selecione um torneio recente"}
            </p>
            <p className="muted">
              Última atualização: {relativeTime(event?.lastRefreshAt ?? null, now)}
            </p>
            {cp ? (
              <p className="muted">
                CP: {cp.playerCount.toLocaleString("pt-BR")} jogadores
                {cp.importedAt ? ` · importado ${relativeTime(cp.importedAt, now)}` : ""}
              </p>
            ) : null}
          </div>
          <div>
            <div className="round-number">
              {event && event.displayRound > 0 ? event.displayRound : "-"}
            </div>
            <div className="muted">Rodada exibida</div>
            {roundLagging ? (
              <div className="warn">
                Exibindo rodada {event!.displayRound} até importar a {event!.currentRound}.
              </div>
            ) : null}
          </div>
          <div>
            <button onClick={manualRefresh} disabled={!selectedEventId || busy}>
              {refreshing ? "Atualizando…" : "Atualizar partidas"}
            </button>
          </div>
        </div>
        {statusMessage ? <p className="success">{statusMessage}</p> : null}
        {errorMessage ? <p className="error">{errorMessage}</p> : null}
      </section>

      {stats ? (
        <section className="stats">
          <div className="stat-card">
            <div className="value">{stats.totalPairings}</div>
            <div className="label">Partidas</div>
          </div>
          <div className="stat-card">
            <div className="value">{stats.pendingPairings}</div>
            <div className="label">Pendentes</div>
          </div>
          <div className="stat-card">
            <div className="value">{stats.completedPairings}</div>
            <div className="label">Concluídas</div>
          </div>
          <div className="stat-card">
            <div className="value">{stats.unmatchedPlayers}</div>
            <div className="label">Sem CP</div>
          </div>
          <div className="stat-card">
            <div className="value">{stats.ambiguousPlayers}</div>
            <div className="label">Ambíguos</div>
          </div>
        </section>
      ) : null}

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Partidas em destaque</h2>
        <div className="filters">
          {FILTERS.map(({ mode, label }) => (
            <button
              key={mode}
              className={filter === mode ? "active" : ""}
              onClick={() => setFilter(mode)}
            >
              {label}
            </button>
          ))}
        </div>

        {filtered.length > 0 && filtered.length !== ranked.length ? (
          <p className="muted">
            Mostrando {filtered.length} de {ranked.length}
          </p>
        ) : null}

        {dashboardLoading || (refreshing && ranked.length === 0) ? (
          <div className="empty">Carregando partidas…</div>
        ) : ranked.length === 0 ? (
          <div className="empty">
            {!event ? (
              "Nenhuma partida carregada. Selecione um torneio acima."
            ) : (
              <>
                <p>
                  {dashboard?.needsPairingsRefresh
                    ? "A rodada atual ainda não foi carregada."
                    : "Nenhuma partida carregada."}
                </p>
                <button onClick={manualRefresh} disabled={busy}>
                  Atualizar partidas
                </button>
              </>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <p>Nenhuma partida neste filtro.</p>
            <button className="secondary" onClick={() => setFilter("all")}>
              Mostrar todas
            </button>
          </div>
        ) : (
          <>
          <div className="match-cards">
            {filtered.map((pairing, position) => (
              <div className="match-card" key={pairing.id}>
                <div className="card-top">
                  <span>
                    #{position + 1}
                    {pairing.tableNumber !== null ? ` · mesa ${pairing.tableNumber}` : ""}
                  </span>
                  <span>{resultLabel(pairing)}</span>
                </div>
                <div className="card-player">
                  <span>
                    {pairing.playerA.displayName}
                    {pairing.playerA.country ? ` [${pairing.playerA.country}]` : ""}
                    {pairing.playerA.tournamentRecord ? (
                      <span className="record-badge">{pairing.playerA.tournamentRecord}</span>
                    ) : null}
                  </span>
                  <span className="cp">{cpLabel(pairing.playerA, false)}</span>
                </div>
                <div className="card-player">
                  <span>
                    {pairing.playerB ? (
                      <>
                        {pairing.playerB.displayName}
                        {pairing.playerB.country ? ` [${pairing.playerB.country}]` : ""}
                        {pairing.playerB.tournamentRecord ? (
                          <span className="record-badge">{pairing.playerB.tournamentRecord}</span>
                        ) : null}
                      </>
                    ) : (
                      "BYE"
                    )}
                  </span>
                  <span className="cp">{pairing.playerB ? cpLabel(pairing.playerB, false) : "-"}</span>
                </div>
                <div className="card-bottom">
                  <span className="muted">
                    {matchStatusLabel(pairing.playerA)}
                    {pairing.playerB ? ` · ${matchStatusLabel(pairing.playerB)}` : ""}
                  </span>
                  <span className="relevance">{pairing.importanceScore.toLocaleString("pt-BR")}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Jogador A</th>
                  <th>CP A</th>
                  <th>Jogador B</th>
                  <th>CP B</th>
                  <th>Placar</th>
                  <th>Relevância</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((pairing, position) => (
                  <tr key={pairing.id}>
                    <td>
                      {position + 1}
                      {pairing.tableNumber !== null ? (
                        <span className="match-status">mesa {pairing.tableNumber}</span>
                      ) : null}
                    </td>
                    <PlayerCell player={pairing.playerA} isBye={false} />
                    <td>{cpLabel(pairing.playerA, false)}</td>
                    <PlayerCell player={pairing.playerB} isBye={pairing.isBye} />
                    <td>{pairing.playerB ? cpLabel(pairing.playerB, false) : "-"}</td>
                    <td>{resultLabel(pairing)}</td>
                    <td>{pairing.importanceScore.toLocaleString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      <details className="panel">
        <summary>Administração — importar Championship Points</summary>
        <p className="muted">
          Importa o ranking VG Masters global 2026 da API oficial Play! Pokémon como um novo
          snapshot. Não roda durante o refresh de partidas.
        </p>
        <div className="admin-row">
          <input
            type="password"
            placeholder="ADMIN_REFRESH_SECRET"
            value={adminSecret}
            onChange={(input) => setAdminSecret(input.target.value)}
          />
          <button className="secondary" onClick={importCp} disabled={!adminSecret || importingCp}>
            {importingCp ? "Importando…" : "Importar CP"}
          </button>
        </div>
        {adminMessage ? <p className="muted">{adminMessage}</p> : null}
      </details>
    </main>
  );
}
