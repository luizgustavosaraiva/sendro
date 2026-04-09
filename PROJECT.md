# Sendro — Definição Canônica do Projeto

> **Documento de referência**: Este arquivo é a fonte de verdade consolidada do projeto Sendro para o repositório. Divergências entre fontes estão explicitamente documentadas na seção [Divergências e Reconciliação](#divergências-e-reconciliação).

---

## O que é o Sendro

Plataforma SaaS B2B de despacho de entregas sob demanda. Conecta empresas de courier, lojistas e entregadores por superfícies web SSR e por operação conversacional no WhatsApp.

**Fluxo operacional core:**

```
Cliente → Bot WhatsApp → Lógica de Despacho → Entregador → Confirmação de Entrega
```

**Proposta de valor:**

A operação de entrega é company-scoped, auditável e executável de ponta a ponta: criação, dispatch automático, resposta do entregador, fechamento com evidência e visibilidade operacional para intervenção — com canal WhatsApp para lojistas e entregadores operarem sem o dashboard.

---

## Posicionamento e Marca

**Nome**: Sendro (Send + Ro — "motor que transforma solicitações em entregas organizadas")

**Tagline principal**: Sendro — Despacho Inteligente de Entregas

**Taglines alternativas**: "O cérebro das suas entregas" / "Entregas organizadas"

**Usuários-alvo**: empresas de entrega local, restaurantes, farmácias, lojas de e-commerce, operadores de frota

### Paleta de Cores

| Papel | Cor | Hex |
|-------|-----|-----|
| Confiança / Tecnologia | Azul Profundo | `#1B2A4A` |
| Gradiente logístico — início | Azul | `#2A7FFF` |
| Gradiente logístico — meio | Verde | `#3DDC84` |
| Gradiente logístico — fim | Laranja | `#FF7A18` |
| Fundo | Branco | `#FFFFFF` |
| Texto | Cinza escuro | `#1F2937` |
| Bordas | Cinza claro | `#E5E7EB` |

**Tipografia**: Inter ou Poppins

**Mascote**: Sendro Pilot — piloto robótico minimalista, usado em onboarding, docs e mensagens do bot

**Conceito de logo**: seta abstrata formada por múltiplas trilhas de movimento

---

## Arquitetura do Produto

Monorepo com quatro componentes principais:

| Módulo | Tecnologias | Responsabilidade |
|--------|-------------|-----------------|
| `apps/api` | Fastify + tRPC + Better Auth + Stripe + OpenAI | API backend: entregas, despacho, autenticação, webhooks, billing |
| `apps/dashboard` | Node.js SSR com HTML string renderers | Interface operacional: fila de despacho, gestão de entregadores, relatórios, billing |
| `packages/db` | Drizzle ORM + PostgreSQL | Schema e client de banco de dados |
| `packages/shared` | Zod | Tipos e schemas compartilhados entre API e dashboard |

> **Atenção**: `apps/dashboard` é um servidor Node.js SSR puro com HTML string renderers. Não é React, não é Next.js. Ver [Divergências D1](#d1--stack-do-dashboard).

**Tooling do monorepo**: pnpm workspaces + Turborepo

**Deployment**: Dokploy com Dockerfiles por app

### Entidades Principais do Domínio

| Entidade | Descrição |
|----------|-----------|
| **Empresa** | Operador de courier; escopo de toda a operação de entrega |
| **Lojista** | Cria entregas (retailer) |
| **Entregador** | Driver — aceita e executa entregas |
| **Vínculo** | Relação many-to-many explícita entre entidades |
| **Entrega** | Ciclo de vida imutável com timeline append-only |
| **Strike** | Progressão de punição (1=aviso, 2=suspensão, 3=revogação), company-scoped |
| **Pricing Rule** | Regra de precificação por região/tipo/classe de peso |
| **Dispatch** | Ranking de candidatos + sequenciamento de ofertas + reprocessamento por timeout |

---

## Estado Atual

**Fase**: M004 com S01-S04 entregues e verificados, aguardando closeout formal.

| Milestone | Status | Escopo |
|-----------|--------|--------|
| M001: Fundação | ✅ Completo | Auth, perfis, vínculos, convites, entregas base |
| M002: Dispatch Engine | ✅ Completo | Fila, tentativas, resposta do entregador, strikes, proof-of-delivery, dashboard |
| M003: WhatsApp Bot | ✅ Completo | Sessões, intake, resposta de oferta, stubs de providers (Evolution Go, WAHA, Z-API, Meta) |
| M004: Billing & Analytics | 🔄 S01-S04 completos | Pricing rules, Stripe Connect, billing report, catálogo Stripe |

### Detalhes do M004

- **S01**: pricing rules persistidas e consumidas no dispatch com `priceScore` determinístico
- **S02**: Stripe Connect Express onboarding + webhook truth com gating por `charges_enabled && payouts_enabled`
- **S03**: billing report com derivação financeira determinística e KPIs gross/net no operations summary
- **S04**: sync de catálogo Stripe no save/update de pricing rule com persistência de `stripeProductId`/`stripePriceId`

**Próximo foco**: closeout formal de M004 (VALIDATION + MILESTONE-SUMMARY), depois planejar milestone de execução de pagamentos (charge/transfer) sobre os contratos já estabilizados.

---

## Requisitos

### Validados (entregues e verificados)

| ID | Descrição |
|----|-----------|
| R006 | Ciclo de vida imutável de entrega com eventos append-only |
| R009 | Ranking company-scoped determinístico persistido nos metadados da fila |
| R010 | Reprocessamento por timeout com progressão de strike e fallback |
| R011 | Resposta do entregador transacional com resolução exact-once |
| R012 | Persistência de strike append-only com consequências progressivas |
| R013 | Conclusão de entrega com proof-of-delivery e enforcement de política |
| R014 | Dashboard operacional SSR com estados de diagnóstico explícitos |
| R020 | Superfície web operacional para entregadores sem dependência de WhatsApp |

### Ativos (M004 — entregues, aguardando fechamento formal)

| ID | Descrição |
|----|-----------|
| R021 | Pricing rules por região/tipo/peso; dispatch consome regras para `priceScore` |
| R022 | Stripe Connect Express onboarding; gating por webhook truth (`charges_enabled + payouts_enabled`) |
| R023 | Billing reports + KPIs (gross/net) derivados de entregas concluídas com filtro de período |
| R024 | Save de pricing rule sincroniza Product/Price no Stripe, persiste IDs para cobrança futura |

---

## Restrições e Fora de Escopo

### Restrições Operacionais

- Dashboard é um servidor Node.js SSR puro com HTML string renderers — **não é React/Next.js**
- Sincronização de catálogo Stripe é exclusivamente nas mutations de API (`createPricingRule`/`updatePricingRule`)
- Runtime verifiers devem validar assinatura HTML Sendro antes de confiar em HTTP 200 em ambientes compartilhados
- Migrações Drizzle locais devem estar em sincronia com os arquivos SQL commitados

### Fora de Escopo (v1)

| Capacidade | Motivo do Deferimento |
|------------|----------------------|
| Apps mobile nativos (iOS/Android) | Estratégia web + WhatsApp-first para v1 |
| Execução transacional de cobrança/transferência Stripe (PaymentIntent/Checkout/transfers) | Deferida para milestone posterior (D044) |
| Otimização de rotas e despacho com IA | Capacidade futura explícita |
| Marketplace de entregadores | Fase posterior após estabilização do fluxo operacional core |
| Landing page | Tratada como slice opcional de follow-up (D045) |

---

## Glossário Operacional

| Termo | Definição |
|-------|-----------|
| **Empresa** | Operador de courier, escopo da operação de entrega |
| **Lojista** | Criador de entregas (retailer) |
| **Entregador** | Driver — aceita e executa entregas |
| **Vínculo** | Relação many-to-many explícita entre entidades |
| **Dispatch** | Ranking automático + sequenciamento de ofertas + reprocessamento por timeout |
| **Pricing Rule** | Regra de precificação company-scoped por região/tipo/classe de peso |
| **priceScore** | Score numérico determinístico calculado da regra de pricing no dispatch |
| **Stripe Connect** | Modelo de cobranças e transferências separadas para plataforma |
| **Webhook Truth** | Eventos `account.updated` do Stripe como fonte de verdade para estado de conexão |
| **Proof-of-Delivery** | Timestamp + nota + referência de foto + evento `delivered` no closeout |
| **Strike** | Punição progressiva gerenciada pela plataforma (aviso → suspensão → revogação), company-scoped |
| **Bond** | Estado de operabilidade do entregador na empresa (active/suspended/revoked) |
| **SSR** | Server-Side Rendering — dashboard é HTML-first, não SPA/React |
| **Delivery Event** | Entrada imutável append-only na timeline com actor/timestamp/metadata |
| **Slice** | Entrega vertical de feature dentro de um milestone |

---

## Divergências e Reconciliação

Esta seção documenta conflitos identificados entre fontes consultadas, com decisão de reconciliação explícita para cada um.

### D1 — Stack do Dashboard

| Fonte | Afirmação |
|-------|-----------|
| `README.md` | `apps/dashboard — Dashboard Next.js` |
| `DECISIONS.md D002-rev` | Next.js 16.2.2 + TailwindCSS + ShadCN UI + tRPC + Better Auth |
| `.gsd/KNOWLEDGE.md` (linha 4) | "NOT React/Next.js — plain Node.js HTTP server with HTML string renderers" |
| `.gsd/PROJECT.md` | "Web: Node.js SSR HTML renderer (dashboard) — NOT React/Next.js" |

**Reconciliação**: A realidade da implementação (KNOWLEDGE.md + PROJECT.md .gsd) é a fonte de verdade. O README.md e D002-rev refletem a intenção original de arquitetura que foi substituída durante a implementação do M001. Este documento adota a implementação real: **dashboard é Node.js SSR puro com HTML string renderers**.

### D2 — Status do M004

| Fonte | Afirmação |
|-------|-----------|
| `STATE.md` | phase: `complete`, M004 marcado como concluído |
| `.gsd/PROJECT.md` | "S01-S04 concluídos; aguardando validação/closeout" |

**Reconciliação**: Diferença temporal entre arquivos — STATE.md foi atualizado após .gsd/PROJECT.md. Ambos estão corretos: os slices estão entregues e verificados (STATE.md), porém o artefato formal de closeout (MILESTONE-SUMMARY + VALIDATION) ainda está pendente (PROJECT.md). Este documento reflete: **M004 slices completos, fechamento formal pendente**.

### D3 — Visão Futura vs. Escopo Atual

| Fonte | Afirmação |
|-------|-----------|
| Textos estratégicos do usuário | Inclui otimização de rotas, despacho com IA, marketplace, apps mobile como capacidades da plataforma |
| `.gsd/REQUIREMENTS.md` + `DECISIONS.md D044/D045` | Essas capacidades são explicitamente deferidas/fora do escopo v1 |

**Reconciliação**: Os textos estratégicos descrevem a visão de longo prazo do produto. As decisões .gsd definem o escopo corrente. Este documento separa claramente "Estado Atual" (o que está implementado) de "Visão de Futuro" (roadmap de longo prazo).

---

## Visão de Futuro

Capacidades planejadas para fases posteriores, fora do escopo v1:

- Execução transacional de cobranças e transferências Stripe
- Otimização de rotas
- Despacho com IA
- Gestão de frotas
- Rastreamento em tempo real
- Marketplace de entregadores

**Objetivo de longo prazo**: tornar-se a plataforma na qual empresas confiam para operar suas entregas — o que Stripe representa para pagamentos, mas para entregas.

---

## Fontes

Fontes consultadas na elaboração deste documento:

| Arquivo | Papel |
|---------|-------|
| `D:\Projetcs\sendro\README.md` | Estrutura do monorepo e setup local |
| `C:\Users\gustavo\.gsd\projects\8a580e6d0a5f\PROJECT.md` | Definição canônica de produto (trilha GSD) |
| `C:\Users\gustavo\.gsd\projects\8a580e6d0a5f\REQUIREMENTS.md` | Contrato de capacidade (R006–R024) |
| `C:\Users\gustavo\.gsd\projects\8a580e6d0a5f\DECISIONS.md` | Registro de decisões (D001–D058+) |
| `C:\Users\gustavo\.gsd\projects\8a580e6d0a5f\KNOWLEDGE.md` | Padrões operacionais e restrições |
| `C:\Users\gustavo\.gsd\projects\8a580e6d0a5f\STATE.md` | Snapshot de estado do GSD |
| Textos estratégicos de produto e marca fornecidos pelo usuário (April 2026) | Posicionamento, marca, visão de futuro |
