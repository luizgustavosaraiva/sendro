# Sendro WhatsApp Hybrid Agent Design

## Status

Approved for specification. Implementation not started.

## Purpose

This spec defines the redesign of the Sendro WhatsApp bot from a field-collection flow into a hybrid conversational agent with deterministic operational execution.

The target behavior is:

- natural conversation with known retailers;
- concise responses with only the necessary next step;
- explicit continuation vs restart decisions;
- early visibility of operational blockers;
- room for future incident handling without collapsing conversation and operations into one state machine.

## Background

Sendro is a B2B delivery operations platform where WhatsApp is a first-class operator channel. Retailers should be able to request deliveries through conversation without using the dashboard, while drivers can still handle controlled operational replies through WhatsApp.

The current implementation already has:

- WhatsApp webhook intake via `apps/api/src/routes/whatsapp/webhook.ts`;
- session management and message routing via `apps/api/src/lib/whatsapp/sessions.ts`;
- retailer intake flow via `apps/api/src/lib/whatsapp/intake.ts`;
- driver flow via `apps/api/src/lib/whatsapp/driver.ts`;
- contact mappings and session state in PostgreSQL via `packages/db/src/schema/whatsapp.ts`.

## Current Problems

### 1. The LLM has the wrong role

The current retailer flow uses the LLM primarily as a slot extractor for `pickupAddress`, `dropoffAddress`, and `externalReference`, while the real conversation is still governed by a small phase machine in `intake.ts`.

This means the model is not deciding:

- whether the retailer is starting a new delivery;
- continuing the current draft;
- correcting the draft;
- cancelling the draft;
- asking a side question;
- or actually needing commercial onboarding.

### 2. Unsafe fallback heuristics produce unnatural behavior

The current intake flow allows arbitrary text to become delivery fields when confidence is not established. In particular, once a pickup exists, free text may be treated as a delivery address.

This causes brittle behavior such as greetings or vague phrases being interpreted as logistics payload.

### 3. Operational blockers are surfaced too late

Retailer eligibility is enforced only when `createDelivery()` runs, through `assertRetailerHasActiveBond()` in `apps/api/src/lib/bonds.ts`, which can make the conversation appear successful until the final confirmation step.

### 4. Memory is too small and too implicit

The current `conversation_states` table stores only:

- `phase`
- `collected_fields`
- `last_processed_message_id`

This is insufficient for a conversational assistant that must decide between continuing and restarting a conversation naturally.

## Design Goals

The redesigned bot must:

1. act as an operational agent for known retailers;
2. act as a commercial/CTA entrypoint for unknown contacts;
3. remain deterministic for operational actions;
4. persist only lightweight, task-relevant memory;
5. support future incident flows such as driver accident or mid-route cancellation;
6. keep infrastructure simple at the current stage.

## Non-Goals

This redesign does not include:

- CRM implementation in this phase;
- pgvector or semantic retrieval;
- Redis-backed conversation sessions;
- autonomous agent loops with unrestricted tool execution;
- replacing Evolution Go;
- redesigning billing or dashboard architecture.

## Product Model

The WhatsApp channel must serve three product roles:

1. **Operational agent for known retailers**
   - create delivery drafts;
   - update drafts;
   - confirm/cancel drafts;
   - explain operational blockers;
   - eventually react to incidents and delivery status questions.

2. **Operational interface for drivers**
   - remain more controlled than retailer conversation;
   - keep critical transitions deterministic.

3. **Commercial entrypoint for unknown contacts**
   - provide a lightweight CTA;
   - qualify interest briefly;
   - prepare future CRM/lead handoff.

## Target Architecture

The recommended architecture is a hybrid model with four primary blocks.

### 1. Contact Resolver

Runs before any LLM interpretation.

Responsibilities:

- normalize WhatsApp identity;
- resolve known vs unknown contact;
- resolve role (`retailer`, `driver`, `unknown`);
- resolve `companyId`, `userId`, `retailerId`, `driverId` when available;
- load store context;
- load active conversation state;
- check early blockers such as inactive retailer/company bond.

Outputs:

- routing category (`known_retailer_operational`, `known_retailer_blocked`, `known_driver`, `unknown_contact`);
- compact conversation context;
- operational flags;
- store snapshot.

### 2. Conversation Brain (LLM Interpreter)

The model interprets the message but never executes the action.

Responsibilities:

- identify flow (`operational`, `acquisition`, `incident`);
- classify intent;
- propose slot updates to the draft;
- decide whether the user is continuing or restarting;
- draft a concise reply;
- request clarification when confidence is insufficient.

The LLM must be used for interpretation, not for direct mutations of deliveries, dispatch, incidents, or account state.

### 3. Conversation Engine

This is the deterministic policy layer.

Responsibilities:

- validate LLM output;
- apply/update/cancel/restart draft state;
- enforce blocker rules;
- decide whether to ask for clarification;
- decide whether explicit confirmation is required;
- route to operational action or acquisition path.

### 4. Action Executors

These remain deterministic and explicit.

Examples:

- `createDelivery()`
- `resolveDriverOffer()`
- `driverUpdateDeliveryStatus()`
- `completeDelivery()`
- future `createLead()` / `requestHumanHandoff()`
- future incident actions.

## Memory Strategy

### Decision

Use PostgreSQL-backed structured memory.

Do not introduce Redis now.

Do not introduce `pgvector` now.

### Rationale

The current problem is workflow continuity, not semantic retrieval.

The bot needs:

- retailer/store context;
- active draft state;
- recent short conversation window;
- continue vs restart decision support;
- blocker visibility.

This is operational memory, not retrieval memory. PostgreSQL is the right source of truth because persistence, auditability, and debuggability matter more than ultra-low-latency cache semantics.

## Memory Model

The memory model must be split into two persisted layers.

### A. Conversation State

Single authoritative row per active WhatsApp contact+company thread.

Responsibilities:

- authoritative conversation status;
- current flow;
- current intent;
- draft payload;
- store context snapshot;
- blocker state;
- stale/closure lifecycle metadata.

### B. Conversation Turns

Bounded short-term transcript for recent interpretation.

Responsibilities:

- preserve the last few meaningful turns;
- support continue vs restart decisions;
- support clarification and corrections;
- remain small enough to assemble prompts efficiently.

## Proposed Schema Evolution

### `conversation_states` (evolved)

The existing table in `packages/db/src/schema/whatsapp.ts` should be expanded conceptually into:

- `company_id`
- `contact_jid`
- `user_id` nullable
- `retailer_id` nullable
- `role_resolution`
- `conversation_mode`
- `current_flow`
- `current_intent`
- `draft_payload` JSONB
- `context_snapshot` JSONB
- `blocked_reason` nullable
- `status`
- `last_processed_message_id`
- `started_at`
- `last_user_message_at`
- `last_bot_message_at`
- `stale_at`
- `closed_at`
- `created_at`
- `updated_at`

### `conversation_turns` (new)

New short-term transcript table with:

- `id`
- `conversation_state_id`
- `company_id`
- `contact_jid`
- `role` (`user`, `assistant`, `system`)
- `message_text`
- `normalized_text` nullable
- `detected_intent` nullable
- `metadata` JSONB nullable
- `created_at`

The system should retain only a bounded recent window for runtime interpretation. Older rows may be archived or pruned later.

## Draft Payload

The draft must become the center of truth for operational conversation.

Example shape:

```json
{
  "pickupAddress": "Rua X",
  "dropoffAddress": "Rua Y",
  "reference": "pedido 123",
  "notes": "entregar na portaria",
  "source": {
    "pickupAddress": "store_default",
    "dropoffAddress": "user_message"
  },
  "completion": {
    "pickupAddress": true,
    "dropoffAddress": true,
    "reference": false,
    "notes": false
  },
  "lastConfirmedAt": null
}
```

The draft must be explicit, auditable, and server-owned.

## Context Snapshot

The conversation state should store a compact snapshot of the retailer/store context used for interpretation.

Example:

```json
{
  "storeName": "Loja da Nati",
  "defaultPickupAddress": "Esmeralda Zaccaro Salvador, 294",
  "companyName": "Sendro Courier",
  "bondStatus": "active",
  "knownContact": true
}
```

This avoids rebuilding full context from scratch on every turn and improves debugging.

## Lifecycle Model

### Conversation lifecycle

The conversation lifecycle must track dialogue state only:

- `active`
- `stale`
- `completed`
- `cancelled`
- `blocked`

### Operational/delivery lifecycle

Delivery lifecycle remains separate and continues to own delivery execution state:

- created
- dispatched
- accepted
- picked_up
- in_transit
- delivered
- cancelled
- failed

### Incident lifecycle

Future exceptions must not be squeezed into conversation state.

The system must eventually support an incident layer for:

- driver accident;
- mid-route cancellation;
- delivery failure;
- proof-of-delivery issues;
- redispatch-required conditions.

Suggested incident lifecycle:

- reported
- triaged
- awaiting_decision
- escalated
- resolved
- closed

## Continue vs Restart Rules

Every inbound message must be evaluated against three signals:

1. active/stale draft state;
2. interpreted user intent;
3. model confidence.

### Continue current draft when

- a draft exists;
- the conversation is active;
- the message is clearly about correction or continuation;
- confidence is sufficient.

### Restart when

- the user clearly requests a new order;
- the previous conversation is stale;
- or the current draft and new message are incompatible.

### Ask for clarification when

- draft exists but intent is ambiguous;
- confidence is medium/low for critical field mutation;
- or stale context makes continuation risky.

## Stale Session Rules

Stale must be explicit and user-visible.

Suggested defaults:

- operational draft: stale after ~30 minutes of inactivity;
- acquisition/commercial flow: stale after ~24 hours.

When a stale conversation resumes, the bot must not assume continuation automatically. It should ask a short question such as:

> “Você quer continuar o pedido anterior ou começar uma nova entrega?”

## LLM Contract

The model must output a compact, structured interpretation.

```ts
type AgentInterpretation = {
  flow: "operational" | "acquisition" | "incident";
  intent:
    | "new_delivery"
    | "update_draft"
    | "confirm_draft"
    | "cancel_draft"
    | "restart_draft"
    | "continue_draft"
    | "product_inquiry"
    | "lead_qualification"
    | "handoff_human"
    | "incident_report"
    | "status_question"
    | "unknown";
  confidence: "high" | "medium" | "low";
  shouldContinueDraft: boolean;
  shouldStartNewDraft: boolean;
  shouldAskClarification: boolean;
  slotUpdates?: {
    pickupAddress?: string;
    dropoffAddress?: string;
    reference?: string;
    notes?: string;
  };
  incidentHint?: {
    type?: "driver_accident" | "midroute_cancellation" | "delivery_failure" | "unknown";
    severity?: "low" | "medium" | "high";
  };
  reply: string;
};
```

## Behavioral Rules

The agent must follow these rules:

1. greetings do not become addresses;
2. low-confidence free text does not mutate critical fields silently;
3. one reply should advance exactly one useful step;
4. operational blockers must surface early;
5. the backend remains responsible for operational execution;
6. incidents must change flow, not be treated as normal intake.

## Unknown Contact Flow

Unknown contacts must not enter the retailer intake flow by default.

The bot must instead use a lightweight acquisition path:

- short CTA;
- 1–3 concise qualification questions;
- future lead creation support;
- optional human handoff.

This commercial flow is approved as part of the product design, but CRM implementation remains deferred.

## Driver Flow

Driver flow remains more constrained than retailer flow.

The same architecture principles apply, but critical transitions stay deterministic. The current command-based driver handling in `apps/api/src/lib/whatsapp/driver.ts` should remain the baseline and later be aligned with the new memory model rather than turned into an unconstrained assistant.

## Technology Decisions

### Keep

- Evolution Go as WhatsApp provider;
- Fastify + tRPC API;
- PostgreSQL + Drizzle ORM;
- OpenAI-compatible LLM provider interface using Ollama locally where desired;
- deterministic execution functions for delivery operations.

### Do not add now

- Redis for sessions or memory;
- pgvector;
- external CRM integration;
- heavyweight agent frameworks.

## Phased Delivery Plan

### Phase 1 — Hybrid retailer agent baseline

- replace slot-extractor contract with interpreter contract;
- enrich conversation state;
- add conversation turns;
- add draft payload;
- remove unsafe field fallback heuristics;
- move blocker checks earlier.

### Phase 2 — Resilient conversation lifecycle

- implement `active/stale/completed/cancelled/blocked`;
- stale handling and continue vs restart prompts;
- closure and reset rules;
- structured logs for interpretation and decisions.

### Phase 3 — Unknown contact commercial path

- resolve `unknown_contact` explicitly;
- CTA and short qualification;
- prepare future lead path;
- optional human handoff trigger.

### Phase 4 — Driver alignment

- align driver memory model where useful;
- preserve deterministic command safety.

### Phase 5 — Incident engine

- introduce incident model;
- integrate conversation, delivery, and incident flows;
- support operational exception handling.

## Acceptance Criteria

This redesign is considered successful when all of the following are true:

1. a known retailer can greet the bot without triggering bogus delivery fields;
2. the bot uses store context such as default pickup naturally and safely;
3. the bot can continue, restart, or clarify an open draft explicitly;
4. retailer-company blockers appear before final delivery confirmation;
5. unknown contacts do not enter retailer intake and instead receive acquisition behavior;
6. the bot persists enough short-term memory to resume safely after delay or restart;
7. delivery execution remains deterministic and server-controlled;
8. the architecture is ready for future incident handling without redesigning the conversation model again.

## Files Most Relevant to the Future Implementation

- `apps/api/src/routes/whatsapp/webhook.ts`
- `apps/api/src/lib/whatsapp/sessions.ts`
- `apps/api/src/lib/whatsapp/intake.ts`
- `apps/api/src/lib/whatsapp/driver.ts`
- `apps/api/src/lib/whatsapp/notifications.ts`
- `apps/api/src/lib/dispatch.ts`
- `apps/api/src/trpc/whatsapp-router.ts`
- `packages/db/src/schema/whatsapp.ts`
- future migration files under `packages/db/migrations/`

## Open Decisions Deferred to Implementation Planning

These are intentionally left for the implementation plan, not this spec:

- exact migration shape and backwards-compatibility path for `conversation_states`;
- whether `draft_payload` is embedded in `conversation_states` or partially normalized;
- exact pruning policy for `conversation_turns`;
- exact LLM prompt wording and structured output validation details;
- exact incident table schema and whether it reuses delivery events or a dedicated incident model.
