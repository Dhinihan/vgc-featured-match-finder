# PRD - VGC Featured Match Finder

**Versao:** 1.0 (rebuild)
**Idioma:** Portugues
**Escopo:** regras de negocio, contratos de dados e decisoes de fonte - sem infraestrutura, deploy, cache ou cron.

---

## 1. Visao e objetivo

O **VGC Featured Match Finder** e uma ferramenta para **espectadores presenciais em torneios VGC** que precisam decidir rapidamente **qual mesa assistir** durante a rodada em andamento.

O produto recebe dados de um torneio (emparelhamentos, resultados parciais, standings) e de um ranking de **Championship Points (CP)**, associa cada jogador do torneio ao seu CP no ranking, e **ordena as partidas da rodada por relevancia** usando o produto `CP_A x CP_B`. Partidas com jogadores de alto CP sobem ao topo da lista.

**Objetivo principal:** em menos de um minuto, o espectador escolhe um torneio ativo na lista de recentes, atualiza os dados manualmente e identifica as partidas mais interessantes da rodada exibida.

**Principios do rebuild:**

- Dominio interno **agnostico de fonte** - regras de negocio nao dependem do provedor externo.
- Fontes externas v1 definidas por adapter, com snapshots persistidos antes de uso pela UI.
- Algoritmo de destaque **identico ao atual** (documentado abaixo a partir do codigo).
- UI de saida **equivalente a atual** (`client/index.tsx` do projeto Lakebed).
- Atualizacao de dados **somente manual** (sem SLA de polling automatico).
- Selecao de torneio por **lista de recentes** (sem colar URL).

---

## 2. Personas

### Espectador ao vivo (primaria)

- Esta no evento, entre rodadas ou durante a rodada.
- Quer ver mesas com jogadores reconhecidos / alto CP.
- Escolhe torneio na lista de eventos recentes.
- Toca em "Atualizar" quando quiser dados frescos.
- Tolera CP ausente ou ambiguo, desde que a partida ainda apareca (com score reduzido).

### Operador de dados (secundaria, fora do app v1)

- Garante que o snapshot de CP esteja carregado antes/durante o evento.
- Nao ha UI de correcao manual de match na v1.

---

## 3. Escopo

### Dentro do escopo (v1)

| Area | Descricao |
|------|-----------|
| Lista de torneios recentes | Torneios Masters com atividade nas ultimas 24-48 h |
| Selecao de torneio | Usuario escolhe um torneio da lista (sem URL manual) |
| Divisao | **Masters apenas** |
| Refresh manual | Botoes explicitos para recarregar rodada e partidas |
| Rodada exibida | `displayRound` com fallback + aviso (logica atual) |
| Algoritmo de destaque | Produto de CP, ordenacao e filtros atuais |
| Dashboard de partidas | Tabela ranqueada, estatisticas, filtros |
| Match CP / jogador | Logica atual (exato, normalizado, token) - sem override |
| Estados vazios/erro | Comportamento equivalente ao atual |

### Fora do escopo (v1)

- Infraestrutura, hosting, banco, cache, cron, filas
- Autenticacao / contas de usuario
- Overrides manuais de match de jogador
- Push notifications
- Analytics / telemetria de produto
- Multi-divisao (Seniors, Juniors)
- Colar URL/ID de torneio manualmente
- Deteccao automatica de fase suica vs. top cut (nao existe hoje)
- Sincronizacao automatica de CP dentro do app (CP e dado pre-carregado)
- Polling automatico / auto-refresh em background

---

## 4. Fontes de dados v1

O modelo interno continua independente de fonte, mas a v1 deve ter adapters concretos para reduzir ambiguidade de implementacao.

### 4.1 Championship Points

**Fonte primaria v1:** API oficial Play! Pokemon usada pela pagina nova de leaderboards.

Endpoint base:

```text
https://api.play.pokemon.com/services/spar/leaderboards/
```

Parametros para VG Masters global 2026:

```text
product=vg
region=global
region_type=global
division=masters
period=a0a3bb4a4c7a75628526ebbc7eb61d26
page_size=300
page=1..N
point_type=championship
sort_by=ranking_order:asc
```

Campos usados:

| Campo externo | Campo interno |
|---------------|---------------|
| `display_name` | `displayName` |
| `player_country_code` ou `player_country` | `country` |
| `primary_point_total` | `championshipPoints` |
| `calculation_date` | metadado do snapshot |

Regras:

- CP e importado em fluxo separado/admin, nao durante refresh de partidas.
- Importacao deve paginar ate consumir todos os resultados.
- Snapshot importado vira a fonte operacional lida pela UI.
- `calculation_date` deve ser preservado para indicar frescor do ranking.

Fallbacks aceitos:

1. CSV/JSON manual com `displayName`, `country`, `championshipPoints`.
2. PokéData `/2026/`, se a API oficial estiver indisponivel.

### 4.2 Torneios recentes

**Fonte primaria v1:** PokéData VGC standings.

Pagina de indice:

```text
https://www.pokedata.ovh/standingsVGC/
```

Uso:

- Descobrir eventos VGC recentes.
- Extrair titulo, datas, divisao disponivel e `externalEventId` quando possivel.
- Filtrar para Masters e janela de atividade da RN-08.

Observacao:

- PokéData nao e fonte oficial canonica; serve como agregador pratico para descoberta e standings.

### 4.3 Standings e pairings

**Fonte primaria v1:** JSON de evento/divisao do PokéData.

Formato de URL esperado:

```text
https://www.pokedata.ovh/standingsVGC/{externalEventId}/masters/{externalEventId}_Masters.json
```

CSV equivalente, util como fallback ou debug:

```text
https://www.pokedata.ovh/standingsVGC/{externalEventId}/masters/data.csv
```

Uso:

- Detectar rodada atual.
- Extrair pairings por rodada.
- Extrair resultados, mesas, record do torneio e BYEs.

Limites:

- As paginas do PokéData informam que standings sao calculados fora do software oficial e nao sao oficiais.
- O app deve preservar `sourceUrl`, `sourceFetchedAt` e metadados de importacao para auditoria.

### 4.4 Fonte alternativa para pairings

**Fonte alternativa/futura:** RK9 public pairings.

Exemplo de formato:

```text
https://rk9.gg/pairings/{rk9PairingsId}?pod={pod}&rnd={roundNumber}
```

RK9 e mais proximo da operacao oficial do evento, mas a integracao exige parsing HTML e mapeamento de `pod` para divisao. Para a v1, RK9 deve ser preservado como `sourceUrl`/referencia quando vier do PokéData, mas nao precisa ser o adapter principal.

### 4.5 Fontes apenas auxiliares

Limitless VGC Standings e Reportworm podem ser usadas para validacao humana ou comparacao, mas nao devem ser fonte primaria v1. Ambas declaram que standings sao calculados fora do software oficial ou dependem de fontes externas.

---

## 5. Glossario

| Termo | Definicao |
|-------|-----------|
| **Championship Points (CP)** | Pontos acumulados no ranking oficial VGC |
| **Pairing / partida** | Confronto entre dois jogadores (ou BYE) em uma mesa, numa rodada |
| **Rodada ao vivo (`currentRound`)** | Maior numero de rodada considerado "atual" pelas fontes |
| **Rodada importada (`importedRound`)** | Ultima rodada cujos pairings foram persistidos com sucesso |
| **Rodada exibida (`displayRound`)** | Rodada cujos pairings aparecem na tabela |
| **Resultado pendente** | Partida sem resultado final (`null`, vazio, `-`, `?`, `PENDING`) |
| **BYE** | Rodada sem oponente; oponente vazio ou literal `"BYE"` |
| **Relevancia / importance score** | `CP_A_efetivo x CP_B_efetivo` (ver algoritmo) |
| **Match status** | Como o jogador foi associado ao ranking: exato, normalizado, ambiguo, nao encontrado |
| **Record do torneio** | Placar acumulado W-L ou W-L-T naquele evento |
| **Janela de atividade** | Periodo (24-48 h) em que um torneio teve atualizacao de pairings/standings |

---

## 6. Modelo de dados

Contratos internos agnosticos de fonte. Campos marcados com **\*** sao obrigatorios.

### 6.1 Torneio (`Event`)

| Campo | Tipo | Obrigatorio | Descricao |
|-------|------|-------------|-----------|
| `id`* | string | sim | ID interno |
| `externalEventId`* | string | sim | Identificador externo |
| `title`* | string | sim | Nome do evento |
| `division`* | string | sim | v1: sempre `"masters"` |
| `currentRound`* | number | sim | Rodada ao vivo conhecida (>= 0; 0 = desconhecida) |
| `importedRound` | number | sim | Ultima rodada importada |
| `displayRound` | number | derivado | Rodada mostrada na UI |
| `lastRefreshAt`* | datetime ISO | sim | Ultima atualizacao bem-sucedida |
| `lastActivityAt`* | datetime ISO | sim | Ultima atividade (para lista de recentes) |
| `sourceUrl` | string | nao | URL de referencia |

### 6.2 Jogador no ranking de CP (`ChampionshipPointsPlayer`)

| Campo | Tipo | Obrigatorio |
|-------|------|-------------|
| `displayName`* | string | sim |
| `normalizedName`* | string | sim |
| `country`* | string | sim |
| `championshipPoints`* | number >= 0 | sim |

**Metadados do ranking (`ChampionshipPointsMeta`):**

| Campo | Tipo |
|-------|------|
| `playerCount` | number |
| `division` | string (`"masters"`) |
| `importedAt` | datetime ou null |

### 6.3 Jogador no torneio (`TournamentPlayer`)

| Campo | Tipo | Obrigatorio |
|-------|------|-------------|
| `displayName`* | string | sim |
| `normalizedName`* | string | sim |
| `country`* | string | sim |
| `tournamentRecord` | string ou null | nao |
| `championshipPoints` | number ou null | derivado |
| `championshipPointsMatch`* | enum | sim |

**`ChampionshipPointsMatch`:**

| status | Campos extras |
|--------|---------------|
| `"exact"` | `leaderboardDisplayName` |
| `"normalized-name"` | `leaderboardDisplayName` |
| `"ambiguous"` | `candidates: string[]` |
| `"not-found"` | - |

### 6.4 Partida (`Pairing`)

| Campo | Tipo | Obrigatorio |
|-------|------|-------------|
| `id`* | string | sim |
| `eventId`* | string | sim |
| `roundNumber`* | number | sim |
| `tableNumber` | number ou null | nao |
| `playerA`* | TournamentPlayer | sim |
| `playerB` | TournamentPlayer ou null | sim |
| `result` | string ou null | nao |
| `isPending`* | boolean | sim |
| `isBye`* | boolean | sim |

### 6.5 Partida ranqueada (`RankedPairing`)

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `importanceScore`* | number | Relevancia calculada |
| `scoreStatus`* | enum | `"complete"` / `"missing-player-cp"` / `"bye"` |

### 6.6 Payload de standings (entrada agnostica)

Array JSON de jogadores, cada um com:

| Campo | Tipo | Obrigatorio |
|-------|------|-------------|
| `name`* | string | sim (formato `"Nome [CC]"` preferido) |
| `record` | `{ wins, losses, ties }` | nao |
| `placing` | number | nao |
| `rounds`* | mapa roundNumber -> RoundData | sim |

**`RoundData` por rodada:**

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `name` | string | Oponente (`"BYE"` ou vazio = bye) |
| `result` | string ou null | Resultado |
| `table` | number | Numero da mesa |

### 6.7 Dashboard agregado (`EventDashboard`)

```typescript
{
  event: EventSummary | null,
  needsPairingsRefresh: boolean,
  rankedPairings: RankedPairing[],
  stats: {
    totalPairings: number,
    pendingPairings: number,
    completedPairings: number,
    unmatchedPlayers: number,
    ambiguousPlayers: number
  }
}
```

### 6.8 Execucao de refresh (`RefreshRun`) - opcional na UI

| Campo | Descricao |
|-------|-----------|
| `startedAt`, `finishedAt` | Timestamps |
| `status` | `"running"` / `"success"` / `"error"` |
| `roundNumber`, `pairingCount` | Resultado |
| `unmatchedPlayerCount`, `ambiguousPlayerCount` | Qualidade do match |
| `message` | Texto livre |

---

## 7. Regras de negocio

### Normalizacao e parsing

**RN-01 - Normalizacao de nome**
Remover acentos (NFD), minusculas, remover tudo que nao seja `[a-z0-9]`.
Ex.: `"Joao da Silva"` -> `"joaodasilva"`.

**RN-02 - Label de jogador**
Formato preferido: `"Nome [CC]"` onde `CC` e codigo de pais 2-3 letras. Sem colchetes: `country = ""`.

**RN-03 - Resultado pendente**
Pendente se `result` for: `null`, `undefined`, string vazia, `"-"`, `"?"`, `"PENDING"` (case-insensitive).

**RN-04 - BYE**
`isBye = true` quando oponente e `"BYE"` (case-insensitive) ou string vazia. `playerB = null`.

**RN-05 - Record do torneio**
`{ wins, losses, ties }` -> `"W-L"` ou `"W-L-T"` se `ties > 0`. Retorna `null` se `0-0-0`.

**RN-06 - Deduplicacao de pairings**
Uma partida por combinacao `(tableNumber, jogadorA_normalizado, jogadorB_normalizado)` com nomes ordenados lexicograficamente. Manter apenas a entrada onde `playerSide <= opponentSide`.

**RN-07 - Ordenacao de pairings na rodada**
Por `tableNumber` ascendente; `null` trata como `99999`.

### Torneios recentes

**RN-08 - Janela de atividade**
Torneio entra na lista se `lastActivityAt` estiver dentro das ultimas **24-48 horas** (default sugerido: 36 h).

**RN-09 - Selecao de torneio**
Usuario escolhe da lista; torna-se o torneio ativo. Apenas um torneio ativo por sessao. Sem campo de URL/ID.

**RN-10 - Divisao fixa**
v1 opera exclusivamente em **Masters**.

### Rodada

**RN-11 - Deteccao de rodada nos standings**
Para cada jogador, inspecionar `rounds`. `maxRound` = maior rodada presente. `highestPendingRound` = maior rodada com resultado pendente (RN-03). Retorno: se `highestPendingRound > 0` -> essa rodada; senao -> `maxRound`.

**RN-12 - Reconciliacao HTML vs JSON**
Quando ha rodada do HTML e do JSON: retornar `max(htmlRound, standingsRound)`.

**RN-13 - Rodada ao vivo do evento**
`currentRound = max(htmlRound, standingsRound, storedRound)` no momento do refresh.

**RN-14 - Rodada exibida (`displayRound`)**
Ver secao 9. Manter `resolveDisplayRound` atual.

**RN-15 - Flag `needsPairingsRefresh`**
`true` se: `liveRound > 0` E (`pairingCount === 0` OU `displayRound < liveRound`). Indicador visual apenas; nao dispara import automatico.

**RN-16 - Importacao de pairings**
Tentar extrair pairings da rodada alvo. Se vazio, retroceder rodada a rodada ate encontrar dados.

### Match CP / jogador

**RN-17 - Prioridade de match** (sem override na v1):

1. Exato nome+pais - um unico jogador no indice
2. Ambiguo nome+pais - multiplos candidatos -> CP null, status `"ambiguous"`
3. Nome normalizado apenas - um unico match -> `"normalized-name"`
4. Ambiguo por nome - multiplos -> `"ambiguous"`
5. Token primeiro+ultimo nome - chave `"primeiro|ultimo"`; tentar com pais, depois sem
6. Nao encontrado - status `"not-found"`, CP null

**RN-18 - Normalizacao de pais**
`US`/`USA` -> `USA`; `UK`/`GB`/`GBR` -> `GB`; `UAE`/`AE` -> `AE`.

**RN-19 - Contagem de jogadores problematicos**
`unmatchedPlayers` = jogadores unicos com status `"not-found"`. `ambiguousPlayers` = jogadores unicos com status `"ambiguous"`.

### Scoring e ranking

**RN-20 - Score de relevancia**
Para partidas com dois jogadores (nao-BYE): `importanceScore = cpForScoring(cpA) x cpForScoring(cpB)` onde `cpForScoring(null) = 1` (**nao zero**).

**RN-21 - BYE**
`importanceScore = 0`, `scoreStatus = "bye"`.

**RN-22 - Status do score**
- `"complete"`: ambos CP conhecidos
- `"missing-player-cp"`: pelo menos um CP null
- `"bye"`: partida BYE

**RN-23 - Ordenacao final**
Decrescente por `importanceScore`. Empate: ascendente por `tableNumber`.

**RN-24 - Sem distincao de fase**
O algoritmo nao diferencia suica, top cut ou final. Todas as rodadas sao tratadas igualmente.

### UI e filtros

**RN-25 - Filtro padrao**
`"top25"` - exibir apenas as 25 primeiras apos ranking.

**RN-26 - Modos de filtro**

| Modo | Comportamento |
|------|---------------|
| `all` | Todas as partidas ranqueadas |
| `finished` | `!isPending && result` truthy |
| `pending` | `isPending === true` |
| `hide-missing` | `scoreStatus !== "missing-player-cp"` |
| `top10` | Primeiras 10 |
| `top25` | Primeiras 25 |

**RN-27 - Exibicao de resultado**

| Condicao | Label |
|----------|-------|
| BYE | `"BYE"` |
| `result === "W"` | `"Vitoria A"` |
| `result === "L"` | `"Vitoria B"` |
| `result === "T"` | `"Empate"` |
| outro result | result literal |
| pendente | `"Pendente"` |

**RN-28 - Exibicao de CP**
Numero formatado ou `"?"` se null. BYE na coluna CP B: `"-"`.

**RN-29 - Label de match status**

| status | Label |
|--------|-------|
| `not-found` | `"CP nao encontrado"` |
| `ambiguous` | `"CP ambiguo"` |
| `normalized-name` | `"nome normalizado"` |
| `exact` | `"CP exato"` |

**RN-30 - Refresh manual**
Usuario aciona "Atualizar partidas". Sistema sincroniza rodada, importa pairings, recalcula ranking. Mensagens de progresso durante o processo.

**RN-31 - Championship Points pre-carregados**
CP nao sao buscados durante refresh de pairings. Sistema le snapshot ja importado. UI informa contagem e data de importacao.

---

## 8. Algoritmo de partida em destaque (como esta hoje)

### 8.1 Pipeline

```
Standings da rodada exibida
  -> extrair Pairings (RN-04 a RN-07)
  -> enriquecer cada jogador com CP (RN-17)
  -> scorePairing (RN-20 a RN-22)
  -> rankPairings (RN-23)
  -> aplicar filtros UI (RN-25, RN-26)
```

### 8.2 Formula

Para partida **A vs B** (nao-BYE):

```
importanceScore = cpForScoring(cpA) x cpForScoring(cpB)

cpForScoring(cp) = cp  se cp != null
                 = 1   se cp = null
```

**Exemplos:**

- A=800 CP, B sem CP -> `800 x 1 = 800`, status `"missing-player-cp"`
- A=800, B=600 -> `480000`, status `"complete"`
- 1200 x 100 (120000) perde para 800 x 600 (480000) - produto, nao soma

### 8.3 BYE

BYE recebe score **0** e fica no final. Nao entra em competicao de destaque.

### 8.4 Desempate

Mesmo `importanceScore` -> mesa menor (`tableNumber` ascendente).

---

## 9. Resolucao de rodada

### 9.1 Tres conceitos

| Conceito | Significado |
|----------|-------------|
| `currentRound` | Maior rodada conhecida pelas fontes |
| `importedRound` | Ultima rodada cujos pairings foram importados |
| `displayRound` | Rodada mostrada na tabela |

### 9.2 `resolveDisplayRound(live, imported, roundsWithPairings)`

```
1. se liveRound <= 0 -> importedRound (ou 0)
2. se roundsWithPairings vazio -> liveRound
3. se liveRound in roundsWithPairings -> liveRound
4. senao -> maior rodada em roundsWithPairings que seja <= liveRound
5. senao -> maior rodada em roundsWithPairings (qualquer)
```

**Comportamento:** tenta mostrar a rodada ao vivo; se pairings ainda nao importados, recua para a rodada importada mais recente <= ao vivo. UI avisa quando `displayRound < currentRound`.

### 9.3 Rodada alvo na importacao

```
targetRound = max(htmlRound, standingsRound, storedRound)
pairings = extrair(targetRound)
se vazio -> tentar targetRound-1, targetRound-2, ... ate 1
```

---

## 10. Fluxos do usuario

### 10.1 Fluxo principal

1. Abrir app
2. Ver lista de torneios Masters recentes (24-48 h)
3. Selecionar torneio
4. Ver dashboard (default Top 25) ou estado vazio
5. Clicar "Atualizar partidas" para carregar/recarregar dados
6. Filtrar e identificar mesa de interesse
7. Repetir passo 5 quando quiser dados frescos

### 10.2 Atualizacao manual

1. Usuario clica **"Atualizar partidas"** (desabilitado sem torneio ativo ou durante refresh)
2. Sistema sincroniza rodada ao vivo
3. Sistema importa standings/pairings da rodada alvo (RN-16)
4. Sistema recalcula match CP, scores e stats
5. Mensagem de sucesso com rodada, contagem de partidas e CP no banco
6. Em falha: mensagem de erro; estado anterior preservado quando possivel

### 10.3 Arquitetura de informacao (UI a preservar)

**Cabecalho**

- Titulo: VGC Featured Match Finder
- Descricao: relevancia por produto de CP

**Painel do evento**

- Evento ativo: titulo, ID externo, divisao
- Rodada atual (numero grande) + aviso se `displayRound < currentRound`
- Ultima atualizacao (timestamp)
- Botao **Atualizar partidas** + spinner durante refresh

**Cards de estatisticas (5)**

- Partidas | Pendentes | Concluidas | Sem CP | Ambiguos

**Entrada de torneio (rebuild)**

- Substituir formulario ID/URL por **lista de torneios recentes**
- Usuario toca para selecionar

**Tabela "Partidas em destaque"**

- Colunas: Posicao | Jogador A (+ record badge) | CP A | Jogador B | CP B | Placar | Relevancia
- Subtexto: status do match CP
- Filtros: Todas | Com placar | Somente pendentes | Ocultar CP ausente | Top 10 | Top 25
- Contador "Mostrando X de Y" quando filtrado

**Historico de execucoes de atualizacao** (opcional - manter se util para debug)

---

## 11. Estados vazios e erros

### Sem torneio ativo

| Elemento | Comportamento |
|----------|---------------|
| Titulo evento | `"Nenhum evento configurado"` |
| Subtexto | `"Selecione um torneio recente"` |
| Rodada | `"-"` |
| Botao atualizar | desabilitado |
| Tabela | `"Nenhuma partida carregada. Selecione um torneio e clique Atualizar."` |

### Torneio ativo, zero partidas

| Condicao | Mensagem |
|----------|----------|
| `needsPairingsRefresh === true` | `"Clique em Atualizar partidas para carregar a rodada atual."` |
| `needsPairingsRefresh === false` | `"Nenhuma partida carregada."` |

### Partidas existem, filtro vazio

`"Nenhuma partida neste filtro. Tente o filtro 'Todas'."`

### CP nao importados

Banner informando que o snapshot de CP esta vazio ou desatualizado.

### Erros de operacao

| Operacao | Comportamento |
|----------|---------------|
| Refresh falha | Mensagem de erro especifica ou `"Falha na atualizacao."` |
| Sync rodada falha | Silencioso; dashboard usa ultimo valor conhecido |
| Nenhuma partida na rodada alvo | Erro: `"nenhuma partida encontrada para a rodada N"` |

### Aviso rodada defasada

Quando `displayRound > 0` e `displayRound < currentRound`:

> *"Exibindo rodada {displayRound} ate importar a {currentRound}."*

---

## 12. Criterios de aceite

### Torneios e selecao

- [ ] Lista exibe apenas torneios Masters com atividade nas ultimas 24-48 h
- [ ] Usuario seleciona torneio da lista (sem URL manual)
- [ ] Apenas um torneio ativo por sessao

### Rodada

- [ ] `displayRound` segue `resolveDisplayRound` com fallback
- [ ] Aviso visual quando `displayRound < currentRound`
- [ ] `needsPairingsRefresh` reflete defasagem sem auto-import

### Refresh manual

- [ ] Nenhum auto-refresh em background
- [ ] Botao "Atualizar partidas" recarrega pairings e recalcula ranking
- [ ] Mensagem de sucesso com rodada, partidas e CP no banco

### Algoritmo

- [ ] `importanceScore = cpA x cpB` com CP nulo = 1
- [ ] BYE com score 0
- [ ] Ordenacao decrescente; desempate por mesa
- [ ] Smoke tests de normalizacao, scoring e round-resolution passam

### Match CP

- [ ] Prioridade: exato > normalizado > token > not-found/ambiguous
- [ ] Ambiguos contabilizados em stats

### UI

- [ ] Tabela com 7 colunas conforme RN-27 a RN-29
- [ ] Filtros com default top25
- [ ] 5 cards de estatisticas
- [ ] Estados vazios da secao 11 reproduzidos

### Dados

- [ ] Modelo interno conforme secao 6, independente de fonte externa
- [ ] Pairings deduplicados e ordenados por mesa
- [ ] 500+ mesas produzem ranking completo apos import manual

### Fontes

- [ ] CP importa da API oficial Play! Pokemon e persiste snapshot local
- [ ] Refresh de partidas nao busca CP externo
- [ ] Lista de recentes usa PokéData `standingsVGC` como fonte primaria v1
- [ ] Standings/pairings usam JSON do PokéData como fonte primaria v1
- [ ] CSV/JSON manual e aceito como fallback para CP
- [ ] RK9 fica preservado como `sourceUrl`/referencia para adapter futuro

---

## 13. Divergencias vs. projeto Lakebed

| Aspecto | Lakebed (atual) | Rebuild (v1) |
|---------|-----------------|--------------|
| Entrada de torneio | Formulario ID/URL | Lista de recentes only |
| Refresh | Auto quando `needsPairingsRefresh` | Tudo manual |
| Overrides | UI de correcao | Removido |
| Divisoes | 3 opcoes | Masters only |
| Auth | Sessao Lakebed | Removido |
| CP import | Script externo + chunking via PokéData | Import separado/admin via API oficial Play! Pokemon; CSV/JSON manual como fallback |
| Logica de dominio | `shared/` portavel | Reutilizar/adaptar `shared/` |

---

## 14. Pontos em aberto

- Default exato da janela de recentes (24 h vs 36 h vs 48 h)
- Priorizar pendentes no ranking (hoje nao prioriza)
- Manter historico de refresh runs na UI ou remover

---

**Referencias de codigo auditadas:**

`shared/domain.ts`, `shared/parsing.ts`, `shared/round-resolution.ts`, `shared/scoring.ts`, `shared/leaderboard-index.ts`, `shared/match-player.ts`, `shared/smoke-test.ts`, `server/index.ts`, `client/index.tsx` (projeto original em `../vgc-feature-finder/`).
