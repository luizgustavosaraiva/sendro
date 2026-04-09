# Sendro Landing Page Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new conversion-ready Sendro landing page in `D:\Projetcs\sendro\.pencil\sendro.pen` using the existing shadcn design system and the approved spec.

**Architecture:** The landing page will be added as a new top-level frame in `sendro.pen`, separate from the existing dashboard examples. The page will use existing shadcn components for structure and interaction patterns, with custom Pencil frames for the WhatsApp-first hero composition, workflow storytelling, and proof/KPI sections. Each major section will be built and visually validated in sequence.

**Tech Stack:** Pencil MCP, `.pen` design file, existing shadcn component set in `sendro.pen`

---

## File Structure

### Existing files to reference

- Spec: `docs/superpowers/specs/2026-04-08-sendro-landing-page-design.md`
- Design file: `.pencil/sendro.pen`
- Product reference: `PROJECT.md`

### Files to modify

- Modify: `.pencil/sendro.pen`

### Files to create/update during planning and verification

- Create: `docs/superpowers/plans/2026-04-08-sendro-landing-page-implementation.md`

---

## Chunk 1: Prepare canvas and structure

### Task 1: Inspect design system primitives needed for the landing

**Files:**
- Read: `.pencil/sendro.pen`
- Read: `docs/superpowers/specs/2026-04-08-sendro-landing-page-design.md`

- [ ] **Step 1: Re-open the approved spec and current Pencil document state**

Read the spec and inspect the active `.pen` file to confirm:
- existing top-level frames
- reusable components available
- current token/theme setup

- [ ] **Step 2: Inspect the exact reusable components that will anchor the page**

Inspect at minimum:
- `Button/Default`
- `Button/Outline` or `Button/Secondary`
- `Badge/*`
- `Card`
- `Accordion/Open`

Capture the descendant structure needed for safe overrides.

- [ ] **Step 3: Find empty canvas space for a new landing frame**

Use Pencil layout/empty-space tools to place the landing page away from the dashboard examples.

- [ ] **Step 4: Create a placeholder top-level landing frame**

Create a new frame named something like `landing-sendro` with:
- placeholder enabled during work
- vertical layout
- width appropriate for desktop marketing page composition
- light background token base

- [ ] **Step 5: Verify the frame placement and size**

Use layout snapshot and screenshot validation to confirm:
- no overlap with existing examples
- enough height strategy for multi-section build
- clean starting canvas

---

## Chunk 2: Build header and hero

### Task 2: Compose the top navigation and hero shell

**Files:**
- Modify: `.pencil/sendro.pen`

- [ ] **Step 1: Add a minimal header/navigation section**

Include:
- Sendro brand mark/text
- concise nav items
- one visible CTA

Keep it lightweight and premium.

- [ ] **Step 2: Build the hero text column**

Add:
- eyebrow/badge
- approved headline
- supporting paragraph
- primary CTA `Começar com a Sendro`
- secondary CTA `Falar no WhatsApp`
- small audience/proof line below CTA row

- [ ] **Step 3: Build the hero visual composition container**

Create a composition area that can hold:
- WhatsApp conversation cards as the primary layer
- dashboard proof cards as secondary support
- subtle gradient / motion accents aligned to Sendro brand energy

- [ ] **Step 4: Compose the WhatsApp-first visual**

Represent a believable flow such as:
- order/request intake
- dispatch offer message
- acceptance or status confirmation

It should feel familiar, fast, and human.

- [ ] **Step 5: Compose the dashboard authority layer**

Represent the control surface with:
- queue/status cards
- KPI snippets
- operational monitoring cues

It should feel calm, precise, and trustworthy.

- [ ] **Step 6: Visually validate the hero**

Take a screenshot and verify:
- WhatsApp leads visually
- dashboard still matters
- CTA hierarchy is obvious
- the hero communicates the entire pitch in one fold

---

## Chunk 3: Build the narrative sections

### Task 3: Add the explanatory middle of the landing page

**Files:**
- Modify: `.pencil/sendro.pen`

- [ ] **Step 1: Add the credibility / audience strip**

Use badges, short statements, or compact cards to show that Sendro fits:
- couriers
- comércio local
- restaurantes/farmácias
- growing delivery operations

- [ ] **Step 2: Add the market pain section**

Create a section that frames the operational problem:
- dispatch chaos
- fragmented communication
- lack of control
- poor visibility

Prefer 3–4 concise cards or a structured two-column explanation.

- [ ] **Step 3: Add the “how it works” flow section**

Design a clean 3–4 step sequence:
1. pedido entra
2. despacho com inteligência
3. entregador responde/executa
4. operação acompanha e fecha

This should be visually linear and easy to scan.

- [ ] **Step 4: Add the WhatsApp-first section**

Build a section focused on accessibility and adoption. Show that operators can work in the channel they already know.

- [ ] **Step 5: Add the dashboard/control-center section**

Build a section focused on visibility, metrics, queue, and intervention.

- [ ] **Step 6: Add the audience-benefits section**

Organize by operator type instead of feature bucket:
- Para couriers
- Para comércio local
- Para operações em crescimento

- [ ] **Step 7: Validate narrative rhythm**

Take a screenshot of the growing page and verify:
- the page alternates explanation and proof well
- no two sections feel visually repetitive
- messaging remains broad but operationally credible

---

## Chunk 4: Build proof, FAQ, and final CTA

### Task 4: Finish the lower-conversion sections

**Files:**
- Modify: `.pencil/sendro.pen`

- [ ] **Step 1: Add the KPI / proof section**

Create a proof-oriented band with KPI-style visuals or operational summary cards. Do not invent hard customer metrics; express measurable value visually.

- [ ] **Step 2: Add the FAQ section using accordion components**

Include adoption-friction questions around:
- who it is for
- WhatsApp vs dashboard
- fit for different operations
- speed of adoption

- [ ] **Step 3: Add the final CTA section**

Build a strong closing block that restates simplicity + intelligence and repeats the CTA pair.

- [ ] **Step 4: Add footer-level closure if needed**

If the composition needs it, add a simple footer or legal/brand close. Keep it quiet and secondary.

- [ ] **Step 5: Validate bottom-of-page conversion flow**

Take a screenshot and verify the landing ends decisively and does not taper off weakly.

---

## Chunk 5: Polish, align, and finalize

### Task 5: Refine the page to production-quality design state

**Files:**
- Modify: `.pencil/sendro.pen`

- [ ] **Step 1: Audit spacing and section rhythm**

Check:
- vertical spacing consistency
- card alignment
- text width comfort
- CTA prominence
- visual balance between light and emphasis sections

- [ ] **Step 2: Audit brand accent usage**

Check:
- gradients are selective, not overwhelming
- WhatsApp feels lively
- dashboard feels authoritative
- shadcn structure remains intact

- [ ] **Step 3: Audit hierarchy and readability**

Check:
- headline and section headings are clearly scannable
- body copy does not become too dense
- long sections do not lose visual momentum

- [ ] **Step 4: Remove placeholder flags from finished frames**

Ensure the final landing frame and all finished sections no longer carry placeholder markers.

- [ ] **Step 5: Run final Pencil verification**

Use layout checks and final screenshots to confirm:
- no clipping issues
- no accidental overlaps
- section widths feel intentional
- the page is clearly more than a wireframe

- [ ] **Step 6: Capture final review assets**

Take one or more screenshots of the final landing page for human review.

---

## Acceptance Criteria

- A new top-level landing page frame exists in `.pencil/sendro.pen`
- The landing clearly differs from the existing dashboard examples
- The design system feels shadcn-based, not custom-chaotic
- The hero sells WhatsApp accessibility + intelligent dispatch + operational control in one fold
- WhatsApp is visually primary without reducing the dashboard to irrelevance
- The page addresses a broad delivery-dependent market without sounding generic
- The landing contains all approved sections from the spec
- The final design is visually polished and conversion-oriented

---

## Risks to Watch During Execution

- Over-indexing on WhatsApp and making the product seem like only a bot
- Over-indexing on dashboard visuals and losing the accessibility thesis
- Making the page too enterprise/corporate and losing warmth/accessibility
- Overusing gradients and breaking the premium shadcn feel
- Reusing dashboard-like patterns too literally, making the landing feel like internal app UI

---

Plan complete and saved to `docs/superpowers/plans/2026-04-08-sendro-landing-page-implementation.md`. Ready to execute?
