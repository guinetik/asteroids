# Tutorial Programs Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Shuttle, Lander, Multitool, and Suit tutorial programs as standard-issued
manuals with shared diagnostic-card UI inside the existing shuttle terminal.

**Architecture:** Keep the existing shuttle terminal launcher unchanged. Replace the tutorial program
screens with a shared `TutorialProgramManual.vue` presentational shell, shared typed content models,
and per-program data in each existing program component. Put reusable styling in
`src/assets/css/main.css` so the programs look like the same terminal OS.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Tailwind v4 via `@apply`, Bun, Vitest.

---

## File Structure

- Create `src/components/shuttle-control/tutorialProgramTypes.ts`
  - Owns shared TypeScript interfaces for manual issuers, badges, cards, chapters, and checklist
    items.
  - Every export gets TSDoc.

- Create `src/components/shuttle-control/TutorialProgramManual.vue`
  - Shared presentational shell for program header, chapter rail, diagnostic content frame, and
    footer navigation.
  - Emits `switch-to-upgrades` through slot-provided actions from parent components.
  - Owns chapter switching state and UI audio click behavior.

- Modify `src/assets/css/main.css`
  - Add `.tutorial-program-*` classes using `@apply`.
  - Cover header, badges, chapter rail, cards, warnings, readouts, checklist, footer nav, and
    issuer accent variants.

- Modify `src/components/shuttle-control/ShuttleControlProgramShuttle.vue`
  - Replace bespoke manual layout with data passed into `TutorialProgramManual`.
  - Preserve props: `telemetry`, `upgradeLevels`, `dockedPlanet`, `playerName`.
  - Preserve `switch-to-upgrades` emit.
  - Preserve the certificate of ownership as a readable chapter/document view.
  - Issuer: Vale Orbital Refurb.

- Modify `src/components/shuttle-control/ShuttleControlProgramLander.vue`
  - Replace Vale manual copy/layout with Jovian Society / Cloud City Field Engineering manual data.
  - Preserve props: `upgradeLevels`, `dockedPlanet`, `playerName`.
  - Preserve `switch-to-upgrades` emit.

- Modify `src/components/shuttle-control/ShuttleControlProgramMultitool.vue`
  - Replace Tailwind-heavy standalone layout with shared manual data.
  - Preserve props: `upgradeLevels`, `dockedPlanet`.
  - Preserve `switch-to-upgrades` emit.
  - Issuer: Martian Marine Corps.

- Create `src/components/shuttle-control/ShuttleControlProgramSuit.vue`
  - Add a Suit tutorial using the shared manual data.
  - Preserve props: `upgradeLevels`, `dockedPlanet`.
  - Preserve `switch-to-upgrades` emit.
  - Teach asteroid EVA and space EVA mechanics.

## Task 1: Shared Content Types

**Files:**
- Create: `src/components/shuttle-control/tutorialProgramTypes.ts`

- [ ] **Step 1: Add shared interfaces**

Create `src/components/shuttle-control/tutorialProgramTypes.ts` with the shared content model for
`TutorialProgramAccent`, `TutorialProgramBadge`, `TutorialProgramCard`,
`TutorialProgramReadout`, `TutorialProgramChecklistItem`, `TutorialProgramChapter`, and
`TutorialProgramManualModel`. Every export must include TSDoc.

- [ ] **Step 2: Run a focused type-check**

Run: `bun run type-check`

Expected: no errors pointing at `tutorialProgramTypes.ts`.

## Task 2: Shared Tutorial Manual Shell

**Files:**
- Create: `src/components/shuttle-control/TutorialProgramManual.vue`
- Modify: `src/assets/css/main.css`

- [ ] **Step 1: Create the shared shell component**

Create `TutorialProgramManual.vue` as a presentational shell that accepts
`manual: TutorialProgramManualModel`, owns the active chapter index, calls `uiAudio.notifyNavClick()`
when navigation changes, renders header badges, chapter rail, diagnostic cards, readouts, notes,
checklists, an optional upgrade action, and previous/next footer navigation.

- [ ] **Step 2: Add shared CSS**

Add `.tutorial-program-*` classes to `src/assets/css/main.css` for the shared issued-manual UI:
header, issuer/title/document text, badges, chapter rail, content, card grid, readout strip, note
block, checklist, upgrade action, footer, progress dots, and issuer accent variants for `jovian`
and `mmc`.

- [ ] **Step 3: Run lints for changed files**

Run: `bun run lint`

Expected: no ESLint or oxlint errors.

## Task 3: Shuttle Manual Content

**Files:**
- Modify: `src/components/shuttle-control/ShuttleControlProgramShuttle.vue`

- [ ] **Step 1: Replace the bespoke template with manual data**

Rewrite the component around `TutorialProgramManual` and keep the existing props/emits. The manual
model must use:

- Issuer: `Vale Orbital Refurb`
- Title: `Shuttle Owner/Operator Manual`
- Document code: `VOR-SHUTTLE-OPS-0.8`
- Accent: `vale`

Include chapters for summary, controls, power, slingshot, hazards, upgrades, and certificate.
Preserve live telemetry badges for fuel, hull, temperature, and docked planet. Preserve installed
upgrade display through the upgrades chapter note, preserve `switch-to-upgrades`, and preserve the
certificate of ownership/provenance from the existing shuttle manual.

- [ ] **Step 2: Run focused checks**

Run: `bun run type-check`

Expected: no TypeScript errors in `ShuttleControlProgramShuttle.vue`.

## Task 4: Lander Manual Content

**Files:**
- Modify: `src/components/shuttle-control/ShuttleControlProgramLander.vue`

- [ ] **Step 1: Replace Vale framing with Jovian manual data**

Rewrite the component around `TutorialProgramManual`. The manual model must use:

- Issuer: `Jovian Society / Cloud City Field Engineering`
- Title: `Surface Lander Field Manual`
- Document code: `JS-CCFE-LANDER-SURF-3.1`
- Accent: `jovian`

Include chapters for summary, controls, power, landing, upgrades, and protocol. Teach main engine,
RCS, yaw, ascend/descend, retro-brake, safe landing speed/tilt/slope, fuel/charge behavior, and
lander upgrade effects. Preserve `switch-to-upgrades`.

- [ ] **Step 2: Run focused checks**

Run: `bun run type-check`

Expected: no TypeScript errors in `ShuttleControlProgramLander.vue`.

## Task 5: Multitool Manual Content

**Files:**
- Modify: `src/components/shuttle-control/ShuttleControlProgramMultitool.vue`

- [ ] **Step 1: Replace standalone layout with MMC manual data**

Rewrite the component around `TutorialProgramManual`. The manual model must use:

- Issuer: `Martian Marine Corps`
- Title: `Standard Field Multitool Manual`
- Document code: `MMC-FIELD-MT-RTG-1.2`
- Accent: `mmc`

Include chapters for summary, controls, RTG, mode behavior, upgrades, and protocol. Teach DRL/LAS/SCI,
Digit 1/2/3, ADS requirement, left mouse fire behavior, RTG shared pool, per-mode charge, RTG burst
recharge, drill feathering/lockout, weapon auto fire, science click shots, and multitool upgrades.
Remove references to Vale, Prey inspiration, future expansions, and implementation-facing text.

- [ ] **Step 2: Run focused checks**

Run: `bun run type-check`

Expected: no TypeScript errors in `ShuttleControlProgramMultitool.vue`.

## Task 6: Polish, Validation, And Cleanup

**Files:**
- Create: `src/components/shuttle-control/ShuttleControlProgramSuit.vue`
- Modify: `src/components/ShuttleControlOverlay.vue`
- Modify: `src/components/shuttle-control/tutorialProgramTypes.ts`
- Modify: `src/assets/css/main.css`

- [ ] **Step 0: Add Suit tutorial program**

Create the Suit program using `TutorialProgramManual`, add a `suit` accent, wire `Suit` into the
left-rail terminal program list, and cover asteroid EVA, space EVA, O2/hypoxia, gravity boots,
sprint/jump/hover, RCS controls, maintenance prompts, return prompts, and suit upgrades.

**Files:**
- Verify: `src/components/shuttle-control/TutorialProgramManual.vue`
- Verify: `src/components/shuttle-control/ShuttleControlProgramShuttle.vue`
- Verify: `src/components/shuttle-control/ShuttleControlProgramLander.vue`
- Verify: `src/components/shuttle-control/ShuttleControlProgramMultitool.vue`
- Verify: `src/components/shuttle-control/ShuttleControlProgramSuit.vue`
- Verify: `src/assets/css/main.css`

- [ ] **Step 1: Check visual integration in dev server**

Run: `bun dev`

Expected: dev server starts. Open the shuttle terminal and verify the existing launcher/menu remains
stable, the tutorial programs share the same issued-manual layout, the Suit program appears in the
left rail, chapter rail/footer/action work, the shuttle certificate of ownership remains readable,
and issuers are Vale, Jovian Society / Cloud City Field Engineering, Martian Marine Corps, and Vale
Orbital Refurb / Contractor Life Support.

- [ ] **Step 2: Run linter**

Run: `bun run lint`

Expected: oxlint and ESLint pass with zero errors and zero warnings.

- [ ] **Step 3: Run type-check**

Run: `bun run type-check`

Expected: TypeScript passes.

- [ ] **Step 4: Run unit tests**

Run: `bun run test:unit`

Expected: Vitest passes.

- [ ] **Step 5: Review git diff**

Run: `git diff -- src/components/shuttle-control src/assets/css/main.css docs/superpowers/specs/2026-04-27-tutorial-programs-redesign-design.md docs/superpowers/plans/2026-04-27-tutorial-programs-redesign.md`

Expected: diff only contains the tutorial program redesign, shared styling, spec, and plan changes.

## Self-Review

- Spec coverage: The plan preserves the existing launcher, standardizes the opened tutorial program
  screens, adds Suit EVA coverage, assigns the correct issuers, preserves the shuttle ownership
  certificate, updates player-facing mechanics, removes Multitool implementation-note copy, and
  requires final Bun verification.
- Placeholder scan: No `TBD`, `TODO`, or unspecified implementation steps are intentionally left in
  the plan.
- Type consistency: `TutorialProgramManualModel`, chapter/card/readout/checklist interfaces, and the
  `switch-to-upgrades` event are defined before they are consumed by the three program components.
