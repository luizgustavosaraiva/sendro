# M002/S02 — Research

**Date:** 2026-04-05

## Summary

S02 is a **targeted-research** slice, not a greenfield one. S01 already established the right operational boundary in `apps/api/src/lib/dispatch.ts`: `dispatch_queue_entries` hold the queue-level phase/offer state, `dispatch_attempts` hold per-offer resolution, and `delivery_events` remain the append-only audit trail. The main work for S02 is to let the **driver** resolve the active offer exactly once under concurrency and to persist a platform-managed strike progression without collapsing that behavior into ad-hoc delivery status changes.

The slice directly owns **R011** (driver accept/reject with strike on unjustified rejection) and **R012** (progressive platform-managed consequences). It also supports **R009/R010** because accept/reject must compose cleanly with the ranked private-offer flow and timeout reprocessing added in S01. The hard part is not the SSR form; it is preserving a single winner when driver accept/reject races timeout reprocessing on `dispatch_attempts.status = pending`.

## Recommendation

Build S02 **API/domain first**, then add the SSR surface.

1. **Lock and resolve the active attempt transactionally** inside the dispatch domain before adding UI. S01 already proved the right pattern in `processExpiredQueueEntry` and `apps/api/src/lib/invitations.ts`: lock, re-check, mutate, append evidence. S02 should use the same rule for driver acceptance/rejection so timeout, duplicate clicks, and late responses cannot produce two winners.
2. **Persist strike state beside driver/company bond state, not in dashboard-only code.** The dashboard is just one response channel; M003 will reuse the same contract from WhatsApp. Strike counting, thresholds, and consequences must live in shared types + DB + dispatch domain, with SSR only rendering the result.
3. **Keep delivery lifecycle audit append-only.** Driver actions should add explicit `delivery_events` with `actorType: "driver"` and metadata pointing to attempt/strike consequence. Do not hide rejection/late-response logic inside queue fields only.
4. **Treat driver visibility as a first-class SSR branch.** Today `/dashboard` has company and retailer branches only. S02 needs a driver branch that lists active offers and feedback/error states explicitly, following the existing SSR pattern rather than inventing client-side fetches.

## Implementation Landscape

### Key Files

- `apps/api/src/lib/dispatch.ts` — primary seam for S02. It already owns ranking, attempt creation, timeout expiry, waiting-queue fallback, list/detail shaping, and `reprocessDispatchTimeouts`. Add driver-facing accept/reject resolution here instead of reusing `transitionDelivery`, because the concurrency primitive lives around `dispatchAttempts` and queue-entry active-offer fields.
- `apps/api/src/lib/deliveries.ts` — currently only re-exports dispatch-backed delivery APIs and keeps the company-only manual transition surface. If S02 needs a distinct driver-facing delivery detail/list helper, this module is the boundary the router already imports from.
- `apps/api/src/lib/bonds.ts` — already resolves authenticated driver profiles and company/retailer gates. S02 can reuse `resolveAuthenticatedDriverProfile` and add any company-driver bond/lifecycle guards here instead of hand-rolling role resolution.
- `apps/api/src/trpc/router.ts` — current `deliveries` router has create/list/detail/transition/dispatchQueue/waitingQueue/reprocessTimeouts. S02 needs new protected driver mutations/queries here, likely `acceptOffer`, `rejectOffer`, and a driver-scoped list/detail of actionable offers.
- `packages/db/src/schema/index.ts` — current schema has `drivers.lifecycle` plus S01 dispatch tables, but no strike model. This is the place to add strike persistence and any consequence linkage. Natural options are a dedicated `driver_strikes` append-only table plus counters/suspension fields on `bonds` or `drivers`; whichever is chosen must stay company-scoped for multi-tenant safety.
- `packages/db/migrations/0001_dispatch_queue.sql` — the latest migration added S01 dispatch tables. S02 will need a new migration for strike/consequence persistence and possibly extra dispatch attempt statuses if reject/late-response needs a distinct state.
- `packages/shared/src/types/deliveries.ts` — shared delivery/dispatch contract. It currently lacks driver response inputs/results, strike summaries, and possibly lacks enough attempt statuses to express explicit rejection vs late rejection. Extend here first so API/dashboard stay aligned.
- `packages/shared/src/schemas/deliveries.ts` — Zod contract for the same additions. This should validate new accept/reject inputs, driver-offer list/detail payloads, and any strike summary surfaced in SSR diagnostics.
- `apps/dashboard/src/lib/trpc.ts` — current SSR fetcher/view-model builder handles company and retailer branches only. It should grow driver-facing fetch/mutation helpers and explicit state branches for active offers, empty offer queue, and action failures.
- `apps/dashboard/src/app/(app)/dashboard/page.tsx` — current page renders company queue/waiting sections and retailer create/list only. S02 needs a driver section with accept/reject forms, current strike/consequence state, and diagnostics for late/expired offers, reusing the explicit SSR `loaded|empty|error|not-*` pattern.
- `apps/dashboard/src/server.ts` — currently wires POST handlers for retailer create and company transition/reprocess only. Add driver POST actions here for offer accept/reject, because this server is the single SSR action surface.
- `apps/api/test/dispatch.integration.test.ts` — best place to prove race-sensitive offer resolution and idempotence at the domain boundary. This should be the first verification target for S02.
- `apps/api/test/deliveries.integration.test.ts` — should be extended only where delivery detail/list contracts change due to driver acceptance/rejection and strike evidence in the timeline.
- `apps/dashboard/test/dispatch-queue.test.ts` — can either be extended or split to cover driver SSR sections. It already validates the SSR pattern of explicit queue/waiting state surfaces and should do the same for driver response surfaces.
- `scripts/verify-m002-s01-dispatch.ts` — reusable shape for a new cumulative verifier. S02 should follow the same pattern: create real users, exercise SSR, then confirm final Postgres invariants instead of trusting HTML alone.

### Natural Seams

1. **Dispatch-response + concurrency seam**
   - Files: `apps/api/src/lib/dispatch.ts`, `apps/api/src/trpc/router.ts`, `packages/shared/src/types/deliveries.ts`, `packages/shared/src/schemas/deliveries.ts`
   - Purpose: add driver accept/reject inputs/results, resolve the active attempt under lock, block double resolution, and return deterministic error states for expired/already-resolved offers.
2. **Strike persistence + progression seam**
   - Files: `packages/db/src/schema/index.ts`, `packages/db/migrations/*`, `apps/api/src/lib/dispatch.ts`, potentially `apps/api/src/lib/bonds.ts`
   - Purpose: persist strike events and derive progressive consequences (warning/suspension/unlink/blocking behavior) in a company-scoped way.
3. **Driver SSR surface seam**
   - Files: `apps/dashboard/src/lib/trpc.ts`, `apps/dashboard/src/app/(app)/dashboard/page.tsx`, `apps/dashboard/src/server.ts`
   - Purpose: show active offers/feedback/strike state to the driver and post accept/reject actions over SSR.
4. **Verification seam**
   - Files: `apps/api/test/dispatch.integration.test.ts`, `apps/api/test/deliveries.integration.test.ts`, `apps/dashboard/test/dispatch-queue.test.ts`, `scripts/verify-m002-s02-driver-response.ts` (new)
   - Purpose: prove the race rule and final transactional state across API + SSR + Postgres.

### What To Build Or Prove First

1. **Single-winner attempt resolution** — highest risk. Prove that only one of `{accept, reject, timeout}` can win for a pending attempt. This likely means `SELECT ... FOR UPDATE` on both the delivery row and the active `dispatch_attempts` row or on the queue entry + attempt, then compare `activeAttemptId`, `phase`, `attempt.status`, and deadline before mutating.
2. **Strike progression contract** — next risk. Decide a concrete platform-managed threshold model for this slice so planner/executor are not forced to improvise. The research context flagged this as a product gap; implementation should not start before the plan pins exact thresholds and consequences.
3. **Driver-facing SSR path** — once the API contract is stable, expose it in `/dashboard` with explicit feedback states. This is comparatively straightforward once the domain behavior exists.

## Constraints

- There is **no existing driver dashboard branch**. `apps/dashboard/src/lib/trpc.ts` only has company and retailer view-model logic, and `apps/dashboard/src/server.ts` only exposes POST actions for company invitations/reprocess/transition and retailer delivery creation. Driver UI is net-new but should follow existing SSR patterns rather than introducing a different architecture.
- `transitionDelivery` is **company-only** and models manual lifecycle steps (`assigned`, `picked_up`, `in_transit`). Driver acceptance should not be wedged into this mutation without changing its semantics; the real state machine edge lives in dispatch attempt resolution, not a generic transition select.
- Current DB support for punishment is minimal: `drivers.lifecycle` exists with `onboarding|active|paused|blocked`, but there is **no strike table, no strike counter, and no company-specific driver-operability state**. Using `drivers.lifecycle` alone would be too global for a multi-company product unless the business explicitly wants cross-company punishment.
- S01 timeout processing is explicit via `reprocessDispatchTimeouts`; there is no background worker. S02 must therefore handle late accept/reject against attempts that may only become expired when a company-triggered reprocess happens, or it must define acceptance as invalid after `expiresAt` even before reprocess persists expiry.
- The project knowledge explicitly requires runtime verifiers to prove both SSR evidence and DB invariants. S02 verification must inspect persisted attempt status, strike evidence, and `delivery_events` sequence/actor metadata, not just dashboard text.

## Common Pitfalls

- **Encoding rejection solely as `deliveries.status = failed_attempt`** — that loses the distinction between timeout expiry, explicit driver rejection, and lifecycle failure. Rejection belongs on the attempt/strike boundary plus append-only timeline metadata.
- **Using `drivers.lifecycle` as the only punishment state** — that would make one company’s strike behavior global to all companies. Unless the product explicitly wants platform-global punishment, the safer default is company-scoped operability attached to the company↔driver relationship.
- **Letting timeout and accept both succeed** — if accept only checks `deliveries.status === offered` without locking the active attempt, a timeout reprocess and a driver click can both commit different outcomes.
- **Collapsing late responses into generic 400s** — S02 needs explicit diagnostics like `dispatch_attempt_expired`, `dispatch_attempt_already_resolved`, or `driver_offer_not_active`, otherwise SSR and future WhatsApp flows cannot tell the operator what happened.
- **Building the driver surface as company-style generic delivery list first** — the driver experience here is really an “active offer inbox” with action buttons and strike context. Starting from generic list rendering risks obscuring the actionable state.

## Open Risks

- **Strike thresholds are still unspecified.** D008 says platform-managed, but not the concrete rule. Planning should lock something explicit (for example warning/suspension/desvinculação thresholds and whether the counter is cumulative or resettable) before implementation.
- **“Unjustified rejection” has no explicit data model yet.** If the slice needs justification text or reason codes, that changes both the mutation input and strike semantics. If not, the planner should state that all explicit rejections in S02 are treated as strike-worthy by default.
- **Scope of punishment target is ambiguous.** The schema suggests both global (`drivers.lifecycle`) and company-scoped (`bonds.status`) levers exist. The plan should decide which consequence lives where so executors do not split logic inconsistently.
- **Accepted delivery lifecycle semantics need pinning.** The shared delivery status enum already includes `accepted`, but S01 never reaches it; company manual assignment jumps to `assigned`. S02 should define whether driver acceptance sets `deliveries.status = accepted`, sets `driverId`, and leaves later company/manual transitions intact.

## Verification Approach

- **API/domain first:** extend `apps/api/test/dispatch.integration.test.ts` with scenarios for:
  - driver accepts active attempt successfully;
  - driver rejects active attempt successfully and strike evidence persists;
  - repeated accept/reject on the same attempt is idempotent or rejected deterministically;
  - timeout-vs-accept race where only one outcome wins;
  - blocked/suspended/unlinked driver cannot receive or accept new active offers, depending on the chosen progression contract.
- **Contract/list/detail coverage:** extend `apps/api/test/deliveries.integration.test.ts` to prove delivery detail/list includes new driver/strike evidence and correct final statuses (`accepted` vs next state) without breaking company/retailer scoping.
- **SSR coverage:** add or extend dashboard tests to prove driver-facing sections render explicit `loaded|empty|error` states and action feedback, without collapsing missing offers or API failures into the same copy.
- **Runtime/UAT proof:** add a new verifier in the style of `scripts/verify-m002-s01-dispatch.ts` that:
  1. boots API + dashboard,
  2. creates company/retailer/drivers,
  3. creates a delivery into dispatch,
  4. exercises driver accept or reject from SSR,
  5. confirms DB invariants for `dispatch_attempts`, strike persistence, queue-entry phase, `deliveries.status/driverId`, and append-only `delivery_events` sequence.
- **Commands likely required:**
  - `C:/ProgramData/chocolatey/bin/pnpm --filter api test -- --runInBand ./test/dispatch.integration.test.ts ./test/deliveries.integration.test.ts`
  - `C:/ProgramData/chocolatey/bin/pnpm --filter dashboard test -- --runInBand test/auth-pages.test.ts test/dispatch-queue.test.ts`
  - `C:/ProgramData/chocolatey/bin/pnpm tsx scripts/verify-m002-s02-driver-response.ts`

## Skills Discovered

- **Fastify:** `mcollina/skills@fastify-best-practices` — `npx skills add mcollina/skills@fastify-best-practices`
- **Drizzle ORM:** `bobmatnyc/claude-mpm-skills@drizzle-orm` — `npx skills add bobmatnyc/claude-mpm-skills@drizzle-orm`
- **tRPC:** `bobmatnyc/claude-mpm-skills@trpc-type-safety` — `npx skills add bobmatnyc/claude-mpm-skills@trpc-type-safety`
- **Better Auth:** `better-auth/skills@better-auth-best-practices` — `npx skills add better-auth/skills@better-auth-best-practices`

## Sources

- S01 dispatch boundary and timeout logic in `apps/api/src/lib/dispatch.ts`.
- Current router surface in `apps/api/src/trpc/router.ts`.
- Current DB enums/tables in `packages/db/src/schema/index.ts`.
- Shared delivery/dispatch contracts in `packages/shared/src/types/deliveries.ts` and `packages/shared/src/schemas/deliveries.ts`.
- SSR role/view-model split in `apps/dashboard/src/lib/trpc.ts`, `apps/dashboard/src/app/(app)/dashboard/page.tsx`, and `apps/dashboard/src/server.ts`.
- Existing lock/re-check transaction pattern in `apps/api/src/lib/invitations.ts`.
