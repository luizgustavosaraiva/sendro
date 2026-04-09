# Sendro Landing Page Design Spec

## Context

This spec defines the first-pass landing page design for Sendro inside `D:\Projetcs\sendro\.pencil\sendro.pen`, using the existing shadcn-based design system already present in the file.

The design is grounded in `PROJECT.md`, especially these product truths:

- Sendro is a B2B SaaS for on-demand local delivery dispatch.
- The product serves a broad delivery market: courier operators, local commerce, restaurants, pharmacies, e-commerce, and similar delivery-dependent businesses.
- The core value proposition combines intelligent dispatch, operational visibility, and WhatsApp-first execution.
- The dashboard is an operational control surface, but the product should also feel accessible to users who can operate through WhatsApp without living inside the dashboard.

## Design Goal

Create a landing page that positions Sendro as:

> the effective solution for intelligent deliveries, with the accessibility of WhatsApp and the control of a real operations platform.

The page must convert both users who want to start quickly and users who need commercial confidence before adopting the system.

## Primary Conversion Strategy

- **Primary CTA:** `Começar com a Sendro`
- **Secondary CTA:** `Falar no WhatsApp`

This pairing reflects the approved dual-intent strategy:

- immediate product entry
- low-friction commercial/contact path through WhatsApp

## Audience

The page should intentionally speak to a broad delivery market, not a single vertical.

### Core audience segments

- courier companies
- local commerce operators
- restaurants and pharmacies
- any business that depends on local delivery operations

### Positioning implication

The message should not overfit one niche. It should feel broad enough to capture anyone with delivery pain, while still sounding operationally credible.

## Approved Creative Direction

### Direction name

**Hybrid command flow**

### Meaning

- WhatsApp is the primary emotional and visual entry point.
- The dashboard remains visibly important as the control and intelligence layer.
- The page should never read as “just a WhatsApp automation tool.”
- The page should never become “just another dashboard SaaS page” either.

### Desired perception

Visitors should understand:

1. the product is easy to adopt because it works through WhatsApp,
2. the product is smart because dispatch is organized and automated,
3. the product is trustworthy because the dashboard gives visibility, auditability, and operational control.

## Core Messaging

### Headline direction

Approved base headline:

**Entregas inteligentes com a simplicidade do WhatsApp e o controle que sua operação precisa.**

### Supporting narrative

The product promise should combine these ideas:

- intelligent dispatch
- easy access through WhatsApp
- centralized control
- operational confidence
- broad applicability across delivery-dependent businesses

### Messaging constraints

- Avoid generic startup language.
- Avoid sounding like only a courier backoffice.
- Avoid sounding like only a chat automation product.
- Use operationally grounded language.

## Visual Direction

### Base style

Use a **minimal, premium shadcn-style system** as the structural language.

Characteristics:

- clean spacing
- quiet card surfaces
- clear typography hierarchy
- restrained borders
- crisp CTA hierarchy
- light-first composition with selective contrast sections

### Brand tokens for implementation

Use the canonical brand values from `PROJECT.md` directly when translating the design into the existing shadcn-based system:

- deep blue trust base: `#1B2A4A`
- logistics gradient accents: `#2A7FFF → #3DDC84 → #FF7A18`
- background: `#FFFFFF`
- primary text: `#1F2937`
- border tone: `#E5E7EB`
- typography: `Inter` or `Poppins`

The shadcn design language remains the structural base, but these brand values should guide the visual overrides and accent moments.

### Brand energy layer

Bring Sendro brand energy through accents rather than full-page saturation.

Use these brand ideas from `PROJECT.md`:

- deep blue trust base
- logistics gradient accents: blue → green → orange

Apply the accents in:

- hero highlights
- badges
- flow lines / motion cues
- glow treatments
- important emphasis moments

Do **not** flood the full page with gradients. The foundation must stay sophisticated and legible.

### Visual hierarchy rule

- WhatsApp = accessibility, movement, adoption
- Dashboard = control, seriousness, proof

In the hero, WhatsApp should own the **first visual read**, but the dashboard must still occupy at least one clearly visible and meaningful secondary surface. Neither layer can disappear into decoration.

## Hero Section Specification

### Objective

Compress the entire value proposition into the first fold.

### Layout

- left or left-centered text block
- dominant visual composition to the right / center-right
- WhatsApp visual as the primary layer
- dashboard visual integrated as the control layer behind or beside it

### Content

- eyebrow/badge introducing dispatch intelligence or WhatsApp-first operations
- main headline
- supporting paragraph
- primary and secondary CTAs
- small proof line or audience line below CTAs

### Visual composition

The hero visual should show a believable delivery workflow such as:

- incoming order or request
- driver offer via WhatsApp
- acceptance/confirmation state
- dashboard cards showing queue, metrics, or status monitoring

The WhatsApp side should feel lively and familiar.
The dashboard side should feel calm, controlled, and authoritative.

## Full Landing Architecture

The approved landing structure is:

1. Header / navigation
2. Hero
3. Credibility / audience strip
4. Market problem / operational pain
5. How it works flow
6. WhatsApp-first operations section
7. Dashboard / control center section
8. Benefits by audience type
9. KPI / proof section
10. FAQ
11. Final CTA

## Section-by-Section Intent

### 1. Header

Minimal top bar.

Should include:

- Sendro brand
- a few concise nav links
- one visible CTA

Should not feel crowded or app-like.

Header should use only **one** CTA. The full primary/secondary CTA pair belongs in the hero and final CTA sections.

### 2. Hero

Sell the combined promise:

- easy adoption through WhatsApp
- intelligent delivery orchestration
- operational control

### 3. Credibility / audience strip

Signal breadth of applicability.

Examples of content types:

- “feito para couriers, comércio local, restaurantes e operações de entrega em crescimento”
- trust statements
- simple market-fit badges

### 4. Problem section

Frame the market pain:

- dispatch chaos
- fragmented communication
- lack of control over execution
- poor visibility of delivery status

This should justify the need for Sendro before deeper feature explanation.

### 5. How it works

Explain the delivery flow in 3–4 steps.

Recommended sequence:

1. pedido entra
2. despacho acontece com inteligência
3. entregador responde / executa
4. operação acompanha e fecha com visibilidade

### 6. WhatsApp-first section

This section should prove the accessibility thesis.

Message:

**Lojistas e entregadores operam no canal que já conhecem.**

It should emphasize:

- familiarity
- reduced friction
- fast adoption
- population-scale accessibility

### 7. Dashboard / control center section

This section should prove the control thesis.

Message:

**Sua operação continua sob controle, com fila, status, métricas e capacidade de intervenção.**

It should emphasize:

- queue visibility
- monitoring
- exception handling
- metrics
- confidence for operators

It must also signal:

- auditability
- intervention capacity
- delivery evidence / operational traceability

The dashboard proof should not feel like generic analytics software. It should feel like a delivery operations control center.

### 8. Benefits by audience

This section should be organized by operator type instead of feature bucket.

Recommended groupings:

- Para couriers
- Para comércio local
- Para restaurantes e farmácias

This helps the page stay broad without sounding vague.

### 9. KPI / proof section

A visual proof band that makes the platform feel effective and measurable.

Possible content patterns:

- dispatch speed
- response visibility
- operations overview
- completion confidence

The purpose is not to invent hard metrics, but to visually express measurable operational gains.

Do **not** use fabricated percentages, delivery counts, customer logos, or benchmark claims. Prefer qualitative proof surfaces such as:

- queue states
- response states
- operational summaries
- audit trail hints
- delivery evidence cues
- status cards that imply control and visibility

### 10. FAQ

Use accordion pattern.

Questions should reduce adoption hesitation, especially around:

- who Sendro is for
- whether WhatsApp replaces the dashboard
- whether the platform supports different delivery operations
- how quickly teams can start using it

These question themes are mandatory for the first design pass, even if the exact wording is finalized during composition.

### 11. Final CTA

End with a strong conversion block that reinforces simplicity + intelligence.

Suggested direction:

**Comece a organizar suas entregas com inteligência, sem complicar a operação.**

## Microcopy Directions

### Approved CTA pair

- `Começar com a Sendro`
- `Falar no WhatsApp`

### Supporting section copy themes

- “Receba pedidos, despache com inteligência, acompanhe a execução e finalize com visibilidade total.”
- “Lojistas e entregadores operam no canal que já conhecem.”
- “Sua operação continua sob controle, com fila, status, métricas e capacidade de intervenção.”

### KPI/proof label rule

KPI and proof labels must be qualitative UI labels, not numeric claims that imply real customer performance data.

## Design System Usage in `sendro.pen`

The file already contains a reusable shadcn-style component set.

Primary reusable components likely to be used:

- `Button/*`
- `Badge/*`
- `Card`
- `Accordion/Open`
- `Sidebar` (reference only if useful for dashboard mock composition)
- table/card-related primitives for dashboard proof surfaces

### Implementation rule

Use the existing shadcn system as the structural base and build custom hero/flow compositions with frames around it, rather than inventing a completely separate visual language.

## Composition Rules

- Keep the page polished and premium, not loud.
- Use whitespace generously.
- Use contrast sections sparingly for rhythm.
- Let the hero do the heavy lifting.
- Make the CTA the strongest accent target.
- Preserve the balance: WhatsApp should lead, dashboard should validate.

## Non-Goals

- Do not design a generic corporate site.
- Do not make the page feel like a dashboard screenshot gallery.
- Do not reduce the product to a WhatsApp bot.
- Do not over-style the page at the expense of clarity.
- Do not imply route optimization, real-time tracking maps, native mobile apps, or future AI capabilities beyond the approved dispatch-intelligence positioning in `PROJECT.md`.

## Deliverable for Pencil Phase

Create a new landing page frame inside `sendro.pen` that:

- clearly differs from the existing dashboard examples
- uses the file’s shadcn design system
- reflects Sendro’s approved narrative and brand energy
- is visually conversion-ready, not just a loose wireframe

## Open Questions Deferred to Execution

These can be finalized during the Pencil build phase if needed:

- exact nav labels
- whether the hero is left-heavy or center-split after composition testing
- whether one section should use a dark surface variant for rhythm
