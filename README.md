# VGC Featured Match Finder

Rebuild do [vgc-feature-finder](../vgc-feature-finder) sem Lakebed.

Ferramenta para espectadores de torneios VGC: ranqueia as partidas da rodada em
andamento pelo produto de Championship Points (`CP_A × CP_B`).

## Documentação

- **[PRD.md](./PRD.md)** — regras de negócio, modelo de dados e critérios de aceite (v1)
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** — estratégia de deploy, persistência e cache para baixo volume

## Stack

- Next.js (App Router) + TypeScript
- Postgres (Neon) + Drizzle ORM
- Vitest para testes de domínio

## Setup local

```bash
npm install
cp .env.example .env.local   # preencha DATABASE_URL e ADMIN_REFRESH_SECRET
npm run db:migrate           # aplica as migrations no banco
npm run dev                  # http://localhost:3000
```

Comandos:

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Build e serve de produção |
| `npm run db:generate` | Gera migration a partir de `src/db/schema.ts` |
| `npm run db:migrate` | Aplica migrations (pasta `drizzle/`) |
| `npm test` | Testes unitários/smoke das regras do PRD |

## Validando o fluxo principal

1. **Importar CP** (snapshot separado, nunca roda no refresh de partidas):
   pela seção "Administração" da UI, ou via curl:

   ```bash
   curl -X POST -H "x-admin-secret: $ADMIN_REFRESH_SECRET" \
     http://localhost:3000/api/admin/import-cp
   ```

   Pagina a API oficial Play! Pokémon (VG Masters global 2026, `page_size=300`)
   e persiste um novo snapshot em `championship_points_snapshots/_players`.

2. **Abrir a UI** — a lista de torneios Masters recentes vem do índice
   PokéData (`standingsVGC`), com cache em banco (TTL `RECENT_EVENTS_TTL_SECONDS`).

3. **Selecionar um torneio** — o dashboard lê só do banco (zero chamadas externas).

4. **Atualizar partidas** — importa standings/pairings da rodada alvo do JSON
   PokéData. Cache-first: snapshot fresco da rodada atual
   (`ACTIVE_ROUND_TTL_SECONDS`) evita nova chamada; rodadas finalizadas não são
   reimportadas. Reimportação forçada: `POST /api/events/{id}/refresh` com body
   `{"force":true}` e header `x-admin-secret`.

5. **Ver o ranking** — tabela ordenada por `CP_A × CP_B` (CP ausente = 1, BYE = 0),
   filtros Todas / Com placar / Somente pendentes / Ocultar CP ausente / Top 10 /
   Top 25 (default).

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/events` | Torneios Masters recentes (janela `RECENT_EVENTS_WINDOW_HOURS`) |
| GET | `/api/events/{externalEventId}/dashboard` | Dashboard do evento (só banco) |
| POST | `/api/events/{externalEventId}/refresh` | Atualiza partidas; `{"force":true}` exige `x-admin-secret` |
| POST | `/api/admin/import-cp` | Importa snapshot de CP; exige `x-admin-secret` |

## Decisões/simplificações da v1 dev

- **Atividade de evento (RN-08):** o índice PokéData só expõe o intervalo de
  datas do evento; um torneio é "recente" se `agora` está entre o início do
  evento e o fim do último dia + `RECENT_EVENTS_WINDOW_HOURS`.
- **Rodada ao vivo:** detectada apenas pelo JSON de standings (RN-11); o HTML
  do PokéData não é consultado (RN-12 coberta por `resolveCurrentRound`, não usada no fluxo).
- **Snapshot de rodada:** `event_round_snapshots.raw_payload` guarda os pairings
  normalizados extraídos (não o JSON bruto de ~600 KB), com `source_hash` do bruto.
- **Match CP:** derivado na leitura do dashboard a partir do snapshot de CP mais
  recente (sem tabela de cache `player_cp_matches` na v1).
- **Nomes truncados da API oficial:** ~14% do ranking vem com sobrenome
  abreviado ("Giuseppe M") ou sem o segundo sobrenome ("Álex Gomez"); o cascade
  RN-17 ganhou dois fallbacks (inicial de sobrenome e prefixo de nome) que
  preferem o país e exigem candidato único. Apelidos ("marcofieroVGC") seguem
  `not-found`.
- **Auto-carregamento na seleção** (além do PRD, que é 100% manual): ao
  selecionar um torneio sem dados locais ou com rodada defasada, a UI dispara a
  atualização sozinha — o cache-first do servidor protege as fontes. O botão
  "Atualizar partidas" continua sendo o único jeito de revalidar dados já
  carregados. A última seleção fica em `localStorage` e é restaurada ao abrir;
  com um único torneio recente, ele é selecionado direto.
- **Mobile:** abaixo de 720 px a tabela vira cards de partida (persona
  principal é o espectador de celular no evento).
- **Ambíguo usa o maior CP** (divergência deliberada do PRD, que zera o CP):
  preferimos um falso positivo a esconder uma mesa relevante; o status
  "ambíguo" continua visível nas stats e no subtexto da tabela.
- **Happy Eyeballs:** `src/sources/http.ts` aumenta o
  `autoSelectFamilyAttemptTimeout` do Node — o connect até o PokéData (~300 ms)
  estoura o default de 250 ms e o `fetch` falharia com `ETIMEDOUT`.

## Referência

A lógica de domínio portável do projeto original está em
`../vgc-feature-finder/vgc-featured-match-finder/shared/` (`domain.ts`,
`parsing.ts`, `scoring.ts`, `round-resolution.ts`, `leaderboard-index.ts`,
`match-player.ts`, etc.) e foi portada para `src/domain/` (sem overrides
manuais, fora do escopo v1).
