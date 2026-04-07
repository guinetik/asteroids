# Survey Objective Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "survey" objective type where the player lands at a flat zone, activates a terminal on foot, collects holographic probe diamonds in the lander under a timer, and returns to deliver.

**Architecture:** Extends the existing mission type system with a new `survey` discriminator. New Three.js controllers (`TerminalModel`, `SurveyProbeController`) handle 3D visuals. Survey runtime state (timer, collection, terminal interaction) is managed in `LevelViewController`. HUD additions show timer and probe counter during active surveys.

**Tech Stack:** TypeScript, Three.js, Vue 3, Vitest

---

### Task 1: Add survey type to mission data model

**Files:**
- Modify: `src/lib/missions/types.ts:17` (ObjectiveType union)
- Modify: `src/lib/missions/types.ts:62-66` (ScalableParams union)
- Modify: `src/lib/missions/types.ts:208-231` (ConcreteObjective interface)

- [ ] **Step 1: Add `'survey'` to the `ObjectiveType` union**

In `src/lib/missions/types.ts`, line 17, change:

```ts
export type ObjectiveType = 'gather' | 'exterminate' | 'rescue'
```

to:

```ts
export type ObjectiveType = 'gather' | 'exterminate' | 'rescue' | 'survey'
```

- [ ] **Step 2: Add `SurveyScalableParams` interface**

After `RescueScalableParams` (after line 60), add:

```ts
/** Scalable params for SURVEY objectives. */
export interface SurveyScalableParams {
  /** Discriminator for the union type. */
  type: 'survey'
  /** Number of gravitometric probes to calibrate. Scales up with difficulty. */
  probeCount: NumberRange
  /** Seconds to collect all probes. INVERTED: decreases with difficulty (easy=90s, hard=45s). */
  timeLimit: NumberRange
}
```

- [ ] **Step 3: Add `SurveyScalableParams` to the `ScalableParams` union**

Change:

```ts
export type ScalableParams =
  | GatherScalableParams
  | ExterminateScalableParams
  | RescueScalableParams
```

to:

```ts
export type ScalableParams =
  | GatherScalableParams
  | ExterminateScalableParams
  | RescueScalableParams
  | SurveyScalableParams
```

- [ ] **Step 4: Add survey fields to `ConcreteObjective`**

After the `isGuarded` field (line 228), add:

```ts
  /** For survey: number of probes to calibrate. */
  probeCount?: number
  /** For survey: time limit in seconds. */
  timeLimit?: number
```

- [ ] **Step 5: Run type-check to verify no errors**

Run: `bun run type-check`
Expected: PASS (no type errors — new type is additive)

- [ ] **Step 6: Commit**

```bash
git add src/lib/missions/types.ts
git commit -m "feat: add survey objective type to mission data model"
```

---

### Task 2: Add survey rolling to mission generator

**Files:**
- Modify: `src/lib/missions/asteroidMissionGenerator.ts:108-141` (rollObjective switch)
- Test: `src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts`, inside the `rollObjective` describe block:

```ts
  it('rolls survey objective with concrete values', () => {
    const slot = {
      type: 'survey' as const,
      weight: 1,
      params: {
        type: 'survey' as const,
        probeCount: { min: 3, max: 10 },
        timeLimit: { min: 90, max: 45 },
      },
      reward: { min: 200, max: 800 },
    }
    const obj = rollObjective(slot, 5)
    expect(obj.type).toBe('survey')
    expect(obj.probeCount).toBeGreaterThanOrEqual(3)
    expect(obj.probeCount).toBeLessThanOrEqual(10)
    expect(obj.timeLimit).toBeGreaterThanOrEqual(45)
    expect(obj.timeLimit).toBeLessThanOrEqual(90)
    expect(obj.reward).toBeGreaterThanOrEqual(200)
    expect(obj.reward).toBeLessThanOrEqual(800)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test:unit src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts`
Expected: FAIL — `rollObjective` does not handle `'survey'` case

- [ ] **Step 3: Add survey case to `rollObjective()`**

In `src/lib/missions/asteroidMissionGenerator.ts`, inside the `switch (slot.params.type)` block (after the `rescue` case, before the closing `}`), add:

```ts
    case 'survey':
      return {
        type: 'survey',
        x: 0,
        z: 0,
        probeCount: interpolateRange(slot.params.probeCount, difficulty),
        timeLimit: interpolateRange(slot.params.timeLimit, difficulty),
        reward,
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test:unit src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/missions/asteroidMissionGenerator.ts src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts
git commit -m "feat: add survey case to rollObjective"
```

---

### Task 3: Add survey mission template and giver data

**Files:**
- Create: `src/data/missions/gravitometric-survey.json`
- Modify: `src/data/missions/givers/jay-mercer.json`

- [ ] **Step 1: Create the survey mission template**

Create `src/data/missions/gravitometric-survey.json`:

```json
{
  "id": "gravitometric-survey",
  "name": "Gravitometric Survey",
  "description": "Deploy and calibrate gravitometric sensor probes in low orbit above an asteroid surface.",
  "minDifficulty": 1,
  "maxDifficulty": 10,
  "objectiveSlots": [
    {
      "type": "survey",
      "weight": 1.0,
      "params": {
        "type": "survey",
        "probeCount": { "min": 3, "max": 10 },
        "timeLimit": { "min": 90, "max": 45 }
      },
      "reward": { "min": 200, "max": 800 }
    }
  ],
  "completionBonus": { "min": 100, "max": 400 },
  "regionByDifficulty": {
    "near-earth": [1, 3],
    "asteroid-belt": [4, 7],
    "kuiper-belt": [8, 10]
  }
}
```

- [ ] **Step 2: Add survey mission to Jay Mercer's giver manifest**

In `src/data/missions/givers/jay-mercer.json`:

1. Change `"objectiveTypes": ["gather"]` to `"objectiveTypes": ["gather", "survey"]`
2. Add a new mission entry to the `"missions"` array:

```json
    {
      "id": "jay_grav_survey",
      "name": "Gravitometric Survey",
      "briefing": "Science division needs gravitometric readings from the surface. Land near the beacon, calibrate the probes they drop, and bring back the data. Quick job if you fly clean.",
      "objectiveSlots": [
        {
          "type": "survey",
          "weight": 1.0,
          "params": {
            "type": "survey",
            "probeCount": { "min": 3, "max": 8 },
            "timeLimit": { "min": 90, "max": 50 }
          },
          "reward": { "min": 200, "max": 600 }
        }
      ],
      "completionBonus": { "min": 100, "max": 300 },
      "regionByDifficulty": { "near-earth": [1, 2], "asteroid-belt": [3, 5] }
    }
```

- [ ] **Step 3: Run existing mission tests to verify nothing breaks**

Run: `bun test:unit src/lib/missions/__tests__/`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/data/missions/gravitometric-survey.json src/data/missions/givers/jay-mercer.json
git commit -m "feat: add gravitometric survey mission template and giver data"
```

---

### Task 4: Create TerminalModel (placeholder cube)

**Files:**
- Create: `src/three/TerminalModel.ts`

- [ ] **Step 1: Create the TerminalModel class**

Create `src/three/TerminalModel.ts`:

```ts
/**
 * Survey terminal — placeholder cube rendered at flat zone centers
 * for survey objectives. Player interacts in EVA to start/deliver surveys.
 *
 * @author guinetik
 * @date 2026-04-07
 * @spec docs/superpowers/specs/2026-04-07-survey-objective-design.md
 */
import * as THREE from 'three'

/** Terminal box width (X axis). */
const TERMINAL_WIDTH = 2

/** Terminal box height (Y axis). */
const TERMINAL_HEIGHT = 3

/** Terminal box depth (Z axis). */
const TERMINAL_DEPTH = 1

/** Base color — dark metallic. */
const TERMINAL_COLOR = 0x334455

/** Emissive screen color — teal glow on front face. */
const SCREEN_COLOR = 0x00ffcc

/** Screen emissive intensity. */
const SCREEN_INTENSITY = 0.4

/** Interaction range — EVA player must be within this distance (world units). */
export const TERMINAL_INTERACT_RANGE = 8

/**
 * A survey terminal placed at a flat zone.
 * Currently a placeholder cube with a glowing screen face.
 *
 * @author guinetik
 * @date 2026-04-07
 */
export class TerminalModel {
  /** The Three.js group containing the terminal mesh. */
  readonly group: THREE.Group

  /** World-space position of this terminal. */
  get position(): THREE.Vector3 {
    return this.group.position
  }

  constructor() {
    this.group = new THREE.Group()

    // Body — dark metallic box
    const bodyGeo = new THREE.BoxGeometry(TERMINAL_WIDTH, TERMINAL_HEIGHT, TERMINAL_DEPTH)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: TERMINAL_COLOR,
      metalness: 0.7,
      roughness: 0.3,
    })
    const body = new THREE.Mesh(bodyGeo, bodyMat)
    body.position.y = TERMINAL_HEIGHT / 2
    body.castShadow = true
    body.receiveShadow = true
    this.group.add(body)

    // Screen — emissive front face indicator
    const screenGeo = new THREE.PlaneGeometry(TERMINAL_WIDTH * 0.7, TERMINAL_HEIGHT * 0.3)
    const screenMat = new THREE.MeshStandardMaterial({
      color: SCREEN_COLOR,
      emissive: SCREEN_COLOR,
      emissiveIntensity: SCREEN_INTENSITY,
    })
    const screen = new THREE.Mesh(screenGeo, screenMat)
    screen.position.set(0, TERMINAL_HEIGHT * 0.65, TERMINAL_DEPTH / 2 + 0.01)
    this.group.add(screen)
  }

  /**
   * Place this terminal at a world position on the terrain.
   *
   * @param x - World X.
   * @param groundY - Ground height at (x, z).
   * @param z - World Z.
   */
  placeAt(x: number, groundY: number, z: number): void {
    this.group.position.set(x, groundY, z)
  }

  /** Dispose geometry and materials. */
  dispose(): void {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (child.material instanceof THREE.Material) child.material.dispose()
      }
    })
  }
}
```

- [ ] **Step 2: Run type-check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/three/TerminalModel.ts
git commit -m "feat: add TerminalModel placeholder cube for survey objectives"
```

---

### Task 5: Create SurveyProbeController

**Files:**
- Create: `src/three/SurveyProbeController.ts`

- [ ] **Step 1: Create the SurveyProbeController class**

Create `src/three/SurveyProbeController.ts`:

```ts
/**
 * Manages holographic diamond probes for a gravitometric survey.
 *
 * Spawns octahedron wireframe meshes at given positions, animates
 * them (rotation + bob), checks lander proximity for collection,
 * and fires a callback + particle burst on collect.
 *
 * @author guinetik
 * @date 2026-04-07
 * @spec docs/superpowers/specs/2026-04-07-survey-objective-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import { ParticleEmitter } from '@/three/ParticleEmitter'

/** Diamond radius in world units. */
const PROBE_RADIUS = 3

/** Collection trigger distance (lander center to probe center). */
const COLLECT_RANGE = 15

/** Rotation speed in radians per second. */
const ROTATION_SPEED = 1.0

/** Vertical bob amplitude in world units. */
const BOB_AMPLITUDE = 0.5

/** Vertical bob speed multiplier. */
const BOB_SPEED = 2.0

/** Probe wireframe color — holographic teal. */
const PROBE_COLOR = 0x00ffcc

/** Point light intensity per probe. */
const PROBE_LIGHT_INTENSITY = 8

/** Point light range per probe. */
const PROBE_LIGHT_DISTANCE = 40

/** Number of particles emitted on collection. */
const COLLECT_PARTICLE_COUNT = 12

/** Tracked probe state. */
interface ProbeEntry {
  /** Three.js group (diamond mesh + light). */
  group: THREE.Group
  /** Original spawn Y for bob calculation. */
  baseY: number
  /** Whether this probe has been collected. */
  collected: boolean
}

/**
 * Survey probe controller — spawns, animates, and collects probes.
 *
 * @author guinetik
 * @date 2026-04-07
 */
export class SurveyProbeController implements Tickable {
  private readonly probes: ProbeEntry[] = []
  private readonly scene: THREE.Scene
  private elapsed = 0

  /** Particle emitter for collection bursts. */
  readonly collectEmitter: ParticleEmitter

  /** Number of probes collected so far. */
  get collected(): number {
    return this.probes.filter((p) => p.collected).length
  }

  /** Total probe count. */
  get total(): number {
    return this.probes.length
  }

  /** True when all probes have been collected. */
  get allCollected(): boolean {
    return this.probes.length > 0 && this.collected === this.probes.length
  }

  /** Callback fired when a probe is collected. Receives the probe index. */
  onCollect: ((index: number) => void) | null = null

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.collectEmitter = new ParticleEmitter({
      poolSize: 64,
      color: new THREE.Color(PROBE_COLOR),
      size: 2.5,
      lifetime: 0.6,
      spread: 12,
      opacity: 0.9,
    })
    scene.add(this.collectEmitter.points)
  }

  /**
   * Spawn probes at the given world positions.
   *
   * @param positions - Array of world-space positions for each probe.
   */
  spawn(positions: THREE.Vector3[]): void {
    for (const pos of positions) {
      const group = new THREE.Group()

      // Diamond mesh — wireframe octahedron
      const geo = new THREE.OctahedronGeometry(PROBE_RADIUS, 0)
      const mat = new THREE.MeshBasicMaterial({
        color: PROBE_COLOR,
        wireframe: true,
        transparent: true,
        opacity: 0.85,
      })
      const mesh = new THREE.Mesh(geo, mat)
      group.add(mesh)

      // Point light for visibility
      const light = new THREE.PointLight(PROBE_COLOR, PROBE_LIGHT_INTENSITY, PROBE_LIGHT_DISTANCE)
      group.add(light)

      group.position.copy(pos)
      this.scene.add(group)

      this.probes.push({
        group,
        baseY: pos.y,
        collected: false,
      })
    }
  }

  /**
   * Per-frame update — animate probes and check collection.
   *
   * @param dt - Delta time in seconds.
   * @param landerPos - Current lander world position (null if not in lander state).
   */
  tick(dt: number): void {
    this.elapsed += dt
    this.collectEmitter.tick(dt)

    for (let i = 0; i < this.probes.length; i++) {
      const probe = this.probes[i]!
      if (probe.collected) continue

      // Animate — rotate + bob
      probe.group.rotation.y = this.elapsed * ROTATION_SPEED
      probe.group.position.y = probe.baseY + Math.sin(this.elapsed * BOB_SPEED) * BOB_AMPLITUDE
    }
  }

  /**
   * Check lander proximity against all uncollected probes.
   * Call this each frame during lander state with the current lander position.
   *
   * @param landerPos - Current lander world position.
   */
  checkCollection(landerPos: THREE.Vector3): void {
    for (let i = 0; i < this.probes.length; i++) {
      const probe = this.probes[i]!
      if (probe.collected) continue

      const dx = landerPos.x - probe.group.position.x
      const dy = landerPos.y - probe.group.position.y
      const dz = landerPos.z - probe.group.position.z
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

      if (dist <= COLLECT_RANGE) {
        probe.collected = true
        probe.group.visible = false

        // Particle burst
        const up = new THREE.Vector3(0, 1, 0)
        for (let j = 0; j < COLLECT_PARTICLE_COUNT; j++) {
          this.collectEmitter.emit(probe.group.position, up.clone().multiplyScalar(5))
        }

        this.onCollect?.(i)
      }
    }
  }

  /** Dispose all probe meshes and the particle emitter. */
  dispose(): void {
    for (const probe of this.probes) {
      this.scene.remove(probe.group)
      probe.group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose()
          if (child.material instanceof THREE.Material) child.material.dispose()
        }
      })
    }
    this.probes.length = 0
    this.scene.remove(this.collectEmitter.points)
  }
}
```

- [ ] **Step 2: Run type-check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/three/SurveyProbeController.ts
git commit -m "feat: add SurveyProbeController with holographic diamond probes"
```

---

### Task 6: Generate probe positions (domain logic + test)

**Files:**
- Create: `src/lib/survey/probePositions.ts`
- Create: `src/lib/survey/__tests__/probePositions.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/survey/__tests__/probePositions.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { generateProbePositions } from '../probePositions'

describe('generateProbePositions', () => {
  it('returns the correct number of positions', () => {
    const positions = generateProbePositions(5, 0, 0, 42)
    expect(positions).toHaveLength(5)
  })

  it('positions are within horizontal radius range', () => {
    const cx = 100
    const cz = -200
    const positions = generateProbePositions(10, cx, cz, 99)
    for (const pos of positions) {
      const dx = pos.x - cx
      const dz = pos.z - cz
      const dist = Math.sqrt(dx * dx + dz * dz)
      expect(dist).toBeGreaterThanOrEqual(100) // MIN_RADIUS
      expect(dist).toBeLessThanOrEqual(500) // MAX_RADIUS
    }
  })

  it('positions are within altitude range', () => {
    const positions = generateProbePositions(10, 0, 0, 77)
    for (const pos of positions) {
      expect(pos.y).toBeGreaterThanOrEqual(30) // MIN_ALTITUDE
      expect(pos.y).toBeLessThanOrEqual(150) // MAX_ALTITUDE
    }
  })

  it('same seed produces same positions', () => {
    const a = generateProbePositions(5, 0, 0, 123)
    const b = generateProbePositions(5, 0, 0, 123)
    for (let i = 0; i < a.length; i++) {
      expect(a[i]!.x).toBe(b[i]!.x)
      expect(a[i]!.y).toBe(b[i]!.y)
      expect(a[i]!.z).toBe(b[i]!.z)
    }
  })

  it('different seeds produce different positions', () => {
    const a = generateProbePositions(5, 0, 0, 1)
    const b = generateProbePositions(5, 0, 0, 2)
    const allSame = a.every((p, i) => p.x === b[i]!.x && p.z === b[i]!.z)
    expect(allSame).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test:unit src/lib/survey/__tests__/probePositions.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `generateProbePositions`**

Create `src/lib/survey/probePositions.ts`:

```ts
/**
 * Generates deterministic probe positions for a gravitometric survey.
 *
 * Probes are scattered randomly within a cylindrical volume above a
 * flat zone center. Uses a seeded PRNG for reproducibility.
 *
 * @author guinetik
 * @date 2026-04-07
 * @spec docs/superpowers/specs/2026-04-07-survey-objective-design.md
 */

/** Minimum horizontal distance from zone center (world units). */
const MIN_RADIUS = 100

/** Maximum horizontal distance from zone center (world units). */
const MAX_RADIUS = 500

/** Minimum probe altitude above ground (world units). */
const MIN_ALTITUDE = 30

/** Maximum probe altitude above ground (world units). */
const MAX_ALTITUDE = 150

/** Simple position output (no Three.js dependency in domain code). */
export interface ProbePosition {
  /** World X. */
  x: number
  /** World Y (altitude above ground). */
  y: number
  /** World Z. */
  z: number
}

/**
 * Seeded pseudo-random number generator (mulberry32).
 *
 * @param seed - Integer seed.
 * @returns Function that returns the next random number in [0, 1).
 */
function mulberry32(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Generate probe positions scattered above a flat zone.
 *
 * @param count - Number of probes.
 * @param centerX - Flat zone center X.
 * @param centerZ - Flat zone center Z.
 * @param seed - Random seed for deterministic placement.
 * @returns Array of probe positions.
 */
export function generateProbePositions(
  count: number,
  centerX: number,
  centerZ: number,
  seed: number,
): ProbePosition[] {
  const rng = mulberry32(seed)
  const positions: ProbePosition[] = []

  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2
    const radius = MIN_RADIUS + rng() * (MAX_RADIUS - MIN_RADIUS)
    const altitude = MIN_ALTITUDE + rng() * (MAX_ALTITUDE - MIN_ALTITUDE)

    positions.push({
      x: centerX + Math.cos(angle) * radius,
      y: altitude,
      z: centerZ + Math.sin(angle) * radius,
    })
  }

  return positions
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test:unit src/lib/survey/__tests__/probePositions.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/survey/probePositions.ts src/lib/survey/__tests__/probePositions.spec.ts
git commit -m "feat: add deterministic probe position generator for surveys"
```

---

### Task 7: Add survey color to LevelView objective map

**Files:**
- Modify: `src/views/LevelView.vue:29-33` (OBJECTIVE_COLORS)

- [ ] **Step 1: Add `survey` color to the OBJECTIVE_COLORS map**

In `src/views/LevelView.vue`, change:

```ts
const OBJECTIVE_COLORS: Record<string, string> = {
  gather: '#66ffee',
  exterminate: '#ff4444',
  rescue: '#ffcc44',
}
```

to:

```ts
const OBJECTIVE_COLORS: Record<string, string> = {
  gather: '#66ffee',
  exterminate: '#ff4444',
  rescue: '#ffcc44',
  survey: '#00ffcc',
}
```

- [ ] **Step 2: Run type-check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/views/LevelView.vue
git commit -m "feat: add survey color to objective map markers"
```

---

### Task 8: Add survey HUD elements to LanderHud

**Files:**
- Modify: `src/components/LanderHud.vue`

- [ ] **Step 1: Add survey props to `LanderTelemetry` interface**

In `src/components/LanderHud.vue`, add to the `LanderTelemetry` interface (after `landingSafety`):

```ts
  /** Survey timer remaining in seconds (null if no active survey). */
  surveyTimeRemaining: number | null
  /** Number of probes collected (null if no active survey). */
  surveyProbesCollected: number | null
  /** Total probes to collect (null if no active survey). */
  surveyProbesTotal: number | null
```

- [ ] **Step 2: Add timer format helper**

After the `fuelColor` function, add:

```ts
function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function timerColor(seconds: number): string {
  if (seconds <= 15) return 'text-red-500'
  if (seconds <= 30) return 'text-yellow-500'
  return 'text-green-400'
}
```

- [ ] **Step 3: Add survey HUD template**

In the template, after the `lander-hud-gauges` div (before the closing `</div>` of `lander-hud`), add:

```html
    <!-- Survey overlay -->
    <div v-if="props.telemetry.surveyTimeRemaining !== null" class="survey-hud">
      <div class="survey-timer" :class="timerColor(props.telemetry.surveyTimeRemaining ?? 0)">
        {{ formatTimer(props.telemetry.surveyTimeRemaining ?? 0) }}
      </div>
      <div class="survey-probes">
        {{ props.telemetry.surveyProbesCollected ?? 0 }}/{{ props.telemetry.surveyProbesTotal ?? 0 }} PROBES
      </div>
    </div>
```

- [ ] **Step 4: Update the `landerTelemetry` reactive object in `LevelView.vue`**

In `src/views/LevelView.vue`, add the new fields to the `landerTelemetry` reactive object (after `landingSafety: 'safe'`):

```ts
  surveyTimeRemaining: null,
  surveyProbesCollected: null,
  surveyProbesTotal: null,
```

- [ ] **Step 5: Add survey HUD CSS to `src/assets/css/main.css`**

Add to `src/assets/css/main.css`:

```css
/* Survey HUD — timer + probe count overlay during active surveys */
.survey-hud {
  @apply(fixed top-4 right-4 z-30 flex flex-col items-end gap-1 pointer-events-none);
}
.survey-timer {
  @apply(font-mono text-3xl tracking-widest);
  font-family: 'Datatype', ui-monospace, monospace;
}
.survey-probes {
  @apply(font-mono text-sm tracking-wider text-cyan-400);
  font-family: 'Datatype', ui-monospace, monospace;
}
```

- [ ] **Step 6: Run type-check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/LanderHud.vue src/views/LevelView.vue src/assets/css/main.css
git commit -m "feat: add survey timer and probe counter to lander HUD"
```

---

### Task 9: Integrate survey runtime into LevelViewController

**Files:**
- Modify: `src/views/LevelViewController.ts`

This is the largest task — wires everything together. The survey state machine (idle/active/delivered/failed) runs per-objective inside the existing level state machine.

- [ ] **Step 1: Add imports**

At the top of `src/views/LevelViewController.ts`, add:

```ts
import { TerminalModel, TERMINAL_INTERACT_RANGE } from '@/three/TerminalModel'
import { SurveyProbeController } from '@/three/SurveyProbeController'
import { generateProbePositions } from '@/lib/survey/probePositions'
```

- [ ] **Step 2: Add survey state interface and instance fields**

After the mission fields section (around line 188), add the interface above the class and new fields inside the class:

Above the class (after the `hashSeed` function area):

```ts
/** Runtime state for a single survey objective. */
interface SurveyRuntimeState {
  /** Index into missionObjectives array. */
  objectiveIndex: number
  /** Current phase. */
  status: 'idle' | 'active' | 'delivered' | 'failed'
  /** Terminal model placed at flat zone. */
  terminal: TerminalModel
  /** Probe controller (created on activation). */
  probeController: SurveyProbeController | null
  /** Time remaining in seconds (set on activation). */
  timeRemaining: number
}
```

Inside the class, after `private missionObjectives: ConcreteObjective[] = []`:

```ts
  /** Survey runtime states — one per survey objective. */
  private surveyStates: SurveyRuntimeState[] = []

  /** Called each frame during EVA with terminal prompt text (null to hide). */
  onTerminalPrompt: ((text: string | null) => void) | null = null
```

- [ ] **Step 3: Place terminals during init for survey objectives**

In the `init()` method, after the objective waypoint markers loop (after line 277), add:

```ts
    // ── Survey terminals ───────────────────────────────────────
    for (let i = 0; i < mission.objectives.length; i++) {
      const obj = mission.objectives[i]!
      if (obj.type !== 'survey') continue
      const groundY = this.heightmap!.heightAt(obj.x, obj.z)
      const terminal = new TerminalModel()
      terminal.placeAt(obj.x + 5, groundY, obj.z)
      this.sceneManager!.addToScene(terminal.group)
      this.surveyStates.push({
        objectiveIndex: i,
        status: 'idle',
        terminal,
        probeController: null,
        timeRemaining: obj.timeLimit ?? 90,
      })
    }
```

- [ ] **Step 4: Add survey tick logic**

Add a new private method to the class:

```ts
  /** Per-frame survey logic — timer countdown, probe collection, terminal interaction. */
  private tickSurveys(dt: number): void {
    const currentState = this.stateMachine?.state ?? ''

    for (const survey of this.surveyStates) {
      if (survey.status === 'delivered' || survey.status === 'failed') continue

      // Tick probe controller if active
      if (survey.probeController) {
        survey.probeController.tick(dt)
      }

      // Timer countdown when active
      if (survey.status === 'active') {
        survey.timeRemaining -= dt
        if (survey.timeRemaining <= 0) {
          survey.timeRemaining = 0
          survey.status = 'failed'
          continue
        }

        // Check probe collection while in lander
        if (currentState === 'lander' && this.landerController && survey.probeController) {
          survey.probeController.checkCollection(this.landerController.position)
        }
      }

      // Terminal interaction during EVA
      if (currentState === 'eva' && this.playerController) {
        const playerPos = this.playerController.group.position
        const termPos = survey.terminal.position
        const dx = playerPos.x - termPos.x
        const dz = playerPos.z - termPos.z
        const dist = Math.sqrt(dx * dx + dz * dz)

        if (dist <= TERMINAL_INTERACT_RANGE) {
          if (survey.status === 'idle') {
            this.onTerminalPrompt?.('[E] BEGIN GRAVITOMETRIC SURVEY')
            if (this.inputManager?.wasActionPressed('interact')) {
              this.activateSurvey(survey)
            }
          } else if (survey.status === 'active' && survey.probeController?.allCollected) {
            this.onTerminalPrompt?.('[E] DELIVER CALIBRATION DATA')
            if (this.inputManager?.wasActionPressed('interact')) {
              survey.status = 'delivered'
              this.onTerminalPrompt?.(null)
            }
          }
        }
      }
    }

    // Clear prompt if no terminal is in range
    if (currentState === 'eva' && this.playerController) {
      const nearAny = this.surveyStates.some((s) => {
        if (s.status === 'delivered' || s.status === 'failed') return false
        const playerPos = this.playerController!.group.position
        const dx = playerPos.x - s.terminal.position.x
        const dz = playerPos.z - s.terminal.position.z
        return Math.sqrt(dx * dx + dz * dz) <= TERMINAL_INTERACT_RANGE
      })
      if (!nearAny) this.onTerminalPrompt?.(null)
    }
  }

  /** Activate a survey — spawn probes, refuel lander, start timer. */
  private activateSurvey(survey: SurveyRuntimeState): void {
    const obj = this.missionObjectives[survey.objectiveIndex]!
    survey.status = 'active'
    survey.timeRemaining = obj.timeLimit ?? 90

    // Refuel the lander
    this.landerController?.thrusterSystem.refuel()

    // Generate and spawn probes
    const seed = hashSeed(this.mission!.id) + survey.objectiveIndex
    const probePositions = generateProbePositions(
      obj.probeCount ?? 5,
      obj.x,
      obj.z,
      seed,
    )
    // Convert to Three.js vectors and add ground height
    const positions = probePositions.map((p) => {
      const groundY = this.heightmap?.heightAt(p.x, p.z) ?? 0
      return new Vector3(p.x, groundY + p.y, p.z)
    })

    survey.probeController = new SurveyProbeController(this.sceneManager!.scene)
    survey.probeController.spawn(positions)
    this.tickHandler!.register(survey.probeController, TICK_PRIORITY_PHYSICS + 4)

    this.onTerminalPrompt?.(null)
  }
```

- [ ] **Step 5: Call `tickSurveys` from the main `tick` method**

In the `tick()` method, after the `enforceLanderAltitudeCeiling()` call (around line 863), add:

```ts
    this.tickSurveys(dt)
```

- [ ] **Step 6: Feed survey data into lander telemetry**

In the lander telemetry section (inside the `if (currentState === 'lander' && this.onLanderTelemetry` block), add the survey fields to the telemetry object. After `landingSafety`:

```ts
          surveyTimeRemaining: this.getActiveSurveyTimeRemaining(),
          surveyProbesCollected: this.getActiveSurveyProbesCollected(),
          surveyProbesTotal: this.getActiveSurveyProbesTotal(),
```

And add these helper methods to the class:

```ts
  /** Get remaining time for the first active survey (null if none). */
  private getActiveSurveyTimeRemaining(): number | null {
    const active = this.surveyStates.find((s) => s.status === 'active')
    return active ? active.timeRemaining : null
  }

  /** Get collected probes for the first active survey (null if none). */
  private getActiveSurveyProbesCollected(): number | null {
    const active = this.surveyStates.find((s) => s.status === 'active')
    return active?.probeController ? active.probeController.collected : null
  }

  /** Get total probes for the first active survey (null if none). */
  private getActiveSurveyProbesTotal(): number | null {
    const active = this.surveyStates.find((s) => s.status === 'active')
    return active?.probeController ? active.probeController.total : null
  }
```

- [ ] **Step 7: Prevent F-key interact from triggering state machine when near a terminal**

The F key is shared between terminal interaction and lander enter/exit/exfil. In the `tick()` method, the existing F-key block (line 835-841) fires state machine triggers. We need to suppress this when near a terminal.

Change the existing interact block:

```ts
    if (this.inputManager?.wasActionPressed('interact') && this.stateMachine && !this.landerDestroyed) {
      if (!this.stateMachine.trigger('exfiltrate')) {
        if (!this.stateMachine.trigger('exitVehicle')) {
          this.stateMachine.trigger('enterVehicle')
        }
      }
    }
```

to:

```ts
    if (this.inputManager?.wasActionPressed('interact') && this.stateMachine && !this.landerDestroyed) {
      // Skip state-machine triggers if player is near a survey terminal (terminal handles F key)
      const nearTerminal = this.isPlayerNearSurveyTerminal()
      if (!nearTerminal) {
        if (!this.stateMachine.trigger('exfiltrate')) {
          if (!this.stateMachine.trigger('exitVehicle')) {
            this.stateMachine.trigger('enterVehicle')
          }
        }
      }
    }
```

And add the helper:

```ts
  /** Check if the EVA player is within interact range of any survey terminal. */
  private isPlayerNearSurveyTerminal(): boolean {
    if (!this.playerController || this.stateMachine?.state !== 'eva') return false
    const playerPos = this.playerController.group.position
    return this.surveyStates.some((s) => {
      if (s.status === 'delivered' || s.status === 'failed') return false
      const dx = playerPos.x - s.terminal.position.x
      const dz = playerPos.z - s.terminal.position.z
      return Math.sqrt(dx * dx + dz * dz) <= TERMINAL_INTERACT_RANGE
    })
  }
```

- [ ] **Step 8: Dispose survey resources in `dispose()`**

In the `dispose()` method, before `this.gameLoop?.stop()`, add:

```ts
    for (const survey of this.surveyStates) {
      survey.terminal.dispose()
      if (survey.probeController) {
        this.tickHandler?.unregister(survey.probeController)
        survey.probeController.dispose()
      }
    }
    this.surveyStates.length = 0
```

- [ ] **Step 9: Run type-check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/views/LevelViewController.ts
git commit -m "feat: integrate survey runtime — terminals, probes, timer, collection"
```

---

### Task 10: Add terminal prompt to LevelView template

**Files:**
- Modify: `src/views/LevelView.vue`

- [ ] **Step 1: Add terminal prompt ref and callback**

In `src/views/LevelView.vue`, add a ref after the existing refs:

```ts
const terminalPrompt = ref<string | null>(null)
```

In the `onMounted` callback, after the existing callback assignments and before `await viewController.init(container.value)`, add:

```ts
    viewController.onTerminalPrompt = (text) => {
      terminalPrompt.value = text
    }
```

- [ ] **Step 2: Add terminal prompt to the template**

After the EXIT (F) prompt div and before the EXFILTRATE prompt div, add:

```html
  <div
    v-if="terminalPrompt"
    class="exit-prompt"
  >
    <span class="exit-prompt__text exit-prompt__text--terminal">{{ terminalPrompt }}</span>
  </div>
```

- [ ] **Step 3: Add terminal prompt CSS variant**

In the `<style>` section of `LevelView.vue`, after `.exit-prompt__text`, add:

```css
.exit-prompt__text--terminal {
  border-color: rgba(0, 255, 204, 0.5);
  color: rgba(0, 255, 204, 0.9);
  text-shadow: 0 0 8px rgba(0, 255, 204, 0.5);
}
```

- [ ] **Step 4: Run type-check**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/LevelView.vue
git commit -m "feat: add terminal interaction prompt to level HUD"
```

---

### Task 11: Smoke test the full flow

**Files:** None (manual testing)

- [ ] **Step 1: Run all unit tests**

Run: `bun test:unit`
Expected: All tests PASS

- [ ] **Step 2: Run lint**

Run: `bun lint`
Expected: No errors (warnings from missing TSDoc on new exports are acceptable for now)

- [ ] **Step 3: Run the dev server and test manually**

Run: `bun dev`

Test the survey flow:
1. Navigate to `/level?asteroidId=bennu` (or accept a survey mission from Jay Mercer)
2. Fly to a survey objective waypoint (if the generated mission has one)
3. Land near the terminal cube at the flat zone
4. Exit lander (F), walk to terminal
5. Press F to begin survey — verify probes spawn, lander refuels
6. Board lander (F), fly through diamond probes
7. Verify counter updates in HUD, timer counts down
8. Return to terminal, deliver calibration data

- [ ] **Step 4: Fix any lint warnings on new exports (add TSDoc)**

Run: `bun lint` and add any missing TSDoc comments that ESLint flags.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "fix: resolve lint warnings for survey objective exports"
```
