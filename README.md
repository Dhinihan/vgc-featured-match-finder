# VGC Featured Match Finder

Rebuild do [vgc-feature-finder](../vgc-feature-finder) sem Lakebed.

## Documentação

- **[PRD.md](./PRD.md)** — regras de negócio, modelo de dados e critérios de aceite (v1)
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** — estratégia de deploy, persistência e cache para baixo volume

## Referência

A lógica de domínio portável do projeto original está em:

```
../vgc-feature-finder/vgc-featured-match-finder/shared/
```

Módulos candidatos a copiar/adaptar: `domain.ts`, `parsing.ts`, `scoring.ts`, `round-resolution.ts`, `leaderboard-index.ts`, `match-player.ts`, `normalize-player-name.ts`, `normalize-country.ts`, `smoke-test.ts`.
