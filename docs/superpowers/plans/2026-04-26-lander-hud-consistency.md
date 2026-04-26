# Lander HUD Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move lander resources into the same bottom HUD pattern used by shuttle and FPS, while keeping lander motion telemetry top-center.

**Architecture:** This is a presentation-only Vue/CSS change. `LanderHud.vue` keeps its existing telemetry prop and helper functions, but restructures its template to use the shared HUD classes already used by `ShuttleHud.vue`; `main.css` only removes or repurposes obsolete lander-only top-left styles.

**Tech Stack:** Vue 3 single-file components, TypeScript, Tailwind CSS v4 via `@apply`, Bun scripts.

---

## File Structure

- Modify: `src/components/LanderHud.vue`
  - Owns lander HUD rendering.
  - Keeps helper functions `pct`, `fuelColor`, `formatTimer`, and `timerColor`.
  - Moves `ALT`, `VEL`, and `X/Z` to the top-center cluster.
  - Moves `HULL`, `ENG`, `RCS`, and `FUEL` to the bottom dock.
- Modify: `src/assets/css/main.css`
  - Keeps shared shuttle/FPS/lander HUD classes.
  - Updates `.lander-hud` into a full-screen HUD container.
  - Deletes obsolete lander-only top-left layout helpers.
  - Moves the survey overlay above the bottom dock.
- No telemetry, controller, physics, router, or store files should change.
- No new unit test file is needed because this is static presentation markup with no domain behavior.

## Task 1: Restructure Lander HUD Markup

**Files:**
- Modify: `src/components/LanderHud.vue`

- [ ] **Step 1: Replace the top-left stack with top-center flight telemetry**

Replace the current top-left flight readouts with this top-center cluster inside the `.lander-hud`
root:

```vue
<div class="hud-top-cluster">
  <div class="hud-top-cluster__readout">
    ALT {{ props.telemetry.altitude.toFixed(1) }} &middot; VEL
    {{ props.telemetry.velocityY.toFixed(1) }}
  </div>
  <div class="hud-top-cluster__readout">
    X {{ props.telemetry.posX.toFixed(0) }} Z {{ props.telemetry.posZ.toFixed(0) }}
  </div>
</div>
```

Expected result after Step 3: `ALT`, `VEL`, and `X/Z` no longer render in the top-left corner.

- [ ] **Step 2: Add the bottom dock resource layout**

Inside the same `.lander-hud` root, after `hud-top-cluster`, add the shared bottom dock:

```vue
<div class="hud-bottom-dock">
  <div class="hud-bottom-dock__column hud-bottom-dock__column--hull">
    <span class="hud-hull-label">HULL</span>
    <div class="hud-hull-track">
      <div
        class="hud-hull-fill"
        :class="fuelColor(props.telemetry.hp, props.telemetry.maxHp)"
        :style="{ width: pct(props.telemetry.hp, props.telemetry.maxHp) + '%' }"
      ></div>
    </div>
  </div>

  <div class="hud-thruster-gauges">
    <div class="hud-gauge">
      <div class="hud-gauge-track">
        <div
          class="hud-gauge-fill bg-red-500"
          :style="{
            height: pct(props.telemetry.mainEngineCharge, props.telemetry.mainEngineCapacity) + '%',
          }"
        ></div>
      </div>
      <span class="hud-gauge-label">ENG</span>
    </div>
    <div class="hud-gauge">
      <div class="hud-gauge-track">
        <div
          class="hud-gauge-fill bg-white"
          :style="{ height: pct(props.telemetry.rcsCharge, props.telemetry.rcsCapacity) + '%' }"
        ></div>
      </div>
      <span class="hud-gauge-label">RCS</span>
    </div>
  </div>

  <div class="hud-bottom-dock__column hud-bottom-dock__column--fuel">
    <span class="hud-fuel-label">FUEL</span>
    <div class="hud-fuel-track">
      <div
        class="hud-fuel-fill"
        :class="fuelColor(props.telemetry.fuelLevel, props.telemetry.fuelCapacity)"
        :style="{ width: pct(props.telemetry.fuelLevel, props.telemetry.fuelCapacity) + '%' }"
      ></div>
    </div>
  </div>
</div>
```

Expected result: bottom-center resource layout reads as `HULL | ENG/RCS | FUEL`, matching shuttle.

- [ ] **Step 3: Keep survey overlay separate from resources**

Move the existing survey block below the bottom dock inside the root. Keep the existing bindings:

```vue
<div v-if="props.telemetry.surveyTimeRemaining !== null" class="survey-hud">
  <div class="survey-timer" :class="timerColor(props.telemetry.surveyTimeRemaining ?? 0)">
    {{ formatTimer(props.telemetry.surveyTimeRemaining ?? 0) }}
  </div>
  <div class="survey-probes">
    {{ props.telemetry.surveyProbesCollected ?? 0 }}/{{
      props.telemetry.surveyProbesTotal ?? 0
    }}
    {{ props.telemetry.minigameProgressLabel ?? 'PROBES' }}
  </div>
  <div v-if="props.telemetry.missionInstruction" class="survey-instruction" aria-live="polite">
    {{ props.telemetry.missionInstruction }}
  </div>
</div>
```

Expected result: survey data still renders only when `surveyTimeRemaining` is not `null`.

- [ ] **Step 4: Run type-check for template correctness**

Run:

```bash
bun run type-check
```

Expected: command completes with no TypeScript or Vue template errors.

## Task 2: Align Lander CSS With Shared HUD Classes

**Files:**
- Modify: `src/assets/css/main.css`

- [ ] **Step 1: Change `.lander-hud` into a full-screen overlay**

Replace the existing `.lander-hud` rule:

```css
.lander-hud {
  @apply fixed top-4 left-4 pointer-events-none font-mono text-xs text-green-400 flex flex-col gap-1;
  text-shadow: 0 0 4px rgba(0, 255, 0, 0.5);
}
```

with:

```css
.lander-hud {
  @apply fixed inset-0 pointer-events-none font-mono text-xs text-green-400 z-30;
  text-shadow: 0 0 4px rgba(0, 255, 0, 0.5);
}
```

Expected result: lander HUD children can use absolute shared positioning like shuttle.

- [ ] **Step 2: Remove obsolete lander-only layout helpers**

Delete these rules because the new lander template no longer references them:

```css
.hud-readout {
  @apply text-green-400;
}

.lander-hud-fuel {
  @apply flex items-center gap-2 mt-2;
}

.lander-hud-gauges {
  @apply flex gap-3 items-end mt-3;
}
```

Expected result: no dead lander-specific top-left layout CSS remains.

- [ ] **Step 3: Ensure survey overlay clears the bottom dock**

Replace the existing `.survey-hud` rule:

```css
.survey-hud {
  @apply fixed top-4 left-1/2 z-30 flex flex-col items-center gap-1 pointer-events-none;
  transform: translateX(-50%);
}
```

with:

```css
.survey-hud {
  @apply absolute bottom-28 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-1
         rounded border border-cyan-300/30 bg-black/40 px-4 py-2 text-center pointer-events-none
         backdrop-blur-sm;
}
```

Expected result: survey status sits above the bottom resource dock.

- [ ] **Step 4: Run lint after CSS changes**

Run:

```bash
bun run lint
```

Expected: oxlint has 0 errors, ESLint has 0 errors and 0 warnings.

## Task 3: Verify and Review

**Files:**
- Verify: `src/components/LanderHud.vue`
- Verify: `src/assets/css/main.css`
- Verify: `docs/superpowers/specs/2026-04-26-lander-hud-consistency-design.md`

- [ ] **Step 1: Run full local verification**

Run:

```bash
bun run lint
bun run type-check
bun run test:unit
```

Expected: all three commands pass.

- [ ] **Step 2: Manual visual check in lander mode**

Run the dev server if one is not already running:

```bash
bun dev
```

Open the app and enter lander mode. Verify:

- `ALT`, `VEL`, and `X/Z` render top-center.
- No lander resource readouts remain in the top-left corner.
- `HULL`, `ENG`, `RCS`, and `FUEL` render bottom-center.
- Survey timer, probe count, and mission instruction do not overlap the resource dock.

- [ ] **Step 3: Commit only if the user explicitly asks**

If commit approval is given, use:

```bash
git add src/components/LanderHud.vue src/assets/css/main.css docs/superpowers/specs/2026-04-26-lander-hud-consistency-design.md docs/superpowers/plans/2026-04-26-lander-hud-consistency.md
git commit -m "fix: align lander hud"
```

Expected result: a short commit message matching the repo preference.
