# M001/S04 — Research

**Date:** 2026-04-04

## Summary

S04 primarily owns **R006 — lifecycle completo de entrega com timeline imutável**, while also depending on S01 auth/profile bootstrap and S02’s retailer→company active-bond gate. The database already contains the right persistence primitives (`deliveries`, `delivery_events`, status/actor enums), but nothing in the runtime currently uses them. This slice is therefore not a schema exercise; it is an application-layer implementation pass across shared contracts, API domain logic, thin tRPC procedures, dashboard SSR composition, and an executable verifier.

The safest path is to follow the S02/S03 pattern exactly: define delivery contracts in `packages/shared`, centralize delivery authorization + transition logic in a new `apps/api/src/lib/deliveries.ts`, keep `apps/api/src/trpc/router.ts` thin, and expand the existing dashboard SSR view model instead of introducing a separate frontend fetch path. The main risk is not CRUD complexity but preserving the multi-tenant boundary and immutable timeline semantics: retailer actions must resolve through real retailer/company profiles and active bonds, company listings must scope by company profile rather than `session.user.id`, and every status transition must append a new `delivery_events` row with monotonic `sequence`.

## Recommendation

Implement deliveries as a small domain module with three concerns: (1) create/list/detail queries scoped through resolved company/retailer profiles, (2) guarded lifecycle transitions backed by an explicit allowed-transition map, and (3) immutable event append logic that writes the delivery status and corresponding timeline row transactionally. Reuse S02’s `assertRetailerHasActiveBond`/profile-resolution helpers instead of deriving tenant IDs from auth session IDs.

On the dashboard side, extend the single SSR company view model rather than creating a new page or API client shape. Add a retailer-facing create-delivery form and a company-side queue/list + timeline rendering on `/dashboard`, preserving the existing explicit state branches (`loaded` / `empty` / `error` / `not-company`) because S02 established that SSR consumers must distinguish “no data” from upstream/API failure. Verification should center on a new end-to-end script, analogous to `scripts/verify-s02-bonds.ts` and `scripts/verify-s03-invitations.ts`, because that is the strongest proof style in this repo.

**Relevant skill guidance used:** the built-in frontend-design skill path was absent in this environment, so no external skill rules were available. I followed the repo’s own established frontend pattern instead: SSR view-model composition in `apps/dashboard/src/lib/trpc.ts` and HTML rendering in `apps/dashboard/src/app/(app)/dashboard/page.tsx`.

**Skill discovery:** `npx skills find "fastify trpc drizzle nextjs"` returned only low-adoption tRPC skills. The only remotely relevant option was `mindrally/skills@trpc` (148 installs, install command: `npx skills add mindrally/skills@trpc`), which is below the quality bar for recommending as core guidance here.

## Implementation Landscape

### Key Files

- `packages/db/src/schema/index.ts` — Already defines `deliveries`, `delivery_events`, `delivery_status` enum, and `delivery_actor_type` enum. S04 should consume these tables as-is rather than adding new persistence structures.
- `apps/api/src/lib/bonds.ts` — Critical dependency. Provides `resolveAuthenticatedCompanyProfile`, `resolveAuthenticatedRetailerProfile`, `resolveAuthenticatedDriverProfile`, and `assertRetailerHasActiveBond`. S04 delivery authorization should build on these helpers and preserve deterministic error semantics.
- `apps/api/src/lib/invitations.ts` — Best model for the new delivery domain module: thin helpers around validation/guards, transactional writes, deterministic `TRPCError` messages, and small mapping functions from Drizzle rows to shared contract shapes.
- `apps/api/src/trpc/router.ts` — Current router only exposes `user`, `bonds`, and `invitations`. S04 needs a new `deliveries` router subtree, but should keep procedures as thin orchestration over a dedicated delivery helper module.
- `packages/shared/src/types/bonds.ts` / `packages/shared/src/schemas/bonds.ts` — Pattern reference for adding `types/deliveries.ts` and `schemas/deliveries.ts`. Shared contracts are the established anti-drift boundary for API + dashboard + verifiers.
- `packages/shared/src/index.ts` — Must re-export any new delivery types/schemas so both app packages can import them from `@repo/shared`.
- `apps/dashboard/src/lib/trpc.ts` — Current SSR composition layer. It already handles TRPC envelopes, authorization fallbacks, and explicit company-only state machines. S04 should extend this file with `get*Delivery*` fetchers and fold delivery state into the dashboard view model rather than bypassing it.
- `apps/dashboard/src/app/(app)/dashboard/page.tsx` — Current dashboard rendering is invitation/bond-only. S04 should extend this surface with delivery creation + queue/timeline sections and stable `data-testid` hooks for SSR verification.
- `apps/dashboard/src/server.ts` — Current HTTP SSR runtime. S04 will likely need additional POST handlers (e.g. delivery create and possibly transition actions) and to pass resulting mutations into the updated dashboard view model.
- `apps/dashboard/test/auth-pages.test.ts` — Existing SSR rendering tests. This is the natural place to extend static coverage for delivery sections, empty states, and timeline rendering.
- `apps/api/test/bonds.integration.test.ts` — Best template for new API DB-backed lifecycle integration tests. It already demonstrates real signup/login agents, TRPC envelope parsing, and deterministic negative-path assertions.
- `scripts/verify-s02-bonds.ts` and `scripts/verify-s03-invitations.ts` — Best templates for S04 proof. They boot the real API/dashboard, create accounts, drive the workflow end to end, assert HTML output, and check transactional DB state. S04 should add `scripts/verify-s04-deliveries.ts` in the same style.
- `scripts/verify-s01-stack.sh` — Existing stack-level proof runner. Once S04 is implemented, this is the likely place to compose the new verifier into the broader milestone proof path.
- `.gsd/KNOWLEDGE.md` — Already captures two constraints that matter directly here: runtime verifiers should reuse healthy services instead of colliding on port 3000, and SSR consumers must not assume `result.data` is always an object or collapse upstream failures into empty states.

### Natural Seams

1. **Shared contract seam**
   - Add delivery status/type definitions and Zod schemas in `packages/shared/src/types/deliveries.ts` and `packages/shared/src/schemas/deliveries.ts`.
   - Re-export through `packages/shared/src/index.ts`.
   - This should happen first because API, dashboard, and verifier code will all depend on the same shapes.

2. **API domain seam**
   - Create `apps/api/src/lib/deliveries.ts`.
   - Responsibilities should include:
     - resolving authenticated company/retailer/driver profiles through S02 helpers
     - retailer create-delivery authorization via active bond gate
     - company-scoped list/detail queries
     - allowed transition map + immutable event append logic
     - mapping DB rows/events into shared contract view models
   - Keep event creation transactional with delivery status updates to avoid split-brain status vs timeline rows.

3. **API transport seam**
   - Extend `apps/api/src/trpc/router.ts` with a `deliveries` subtree.
   - Likely procedures: create, list-for-dashboard/company, get-by-id/detail, and transition.
   - Router should remain thin, mirroring `bonds` and `invitations`.

4. **Dashboard SSR seam**
   - Extend `apps/dashboard/src/lib/trpc.ts` with delivery fetchers and delivery-inclusive dashboard view model branches.
   - Extend `apps/dashboard/src/app/(app)/dashboard/page.tsx` to render delivery queue/timeline and the retailer create form.
   - Extend `apps/dashboard/src/server.ts` with POST handlers that call the new tRPC delivery procedures and rerender the SSR page.

5. **Verification seam**
   - API integration tests for direct contract assertions.
   - Dashboard SSR test updates for rendering.
   - New end-to-end verifier for full real-stack workflow.

### Build Order

1. **Define shared delivery contracts first.**
   This unblocks every downstream file and prevents API/dashboard drift.

2. **Build the API domain helper before touching SSR.**
   The highest-risk logic is tenant scoping + immutable timeline transitions, not HTML rendering. Prove creation + transition rules at the domain/API layer first.

3. **Wire thin tRPC procedures next.**
   Once the domain helper exists, transport should be low-risk.

4. **Add dashboard SSR composition and rendering last.**
   The current dashboard is a simple server-rendered HTML surface. It should consume the already-proven API contract, not invent frontend-only state.

5. **Close with end-to-end verification, then optionally compose into stack verification.**
   Follow the existing verifier pattern before broadening `scripts/verify-s01-stack.sh`.

### What Needs to Be Designed Carefully

- **Status model vs roadmap wording:** the DB enum uses English statuses (`created`, `assigned`, `in_transit`, etc.), while the roadmap text says “estado muda para em_trânsito”. S04 should keep the existing DB enum and map/render Portuguese copy in the dashboard if needed, rather than renaming persistence values.
- **Immutable timeline semantics:** `delivery_events.sequence` is unique per delivery. Transition helpers should compute the next sequence inside the same transaction that updates `deliveries.status` and inserts the event row.
- **Authorization boundaries:**
  - retailer create must require an active retailer↔company bond (`bond_active_required:retailer_company` already exists and should stay reusable)
  - company list/detail must resolve through authenticated company profile
  - if driver transitions are included in S04, they should verify the driver is linked to the same company/delivery, not merely authenticated as a driver
- **Dashboard surface shape:** the current `/dashboard` is company-oriented. S04 requires at least a retailer create flow and a company queue/timeline view. The planner should decide whether a single page with role-conditional sections is enough; given the existing SSR runtime, that is the least disruptive option.
- **Metadata usage:** `deliveries.metadata` and `delivery_events.metadata` are already available and should carry structured payloads like contact/package/reference details instead of proliferating columns unless the UI/contract truly needs top-level fields.

### Verification

Use the repo’s strongest existing proof style: real app boot + scripted workflow + DB assertions.

Recommended checks:

- `pnpm --filter api test` — after adding delivery integration tests, this should cover the direct API contract.
- `pnpm --filter api typecheck`
- `pnpm --filter dashboard test`
- `pnpm tsx scripts/verify-s04-deliveries.ts` — new verifier should:
  - register company, bonded retailer, and optionally driver
  - create a delivery as retailer against the active bond
  - assert company queue listing contains the delivery
  - drive one or more lifecycle transitions (at minimum to `in_transit`, per roadmap)
  - assert `delivery_events` contains the full ordered timeline with actor/timestamp/sequence
  - assert the dashboard SSR HTML shows the delivery and timeline
  - assert a retailer without active bond gets `bond_active_required:retailer_company`
- `bash scripts/verify-s01-stack.sh` — after the slice verifier is green and composed into the stack script.

### Concrete Planner Hints

- Prefer one new API helper file (`apps/api/src/lib/deliveries.ts`) over scattering delivery logic across router/server files.
- Prefer one new shared contract module pair (`types/deliveries.ts`, `schemas/deliveries.ts`) over embedding ad hoc Zod objects inside the router/dashboard.
- Keep deterministic error messages, as S02/S03 verifiers already depend on string-stable diagnostics.
- Reuse the existing TRPC envelope parser and SSR state-machine pattern in `apps/dashboard/src/lib/trpc.ts`; don’t introduce a second fetch abstraction.
- Add stable `data-testid` markers for delivery list, lifecycle form/buttons, and timeline rows so the verifier can inspect SSR HTML without brittle text-only parsing.
