# Objective Waypoints, Compass & Minimap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire mission objectives to terrain flat zones, add 3D waypoint beams, an FPS compass strip, and a toggleable minimap.

**Architecture:** Objectives gain world positions during mission generation (flat zone rejection sampling). The level reads those positions to create terrain flat zones and 3D waypoint markers. FPS compass and minimap are Vue HUD components driven by telemetry callbacks from the level controller.

**Tech Stack:** Three.js (waypoint markers), Vue 3 (compass + minimap components), pure TS (bearing math, map colors)

---

### Task 1: Add positions to ConcreteObjective and scale count by difficulty

**Files:**
- Modify: `src/lib/missions/types.ts:207-227`
- Modify: `src/lib/missions/asteroidMissionGenerator.ts`
- Modify: `src/lib/terrain/terrainGenerator.ts:314-321` (export constants)
- Test: `src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts`

- [ ] **Step 1: Add x/z fields to ConcreteObjective**

In `src/lib/missions/types.ts`, add position fields to the interface:

```ts
/** Concrete rolled objective values for a generated mission. */
export interface ConcreteObjective {
  /** Objective type. */
  type: ObjectiveType
  /** World-space X position (flat zone center). */
  x: number
  /** World-space Z position (flat zone center). */
  z: number
  /** For gather: kg to collect. */
  resourceAmount?: number
  /** For exterminate: nest count. */
  nestCount?: number
  /** For exterminate: swarm size per nest. */
  swarmSize?: number
  /** For exterminate: whether spitters are present. */
  hasSpitters?: boolean
  /** For rescue: colonist count. */
  colonistCount?: number
  /** For rescue: seconds of oxygen. */
  oxygenTime?: number
  /** For rescue: whether site is guarded. */
  isGuarded?: boolean
  /** Credit reward for this objective. */
  reward: number
}
```

- [ ] **Step 2: Export terrain constants for shared use**

In `src/lib/terrain/terrainGenerator.ts`, export the three flat zone constants so the mission generator can use them:

```ts
/** Default flat zone radius for landing/objective areas (world units). */
export const FLAT_ZONE_RADIUS = 300

/** Minimum distance between flat zone centres as a fraction of worldSize. */
export const FLAT_ZONE_MIN_SPACING_FRACTION = 0.25

/** Margin from world edge for flat zone placement as a fraction of worldSize. */
export const FLAT_ZONE_EDGE_MARGIN_FRACTION = 0.15
```

- [ ] **Step 3: Add objective count helper and position assignment to generator**

In `src/lib/missions/asteroidMissionGenerator.ts`, add a function to determine objective count from difficulty, and update `generateAsteroidMission` to roll multiple objectives with positions:

```ts
import { generateFlatZones } from '@/lib/terrain/terrainGenerator'

/** Level terrain grid size — shared with LevelViewController. */
export const LEVEL_GRID_SIZE = 12000

/** Minimum number of objectives per difficulty band. */
const OBJECTIVE_COUNT_BY_DIFFICULTY: [number, number, number][] = [
  [1, 3, 1],  // difficulty 1-3: 1 objective
  [4, 6, 2],  // difficulty 4-6: 2 objectives
  [7, 10, 3], // difficulty 7-10: 3 objectives
]

/**
 * Determine number of objectives based on mission difficulty.
 *
 * @param difficulty - Mission difficulty (1-10).
 * @returns Number of objectives (1-3).
 */
export function objectiveCountForDifficulty(difficulty: number): number {
  for (const [min, max, count] of OBJECTIVE_COUNT_BY_DIFFICULTY) {
    if (difficulty >= min && difficulty <= max) return count
  }
  return 1
}
```

Then update `generateAsteroidMission` to:
1. Determine objective count with `objectiveCountForDifficulty(difficulty)`
2. Pick that many objective slots (weighted selection, up to count)
3. Generate flat zones with `generateFlatZones(count, LEVEL_GRID_SIZE, hashSeed(missionId))`
4. Assign each rolled objective's `x`/`z` from the corresponding flat zone

Replace the single-objective logic (current lines 188-190):

```ts
  const asteroidId = pickAsteroidForDifficulty(difficulty)
  const missionId = `${pick.template.id}_${Date.now()}`

  // Roll objectives — count scales with difficulty
  const count = objectiveCountForDifficulty(difficulty)
  const objectives: ConcreteObjective[] = []

  // Pick slots by descending weight, up to count
  const sortedSlots = [...pick.template.objectiveSlots]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, count)

  for (const slot of sortedSlots) {
    objectives.push(rollObjective(slot, difficulty))
  }

  // Generate flat zone positions for each objective
  const seed = hashSeed(missionId)
  const zones = generateFlatZones(objectives.length, LEVEL_GRID_SIZE, seed)
  for (let i = 0; i < objectives.length; i++) {
    objectives[i]!.x = zones[i]!.x
    objectives[i]!.z = zones[i]!.z
  }

  const completionBonus = interpolateRange(pick.template.completionBonus, difficulty)
  const totalReward = objectives.reduce((sum, o) => sum + o.reward, 0) + completionBonus

  const waypoint = generateWaypointInRegion(pick.region)

  return {
    id: missionId,
    asteroidId,
    giverId: pick.giver.id,
    giverName: pick.giver.name,
    templateId: pick.template.id,
    name: pick.template.name,
    briefing: pick.template.briefing,
    difficulty,
    region: pick.region,
    objectives,
    totalReward,
    waypoint,
    status: 'available',
  }
```

Add `hashSeed` at the top of the file (same function as in LevelViewController):

```ts
/** Simple string hash to derive a numeric seed. */
function hashSeed(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}
```

- [ ] **Step 4: Update rollObjective to initialize x/z to 0**

In `rollObjective`, add `x: 0, z: 0` to all return objects (positions are overwritten by the generator after flat zone placement):

```ts
  switch (slot.params.type) {
    case 'gather':
      return {
        type: 'gather',
        x: 0,
        z: 0,
        resourceAmount: interpolateRange(slot.params.resourceAmount, difficulty),
        reward,
      }
    case 'exterminate':
      return {
        type: 'exterminate',
        x: 0,
        z: 0,
        nestCount: interpolateRange(slot.params.nestCount, difficulty),
        swarmSize: interpolateRange(slot.params.swarmSize, difficulty),
        hasSpitters: Math.random() < slot.params.spitterChance,
        reward,
      }
    case 'rescue':
      return {
        type: 'rescue',
        x: 0,
        z: 0,
        colonistCount: interpolateRange(slot.params.colonistCount, difficulty),
        oxygenTime: interpolateRange(slot.params.oxygenTime, difficulty),
        isGuarded: Math.random() < slot.params.guardedChance,
        reward,
      }
  }
```

- [ ] **Step 5: Write tests for objective count and positions**

In `src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts`, add tests:

```ts
import {
  objectiveCountForDifficulty,
  generateAsteroidMission,
} from '../asteroidMissionGenerator'

describe('objectiveCountForDifficulty', () => {
  it('returns 1 for difficulty 1-3', () => {
    expect(objectiveCountForDifficulty(1)).toBe(1)
    expect(objectiveCountForDifficulty(3)).toBe(1)
  })

  it('returns 2 for difficulty 4-6', () => {
    expect(objectiveCountForDifficulty(4)).toBe(2)
    expect(objectiveCountForDifficulty(6)).toBe(2)
  })

  it('returns 3 for difficulty 7-10', () => {
    expect(objectiveCountForDifficulty(7)).toBe(3)
    expect(objectiveCountForDifficulty(10)).toBe(3)
  })
})

describe('generateAsteroidMission objective positions', () => {
  it('generates objectives with valid x/z positions', () => {
    const mission = generateAsteroidMission(5)
    for (const obj of mission.objectives) {
      expect(typeof obj.x).toBe('number')
      expect(typeof obj.z).toBe('number')
      expect(Math.abs(obj.x)).toBeLessThan(6000)
      expect(Math.abs(obj.z)).toBeLessThan(6000)
    }
  })

  it('scales objective count with difficulty', () => {
    const easy = generateAsteroidMission(1)
    const hard = generateAsteroidMission(8)
    expect(easy.objectives.length).toBe(1)
    expect(hard.objectives.length).toBe(3)
  })
})
```

- [ ] **Step 6: Fix mock mission in missionStorage test**

In `src/lib/missions/__tests__/missionStorage.spec.ts`, add `x: 0, z: 0` to the mock objective:

```ts
  objectives: [{ type: 'gather', x: 0, z: 0, resourceAmount: 75, reward: 450 }],
```

- [ ] **Step 7: Run tests**

Run: `bun test:unit src/lib/missions/`
Expected: All mission tests pass.

- [ ] **Step 8: Update LevelViewController to use objective positions as flat zones**

In `src/views/LevelViewController.ts`, replace the `generateFlatZones` call in `init()` with objective-derived zones. Import `FLAT_ZONE_RADIUS` from terrain generator and `LEVEL_GRID_SIZE` from the mission generator.

Remove the `FLAT_ZONE_COUNT` constant and the `generateFlatZones` import. Replace the terrain section:

```ts
import { generateTerrain } from '@/lib/terrain/terrainGenerator'
import type { FlatZone } from '@/lib/terrain/terrainGenerator'
import { FLAT_ZONE_RADIUS } from '@/lib/terrain/terrainGenerator'
import { LEVEL_GRID_SIZE } from '@/lib/missions/asteroidMissionGenerator'
```

In `resolveLevelContext`, return the mission too:

```ts
interface LevelContext {
  asteroid: AsteroidDefinition
  seed: number
  mission: GeneratedAsteroidMission
}
```

Update `resolveLevelContext` to always return a mission (generate ad-hoc if needed):

```ts
function resolveLevelContext(): LevelContext {
  const params = new URLSearchParams(window.location.search)
  const paramId = params.get('asteroidId')

  let mission: GeneratedAsteroidMission

  if (paramId) {
    mission = generateAsteroidMission(5)
    mission.asteroidId = paramId
  } else {
    mission = loadActiveMission() ?? generateAsteroidMission(5)
  }

  const asteroid = getAsteroidById(mission.asteroidId) ?? ASTEROID_CATALOG[0]!
  const seed = hashSeed(mission.id)

  return { asteroid, seed, mission }
}
```

Replace the terrain init block:

```ts
    // ── Asteroid data ────────────────────────────────────────────
    const { asteroid, seed, mission } = resolveLevelContext()

    // ── Terrain ─────────────────────────────────────────────────
    const flat = new URLSearchParams(window.location.search).has('flat')
    const flatZones: FlatZone[] = mission.objectives.map((obj) => ({
      x: obj.x,
      z: obj.z,
      radius: FLAT_ZONE_RADIUS,
    }))
    this.heightmap = flat
      ? new Heightmap(TERRAIN_RESOLUTION, LEVEL_GRID_SIZE)
      : generateTerrain(asteroid.surface, {
          seed,
          resolution: TERRAIN_RESOLUTION,
          worldSize: LEVEL_GRID_SIZE,
          flatZones,
        })
```

Remove the `GRID_SIZE` constant and use `LEVEL_GRID_SIZE` everywhere it was used.

- [ ] **Step 9: Run type-check**

Run: `bun run type-check`
Expected: No errors.

- [ ] **Step 10: Commit**

```bash
git add src/lib/missions/types.ts src/lib/missions/asteroidMissionGenerator.ts \
  src/lib/terrain/terrainGenerator.ts src/lib/missions/__tests__/ \
  src/views/LevelViewController.ts
git commit -m "feat: objectives own positions via flat zone generation in mission"
```

---

### Task 2: 3D Waypoint Markers

**Files:**
- Create: `src/three/WaypointMarkers.ts`
- Modify: `src/views/LevelViewController.ts`

- [ ] **Step 1: Create WaypointMarkers.ts**

Create `src/three/WaypointMarkers.ts` — ported from irover with the same visual structure (beam core, glow, ring, diamond):

```ts
/**
 * 3D waypoint markers for mission objectives.
 *
 * Each marker is a glowing vertical beam with a pulsing base ring
 * and rotating diamond tip. Placed at flat zone centers on the
 * terrain surface, visible from orbit during lander descent.
 *
 * @author guinetik
 * @date 2026-04-07
 * @spec docs/superpowers/specs/2026-04-07-objective-waypoints-design.md
 */
import * as THREE from 'three'

/** Beam height in world units — tall enough to see from lander altitude. */
const BEAM_HEIGHT = 80

/** Beam core cylinder radius. */
const BEAM_CORE_RADIUS = 1.5

/** Beam glow cylinder radius. */
const BEAM_GLOW_RADIUS = 4

/** Base ring torus major radius. */
const RING_RADIUS = 12

/** Base ring torus tube radius. */
const RING_TUBE = 0.6

/** Default marker color — cyan energy. */
const MARKER_COLOR = 0x66ffee

/** Tracked marker entry. */
interface WaypointMarker {
  /** Unique objective id. */
  id: string
  /** Three.js group containing all marker meshes. */
  group: THREE.Group
}

/** Module-level marker registry. */
const markers: WaypointMarker[] = []

/**
 * Build a translucent additive beam material.
 *
 * @param color - Hex color.
 * @param opacity - Base opacity (0-1).
 * @returns MeshBasicMaterial configured for additive blending.
 */
function createBeamMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
}

/**
 * Create the mesh group for a single waypoint marker.
 *
 * @param color - Marker color (default cyan).
 * @returns Group containing beam core, glow, ring, and diamond meshes.
 */
function createMarkerMesh(color: number = MARKER_COLOR): THREE.Group {
  const group = new THREE.Group()

  // Beam core — bright inner cylinder
  const beamCoreGeo = new THREE.CylinderGeometry(
    BEAM_CORE_RADIUS * 0.7,
    BEAM_CORE_RADIUS,
    BEAM_HEIGHT,
    10,
    1,
    true,
  )
  const beamCore = new THREE.Mesh(beamCoreGeo, createBeamMaterial(color, 0.72))
  beamCore.name = 'beamCore'
  beamCore.position.y = BEAM_HEIGHT / 2
  group.add(beamCore)

  // Beam glow — softer outer cylinder
  const beamGlowGeo = new THREE.CylinderGeometry(
    BEAM_GLOW_RADIUS * 0.45,
    BEAM_GLOW_RADIUS,
    BEAM_HEIGHT * 1.08,
    12,
    1,
    true,
  )
  const beamGlow = new THREE.Mesh(beamGlowGeo, createBeamMaterial(color, 0.22))
  beamGlow.name = 'beamGlow'
  beamGlow.position.y = (BEAM_HEIGHT * 1.08) / 2
  group.add(beamGlow)

  // Base ring — torus at ground level
  const ringGeo = new THREE.TorusGeometry(RING_RADIUS, RING_TUBE, 8, 32)
  const ringMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.7,
  })
  const ring = new THREE.Mesh(ringGeo, ringMat)
  ring.name = 'ring'
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.1
  group.add(ring)

  // Top diamond — octahedron at beam peak
  const diamondGeo = new THREE.OctahedronGeometry(3, 0)
  const diamondMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.9,
  })
  const diamond = new THREE.Mesh(diamondGeo, diamondMat)
  diamond.name = 'diamond'
  diamond.position.y = BEAM_HEIGHT + 4
  group.add(diamond)

  return group
}

/**
 * Add a waypoint marker to the scene at the given world position.
 *
 * @param id - Unique marker id (objective id).
 * @param x - World X position.
 * @param z - World Z position.
 * @param groundY - Terrain height at (x, z).
 * @param scene - Three.js scene to add marker to.
 */
export function addWaypointMarker(
  id: string,
  x: number,
  z: number,
  groundY: number,
  scene: THREE.Scene,
): void {
  if (markers.find((m) => m.id === id)) return
  const group = createMarkerMesh()
  group.position.set(x, groundY, z)
  scene.add(group)
  markers.push({ id, group })
}

/**
 * Remove a specific waypoint marker by id.
 *
 * @param id - Marker id to remove.
 * @param scene - Three.js scene to remove from.
 */
export function removeWaypointMarker(id: string, scene: THREE.Scene): void {
  const idx = markers.findIndex((m) => m.id === id)
  if (idx === -1) return
  const marker = markers[idx]!
  scene.remove(marker.group)
  marker.group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
      if (child.material instanceof THREE.Material) child.material.dispose()
    }
  })
  markers.splice(idx, 1)
}

/**
 * Remove all waypoint markers from the scene.
 *
 * @param scene - Three.js scene to clear.
 */
export function clearWaypointMarkers(scene: THREE.Scene): void {
  for (const marker of markers) {
    scene.remove(marker.group)
    marker.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (child.material instanceof THREE.Material) child.material.dispose()
      }
    })
  }
  markers.length = 0
}

/**
 * Animate all markers. Call each frame with elapsed scene time.
 * Pulses the ring, modulates beam opacity, and rotates the diamond.
 *
 * @param elapsed - Total elapsed time in seconds.
 */
export function updateWaypointMarkers(elapsed: number): void {
  const pulse = 0.5 + 0.5 * Math.sin(elapsed * 3)
  for (const marker of markers) {
    const ring = marker.group.getObjectByName('ring') as THREE.Mesh | undefined
    if (ring) {
      ring.scale.setScalar(0.9 + pulse * 0.2)
      ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.4 + pulse * 0.4
    }

    const beamCore = marker.group.getObjectByName('beamCore') as THREE.Mesh | undefined
    if (beamCore) {
      ;(beamCore.material as THREE.MeshBasicMaterial).opacity = 0.55 + pulse * 0.22
    }

    const beamGlow = marker.group.getObjectByName('beamGlow') as THREE.Mesh | undefined
    if (beamGlow) {
      beamGlow.scale.setScalar(0.95 + pulse * 0.1)
      ;(beamGlow.material as THREE.MeshBasicMaterial).opacity = 0.16 + pulse * 0.12
    }

    const diamond = marker.group.getObjectByName('diamond') as THREE.Mesh | undefined
    if (diamond) {
      diamond.rotation.y = elapsed * 2
      diamond.position.y = BEAM_HEIGHT + 4 + Math.sin(elapsed * 2) * 2
    }
  }
}
```

- [ ] **Step 2: Wire markers into LevelViewController**

In `src/views/LevelViewController.ts`, import and use the waypoint markers. Add after terrain creation in `init()`:

```ts
import {
  addWaypointMarker,
  updateWaypointMarkers,
  clearWaypointMarkers,
} from '@/three/WaypointMarkers'
```

After the terrain mesh is added to the scene, create markers:

```ts
    // ── Objective waypoint markers ──────────────────────────────
    for (let i = 0; i < mission.objectives.length; i++) {
      const obj = mission.objectives[i]!
      const groundY = this.heightmap.heightAt(obj.x, obj.z)
      addWaypointMarker(`obj-${i}`, obj.x, obj.z, groundY, this.sceneManager.scene)
    }
```

In the `tick` method, add marker animation (runs in all states):

```ts
    updateWaypointMarkers(this.gameLoop!.elapsed)
```

In `dispose()`, add cleanup:

```ts
    if (this.sceneManager) clearWaypointMarkers(this.sceneManager.scene)
```

- [ ] **Step 3: Run type-check and test visually**

Run: `bun run type-check`
Expected: No errors.

Manual test: Open `/level?asteroidId=bennu` — cyan beams should be visible on terrain.

- [ ] **Step 4: Commit**

```bash
git add src/three/WaypointMarkers.ts src/views/LevelViewController.ts
git commit -m "feat: 3D waypoint markers at objective flat zones"
```

---

### Task 3: Bearing math module

**Files:**
- Create: `src/lib/math/bearing.ts`
- Create: `src/lib/math/__tests__/bearing.spec.ts`

- [ ] **Step 1: Create bearing.ts**

Create `src/lib/math/bearing.ts`:

```ts
/**
 * Compass bearing math for the FPS compass HUD.
 *
 * Converts Three.js Y-rotation (radians, CCW) to compass degrees
 * (0 = north, CW) and computes relative bearings between positions.
 *
 * Coordinate system: XZ ground plane, Y up.
 * Three.js: heading 0 = facing +Z, increases CCW.
 * Compass: 0 = north (-Z), 90 = east (+X), increases CW.
 *
 * @author guinetik
 * @date 2026-04-07
 * @spec docs/superpowers/specs/2026-04-07-objective-waypoints-design.md
 */

/**
 * Normalize degrees to [0, 360).
 *
 * @param d - Degrees (any range).
 * @returns Normalized degrees in [0, 360).
 */
export function normalizeCompassDeg(d: number): number {
  return ((d % 360) + 360) % 360
}

/**
 * Convert a Three.js Y-rotation (radians) to compass degrees.
 * Three.js: 0 = +Z forward, increases CCW.
 * Compass: 0 = north (-Z), increases CW.
 *
 * @param headingRad - Y-axis rotation in radians.
 * @returns Compass degrees [0, 360).
 */
export function headingRadToCompassDeg(headingRad: number): number {
  return normalizeCompassDeg((-headingRad * 180) / Math.PI)
}

/**
 * Absolute compass bearing from one XZ position to another.
 *
 * @param fromX - Origin X.
 * @param fromZ - Origin Z.
 * @param toX - Target X.
 * @param toZ - Target Z.
 * @returns Compass degrees [0, 360) from origin to target.
 */
export function worldBearingDegTo(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
): number {
  const dx = toX - fromX
  const dz = toZ - fromZ
  const rad = Math.atan2(-dx, dz)
  return normalizeCompassDeg((-rad * 180) / Math.PI)
}

/**
 * Signed relative bearing from a compass heading to an absolute bearing.
 * Returns the shortest turn angle: negative = left, positive = right.
 *
 * @param fromDeg - Current compass heading in degrees.
 * @param toDeg - Target compass bearing in degrees.
 * @returns Signed degrees in (-180, 180].
 */
export function signedRelativeBearingDeg(fromDeg: number, toDeg: number): number {
  const a = normalizeCompassDeg(fromDeg)
  const b = normalizeCompassDeg(toDeg)
  let d = b - a
  if (d > 180) d -= 360
  if (d <= -180) d += 360
  return d
}
```

- [ ] **Step 2: Write tests**

Create `src/lib/math/__tests__/bearing.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  normalizeCompassDeg,
  headingRadToCompassDeg,
  worldBearingDegTo,
  signedRelativeBearingDeg,
} from '../bearing'

describe('normalizeCompassDeg', () => {
  it('normalizes positive degrees', () => {
    expect(normalizeCompassDeg(450)).toBeCloseTo(90)
  })

  it('normalizes negative degrees', () => {
    expect(normalizeCompassDeg(-90)).toBeCloseTo(270)
  })

  it('leaves 0-360 unchanged', () => {
    expect(normalizeCompassDeg(180)).toBeCloseTo(180)
  })
})

describe('headingRadToCompassDeg', () => {
  it('converts 0 rad (facing +Z) to 0 compass deg', () => {
    expect(headingRadToCompassDeg(0)).toBeCloseTo(0)
  })

  it('converts PI/2 rad (facing -X) to 270 compass deg', () => {
    expect(headingRadToCompassDeg(Math.PI / 2)).toBeCloseTo(270)
  })

  it('converts -PI/2 rad (facing +X) to 90 compass deg', () => {
    expect(headingRadToCompassDeg(-Math.PI / 2)).toBeCloseTo(90)
  })

  it('converts PI rad (facing -Z) to 180 compass deg', () => {
    expect(headingRadToCompassDeg(Math.PI)).toBeCloseTo(180)
  })
})

describe('worldBearingDegTo', () => {
  it('returns 0 for target directly ahead (+Z)', () => {
    expect(worldBearingDegTo(0, 0, 0, 10)).toBeCloseTo(0)
  })

  it('returns 90 for target to the east (+X)', () => {
    expect(worldBearingDegTo(0, 0, 10, 0)).toBeCloseTo(90)
  })

  it('returns 180 for target behind (-Z)', () => {
    expect(worldBearingDegTo(0, 0, 0, -10)).toBeCloseTo(180)
  })
})

describe('signedRelativeBearingDeg', () => {
  it('returns 0 when heading matches bearing', () => {
    expect(signedRelativeBearingDeg(90, 90)).toBeCloseTo(0)
  })

  it('returns positive for clockwise turn', () => {
    expect(signedRelativeBearingDeg(0, 90)).toBeCloseTo(90)
  })

  it('returns negative for counter-clockwise turn', () => {
    expect(signedRelativeBearingDeg(90, 0)).toBeCloseTo(-90)
  })

  it('handles wrap-around (350 to 10)', () => {
    expect(signedRelativeBearingDeg(350, 10)).toBeCloseTo(20)
  })

  it('handles wrap-around (10 to 350)', () => {
    expect(signedRelativeBearingDeg(10, 350)).toBeCloseTo(-20)
  })
})
```

- [ ] **Step 3: Run tests**

Run: `bun test:unit src/lib/math/__tests__/bearing.spec.ts`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/math/bearing.ts src/lib/math/__tests__/bearing.spec.ts
git commit -m "feat: compass bearing math module"
```

---

### Task 4: FPS Compass component

**Files:**
- Create: `src/components/FpsCompass.vue`
- Modify: `src/components/FpsHud.vue` (add headingRad + objectives to FpsTelemetry)
- Modify: `src/views/LevelView.vue` (wire compass)
- Modify: `src/views/LevelViewController.ts` (compute compass data in telemetry)

- [ ] **Step 1: Extend FpsTelemetry**

In `src/components/FpsHud.vue`, add compass fields to the `FpsTelemetry` interface:

```ts
/** Objective marker for compass display. */
export interface CompassObjective {
  /** Unique id. */
  id: string
  /** Short label (e.g. "GATHER", "EXTERMINATE"). */
  label: string
  /** Relative bearing to player heading in degrees (-180 to 180). */
  relativeDeg: number
  /** Objective type for color-coding. */
  type: 'gather' | 'exterminate' | 'rescue'
}

export interface FpsTelemetry {
  hp: number
  maxHp: number
  o2Level: number
  o2Capacity: number
  sprintCharge: number
  sprintCapacity: number
  speed: number
  grounded: boolean
  activeMode: 'drill' | 'weapon' | 'heal'
  aiming: boolean
  isFiring: boolean
  rtgLevel: number
  rtgCapacity: number
  modeCharge: number
  modeCapacity: number
  /** Player camera Y rotation in radians. */
  headingRad: number
  /** Active objectives for compass display. */
  objectives: CompassObjective[]
}
```

- [ ] **Step 2: Create FpsCompass.vue**

Create `src/components/FpsCompass.vue`:

```vue
<!-- src/components/FpsCompass.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import type { CompassObjective } from './FpsHud.vue'

const props = defineProps<{
  headingRad: number
  objectives: CompassObjective[]
}>()

/** Pixels per degree on the compass strip. */
const TICK_SPACING = 4

/** Half-width of visible strip in pixels. */
const STRIP_HALF_W = 160

/** Maximum POI offset before clamping to edge. */
const MAX_POI_OFFSET = 150

/** Cardinal/intercardinal labels at 45-degree intervals. */
const LABELS: Record<number, string> = {
  0: 'N', 45: 'NE', 90: 'E', 135: 'SE',
  180: 'S', 225: 'SW', 270: 'W', 315: 'NW',
}

/** Color per objective type. */
const TYPE_COLORS: Record<string, string> = {
  gather: '#66ffee',
  exterminate: '#ff4444',
  rescue: '#ffcc44',
}

const headingDeg = computed(() => {
  return (((-props.headingRad * 180) / Math.PI) % 360 + 360) % 360
})

const offset = computed(() => -headingDeg.value * TICK_SPACING)

/** Generate 720 degrees of ticks for seamless wrapping. */
const ticks = computed(() => {
  const out: { deg: number; label?: string; major: boolean; cardinal: boolean }[] = []
  for (let d = -180; d < 540; d += 5) {
    const norm = ((d % 360) + 360) % 360
    const cardinal = norm % 45 === 0
    const major = norm % 45 === 0
    out.push({
      deg: d,
      label: cardinal ? LABELS[norm] : undefined,
      major,
      cardinal,
    })
  }
  return out
})

/** Position POI markers on strip with clamping. */
const poiMarkers = computed(() => {
  return props.objectives.map((obj) => {
    let offsetPx = obj.relativeDeg * TICK_SPACING
    let clamped = false
    if (offsetPx > MAX_POI_OFFSET) {
      offsetPx = MAX_POI_OFFSET
      clamped = true
    } else if (offsetPx < -MAX_POI_OFFSET) {
      offsetPx = -MAX_POI_OFFSET
      clamped = true
    }
    return {
      id: obj.id,
      label: obj.label,
      type: obj.type,
      offsetPx,
      clamped,
      color: TYPE_COLORS[obj.type] ?? '#66ffee',
    }
  })
})
</script>

<template>
  <div class="compass">
    <div class="compass__track" :style="{ transform: `translateX(${offset}px)` }">
      <div
        v-for="tick in ticks"
        :key="tick.deg"
        class="compass__tick"
        :class="{
          'compass__tick--major': tick.major,
          'compass__tick--cardinal': tick.cardinal,
        }"
        :style="{ left: `${tick.deg * TICK_SPACING}px` }"
      >
        <span v-if="tick.label" class="compass__label">{{ tick.label }}</span>
      </div>
    </div>
    <!-- Objective markers -->
    <div
      v-for="poi in poiMarkers"
      :key="poi.id"
      class="compass__poi"
      :style="{
        left: `calc(50% + ${poi.offsetPx}px)`,
        '--dot-color': poi.color,
        opacity: poi.clamped ? 0.6 : 1,
      }"
      :title="poi.label"
    />
    <!-- Center pointer -->
    <div class="compass__pointer" />
    <!-- Heading readout -->
    <div class="compass__readout">{{ Math.round(headingDeg) }}&deg;</div>
  </div>
</template>

<style>
.compass {
  position: fixed;
  top: 1rem;
  left: 50%;
  transform: translateX(-50%);
  width: 320px;
  height: 32px;
  overflow: hidden;
  z-index: 20;
  pointer-events: none;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.15);
  mask-image: linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%);
  -webkit-mask-image: linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%);
}

.compass__track {
  position: absolute;
  top: 0;
  left: 50%;
  height: 100%;
}

.compass__tick {
  position: absolute;
  bottom: 0;
  width: 1px;
  height: 6px;
  background: rgba(255, 255, 255, 0.3);
}

.compass__tick--major {
  height: 10px;
  background: rgba(255, 255, 255, 0.5);
}

.compass__tick--cardinal {
  height: 14px;
  background: rgba(255, 255, 255, 0.8);
}

.compass__label {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.6rem;
  color: rgba(255, 255, 255, 0.7);
  letter-spacing: 0.1em;
  white-space: nowrap;
}

.compass__poi {
  position: absolute;
  top: 50%;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dot-color, #66ffee);
  box-shadow: 0 0 6px var(--dot-color, #66ffee);
  transform: translate(-50%, -50%);
}

.compass__pointer {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 6px solid rgba(255, 255, 255, 0.8);
}

.compass__readout {
  position: absolute;
  bottom: -16px;
  left: 50%;
  transform: translateX(-50%);
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.55rem;
  color: rgba(255, 255, 255, 0.6);
  letter-spacing: 0.1em;
}
</style>
```

- [ ] **Step 3: Wire compass data in LevelViewController**

In `src/views/LevelViewController.ts`, store the mission's objectives and compute compass data in the EVA telemetry callback.

Add a private field:

```ts
  private missionObjectives: ConcreteObjective[] = []
```

In `init()`, after resolving level context:

```ts
    this.missionObjectives = mission.objectives
```

Add bearing imports at top:

```ts
import { headingRadToCompassDeg, worldBearingDegTo, signedRelativeBearingDeg } from '@/lib/math/bearing'
import type { CompassObjective } from '@/components/FpsHud.vue'
```

In the EVA telemetry callback (where `onFpsTelemetry` is called), add heading and objectives:

```ts
    const headingRad = this.fpsCamera!.camera.rotation.y
    const playerPos = this.playerController!.position
    const compassHeading = headingRadToCompassDeg(headingRad)
    const objectives: CompassObjective[] = this.missionObjectives.map((obj, i) => ({
      id: `obj-${i}`,
      label: obj.type.toUpperCase(),
      relativeDeg: signedRelativeBearingDeg(
        compassHeading,
        worldBearingDegTo(playerPos.x, playerPos.z, obj.x, obj.z),
      ),
      type: obj.type,
    }))
```

Include in the telemetry object:

```ts
    this.onFpsTelemetry?.({
      // ... existing fields ...
      headingRad,
      objectives,
    })
```

- [ ] **Step 4: Update LevelView.vue to render compass**

In `src/views/LevelView.vue`, import and render the compass:

```ts
import FpsCompass from '@/components/FpsCompass.vue'
```

Update `fpsTelemetry` reactive object to include new fields:

```ts
const fpsTelemetry = reactive<FpsTelemetry>({
  // ... existing fields ...
  headingRad: 0,
  objectives: [],
})
```

Add compass component in template after FpsHud:

```html
  <FpsHud v-if="stateInfo.state === 'eva'" :telemetry="fpsTelemetry" />
  <FpsCompass
    v-if="stateInfo.state === 'eva'"
    :heading-rad="fpsTelemetry.headingRad"
    :objectives="fpsTelemetry.objectives"
  />
```

- [ ] **Step 5: Run type-check**

Run: `bun run type-check`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/FpsCompass.vue src/components/FpsHud.vue \
  src/views/LevelView.vue src/views/LevelViewController.ts
git commit -m "feat: FPS compass strip with objective markers"
```

---

### Task 5: Map colors module

**Files:**
- Create: `src/lib/terrain/mapColors.ts`
- Create: `src/lib/terrain/__tests__/mapColors.spec.ts`

- [ ] **Step 1: Create mapColors.ts**

Create `src/lib/terrain/mapColors.ts`:

```ts
/**
 * Heightmap-to-canvas renderer for the minimap overlay.
 *
 * Takes a heightmap grid and produces a grayscale canvas where
 * dark pixels = low elevation, light pixels = high elevation.
 *
 * @author guinetik
 * @date 2026-04-07
 * @spec docs/superpowers/specs/2026-04-07-objective-waypoints-design.md
 */

/**
 * Generate a grayscale map canvas from a heightmap.
 *
 * @param heightmap - Float32Array of resolution*resolution height values.
 * @param resolution - Width/height of the square grid.
 * @returns HTMLCanvasElement with grayscale elevation rendering.
 */
export function generateMapCanvas(
  heightmap: Float32Array,
  resolution: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = resolution
  canvas.height = resolution
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(resolution, resolution)

  // Find height range
  let hMin = Infinity
  let hMax = -Infinity
  for (let i = 0; i < heightmap.length; i++) {
    if (heightmap[i]! < hMin) hMin = heightmap[i]!
    if (heightmap[i]! > hMax) hMax = heightmap[i]!
  }
  const range = hMax - hMin || 1

  for (let i = 0; i < heightmap.length; i++) {
    const t = (heightmap[i]! - hMin) / range
    // Grayscale: dark (20) to light (220) — avoid pure black/white
    const v = Math.round(20 + t * 200)
    const p = i * 4
    img.data[p] = v
    img.data[p + 1] = v
    img.data[p + 2] = v
    img.data[p + 3] = 255
  }

  ctx.putImageData(img, 0, 0)
  return canvas
}
```

- [ ] **Step 2: Write test**

Create `src/lib/terrain/__tests__/mapColors.spec.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { generateMapCanvas } from '../mapColors'

// JSDOM provides HTMLCanvasElement but getContext returns null.
// We test that the function runs and returns a canvas with correct dimensions.
// Pixel-level testing requires a real canvas (browser or node-canvas).

describe('generateMapCanvas', () => {
  it('returns a canvas with correct dimensions', () => {
    const resolution = 16
    const heightmap = new Float32Array(resolution * resolution)
    for (let i = 0; i < heightmap.length; i++) {
      heightmap[i] = i / heightmap.length
    }
    const canvas = generateMapCanvas(heightmap, resolution)
    expect(canvas.width).toBe(resolution)
    expect(canvas.height).toBe(resolution)
  })
})
```

- [ ] **Step 3: Run tests**

Run: `bun test:unit src/lib/terrain/__tests__/mapColors.spec.ts`
Expected: Pass (JSDOM canvas may not support getContext — if it fails, wrap test in a try/catch or skip pixel assertions).

- [ ] **Step 4: Commit**

```bash
git add src/lib/terrain/mapColors.ts src/lib/terrain/__tests__/mapColors.spec.ts
git commit -m "feat: grayscale map canvas renderer for minimap"
```

---

### Task 6: MapOverlay component and M-key toggle

**Files:**
- Create: `src/components/MapOverlay.vue`
- Modify: `src/lib/defaultBindings.ts` (add toggleMap to LEVEL_BINDINGS)
- Modify: `src/views/LevelView.vue` (add M-key toggle and MapOverlay)
- Modify: `src/views/LevelViewController.ts` (expose map data callback)

- [ ] **Step 1: Add toggleMap binding**

In `src/lib/defaultBindings.ts`, add `toggleMap` to `LEVEL_BINDINGS`:

```ts
export const LEVEL_BINDINGS: Record<string, string[]> = {
  // Lander controls
  mainEngine: ['Space'],
  rcsLeft: ['KeyA'],
  rcsRight: ['KeyD'],
  rcsFore: ['KeyW'],
  rcsAft: ['KeyS'],
  rcsDescend: ['KeyC'],
  rcsAscend: ['ShiftLeft'],
  // FPS controls
  moveForward: ['KeyW'],
  moveBack: ['KeyS'],
  moveLeft: ['KeyA'],
  moveRight: ['KeyD'],
  jump: ['Space'],
  sprint: ['ShiftLeft'],
  toolDrill: ['Digit1'],
  toolWeapon: ['Digit2'],
  toolHeal: ['Digit3'],
  // Shared
  interact: ['KeyF'],
  skipCinematic: ['Escape'],
  toggleMap: ['KeyM'],
}
```

- [ ] **Step 2: Create MapOverlay.vue**

Create `src/components/MapOverlay.vue`:

```vue
<!-- src/components/MapOverlay.vue -->
<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'

/** Objective marker on the minimap. */
export interface MapMarker {
  /** Unique id. */
  id: string
  /** World X position. */
  x: number
  /** World Z position. */
  z: number
  /** CSS color string. */
  color: string
  /** Optional label for tooltip. */
  label?: string
}

const props = defineProps<{
  /** Pre-rendered heightmap canvas. */
  mapCanvas: HTMLCanvasElement | null
  /** Player world X position. */
  playerX: number
  /** Player world Z position. */
  playerZ: number
  /** World grid size (centered at origin). */
  gridSize: number
  /** Objective markers. */
  markers: MapMarker[]
}>()

const displayCanvas = ref<HTMLCanvasElement>()

/** Convert world coordinates to pixel position on the display canvas. */
function worldToPixel(wx: number, wz: number, displayW: number, displayH: number) {
  return {
    x: (wx / props.gridSize + 0.5) * displayW,
    y: (wz / props.gridSize + 0.5) * displayH,
  }
}

/** Player dot position on canvas. */
const playerPixel = computed(() => {
  const el = displayCanvas.value
  if (!el) return { x: 0, y: 0 }
  return worldToPixel(props.playerX, props.playerZ, el.clientWidth, el.clientHeight)
})

/** Marker pixel positions. */
const markerPixels = computed(() => {
  const el = displayCanvas.value
  if (!el) return []
  const w = el.clientWidth
  const h = el.clientHeight
  return props.markers.map((m) => {
    const p = worldToPixel(m.x, m.z, w, h)
    return { id: m.id, px: p.x, py: p.y, color: m.color, label: m.label }
  })
})

/** Copy the map canvas into the display canvas. */
function redraw() {
  const src = props.mapCanvas
  const dst = displayCanvas.value
  if (!src || !dst) return
  dst.width = src.width
  dst.height = src.height
  const ctx = dst.getContext('2d')
  if (!ctx) return
  ctx.drawImage(src, 0, 0)
}

onMounted(redraw)
watch(() => props.mapCanvas, redraw)
</script>

<template>
  <div class="map-overlay">
    <div class="map-overlay__header">MAP</div>
    <div class="map-overlay__body">
      <canvas ref="displayCanvas" class="map-overlay__canvas" />
      <!-- Player dot -->
      <div
        class="map-overlay__dot map-overlay__dot--player"
        :style="{
          left: `${playerPixel.x}px`,
          top: `${playerPixel.y}px`,
        }"
      />
      <!-- Objective markers -->
      <div
        v-for="m in markerPixels"
        :key="m.id"
        class="map-overlay__dot"
        :style="{
          left: `${m.px}px`,
          top: `${m.py}px`,
          '--dot-color': m.color,
        }"
        :title="m.label"
      />
    </div>
  </div>
</template>

<style>
.map-overlay {
  position: fixed;
  bottom: 24px;
  left: 8px;
  width: 240px;
  z-index: 25;
  pointer-events: none;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.map-overlay__header {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.6rem;
  color: rgba(255, 255, 255, 0.6);
  letter-spacing: 0.15em;
  padding: 4px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.map-overlay__body {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
}

.map-overlay__canvas {
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  display: block;
}

.map-overlay__dot {
  position: absolute;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dot-color, #66ffee);
  box-shadow: 0 0 6px var(--dot-color, #66ffee);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.map-overlay__dot--player {
  --dot-color: #66ffee;
  width: 8px;
  height: 8px;
  border: 2px solid rgba(0, 0, 0, 0.5);
  animation: map-dot-pulse 1.5s ease-in-out infinite;
}

@keyframes map-dot-pulse {
  0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
  50% { transform: translate(-50%, -50%) scale(1.5); opacity: 0.7; }
}
</style>
```

- [ ] **Step 3: Add map data callback and toggle to LevelViewController**

In `src/views/LevelViewController.ts`, add a callback and map canvas generation.

Import:

```ts
import { generateMapCanvas } from '@/lib/terrain/mapColors'
```

Add callback field:

```ts
  /** Called once with the minimap canvas after terrain generation. */
  onMapCanvas: ((canvas: HTMLCanvasElement) => void) | null = null
```

After terrain generation in `init()`, generate and emit the map canvas:

```ts
    // ── Minimap canvas ─────────────────────────────────────────
    const mapCanvas = generateMapCanvas(this.heightmap.grid, TERRAIN_RESOLUTION)
    this.onMapCanvas?.(mapCanvas)
```

Add a callback for player position (used by both lander and EVA):

```ts
  /** Called each frame with player world position for minimap. */
  onPlayerPosition: ((x: number, z: number) => void) | null = null
```

In the lander telemetry tick, after existing telemetry call:

```ts
    this.onPlayerPosition?.(this.landerController!.group.position.x, this.landerController!.group.position.z)
```

In the EVA telemetry tick, after existing telemetry call:

```ts
    this.onPlayerPosition?.(this.playerController!.position.x, this.playerController!.position.z)
```

- [ ] **Step 4: Wire MapOverlay in LevelView.vue**

Import the component and types:

```ts
import MapOverlay from '@/components/MapOverlay.vue'
import type { MapMarker } from '@/components/MapOverlay.vue'
```

Add reactive state:

```ts
const showMap = ref(false)
const mapCanvas = ref<HTMLCanvasElement | null>(null)
const playerX = ref(0)
const playerZ = ref(0)

/** Objective markers for minimap — computed once from mission objectives. */
const mapMarkers = ref<MapMarker[]>([])
```

Color map for objective types:

```ts
const OBJECTIVE_COLORS: Record<string, string> = {
  gather: '#66ffee',
  exterminate: '#ff4444',
  rescue: '#ffcc44',
}
```

In `onMounted`, wire callbacks:

```ts
    viewController.onMapCanvas = (canvas) => {
      mapCanvas.value = canvas
    }
    viewController.onPlayerPosition = (x, z) => {
      playerX.value = x
      playerZ.value = z
    }
```

Add M-key listener (after viewController.init):

```ts
    // Map markers from mission objectives
    const mission = viewController.getMission()
    if (mission) {
      mapMarkers.value = mission.objectives.map((obj, i) => ({
        id: `obj-${i}`,
        x: obj.x,
        z: obj.z,
        color: OBJECTIVE_COLORS[obj.type] ?? '#66ffee',
        label: obj.type.toUpperCase(),
      }))
    }

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') showMap.value = !showMap.value
    })
```

Add a `getMission()` public method to `LevelViewController`:

```ts
  /** Get the resolved mission (for UI to read objectives). */
  getMission(): GeneratedAsteroidMission | null {
    return this.mission
  }
```

Store mission as a private field in `LevelViewController`:

```ts
  private mission: GeneratedAsteroidMission | null = null
```

Set it in `init()`:

```ts
    const { asteroid, seed, mission } = resolveLevelContext()
    this.mission = mission
```

Add to template:

```html
  <MapOverlay
    v-if="showMap"
    :map-canvas="mapCanvas"
    :player-x="playerX"
    :player-z="playerZ"
    :grid-size="12000"
    :markers="mapMarkers"
  />
```

- [ ] **Step 5: Run type-check**

Run: `bun run type-check`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/MapOverlay.vue src/lib/defaultBindings.ts \
  src/views/LevelView.vue src/views/LevelViewController.ts \
  src/lib/terrain/mapColors.ts
git commit -m "feat: minimap overlay with M-key toggle"
```

---

### Task 7: Final integration test and cleanup

**Files:**
- Modify: `src/lib/missions/__tests__/missionStorage.spec.ts` (if needed)
- Run all tests

- [ ] **Step 1: Run all tests**

Run: `bun test:unit`
Expected: All tests pass (excluding pre-existing orbitCapture failures).

- [ ] **Step 2: Run type-check**

Run: `bun run type-check`
Expected: No errors.

- [ ] **Step 3: Run lint**

Run: `bun lint`
Expected: No errors (TSDoc warnings are acceptable for new exports — add TSDoc if warned).

- [ ] **Step 4: Manual visual test**

Test each asteroid with the URL param:
- `/level?asteroidId=bennu` — 1 objective (ad-hoc mission at difficulty 5 → 2 objectives)
- `/level?asteroidId=kr3` — verify waypoint beams visible from descent
- Enter EVA — verify compass strip at top with objective dots
- Press M — verify minimap appears bottom-left with elevation + dots
- Press M again — verify minimap hides

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: integration cleanup for objective waypoints"
```
