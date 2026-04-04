# Sendro Monorepo

Fundação do monorepo Sendro com pnpm workspaces + Turborepo.

## Workspace

- `apps/api` — API Fastify + tRPC + Better Auth
- `apps/dashboard` — Dashboard Next.js
- `packages/db` — schema Drizzle + client
- `packages/shared` — tipos e schemas compartilhados

## Requisitos locais

- Node.js 22+
- pnpm 10+
- Docker / Docker Compose
- Bash disponível para scripts de verificação

## Comandos principais da slice S01

```bash
pnpm install
pnpm build
pnpm test
pnpm test:workspace
pnpm verify:s01
pnpm --filter api dev
pnpm --filter dashboard dev
pnpm --filter @repo/db db:generate
pnpm --filter @repo/db db:migrate
```

## Banco local

Suba o PostgreSQL local:

```bash
docker compose up -d postgres
```

## Variáveis de ambiente esperadas nas próximas tasks

Copie `.env.example` quando os próximos tasks exigirem integração real de API/dashboard/db.
