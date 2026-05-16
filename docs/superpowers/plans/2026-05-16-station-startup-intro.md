# Station Startup Intro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a data-driven non-interactive station startup intro with letterbox, fade, HUD briefing, and entry walk-in.

**Architecture:** Extend the station layout contract with optional intro metadata and preserve it through the existing loader. `StationViewController` owns gameplay lock and player auto-movement; `StationView.vue` owns HUD/letterbox/fade rendering using existing station visual patterns.

**Tech Stack:** Vue 3, TypeScript, Three.js, Vitest, Bun.

**Spec:** `docs/superpowers/specs/2026-05-16-station-startup-intro-design.md`

---

## File Map

**Modify:**
- `src/lib/station/StationLayout.ts` — add `StationIntroSpec` and optional `intro`.
- `src/lib/station/__tests__/loadStationLayout.spec.ts` — test intro preservation and microwave-test validation.
- `public/data/stations/microwave-test.json` — add intro copy.
- `src/views/StationViewController.ts` — expose intro metadata, lock control, auto-walk from entrance to spawn.
- `src/views/StationView.vue` — render letterbox, fade, and cyan briefing HUD.

---

## Task 1: Data Contract

- [ ] Write failing tests in `src/lib/station/__tests__/loadStationLayout.spec.ts` asserting that `loadStationLayout` preserves `intro.title`, `intro.body`, and `intro.status`, and that `microwave-test.json` loads without throwing.
- [ ] Run `bun test:unit src/lib/station/__tests__/loadStationLayout.spec.ts` and confirm the new tests fail because `intro` is not typed/imported yet.
- [ ] Add exported `StationIntroSpec` to `src/lib/station/StationLayout.ts` and add optional `intro?: StationIntroSpec` to `StationLayout`.
- [ ] Add the `intro` object to `public/data/stations/microwave-test.json`.
- [ ] Re-run the focused unit test and confirm it passes.

## Task 2: Controller Intro State

- [ ] Add constants for intro duration, fade timing, and entry offset in `src/views/StationViewController.ts`.
- [ ] Add callbacks: `onStationIntro`, `onStartupFade`, and `onStartupLetterbox`.
- [ ] Store the loaded layout intro and emit it after scene setup.
- [ ] Start a startup lock when intro data exists; during the lock, place the player at an entry offset and lerp into `spawnPos`.
- [ ] Skip movement input, multitool firing, interact prompts, and pointer-lock requests while the lock is active.
- [ ] Ensure `restart()` restores normal spawn behavior and does not replay the intro.

## Task 3: Vue HUD

- [ ] Add reactive intro state in `src/views/StationView.vue`.
- [ ] Wire the controller callbacks to update intro text, fade opacity, and letterbox visibility.
- [ ] Render letterbox bars using the `LevelView.vue` pattern.
- [ ] Render a compact cyan station briefing HUD while intro text is active.
- [ ] Hide key prompts and chest preview while the startup intro is active.

## Task 4: Verification

- [ ] Run `bun test:unit src/lib/station/__tests__/loadStationLayout.spec.ts`.
- [ ] Run `bun run type-check`.
- [ ] Run `bun run lint`.
- [ ] Run `bun run test:unit`.
- [ ] Manually load `/station?station=microwave-test&dev=true` and verify: non-interactive fade in, letterbox, entry walk, briefing copy, then controls unlock.
