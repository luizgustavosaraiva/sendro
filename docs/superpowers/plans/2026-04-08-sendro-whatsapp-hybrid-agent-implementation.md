# Sendro WhatsApp Hybrid Agent Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Sendro WhatsApp bot into a hybrid conversational agent with deterministic delivery execution, lightweight PostgreSQL-backed memory, explicit continue-vs-restart behavior, and future-ready incident handling.

**Architecture:** Keep operational execution deterministic in the API while replacing the current slot-extractor intake flow with a structured conversation interpreter + engine. Persist only task-relevant memory in PostgreSQL via an evolved conversation state plus bounded conversation turns; do not introduce Redis, pgvector, or external CRM at this stage.

**Tech Stack:** Fastify, tRPC, TypeScript, PostgreSQL, Drizzle ORM, Evolution Go, OpenAI-compatible LLM provider via Ollama/OpenAI.

---

## Testing & Coverage Requirements

Test coverage is mandatory for this redesign.

### Minimum expectations

- Every new behavior in the retailer conversation engine must have automated tests.
- Every new persistence helper must have automated tests.
- Unknown-contact routing must have automated tests.
- Continue-vs-restart and stale-session behavior must have automated tests.
- Existing driver behavior must keep passing coverage-preserving compatibility tests.
- Regressions for the currently observed failures must be captured explicitly:
  - greeting must not become delivery fields;
  - blocked retailer must fail early with a meaningful bot response;
  - stale conversation must not silently continue as active.

### Coverage rule for execution

Implementation is not complete unless:

1. all targeted WhatsApp tests pass;
2. new code paths introduced by this redesign are exercised by tests;
3. at least one regression test exists for every bug or brittle behavior identified in the spec;
4. no task is closed with “manual QA only” where deterministic automated coverage is feasible.

### Priority test areas

- `apps/api/test/whatsapp-intake.test.ts`
- `apps/api/test/whatsapp-driver.test.ts`
- `apps/api/test/whatsapp-notification.test.ts`
- `apps/api/test/whatsapp-health.test.ts`
- `apps/api/test/whatsapp-conversation-engine.test.ts` (new)

---

## File Map

### Existing files to modify
- `packages/db/src/schema/whatsapp.ts` — evolve conversation state schema and add conversation turns table.
- `packages/db/src/schema/index.ts` — export new/evolved schema symbols.
- `apps/api/src/lib/whatsapp/sessions.ts` — insert Contact Resolver routing and new conversation engine entrypoint.
- `apps/api/src/lib/whatsapp/intake.ts` — shrink/replace current phase machine with retailer conversation engine integration.
- `apps/api/src/lib/whatsapp/driver.ts` — align driver state access with new schema shape while keeping deterministic command flow.
- `apps/api/src/routes/whatsapp/webhook.ts` — keep webhook stable but ensure normalized payload supports richer routing context.
- `apps/api/src/trpc/whatsapp-router.ts` — preserve contact registration flow and extend only if needed by new memory primitives.
- `apps/api/src/lib/dispatch.ts` — surface blocker/incident hooks only where needed; preserve deterministic delivery execution.
- `apps/api/test/whatsapp-intake.test.ts` — update/add tests for retailer flow.
- `apps/api/test/whatsapp-driver.test.ts` — update/add tests for driver compatibility.
- `apps/api/test/whatsapp-health.test.ts` — adapt to evolved session/state contract if impacted.

### New files to create
- `packages/db/migrations/00xx_conversation_memory.sql` — schema migration for new memory model.
- `apps/api/src/lib/whatsapp/contact-resolver.ts` — resolve known retailer, known driver, unknown contact, and blockers.
- `apps/api/src/lib/whatsapp/conversation-types.ts` — shared types for interpreter input/output, draft payload, context snapshot.
- `apps/api/src/lib/whatsapp/conversation-interpreter.ts` — LLM integration and structured interpretation contract.
- `apps/api/src/lib/whatsapp/conversation-engine.ts` — deterministic engine for retailer and unknown-contact flows.
- `apps/api/src/lib/whatsapp/conversation-memory.ts` — read/write helpers for conversation state and turns.
- `apps/api/src/lib/whatsapp/acquisition.ts` — lightweight unknown-contact CTA/qualification behavior.
- `apps/api/test/whatsapp-conversation-engine.test.ts` — new tests for continuation, restart, blocked, unknown-contact flows.

### Optional later-phase files (do not implement in phase 1 unless necessary)
- `packages/db/migrations/00xy_delivery_incidents.sql`
- `packages/db/src/schema/incidents.ts`
- `apps/api/src/lib/whatsapp/incident-engine.ts`

---

## Task 1: Establish the new conversation memory schema

**Files:**
- Modify: `packages/db/src/schema/whatsapp.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/migrations/00xx_conversation_memory.sql`
- Test: `apps/api/test/whatsapp-intake.test.ts`

- [ ] **Step 1: Write the failing schema-oriented test expectations**

Add or update tests that require the API to persist richer conversation state beyond `phase` and `collectedFields`, including at minimum:
- `conversationMode`
- `currentFlow`
- `currentIntent`
- `draftPayload`
- `contextSnapshot`
- `status`
- timestamps for stale/closure handling

- [ ] **Step 2: Run the targeted tests to verify they fail for missing schema/fields**

Run: `pnpm --filter api test whatsapp-intake.test.ts`

Expected: failures indicating the current schema/state helpers cannot satisfy the richer memory contract.

- [ ] **Step 3: Evolve the schema in `whatsapp.ts`**

Implement the minimum schema changes required for the spec:
- expand `conversationStates`
- add `conversationTurns`
- preserve backwards compatibility where practical
- use JSONB for `draftPayload`, `contextSnapshot`, and turn metadata

- [ ] **Step 4: Add the SQL migration**

Create the migration with additive, safe changes:
- add new columns with sensible defaults/nullability
- create `conversation_turns`
- add indexes for `(company_id, contact_jid)` and recent turn reads

- [ ] **Step 5: Export the schema and verify tests pass**

Run:
- `pnpm --filter @repo/db test` (if available)
- `pnpm --filter api test whatsapp-intake.test.ts`

Expected: schema-related failures resolved.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/whatsapp.ts packages/db/src/schema/index.ts packages/db/migrations/00xx_conversation_memory.sql apps/api/test/whatsapp-intake.test.ts
git commit -m "feat: add whatsapp conversation memory schema"
```

---

## Task 2: Build conversation memory helpers

**Files:**
- Create: `apps/api/src/lib/whatsapp/conversation-types.ts`
- Create: `apps/api/src/lib/whatsapp/conversation-memory.ts`
- Test: `apps/api/test/whatsapp-conversation-engine.test.ts`

- [ ] **Step 1: Write failing tests for memory read/write behavior**

Cover:
- get-or-create conversation state
- append bounded conversation turns
- update draft payload and context snapshot
- mark conversation stale/completed/cancelled/blocked

- [ ] **Step 2: Run the tests and confirm missing helpers**

Run: `pnpm --filter api test whatsapp-conversation-engine.test.ts`

Expected: failures because the helper modules do not exist yet.

- [ ] **Step 3: Create `conversation-types.ts`**

Define shared types for:
- conversation mode
- conversation flow
- interpretation contract
- draft payload
- context snapshot
- blocked reason payload

- [ ] **Step 4: Create `conversation-memory.ts`**

Implement focused helpers for:
- load/create conversation state
- append turn
- load recent turns (bounded window)
- update state lifecycle fields
- clear/close/restart draft safely

- [ ] **Step 5: Re-run tests and fix any typing issues**

Run: `pnpm --filter api test whatsapp-conversation-engine.test.ts`

Expected: memory helper tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/whatsapp/conversation-types.ts apps/api/src/lib/whatsapp/conversation-memory.ts apps/api/test/whatsapp-conversation-engine.test.ts
git commit -m "feat: add whatsapp conversation memory helpers"
```

---

## Task 3: Implement the Contact Resolver

**Files:**
- Create: `apps/api/src/lib/whatsapp/contact-resolver.ts`
- Modify: `apps/api/src/lib/whatsapp/sessions.ts`
- Modify: `apps/api/src/trpc/whatsapp-router.ts` (only if helper reuse is needed)
- Test: `apps/api/test/whatsapp-conversation-engine.test.ts`

- [ ] **Step 1: Write failing tests for contact resolution categories**

Cover:
- known retailer with active bond
- known retailer with inactive/missing bond
- known driver
- unknown contact

- [ ] **Step 2: Run tests to verify resolver behavior is missing**

Run: `pnpm --filter api test whatsapp-conversation-engine.test.ts`

Expected: failures because routing categories and blocker detection do not exist.

- [ ] **Step 3: Create `contact-resolver.ts`**

Implement a focused resolver that returns:
- routing category
- actor identity
- store context snapshot
- blocker information
- active conversation reference

- [ ] **Step 4: Integrate the resolver at the routing boundary**

Update `sessions.ts` so message routing stops defaulting unknown contacts to retailer intake.

- [ ] **Step 5: Run tests and verify correct routing categories**

Run: `pnpm --filter api test whatsapp-conversation-engine.test.ts`

Expected: category resolution is deterministic and test-covered.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/whatsapp/contact-resolver.ts apps/api/src/lib/whatsapp/sessions.ts apps/api/test/whatsapp-conversation-engine.test.ts
git commit -m "feat: add whatsapp contact resolver"
```

---

## Task 4: Replace slot extraction with structured conversation interpretation

**Files:**
- Create: `apps/api/src/lib/whatsapp/conversation-interpreter.ts`
- Modify: `apps/api/src/lib/whatsapp/intake.ts`
- Test: `apps/api/test/whatsapp-intake.test.ts`

- [ ] **Step 1: Write failing tests for interpreter contract behavior**

Cover:
- greeting does not become address
- known retailer can start a new draft naturally
- low-confidence text yields clarification rather than silent field mutation
- explicit restart intent is surfaced distinctly

- [ ] **Step 2: Run tests and confirm current intake fails these scenarios**

Run: `pnpm --filter api test whatsapp-intake.test.ts`

Expected: current `intake.ts` fails because it still uses extractor + fallback heuristics.

- [ ] **Step 3: Create `conversation-interpreter.ts`**

Implement the OpenAI-compatible interpreter that returns structured output:
- flow
- intent
- confidence
- continue/restart flags
- slot updates
- concise reply

Use strict schema validation on the response.

- [ ] **Step 4: Replace the current unsafe fallback logic in `intake.ts`**

Remove the behavior that implicitly maps arbitrary text to `pickupAddress`/`dropoffAddress` once context exists.

- [ ] **Step 5: Re-run tests and verify conversation interpretation is safe**

Run: `pnpm --filter api test whatsapp-intake.test.ts`

Expected: greetings and ambiguous turns are handled safely.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/whatsapp/conversation-interpreter.ts apps/api/src/lib/whatsapp/intake.ts apps/api/test/whatsapp-intake.test.ts
git commit -m "feat: add whatsapp conversation interpreter"
```

---

## Task 5: Build the retailer conversation engine

**Files:**
- Create: `apps/api/src/lib/whatsapp/conversation-engine.ts`
- Modify: `apps/api/src/lib/whatsapp/intake.ts`
- Modify: `apps/api/src/lib/dispatch.ts` (only for earlier blocker surfacing hooks if needed)
- Test: `apps/api/test/whatsapp-conversation-engine.test.ts`

- [ ] **Step 1: Write failing tests for retailer conversation outcomes**

Cover:
- continue existing draft
- restart stale draft
- confirm validated draft
- cancel draft
- blocked retailer gets blocker message before final create attempt

- [ ] **Step 2: Run tests and confirm current flow lacks these behaviors**

Run: `pnpm --filter api test whatsapp-conversation-engine.test.ts`

Expected: missing engine and blocker-first behavior.

- [ ] **Step 3: Create `conversation-engine.ts`**

Implement deterministic policy decisions:
- continuation vs restart
- clarification path
- draft mutation validation
- stale handling
- explicit confirmation gating

- [ ] **Step 4: Integrate the engine into retailer intake**

Refactor `intake.ts` so it becomes an adapter around:
- context loading
- interpreter call
- conversation engine decision
- action execution

- [ ] **Step 5: Surface bond blockers before confirmation/create**

Move or duplicate the eligibility check early enough that the retailer sees a meaningful blocker response before `createDelivery()` fails at the final step.

- [ ] **Step 6: Run tests and confirm deterministic retailer behavior**

Run: `pnpm --filter api test whatsapp-intake.test.ts whatsapp-conversation-engine.test.ts`

Expected: retailer flow passes the new behavioral cases.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/lib/whatsapp/conversation-engine.ts apps/api/src/lib/whatsapp/intake.ts apps/api/src/lib/dispatch.ts apps/api/test/whatsapp-conversation-engine.test.ts apps/api/test/whatsapp-intake.test.ts
git commit -m "feat: add retailer whatsapp conversation engine"
```

---

## Task 6: Add stale lifecycle and bounded transcript behavior

**Files:**
- Modify: `apps/api/src/lib/whatsapp/conversation-memory.ts`
- Modify: `apps/api/src/lib/whatsapp/conversation-engine.ts`
- Test: `apps/api/test/whatsapp-conversation-engine.test.ts`

- [ ] **Step 1: Write failing tests for stale lifecycle**

Cover:
- active draft becomes stale after threshold
- stale conversation prompts continue vs restart
- completed/cancelled drafts do not resume as active drafts

- [ ] **Step 2: Run tests to verify stale handling is missing**

Run: `pnpm --filter api test whatsapp-conversation-engine.test.ts`

Expected: failures around stale lifecycle behavior.

- [ ] **Step 3: Implement lifecycle timestamps and stale helpers**

Add helper logic to:
- mark stale
- reopen when user chooses continuation
- close/cancel cleanly
- keep transcript bounded for prompt assembly

- [ ] **Step 4: Re-run tests and verify continue-vs-restart UX**

Run: `pnpm --filter api test whatsapp-conversation-engine.test.ts`

Expected: stale lifecycle tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/whatsapp/conversation-memory.ts apps/api/src/lib/whatsapp/conversation-engine.ts apps/api/test/whatsapp-conversation-engine.test.ts
git commit -m "feat: add whatsapp stale lifecycle handling"
```

---

## Task 7: Add the unknown-contact acquisition path

**Files:**
- Create: `apps/api/src/lib/whatsapp/acquisition.ts`
- Modify: `apps/api/src/lib/whatsapp/sessions.ts`
- Modify: `apps/api/src/lib/whatsapp/conversation-engine.ts`
- Test: `apps/api/test/whatsapp-conversation-engine.test.ts`

- [ ] **Step 1: Write failing tests for unknown-contact behavior**

Cover:
- unknown greeting gets CTA, not retailer intake
- unknown operational request gets short qualification path
- no delivery draft is created for unknown contact

- [ ] **Step 2: Run tests and confirm unknown contacts still route incorrectly**

Run: `pnpm --filter api test whatsapp-conversation-engine.test.ts`

Expected: current behavior routes unknowns into retailer intake or unauthorized reply only.

- [ ] **Step 3: Create `acquisition.ts`**

Implement a minimal acquisition path with:
- concise CTA
- 1–3 lightweight qualification prompts
- no CRM persistence yet

- [ ] **Step 4: Route unknown contacts into acquisition flow**

Update routing so unknown contacts never fall into retailer draft logic.

- [ ] **Step 5: Re-run tests and verify acquisition behavior**

Run: `pnpm --filter api test whatsapp-conversation-engine.test.ts`

Expected: unknown-contact flow passes and does not create delivery drafts.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/whatsapp/acquisition.ts apps/api/src/lib/whatsapp/sessions.ts apps/api/src/lib/whatsapp/conversation-engine.ts apps/api/test/whatsapp-conversation-engine.test.ts
git commit -m "feat: add whatsapp unknown contact acquisition flow"
```

---

## Task 8: Preserve and align the driver flow with the new memory shape

**Files:**
- Modify: `apps/api/src/lib/whatsapp/driver.ts`
- Modify: `apps/api/src/lib/whatsapp/conversation-memory.ts`
- Test: `apps/api/test/whatsapp-driver.test.ts`

- [ ] **Step 1: Write failing compatibility tests for driver flow**

Cover:
- driver mappings still route correctly
- acceptance/refusal still works
- status updates still work
- photo-based completion still works

- [ ] **Step 2: Run tests and identify any schema compatibility failures**

Run: `pnpm --filter api test whatsapp-driver.test.ts`

Expected: failures if the evolved memory model breaks driver assumptions.

- [ ] **Step 3: Update `driver.ts` minimally**

Keep driver command execution deterministic, only adapting state helpers to the new memory primitives where necessary.

- [ ] **Step 4: Re-run driver tests**

Run: `pnpm --filter api test whatsapp-driver.test.ts`

Expected: driver flow remains stable.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/whatsapp/driver.ts apps/api/src/lib/whatsapp/conversation-memory.ts apps/api/test/whatsapp-driver.test.ts
git commit -m "refactor: align whatsapp driver flow with new memory model"
```

---

## Task 9: Improve observability for conversation decisions

**Files:**
- Modify: `apps/api/src/lib/whatsapp/sessions.ts`
- Modify: `apps/api/src/lib/whatsapp/conversation-engine.ts`
- Modify: `apps/api/src/lib/whatsapp/conversation-interpreter.ts`
- Test: `apps/api/test/whatsapp-intake.test.ts` or logging-focused tests if present

- [ ] **Step 1: Write failing tests or assertions around key decision logs if practical**

At minimum, define expected structured log points for:
- context resolved
- interpretation returned
- draft updated
- blocked surfaced
- stale continue vs restart prompt

- [ ] **Step 2: Implement structured logs**

Add concise, consistent log events that expose decision boundaries without leaking chain-of-thought.

- [ ] **Step 3: Run the relevant tests and a local verification pass**

Run:
- `pnpm --filter api test whatsapp-intake.test.ts whatsapp-conversation-engine.test.ts`

Expected: behavior unchanged, logs improved.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/whatsapp/sessions.ts apps/api/src/lib/whatsapp/conversation-engine.ts apps/api/src/lib/whatsapp/conversation-interpreter.ts apps/api/test/whatsapp-intake.test.ts apps/api/test/whatsapp-conversation-engine.test.ts
git commit -m "chore: add whatsapp conversation decision logs"
```

---

## Task 10: Full verification and rollout readiness

**Files:**
- Verify all touched files

- [ ] **Step 1: Run all targeted WhatsApp tests**

Run:
```bash
pnpm --filter api test whatsapp-intake.test.ts whatsapp-driver.test.ts whatsapp-notification.test.ts whatsapp-health.test.ts whatsapp-conversation-engine.test.ts
```

Expected: all pass.

- [ ] **Step 1.1: Review coverage of new behaviors before closing the work**

Confirm that the final test suite covers at least these cases:
- known retailer greeting;
- known retailer draft creation;
- known retailer draft update/correction;
- known retailer restart vs continue decision;
- blocked retailer early failure path;
- unknown contact CTA path;
- stale session resume prompt;
- driver compatibility path.

Expected: each behavior has at least one direct automated test.

- [ ] **Step 2: Run API typecheck/build checks**

Run:
```bash
pnpm --filter api build
pnpm --filter api typecheck
```

Expected: exit 0.

- [ ] **Step 3: Run DB migration verification**

Run:
```bash
pnpm --filter @repo/db db:migrate
```

Expected: migration applies cleanly in local environment.

- [ ] **Step 4: Manual WhatsApp QA checklist**

Verify with a real or simulated provider session:
- known retailer greeting does not create draft fields incorrectly
- known retailer can start and confirm a delivery draft
- blocked retailer sees blocker before final confirmation failure
- unknown contact gets CTA flow
- stale conversation prompts continue vs restart
- driver commands still work

- [ ] **Step 4.1: Verify no critical scenario is covered only manually**

If any scenario in the checklist lacks automated coverage and is deterministic enough to test, add the missing test before considering rollout readiness complete.

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "feat: redesign whatsapp bot as hybrid agent"
```

---

## Notes for Execution

- Keep the current webhook surface stable during phase 1.
- Do not add Redis, pgvector, or external CRM while executing this plan.
- Keep LLM output strictly schema-validated.
- Do not let the model directly mutate delivery state; only the engine may authorize operational actions.
- If an implementation chunk reveals incident-engine prerequisites, record them, but do not pull incident handling into phase 1 unless strictly needed for current retailer flow correctness.

## Ready State

Plan complete and saved to `docs/superpowers/plans/2026-04-08-sendro-whatsapp-hybrid-agent-implementation.md`. Ready to execute.
