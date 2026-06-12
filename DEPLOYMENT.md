# Estrategia de deploy e infraestrutura

**Objetivo:** hospedar o VGC Featured Match Finder com custo zero para baixo volume de acessos, preservando dados entre acessos e evitando chamadas repetidas a fontes publicas.

Esta proposta complementa o `PRD.md`. O PRD define produto e regras de negocio; este documento define uma infraestrutura v1 pragmatica para colocar o produto no ar.

---

## Decisao recomendada

Usar:

- **Vercel Hobby** para frontend e API serverless.
- **Neon Postgres Free** para persistencia e cache duravel.
- **Refresh manual cache-first** no fluxo principal.
- **Reimportacao forcada** como acao secundaria/admin.
- **Sem Redis, fila, worker ou cron** na v1.

Racional:

- A conta Vercel ja existe e cobre bem poucos acessos.
- O produto precisa de persistencia para eventos recentes, snapshots de rodada, CP pre-carregado e historico minimo de refresh.
- Um banco Postgres resolve persistencia e cache sem adicionar outro servico.
- Como o PRD exige refresh manual, nao ha necessidade inicial de cron, polling ou fila.

---

## Principios

### 1. Banco como fonte de verdade operacional

A UI deve ler sempre do banco.

As fontes externas continuam sendo canonicas para torneios, standings, pairings e CP, mas o app opera sobre snapshots persistidos.

Cada snapshot importado deve guardar metadados suficientes para auditoria e invalidacao:

- `sourceFetchedAt`
- `importedAt`
- `expiresAt`
- `sourceHash` quando viavel
- identificador da fonte externa
- status da importacao

### 2. Cache-first agressivo

O app deve evitar bombardear fontes publicas.

Regras praticas:

- Nao buscar CP externo durante refresh de partidas.
- Nao reimportar rodadas antigas se ja existem no banco.
- Nao reprocessar CP dos jogadores envolvidos se o snapshot de CP nao mudou.
- Ao atualizar a rodada atual, buscar apenas o minimo necessario para detectar rodada e importar a rodada alvo.
- Se uma rodada esta finalizada, tratar o snapshot como estavel e nao revalidar automaticamente.

### 3. Refresh manual com duas intensidades

Fluxo principal:

- Botao **Atualizar partidas**
- Respeita cache, TTL e snapshots existentes.
- Revalida somente o que parece necessario.

Fluxo secundario/admin:

- Acao **Forcar reimportacao**
- Ignora TTL para evento/rodada atual.
- Deve ser usada para corrigir dados atrasados, inconsistentes ou importados cedo demais.
- Nao deve atualizar CP automaticamente.

---

## Componentes

### Vercel

Responsabilidades:

- Servir a UI.
- Expor endpoints serverless para:
  - listar torneios recentes;
  - selecionar/carregar dashboard de evento;
  - atualizar partidas;
  - forcar reimportacao;
  - consultar metadados de CP.

Observacoes:

- Serverless e suficiente enquanto refresh de um evento caber no limite de execucao da plataforma.
- Se a importacao ficar lenta demais, a evolucao natural e mover refresh para job assincromo, mas isso fica fora da v1.

### Neon Postgres

Responsabilidades:

- Persistir eventos, rodadas, pairings e snapshots de CP.
- Servir como cache duravel.
- Guardar metadados de importacao e historico minimo de refresh.

Por que nao Redis na v1:

- O cache precisa sobreviver entre acessos.
- Os dados sao relacionais e consultados pela UI.
- Postgres simplifica operacao e custo.

---

## Modelo de persistencia sugerido

### `events`

Guarda os torneios conhecidos.

Campos principais:

- `id`
- `external_event_id`
- `title`
- `division`
- `current_round`
- `imported_round`
- `last_refresh_at`
- `last_activity_at`
- `source_url`

### `event_round_snapshots`

Guarda o snapshot bruto/normalizado de uma rodada.

Chave sugerida:

- `(event_id, division, round_number)`

Campos principais:

- `event_id`
- `division`
- `round_number`
- `source_fetched_at`
- `imported_at`
- `expires_at`
- `is_final`
- `source_hash`
- `raw_payload`

### `pairings`

Guarda as partidas extraidas de cada snapshot.

Campos principais:

- `id`
- `event_id`
- `round_number`
- `table_number`
- `player_a`
- `player_b`
- `result`
- `is_pending`
- `is_bye`

### `championship_points_snapshots`

Guarda versoes do ranking de CP.

Campos principais:

- `id`
- `division`
- `imported_at`
- `player_count`
- `source_label`

### `championship_points_players`

Guarda os jogadores de um snapshot de CP.

Campos principais:

- `snapshot_id`
- `display_name`
- `normalized_name`
- `country`
- `championship_points`

### `player_cp_matches`

Cache derivado opcional para associacao jogador do torneio -> jogador no CP.

Chave sugerida:

- `(cp_snapshot_id, normalized_name, country)`

Campos principais:

- `cp_snapshot_id`
- `display_name`
- `normalized_name`
- `country`
- `match_status`
- `leaderboard_display_name`
- `championship_points`
- `candidates`

### `refresh_runs`

Historico operacional opcional, util para debug.

Campos principais:

- `id`
- `event_id`
- `started_at`
- `finished_at`
- `status`
- `round_number`
- `pairing_count`
- `unmatched_player_count`
- `ambiguous_player_count`
- `message`

---

## Politica de cache sugerida

| Dado | TTL recomendado | Regra |
|------|-----------------|-------|
| Lista de torneios recentes | 5-15 min | Revalidar com frequencia baixa |
| Metadados do evento ativo | 1-5 min | Buscar apenas se expirado ou forçado |
| Rodada atual pendente | 30-90 s | Revalidar no refresh manual se expirado |
| Rodada concluida | Sem expiracao automatica | Nao reimportar sem acao forcada |
| Rodadas antigas | Sem expiracao automatica | Nunca buscar de novo no fluxo normal |
| Snapshot de CP | Manual | Nao atualizar no refresh de partidas |
| Match CP derivado | Ate mudar o snapshot de CP | Invalidar por `cp_snapshot_id` |

---

## Fluxo: abrir o app

1. UI chama endpoint de torneios recentes.
2. API consulta `events` dentro da janela de atividade.
3. Se o cache da lista estiver expirado, API revalida a lista em fonte publica com limite conservador.
4. UI exibe apenas Masters recentes.

---

## Fluxo: selecionar evento

1. UI envia `eventId`.
2. API busca `event`, `displayRound`, pairings ja importados e metadados de CP.
3. API calcula ranking usando dados locais.
4. Nenhuma chamada externa deve acontecer nesse fluxo, exceto se a lista/evento estiverem ausentes e a fonte precisar ser consultada uma vez.

---

## Fluxo: atualizar partidas

1. Usuario clica **Atualizar partidas**.
2. API registra `refresh_run`.
3. API descobre a rodada atual com a menor chamada externa possivel, respeitando TTL.
4. API compara rodada alvo com `event_round_snapshots`.
5. Se a rodada alvo ja existe e esta fresca, reutiliza snapshot.
6. Se expirou ou nao existe, importa apenas a rodada alvo.
7. API extrai/deduplica pairings, persiste dados e recalcula ranking.
8. API retorna dashboard atualizado.

Importante:

- O refresh normal nao deve reimportar rodadas anteriores.
- O refresh normal nao deve buscar CP externo.
- Em falha, preservar o estado anterior quando possivel.

---

## Fluxo: forcar reimportacao

1. Usuario/admin aciona **Forcar reimportacao**.
2. API ignora TTL do evento/rodada atual.
3. API busca novamente a rodada alvo.
4. API substitui snapshot/pairings daquela rodada de forma transacional.
5. API registra `refresh_run` com indicacao de `forced = true`.

Limites:

- Nao deve apagar rodadas antigas.
- Nao deve atualizar CP automaticamente.
- Deve ter protecao simples contra abuso, como endpoint nao exposto na UI principal ou segredo de admin.

---

## Variaveis de ambiente esperadas

```env
DATABASE_URL=
ADMIN_REFRESH_SECRET=
RECENT_EVENTS_TTL_SECONDS=600
ACTIVE_ROUND_TTL_SECONDS=60
EVENT_METADATA_TTL_SECONDS=180
RECENT_EVENTS_WINDOW_HOURS=36
```

---

## Caminho de evolucao

Comecar simples:

1. Vercel + Neon.
2. Endpoints serverless sincronamente.
3. Cache persistido em Postgres.
4. Refresh manual cache-first.
5. Reimportacao forcada protegida.

Evoluir somente se houver necessidade real:

- Job assincromo se refresh estourar tempo de serverless.
- Fila se houver multiplos refreshes concorrentes.
- Redis se existir cache altamente volatil e nao relacional.
- Cron se o produto passar a exigir dados pre-aquecidos antes do usuario abrir o app.

---

## Decisoes fechadas

- O projeto precisa de persistencia.
- O cache deve ser usado intensivamente para proteger fontes publicas.
- A UI deve ler dados do banco.
- Refresh normal deve ser cache-first.
- Deve existir modo de reimportacao forcada.
- CP e pre-carregado e nao faz parte do refresh de partidas.
- Postgres e suficiente para persistencia e cache na v1.
