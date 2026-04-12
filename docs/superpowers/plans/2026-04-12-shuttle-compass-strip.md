# Shuttle Compass Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain-text heading readout with a horizontal compass strip where planet abbreviations slide as bearings relative to the shuttle, flanked by position (AU) and speed.

**Architecture:** New `ShuttleCompass.vue` component following the existing `FpsCompass.vue` scrolling-track pattern. Planet bearings are computed in `MapViewController.ts` and passed through a new `compassBearings` field on `ShuttleTelemetry`. The compass strip replaces the `hud-top-cluster` in `ShuttleHud.vue`. Styles go in `main.css` per project ground rules.

**Tech Stack:** Vue 3, TypeScript, Tailwind CSS v4 (@apply in main.css only)

---

### Task 1: Extend ShuttleTelemetry with compass bearing data

**Files:**
- Modify: `src/lib/ShuttleTelemetry.ts`

- [ ] **Step 1: Add compass bearing type and field**

Add to `src/lib/ShuttleTelemetry.ts` after the existing interface fields:

```ts
/** A celestial body's bearing relative to the shuttle heading for the compass strip. */
export interface CompassBearing {
  /** Short label (e.g. "Sol", "Ea", "Ju") */
  label: string
  /** Bearing in radians relative to shuttle heading (0 = dead ahead, positive = right) */
  bearingRad: number
  /** CSS color string from the planet's accentColor */
  color: string
}
```

Add to the `ShuttleTelemetry` interface:

```ts
  /** Planet bearings for the compass strip. */
  compassBearings: CompassBearing[]
```

- [ ] **Step 2: Verify type-check passes**

Run: `bun run type-check 2>&1 | grep -c "error TS"`
Expected: same 3 pre-existing errors (new field will cause errors in MapViewController where telemetry is emitted — that's expected, fixed in Task 2)

- [ ] **Step 3: Commit**

```bash
git add src/lib/ShuttleTelemetry.ts
git commit -m "feat(telemetry): add CompassBearing type and compassBearings field"
```

---

### Task 2: Compute planet bearings in MapViewController

**Files:**
- Modify: `src/views/MapViewController.ts`

- [ ] **Step 1: Add planet abbreviation map**

Add near the top of MapViewController.ts (after imports, before the class):

```ts
/** Short compass labels for each planet + Sun. */
const COMPASS_LABELS: Record<string, string> = {
  sun: 'Sol',
  mercury: 'Me',
  venus: 'Ve',
  earth: 'Ea',
  mars: 'Ma',
  ceres: 'Ce',
  jupiter: 'Ju',
  saturn: 'Sa',
  uranus: 'Ur',
  neptune: 'Ne',
  pluto: 'Pl',
}
```

- [ ] **Step 2: Import CompassBearing type**

Add `CompassBearing` to the existing `ShuttleTelemetry` import:

```ts
import type { CompassBearing } from '@/lib/ShuttleTelemetry'
```

(If already importing `ShuttleTelemetry` as a type, add `CompassBearing` to that import line.)

- [ ] **Step 3: Add bearing computation method**

Add a private method to the `MapViewController` class:

```ts
/**
 * Compute compass bearings from the shuttle to all planets and the Sun.
 * Each bearing is relative to the shuttle's current heading.
 */
private computeCompassBearings(): CompassBearing[] {
  if (!this.shuttleController) return []
  const sx = this.shuttleController.position.x
  const sz = this.shuttleController.position.z
  const heading = this.shuttleController.heading

  const bearings: CompassBearing[] = []

  // Sun at origin
  const sunAngle = Math.atan2(-sz, -sx)
  bearings.push({
    label: COMPASS_LABELS['sun']!,
    bearingRad: sunAngle - heading,
    color: '#FFF0B0',
  })

  // Planets
  for (const controller of this.planetControllers) {
    const px = controller.getWorldX()
    const pz = controller.getWorldZ()
    const angle = Math.atan2(pz - sz, px - sx)
    const planet = PLANETS.find((p) => p.id === (controller as unknown as { planet: { id: string } }).planet.id)
    if (!planet) continue
    bearings.push({
      label: COMPASS_LABELS[planet.id] ?? planet.name.slice(0, 2),
      bearingRad: angle - heading,
      color: planet.accentColor,
    })
  }

  return bearings
}
```

- [ ] **Step 4: Check how to access planet data from controller**

The `PlanetSystemController` has a `private readonly planet: Planet` field. We need the `id` and `accentColor`. Check if `planet` is accessible or if we need to expose it.

Read `src/three/controllers/PlanetSystemController.ts` and check if `planet` is private. If so, add a public getter:

```ts
/** The planet catalog entry. */
get id(): string {
  return this.planet.id
}

/** The planet's accent color from the catalog. */
get accentColor(): string {
  return this.planet.accentColor
}
```

Then update the bearing computation to use `controller.id` and `controller.accentColor` directly instead of the PLANETS lookup:

```ts
for (const controller of this.planetControllers) {
  const px = controller.getWorldX()
  const pz = controller.getWorldZ()
  const angle = Math.atan2(pz - sz, px - sx)
  bearings.push({
    label: COMPASS_LABELS[controller.id] ?? controller.id.slice(0, 2).toUpperCase(),
    bearingRad: angle - heading,
    color: controller.accentColor,
  })
}
```

- [ ] **Step 5: Wire bearings into the telemetry emission**

In the `onTelemetry` call (around line 1093), add the new field:

```ts
this.onTelemetry({
  // ... existing fields ...
  compassBearings: this.computeCompassBearings(),
})
```

- [ ] **Step 6: Verify type-check passes**

Run: `bun run type-check 2>&1 | grep -c "error TS"`
Expected: same 3 pre-existing errors

- [ ] **Step 7: Commit**

```bash
git add src/three/controllers/PlanetSystemController.ts src/views/MapViewController.ts
git commit -m "feat(map): compute planet compass bearings each frame"
```

---

### Task 3: Create ShuttleCompass.vue component

**Files:**
- Create: `src/components/ShuttleCompass.vue`

- [ ] **Step 1: Create the component**

Create `src/components/ShuttleCompass.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { CompassBearing } from '@/lib/ShuttleTelemetry'

const props = defineProps<{
  headingRad: number
  bearings: CompassBearing[]
}>()

/** Pixels per degree on the compass strip. */
const PX_PER_DEG = 3

/** Maximum bearing offset in pixels before clamping to strip edge. */
const MAX_OFFSET_PX = 170

/** Convert radians to degrees. */
const RAD_TO_DEG = 180 / Math.PI

/** Normalize an angle to [-180, 180] degrees. */
function normalizeDeg(deg: number): number {
  let d = deg % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return d
}

/** Planet markers positioned on the strip. */
const markers = computed(() => {
  return props.bearings.map((b) => {
    const deg = normalizeDeg(b.bearingRad * RAD_TO_DEG)
    let offsetPx = deg * PX_PER_DEG
    let clamped = false
    if (offsetPx > MAX_OFFSET_PX) {
      offsetPx = MAX_OFFSET_PX
      clamped = true
    } else if (offsetPx < -MAX_OFFSET_PX) {
      offsetPx = -MAX_OFFSET_PX
      clamped = true
    }
    return {
      label: b.label,
      color: b.color,
      offsetPx,
      clamped,
    }
  })
})
</script>

<template>
  <div class="shuttle-compass">
    <!-- Planet bearing markers -->
    <span
      v-for="m in markers"
      :key="m.label"
      class="shuttle-compass__marker"
      :style="{
        left: `calc(50% + ${m.offsetPx}px)`,
        color: m.color,
        opacity: m.clamped ? 0.4 : 1,
      }"
    >{{ m.label }}</span>
    <!-- Center heading pointer -->
    <div class="shuttle-compass__pointer" />
  </div>
</template>
```

- [ ] **Step 2: Verify type-check passes**

Run: `bun run type-check 2>&1 | grep -c "error TS"`
Expected: same 3 pre-existing errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ShuttleCompass.vue
git commit -m "feat(hud): create ShuttleCompass strip component"
```

---

### Task 4: Add compass styles to main.css

**Files:**
- Modify: `src/assets/css/main.css`

- [ ] **Step 1: Add shuttle compass styles**

Add after the existing `.shuttle-hud` / `.hud-top-cluster` block in `main.css`:

```css
.shuttle-compass {
  position: relative;
  width: 360px;
  height: 28px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.12);
  mask-image: linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%);
  -webkit-mask-image: linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%);
}

.shuttle-compass__marker {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  white-space: nowrap;
  text-shadow: 0 0 6px currentColor;
  transition: opacity 0.15s ease;
}

.shuttle-compass__pointer {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid rgba(255, 255, 255, 0.75);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/assets/css/main.css
git commit -m "style(hud): add shuttle compass strip styles"
```

---

### Task 5: Wire compass into ShuttleHud and fix z-index

**Files:**
- Modify: `src/components/ShuttleHud.vue`
- Modify: `src/assets/css/main.css`
- Modify: `src/views/MapView.vue`

- [ ] **Step 1: Fix z-index**

In `src/assets/css/main.css`, change `.shuttle-hud` from `z-20` to `z-30`:

```css
.shuttle-hud {
  @apply fixed inset-0 pointer-events-none font-mono text-xs text-green-400 z-30;
  text-shadow: 0 0 4px rgba(0, 255, 0, 0.5);
}
```

Also update `.hud-top-cluster` from `z-20` to `z-30`:

```css
.hud-top-cluster {
  @apply absolute top-4 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-0.5 text-center;
}
```

- [ ] **Step 2: Import and add ShuttleCompass to ShuttleHud.vue**

In `src/components/ShuttleHud.vue`, add the import:

```ts
import ShuttleCompass from '@/components/ShuttleCompass.vue'
```

- [ ] **Step 3: Replace hud-top-cluster layout**

Replace the `hud-top-cluster` template section with the new layout — position on the left, compass in the center, speed on the right:

```html
<div class="hud-top-cluster">
  <div class="hud-top-cluster__row">
    <span class="hud-top-cluster__coords">
      X:{{ (props.telemetry.posX / ORBIT_SCALE).toFixed(2) }}
      Z:{{ (props.telemetry.posZ / ORBIT_SCALE).toFixed(2) }} AU
    </span>
    <ShuttleCompass
      :heading-rad="props.telemetry.heading"
      :bearings="props.telemetry.compassBearings"
    />
    <span class="hud-top-cluster__speed">
      SPD {{ props.telemetry.speed.toFixed(1) }}
    </span>
  </div>
  <div v-if="props.telemetry.actionPrompt" class="hud-top-cluster__line hud-top-cluster__line--action">
    {{ props.telemetry.actionPrompt }}
  </div>
  <div v-if="props.telemetry.adriftCountdown >= 0" class="hud-top-cluster__adrift">
    {{ adriftSeconds() }}s
  </div>
</div>
```

- [ ] **Step 4: Add row layout styles to main.css**

Add to `main.css` near the existing `.hud-top-cluster` styles:

```css
.hud-top-cluster__row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.hud-top-cluster__coords {
  @apply text-green-400 whitespace-nowrap;
  font-size: 0.65rem;
}

.hud-top-cluster__speed {
  @apply text-green-400 whitespace-nowrap;
  font-size: 0.65rem;
}
```

- [ ] **Step 5: Add default compassBearings to the reactive telemetry in MapView.vue**

In `src/views/MapView.vue`, find the `reactive<ShuttleTelemetry>` initialization and add the new field:

```ts
compassBearings: [],
```

- [ ] **Step 6: Remove the old HDG line**

Remove the `formatHeading` function from `ShuttleHud.vue` since heading is now shown visually by the compass strip. Also remove the old `hud-top-cluster__line--velocity` div that contained SPD and HDG.

- [ ] **Step 7: Verify type-check passes**

Run: `bun run type-check 2>&1 | grep -c "error TS"`
Expected: same 3 pre-existing errors

- [ ] **Step 8: Visual test**

Run: `bun dev`
Open the map view in a browser. Verify:
- Compass strip is visible at top center, not clipped by any overlay
- Planet labels slide as you turn the shuttle
- Position (AU) is on the left, speed on the right
- Labels fade at strip edges
- Compass hides during intro, map overlay (M), and habitat

- [ ] **Step 9: Commit**

```bash
git add src/components/ShuttleHud.vue src/components/ShuttleCompass.vue src/assets/css/main.css src/views/MapView.vue
git commit -m "feat(hud): wire shuttle compass strip into map HUD"
```

---

### Task 6: Also commit the pending AU scale changes

**Note:** There are uncommitted changes from the AU scale refactor (planetarium.json, ship-health.json, constants, formatDistance, tests). These should be committed before or alongside this work.

- [ ] **Step 1: Stage and commit AU scale changes**

```bash
git add src/data/planets/planetarium.json src/data/shuttle/ship-health.json src/lib/planets/constants.ts src/lib/mapProjection.ts src/lib/__tests__/mapProjection.spec.ts src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts src/three/__tests__/AsteroidBeltController.nearbyTumble.spec.ts src/three/MapPlanetariumScene.ts src/components/ShuttleHud.vue
git commit -m "feat(data): realistic AU orbital distances, proportional planet sizes, AU display"
```
