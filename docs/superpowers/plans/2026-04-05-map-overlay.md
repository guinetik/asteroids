# Map Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tactical map toggle (M key) that pauses the simulation, transitions to a top-down orthographic camera, and renders a Vue HUD overlay with planet labels, gravity rings, distance readouts, and ship heading vector.

**Architecture:** New `'map'` state in `MapViewController` gates all physics/animation tickables. A dedicated `MapCamera` handles the orthographic camera, frustum sizing, and animated transition. A `MapOverlay.vue` component projects world positions to screen coordinates for tactical HUD elements. Map state logic lives in `src/lib/mapState.ts` for testability.

**Tech Stack:** Vue 3 (reactive props, `v-if`), Three.js (`OrthographicCamera`, `Vector3.project()`), TypeScript, Vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/mapState.ts` | Create | Map state machine — transition timing, state guards |
| `src/lib/__tests__/mapState.spec.ts` | Create | Tests for state transitions and guards |
| `src/three/MapCamera.ts` | Create | Ortho camera setup, frustum sizing, transition animations |
| `src/three/__tests__/MapCamera.spec.ts` | Create | Tests for frustum math and transition progress |
| `src/lib/mapProjection.ts` | Create | World-to-screen projection, nearest-body selection, distance formatting |
| `src/lib/__tests__/mapProjection.spec.ts` | Create | Tests for projection and body selection |
| `src/components/MapOverlay.vue` | Create | Vue tactical HUD overlay component |
| `src/views/MapViewController.ts` | Modify | Add `'map'` state, M key binding, tick gating |
| `src/views/MapView.vue` | Modify | Add MapOverlay component |
| `src/lib/defaultBindings.ts` | Modify | Add `toggleMap` binding for M key |
| `src/assets/css/main.css` | Modify | Add map overlay styles |
| `src/data/shuttle/map-overlay.json` | Create | Map overlay constants (frustum, transition timing, thresholds) |

---

### Task 1: Map State Machine (`src/lib/mapState.ts`)

**Files:**
- Create: `src/lib/mapState.ts`
- Create: `src/lib/__tests__/mapState.spec.ts`

The map state machine tracks whether the map is closed, transitioning in, open, or transitioning out. It provides guards (can't open during death/orbit-capture) and transition progress.

- [ ] **Step 1: Write failing tests for state transitions**

```ts
// src/lib/__tests__/mapState.spec.ts
import { describe, it, expect } from 'vitest'
import { MapState } from '../mapState'

describe('MapState', () => {
  it('starts in closed state', () => {
    const state = new MapState()
    expect(state.phase).toBe('closed')
    expect(state.isOpen).toBe(false)
  })

  it('transitions from closed to opening on open()', () => {
    const state = new MapState()
    const result = state.open()
    expect(result).toBe(true)
    expect(state.phase).toBe('opening')
  })

  it('blocks open() when already opening', () => {
    const state = new MapState()
    state.open()
    expect(state.open()).toBe(false)
  })

  it('blocks open() when already open', () => {
    const state = new MapState()
    state.open()
    // Complete the transition
    state.tick(2.0)
    expect(state.phase).toBe('open')
    expect(state.open()).toBe(false)
  })

  it('transitions opening → open after total transition duration', () => {
    const state = new MapState()
    state.open()
    state.tick(0.5)
    expect(state.phase).toBe('opening')
    state.tick(0.5)
    expect(state.phase).toBe('open')
  })

  it('transitions from open to closing on close()', () => {
    const state = new MapState()
    state.open()
    state.tick(2.0)
    const result = state.close()
    expect(result).toBe(true)
    expect(state.phase).toBe('closing')
  })

  it('transitions closing → closed after close duration', () => {
    const state = new MapState()
    state.open()
    state.tick(2.0) // → open
    state.close()
    state.tick(0.5)
    expect(state.phase).toBe('closed')
    expect(state.isOpen).toBe(false)
  })

  it('blocks close() when already closed', () => {
    const state = new MapState()
    expect(state.close()).toBe(false)
  })

  it('reports isOpen for opening and open phases', () => {
    const state = new MapState()
    expect(state.isOpen).toBe(false)
    state.open()
    expect(state.isOpen).toBe(true)
    state.tick(2.0)
    expect(state.isOpen).toBe(true)
  })

  it('provides normalized transition progress', () => {
    const state = new MapState()
    state.open()
    expect(state.progress).toBeCloseTo(0)
    state.tick(0.5)
    expect(state.progress).toBeCloseTo(0.5)
    state.tick(0.5)
    expect(state.progress).toBeCloseTo(1)
  })

  it('progress goes 1→0 during closing', () => {
    const state = new MapState()
    state.open()
    state.tick(2.0)
    state.close()
    expect(state.progress).toBeCloseTo(1)
    state.tick(0.25)
    expect(state.progress).toBeCloseTo(0.5)
    state.tick(0.25)
    expect(state.progress).toBeCloseTo(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test:unit src/lib/__tests__/mapState.spec.ts`
Expected: FAIL — module `../mapState` not found

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/mapState.ts
/**
 * Map overlay state machine — tracks open/close transitions.
 *
 * Four phases: closed → opening → open → closing → closed.
 * Provides transition progress (0–1) for camera animation
 * and guards to prevent invalid transitions.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-map-overlay-design.md
 */

/** Possible phases of the map overlay. */
export type MapPhase = 'closed' | 'opening' | 'open' | 'closing'

/** Duration in seconds for the opening transition (perspective pull-up + ortho zoom). */
const OPEN_DURATION = 1.0

/** Duration in seconds for the closing transition. */
const CLOSE_DURATION = 0.5

/**
 * Tracks the map overlay lifecycle with transition timing.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-map-overlay-design.md
 */
export class MapState {
  /** Current phase of the map overlay. */
  phase: MapPhase = 'closed'

  /** Elapsed time in current transition phase. */
  private elapsed = 0

  /** Whether the map is visible (opening, open, or closing). */
  get isOpen(): boolean {
    return this.phase !== 'closed'
  }

  /**
   * Normalized transition progress (0–1).
   * During opening: 0 → 1. During open: 1. During closing: 1 → 0. During closed: 0.
   */
  get progress(): number {
    switch (this.phase) {
      case 'closed':
        return 0
      case 'opening':
        return Math.min(1, this.elapsed / OPEN_DURATION)
      case 'open':
        return 1
      case 'closing':
        return Math.max(0, 1 - this.elapsed / CLOSE_DURATION)
    }
  }

  /**
   * Attempt to open the map. Returns true if the transition started.
   * Blocked if already opening or open.
   */
  open(): boolean {
    if (this.phase !== 'closed') return false
    this.phase = 'opening'
    this.elapsed = 0
    return true
  }

  /**
   * Attempt to close the map. Returns true if the transition started.
   * Blocked if already closed or closing.
   */
  close(): boolean {
    if (this.phase !== 'open') return false
    this.phase = 'closing'
    this.elapsed = 0
    return true
  }

  /**
   * Advance the transition timer. Automatically advances phase
   * when duration is reached.
   *
   * @param dt - Frame delta in seconds
   */
  tick(dt: number): void {
    if (this.phase === 'opening') {
      this.elapsed += dt
      if (this.elapsed >= OPEN_DURATION) {
        this.phase = 'open'
        this.elapsed = 0
      }
    } else if (this.phase === 'closing') {
      this.elapsed += dt
      if (this.elapsed >= CLOSE_DURATION) {
        this.phase = 'closed'
        this.elapsed = 0
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test:unit src/lib/__tests__/mapState.spec.ts`
Expected: All 10 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/mapState.ts src/lib/__tests__/mapState.spec.ts
git commit -m "feat(map): add MapState state machine with transition timing"
```

---

### Task 2: Map Overlay Config Data (`src/data/shuttle/map-overlay.json`)

**Files:**
- Create: `src/data/shuttle/map-overlay.json`

Data-driven constants for the map overlay system.

- [ ] **Step 1: Create the config file**

```json
{
  "frustumHalfSize": 2600,
  "frustumInitialHalfSize": 50,
  "cameraHeight": 3000,
  "openDuration": 1.0,
  "closeDuration": 0.5,
  "perspectivePhaseFraction": 0.75,
  "nearestBodyCount": 3,
  "influenceMassThreshold": 0.00001,
  "shipMarkerSize": 24,
  "headingArrowScale": 80
}
```

- [ ] **Step 2: Commit**

```bash
git add src/data/shuttle/map-overlay.json
git commit -m "data(map): map overlay constants — frustum, timing, thresholds"
```

---

### Task 3: Map Camera (`src/three/MapCamera.ts`)

**Files:**
- Create: `src/three/MapCamera.ts`
- Create: `src/three/__tests__/MapCamera.spec.ts`

Handles the orthographic camera, frustum sizing, and provides world-to-screen projection.

- [ ] **Step 1: Write failing tests**

```ts
// src/three/__tests__/MapCamera.spec.ts
import { describe, it, expect } from 'vitest'
import { computeFrustum, lerpFrustum, easeInOut } from '../MapCamera'

describe('computeFrustum', () => {
  it('returns symmetric frustum for 16:9 aspect ratio', () => {
    const f = computeFrustum(2600, 16 / 9)
    expect(f.left).toBeCloseTo(-2600)
    expect(f.right).toBeCloseTo(2600)
    // top/bottom scaled by 1/aspect
    expect(f.top).toBeCloseTo(2600 / (16 / 9))
    expect(f.bottom).toBeCloseTo(-2600 / (16 / 9))
  })

  it('returns symmetric frustum for 1:1 aspect ratio', () => {
    const f = computeFrustum(100, 1)
    expect(f.left).toBeCloseTo(-100)
    expect(f.right).toBeCloseTo(100)
    expect(f.top).toBeCloseTo(100)
    expect(f.bottom).toBeCloseTo(-100)
  })
})

describe('lerpFrustum', () => {
  it('returns initial size at t=0', () => {
    expect(lerpFrustum(50, 2600, 0)).toBeCloseTo(50)
  })

  it('returns final size at t=1', () => {
    expect(lerpFrustum(50, 2600, 1)).toBeCloseTo(2600)
  })

  it('returns midpoint at t=0.5', () => {
    expect(lerpFrustum(50, 2600, 0.5)).toBeCloseTo((50 + 2600) / 2)
  })
})

describe('easeInOut', () => {
  it('returns 0 at t=0', () => {
    expect(easeInOut(0)).toBeCloseTo(0)
  })

  it('returns 1 at t=1', () => {
    expect(easeInOut(1)).toBeCloseTo(1)
  })

  it('returns 0.5 at t=0.5', () => {
    expect(easeInOut(0.5)).toBeCloseTo(0.5)
  })

  it('is below 0.5 at t=0.25', () => {
    expect(easeInOut(0.25)).toBeLessThan(0.5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test:unit src/three/__tests__/MapCamera.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```ts
// src/three/MapCamera.ts
/**
 * Orthographic camera for the tactical map overlay.
 *
 * Creates and manages a top-down OrthographicCamera that covers
 * the full solar system. Provides frustum math and animated
 * transition helpers.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-map-overlay-design.md
 */
import * as THREE from 'three'
import mapOverlayData from '@/data/shuttle/map-overlay.json'

/** Frustum bounds for an orthographic camera. */
export interface FrustumBounds {
  /** Left edge in world units */
  left: number
  /** Right edge in world units */
  right: number
  /** Top edge in world units */
  top: number
  /** Bottom edge in world units */
  bottom: number
}

/** Full-system frustum half-extent in world units. */
const FRUSTUM_HALF_SIZE = mapOverlayData.frustumHalfSize

/** Initial tight-crop frustum half-extent around ship. */
const FRUSTUM_INITIAL_HALF_SIZE = mapOverlayData.frustumInitialHalfSize

/** Height of the ortho camera above the XZ plane. */
const CAMERA_HEIGHT = mapOverlayData.cameraHeight

/**
 * Compute symmetric orthographic frustum bounds for a given half-size and aspect ratio.
 *
 * @param halfSize - Half-extent of the frustum along the X axis
 * @param aspect - Viewport width / height
 */
export function computeFrustum(halfSize: number, aspect: number): FrustumBounds {
  return {
    left: -halfSize,
    right: halfSize,
    top: halfSize / aspect,
    bottom: -halfSize / aspect,
  }
}

/**
 * Linearly interpolate between two frustum half-sizes.
 *
 * @param initial - Starting half-size (tight crop around ship)
 * @param final_ - Ending half-size (full system view)
 * @param t - Interpolation factor 0–1
 */
export function lerpFrustum(initial: number, final_: number, t: number): number {
  return initial + (final_ - initial) * t
}

/**
 * Smooth ease-in-out curve (cubic).
 *
 * @param t - Input 0–1
 * @returns Eased output 0–1
 */
export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/**
 * Manages the orthographic camera used for the tactical map view.
 *
 * Created once during MapViewController init. On map open, positions
 * the camera above the ship and animates the frustum from tight crop
 * to full-system view. On close, reverses the animation.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-map-overlay-design.md
 */
export class MapCamera {
  /** The orthographic camera instance. */
  readonly camera: THREE.OrthographicCamera

  constructor() {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, CAMERA_HEIGHT + 100)
    this.camera.position.set(0, CAMERA_HEIGHT, 0)
    this.camera.lookAt(0, 0, 0)
  }

  /**
   * Position the camera above the ship and set the initial tight frustum.
   *
   * @param shipX - Ship world X position
   * @param shipZ - Ship world Z position
   * @param aspect - Viewport aspect ratio
   */
  positionAboveShip(shipX: number, shipZ: number, aspect: number): void {
    this.camera.position.set(shipX, CAMERA_HEIGHT, shipZ)
    this.camera.lookAt(shipX, 0, shipZ)
    this.updateFrustum(FRUSTUM_INITIAL_HALF_SIZE, aspect)
  }

  /**
   * Update the frustum based on transition progress.
   * At progress=0, frustum is tight around ship.
   * At progress=1, frustum covers the full system.
   *
   * @param progress - Transition progress 0–1 (already eased by caller)
   * @param aspect - Viewport aspect ratio
   */
  updateTransition(progress: number, aspect: number): void {
    const halfSize = lerpFrustum(FRUSTUM_INITIAL_HALF_SIZE, FRUSTUM_HALF_SIZE, progress)
    this.updateFrustum(halfSize, aspect)
  }

  /**
   * Project a world position to normalized screen coordinates (0–1).
   *
   * @param worldPos - Position in world space
   * @returns Screen coordinates { x, y } where (0,0) is top-left, (1,1) is bottom-right
   */
  projectToScreen(worldPos: THREE.Vector3): { x: number; y: number } {
    const projected = worldPos.clone().project(this.camera)
    return {
      x: (projected.x + 1) * 0.5,
      y: (1 - projected.y) * 0.5,
    }
  }

  /** Set frustum from half-size and aspect ratio, then update the projection matrix. */
  private updateFrustum(halfSize: number, aspect: number): void {
    const bounds = computeFrustum(halfSize, aspect)
    this.camera.left = bounds.left
    this.camera.right = bounds.right
    this.camera.top = bounds.top
    this.camera.bottom = bounds.bottom
    this.camera.updateProjectionMatrix()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test:unit src/three/__tests__/MapCamera.spec.ts`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/three/MapCamera.ts src/three/__tests__/MapCamera.spec.ts
git commit -m "feat(map): MapCamera with orthographic frustum math and transitions"
```

---

### Task 4: Map Projection Helpers (`src/lib/mapProjection.ts`)

**Files:**
- Create: `src/lib/mapProjection.ts`
- Create: `src/lib/__tests__/mapProjection.spec.ts`

Pure functions for computing what the Vue overlay needs: nearest bodies, distances, heading arrow direction, gravity ring radii.

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/__tests__/mapProjection.spec.ts
import { describe, it, expect } from 'vitest'
import { findNearestBodies, formatDistance, headingToVector } from '../mapProjection'

describe('findNearestBodies', () => {
  const bodies = [
    { name: 'Sun', x: 0, z: 0, mass: 1.0 },
    { name: 'Earth', x: 100, z: 0, mass: 0.000003 },
    { name: 'Jupiter', x: 500, z: 0, mass: 0.000955 },
    { name: 'Neptune', x: 2000, z: 0, mass: 0.0000515 },
  ]

  it('returns the 3 nearest bodies sorted by distance', () => {
    const result = findNearestBodies(90, 0, bodies, 3)
    expect(result).toHaveLength(3)
    expect(result[0]!.name).toBe('Earth')
    expect(result[1]!.name).toBe('Sun')
    expect(result[2]!.name).toBe('Jupiter')
  })

  it('returns fewer if fewer bodies exist', () => {
    const result = findNearestBodies(0, 0, [bodies[0]!], 3)
    expect(result).toHaveLength(1)
  })

  it('includes distance in each result', () => {
    const result = findNearestBodies(0, 0, bodies, 1)
    expect(result[0]!.distance).toBeCloseTo(0) // at Sun position
  })
})

describe('formatDistance', () => {
  it('formats small distances with 1 decimal', () => {
    expect(formatDistance(5.678)).toBe('5.7')
  })

  it('formats large distances in k units', () => {
    expect(formatDistance(1500)).toBe('1.5k')
  })
})

describe('headingToVector', () => {
  it('converts 0 heading to +X direction', () => {
    const v = headingToVector(0)
    expect(v.x).toBeCloseTo(1)
    expect(v.y).toBeCloseTo(0)
  })

  it('converts PI/2 heading to -Z direction', () => {
    const v = headingToVector(Math.PI / 2)
    expect(v.x).toBeCloseTo(0)
    expect(v.y).toBeCloseTo(-1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test:unit src/lib/__tests__/mapProjection.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/mapProjection.ts
/**
 * Pure projection helpers for the tactical map overlay.
 *
 * Computes nearest-body distances, formats display values,
 * and converts heading angles to 2D screen vectors.
 * No Three.js or Vue dependencies — pure math.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-map-overlay-design.md
 */

/** A celestial body with position and mass for map projection. */
export interface MapBody {
  /** Display name */
  name: string
  /** World X position */
  x: number
  /** World Z position */
  z: number
  /** Mass in solar masses */
  mass: number
}

/** A body with its computed distance from the ship. */
export interface NearestBody {
  /** Display name */
  name: string
  /** World X position */
  x: number
  /** World Z position */
  z: number
  /** Mass in solar masses */
  mass: number
  /** Distance from ship in world units */
  distance: number
}

/** Threshold for switching from decimal to k-units display. */
const K_UNIT_THRESHOLD = 1000

/**
 * Find the N nearest celestial bodies to a position, sorted by distance.
 *
 * @param shipX - Ship world X
 * @param shipZ - Ship world Z
 * @param bodies - All celestial bodies
 * @param count - Maximum number of results
 */
export function findNearestBodies(
  shipX: number,
  shipZ: number,
  bodies: readonly MapBody[],
  count: number,
): NearestBody[] {
  return bodies
    .map((b) => {
      const dx = b.x - shipX
      const dz = b.z - shipZ
      return { ...b, distance: Math.sqrt(dx * dx + dz * dz) }
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count)
}

/**
 * Format a distance value for HUD display.
 * Values >= 1000 are shown as "1.5k", smaller as "5.7".
 *
 * @param distance - Distance in world units
 */
export function formatDistance(distance: number): string {
  if (distance >= K_UNIT_THRESHOLD) {
    return `${(distance / K_UNIT_THRESHOLD).toFixed(1)}k`
  }
  return distance.toFixed(1)
}

/**
 * Convert a heading angle (radians, 0 = +X) to a 2D unit vector.
 * The Y component maps Z→screen-Y (inverted because screen Y is down).
 *
 * @param heading - Heading angle in radians
 * @returns 2D unit vector { x, y } suitable for CSS transform
 */
export function headingToVector(heading: number): { x: number; y: number } {
  return {
    x: Math.cos(heading),
    y: -Math.sin(heading),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test:unit src/lib/__tests__/mapProjection.spec.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/mapProjection.ts src/lib/__tests__/mapProjection.spec.ts
git commit -m "feat(map): projection helpers — nearest bodies, distance format, heading vector"
```

---

### Task 5: Add `toggleMap` Input Binding

**Files:**
- Modify: `src/lib/defaultBindings.ts:10-18`

- [ ] **Step 1: Add the toggleMap binding**

Add `toggleMap: ['KeyM']` to `DEFAULT_BINDINGS`:

```ts
// In DEFAULT_BINDINGS, add after orbitAction line:
  toggleMap: ['KeyM'],
```

- [ ] **Step 2: Verify no conflicts**

Run: `bun run type-check`
Expected: No errors — KeyM is not bound to anything else in DEFAULT_BINDINGS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/defaultBindings.ts
git commit -m "feat(map): add toggleMap (M key) to default shuttle bindings"
```

---

### Task 6: Map Overlay Vue Component (`src/components/MapOverlay.vue`)

**Files:**
- Create: `src/components/MapOverlay.vue`
- Modify: `src/assets/css/main.css`

The non-diegetic tactical HUD layer. Receives projected screen positions as props.

- [ ] **Step 1: Define the MapOverlayState type**

Add to `src/lib/ShuttleTelemetry.ts`:

```ts
/** Screen-projected position for a celestial body label. */
export interface MapBodyLabel {
  /** Display name */
  name: string
  /** Screen X as percentage (0–100) */
  screenX: number
  /** Screen Y as percentage (0–100) */
  screenY: number
}

/** Screen-projected distance line from ship to a body. */
export interface MapDistanceLine {
  /** Display name of the body */
  name: string
  /** Ship screen X (%) */
  shipX: number
  /** Ship screen Y (%) */
  shipY: number
  /** Body screen X (%) */
  bodyX: number
  /** Body screen Y (%) */
  bodyY: number
  /** Formatted distance string */
  distance: string
}

/** Screen-projected gravity ring. */
export interface MapGravityRing {
  /** Body display name */
  name: string
  /** Screen center X (%) */
  centerX: number
  /** Screen center Y (%) */
  centerY: number
  /** Influence ring radius in viewport % */
  influenceRadius: number
  /** Event horizon ring radius in viewport % */
  horizonRadius: number
}

/** Full state for the map overlay HUD. */
export interface MapOverlayState {
  /** Whether the overlay is visible */
  visible: boolean
  /** Planet/Sun labels */
  labels: MapBodyLabel[]
  /** Ship screen position X (%) */
  shipX: number
  /** Ship screen position Y (%) */
  shipY: number
  /** Ship heading arrow direction (CSS rotation degrees) */
  headingDeg: number
  /** Ship speed for arrow length scaling */
  speed: number
  /** Distance lines to nearest bodies */
  distances: MapDistanceLine[]
  /** Gravity influence + event horizon rings */
  gravityRings: MapGravityRing[]
}
```

- [ ] **Step 2: Create the MapOverlay component**

```vue
<!-- src/components/MapOverlay.vue -->
<script setup lang="ts">
import type { MapOverlayState } from '@/lib/ShuttleTelemetry'

defineProps<{
  overlay: MapOverlayState
}>()
</script>

<template>
  <div v-if="overlay.visible" class="map-overlay">
    <!-- Gravity rings -->
    <div
      v-for="ring in overlay.gravityRings"
      :key="'ring-' + ring.name"
      class="map-gravity-ring"
    >
      <div
        class="map-influence-ring"
        :style="{
          left: ring.centerX + '%',
          top: ring.centerY + '%',
          width: ring.influenceRadius * 2 + '%',
          height: ring.influenceRadius * 2 + '%',
        }"
      />
      <div
        class="map-horizon-ring"
        :style="{
          left: ring.centerX + '%',
          top: ring.centerY + '%',
          width: ring.horizonRadius * 2 + '%',
          height: ring.horizonRadius * 2 + '%',
        }"
      />
    </div>

    <!-- Distance lines (SVG) -->
    <svg class="map-distance-svg">
      <g v-for="line in overlay.distances" :key="'dist-' + line.name">
        <line
          :x1="line.shipX + '%'"
          :y1="line.shipY + '%'"
          :x2="line.bodyX + '%'"
          :y2="line.bodyY + '%'"
          class="map-distance-line"
        />
        <text
          :x="(line.shipX + line.bodyX) / 2 + '%'"
          :y="(line.shipY + line.bodyY) / 2 + '%'"
          class="map-distance-text"
        >
          {{ line.distance }}
        </text>
      </g>
    </svg>

    <!-- Planet labels -->
    <div
      v-for="label in overlay.labels"
      :key="'label-' + label.name"
      class="map-label"
      :style="{ left: label.screenX + '%', top: label.screenY + '%' }"
    >
      {{ label.name }}
    </div>

    <!-- Ship marker + heading arrow -->
    <div
      class="map-ship-marker"
      :style="{ left: overlay.shipX + '%', top: overlay.shipY + '%' }"
    >
      <div class="map-ship-reticle" />
      <div
        v-if="overlay.speed > 0.01"
        class="map-heading-arrow"
        :style="{ transform: 'rotate(' + overlay.headingDeg + 'deg)' }"
      />
    </div>

    <!-- MAP label -->
    <div class="map-title">TACTICAL MAP</div>
    <div class="map-hint">Press M or ESC to close</div>
  </div>
</template>
```

- [ ] **Step 3: Add CSS styles**

Append to `src/assets/css/main.css`:

```css
/* --- Map Overlay --- */

.map-overlay {
  @apply absolute inset-0 pointer-events-none z-10;
}

.map-label {
  @apply absolute font-mono text-xs text-cyan-300 opacity-80 pointer-events-none;
  transform: translate(-50%, -150%);
  text-shadow: 0 0 4px rgba(34, 211, 238, 0.5);
}

.map-ship-marker {
  @apply absolute pointer-events-none;
  transform: translate(-50%, -50%);
}

.map-ship-reticle {
  @apply border-2 border-cyan-400 rounded-full;
  width: 24px;
  height: 24px;
  transform: translate(-50%, -50%);
  animation: map-pulse 1.5s ease-in-out infinite;
  box-shadow: 0 0 8px rgba(34, 211, 238, 0.6);
}

.map-heading-arrow {
  @apply absolute bg-cyan-400;
  width: 2px;
  height: 40px;
  left: 50%;
  bottom: 50%;
  transform-origin: bottom center;
  box-shadow: 0 0 4px rgba(34, 211, 238, 0.5);
}

.map-influence-ring {
  @apply absolute border border-dashed border-cyan-600 rounded-full opacity-30 pointer-events-none;
  transform: translate(-50%, -50%);
}

.map-horizon-ring {
  @apply absolute border-2 border-red-500 rounded-full opacity-50 pointer-events-none;
  transform: translate(-50%, -50%);
}

.map-distance-svg {
  @apply absolute inset-0 w-full h-full pointer-events-none;
}

.map-distance-line {
  stroke: rgba(34, 211, 238, 0.25);
  stroke-width: 1;
  stroke-dasharray: 4 4;
}

.map-distance-text {
  @apply font-mono text-xs;
  fill: rgba(34, 211, 238, 0.6);
  text-anchor: middle;
  dominant-baseline: middle;
}

.map-title {
  @apply absolute top-4 left-1/2 -translate-x-1/2 font-mono text-sm text-cyan-400 tracking-widest;
  text-shadow: 0 0 8px rgba(34, 211, 238, 0.4);
}

.map-hint {
  @apply absolute bottom-6 left-1/2 -translate-x-1/2 font-mono text-xs text-cyan-600 opacity-60;
}

@keyframes map-pulse {
  0%, 100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  50% { opacity: 0.5; transform: translate(-50%, -50%) scale(1.3); }
}
```

- [ ] **Step 4: Verify build**

Run: `bun run type-check`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add src/components/MapOverlay.vue src/assets/css/main.css src/lib/ShuttleTelemetry.ts
git commit -m "feat(map): MapOverlay Vue component with tactical HUD elements"
```

---

### Task 7: Wire Map State into MapViewController

**Files:**
- Modify: `src/views/MapViewController.ts`
- Modify: `src/views/MapView.vue`

This is the integration task. Adds the `'map'` state, M key handling, tick gating, camera swap, and overlay data emission.

- [ ] **Step 1: Add imports to MapViewController**

At the top of `src/views/MapViewController.ts`, add:

```ts
import { MapState } from '@/lib/mapState'
import { MapCamera, easeInOut } from '@/three/MapCamera'
import { findNearestBodies, formatDistance, headingToVector, type MapBody } from '@/lib/mapProjection'
import { influenceRadius, eventHorizonRadius } from '@/lib/physics/gravity'
import type { MapOverlayState } from '@/lib/ShuttleTelemetry'
import mapOverlayData from '@/data/shuttle/map-overlay.json'
```

Note: `influenceRadius` and `eventHorizonRadius` are already imported — no duplicate needed. Only add the new imports.

- [ ] **Step 2: Add map state fields to the class**

After `private adriftTimer = 0` (line 167), add:

```ts
  private mapState = new MapState()
  private mapCamera: MapCamera | null = null

  /** Called when map overlay state changes for Vue HUD. */
  onMapOverlay: ((state: MapOverlayState) => void) | null = null
```

- [ ] **Step 3: Create MapCamera during init**

After the VehicleCamera setup (after line 213), add:

```ts
    // --- Map overlay camera (ortho, created once, used when M pressed) ---
    this.mapCamera = new MapCamera()
    scene.add(this.mapCamera.camera)
```

- [ ] **Step 4: Add M key handler and map toggle to the tick method**

At the very beginning of the `tick(dt)` method (line 407), before the door toggle block, add the map toggle logic:

```ts
    // Map toggle (M key) — opens/closes tactical map
    if (this.inputManager?.wasActionPressed('toggleMap')) {
      if (!this.mapState.isOpen) {
        // Guard: block during death or orbit approach
        const orbitState = this.orbitSystem?.state ?? 'free'
        const isDead = this.shuttleController?.dead ?? false
        if (!isDead && orbitState !== 'approaching') {
          this.mapState.open()
          this.onOpenMap()
        }
      } else if (this.mapState.phase === 'open') {
        this.mapState.close()
      }
    }

    // Also close on Escape
    if (this.inputManager?.wasActionPressed('closeMap') && this.mapState.phase === 'open') {
      this.mapState.close()
    }

    // Tick map transition
    if (this.mapState.isOpen) {
      this.mapState.tick(dt)
      this.tickMapTransition()

      // When closing completes, restore flying state
      if (this.mapState.phase === 'closed') {
        this.onCloseMap()
      }

      // Skip all gameplay logic while map is open
      return
    }
```

This `return` statement at the end gates all gameplay tick logic (doors, orbit, telemetry, gravity) when the map is visible. Note: this only gates the `MapViewController.tick()` method — other tickables registered on the TickHandler (shuttle physics, orrery, thrusters, camera, compositor) still run. The shuttle is frozen via `freeze()` so physics is a no-op. The orrery and thruster tickables continue but that's harmless since the ortho camera is active. The compositor tickable still renders, which is desired — it drives the EffectComposer output.

- [ ] **Step 5: Add Escape key binding**

In `src/lib/defaultBindings.ts`, add to `DEFAULT_BINDINGS`:

```ts
  closeMap: ['Escape'],
```

- [ ] **Step 6: Add map open/close/transition methods**

Add these private methods to `MapViewController`:

```ts
  /** Called when the map first opens. Freezes everything, positions ortho camera. */
  private onOpenMap(): void {
    if (!this.shuttleController || !this.mapCamera) return

    // Freeze shuttle — no physics, no thrusters, no fuel
    this.shuttleController.freeze()
    this.shuttleController.setInputEnabled(false)

    // Disable OrbitControls
    if (this.vehicleCamera) {
      this.vehicleCamera.controls.enabled = false
    }

    // Position ortho camera above ship
    const px = this.shuttleController.position.x
    const pz = this.shuttleController.position.z
    const aspect = window.innerWidth / window.innerHeight
    this.mapCamera.positionAboveShip(px, pz, aspect)
  }

  /** Runs each frame while map is opening/open/closing — updates camera transition and overlay. */
  private tickMapTransition(): void {
    if (!this.mapCamera || !this.sceneObjects) return

    const progress = easeInOut(this.mapState.progress)
    const aspect = window.innerWidth / window.innerHeight

    // Update ortho frustum based on transition progress
    this.mapCamera.updateTransition(progress, aspect)

    // Swap render camera to ortho during map phases
    const renderPass = this.sceneObjects.composer.passes[0] as RenderPass
    if (this.mapState.phase === 'opening' || this.mapState.phase === 'open') {
      renderPass.camera = this.mapCamera.camera
    }

    // Emit overlay state when fully open
    if (this.mapState.phase === 'open') {
      this.emitMapOverlay()
    } else {
      // During transitions, hide overlay
      this.onMapOverlay?.({ visible: false, labels: [], shipX: 0, shipY: 0, headingDeg: 0, speed: 0, distances: [], gravityRings: [] })
    }

    // No explicit render needed — the compositor tickable runs after this and calls composer.render()
  }

  /** Called when closing transition completes — restore flying state. */
  private onCloseMap(): void {
    if (!this.shuttleController || !this.sceneObjects) return

    // Swap render camera back to perspective
    const renderPass = this.sceneObjects.composer.passes[0] as RenderPass
    if (this.vehicleCamera) {
      renderPass.camera = this.vehicleCamera.camera
      this.vehicleCamera.controls.enabled = true
    }

    // Check if we were orbiting before map opened — restore appropriate state
    const orbitState = this.orbitSystem?.state ?? 'free'
    if (orbitState === 'free') {
      this.shuttleController.unfreeze()
      this.shuttleController.setInputEnabled(true)
    }
    // If orbiting, shuttle stays frozen but input stays disabled (orbit manages this)

    // Hide overlay
    this.onMapOverlay?.({ visible: false, labels: [], shipX: 0, shipY: 0, headingDeg: 0, speed: 0, distances: [], gravityRings: [] })
  }

  /** Compute and emit the full map overlay state for the Vue HUD. */
  private emitMapOverlay(): void {
    if (!this.mapCamera || !this.shuttleController || !this.onMapOverlay) return

    const px = this.shuttleController.position.x
    const pz = this.shuttleController.position.z

    // Build body list from Sun + planets
    const bodies: MapBody[] = []
    if (this.sunController) {
      bodies.push({
        name: 'Sun',
        x: this.sunController.getWorldX(),
        z: this.sunController.getWorldZ(),
        mass: this.sunController.mass,
      })
    }
    for (let i = 0; i < this.planetControllers.length; i++) {
      const c = this.planetControllers[i]!
      bodies.push({
        name: PLANETS[i]?.name ?? '',
        x: c.getWorldX(),
        z: c.getWorldZ(),
        mass: c.mass,
      })
    }

    // Project ship position
    const shipScreen = this.mapCamera.projectToScreen(
      new THREE.Vector3(px, 0, pz),
    )

    // Project body labels
    const labels = bodies.map((b) => {
      const screen = this.mapCamera!.projectToScreen(new THREE.Vector3(b.x, 0, b.z))
      return { name: b.name, screenX: screen.x * 100, screenY: screen.y * 100 }
    })

    // Nearest bodies for distance lines
    const nearest = findNearestBodies(px, pz, bodies, mapOverlayData.nearestBodyCount)
    const distances = nearest.map((b) => {
      const bodyScreen = this.mapCamera!.projectToScreen(new THREE.Vector3(b.x, 0, b.z))
      return {
        name: b.name,
        shipX: shipScreen.x * 100,
        shipY: shipScreen.y * 100,
        bodyX: bodyScreen.x * 100,
        bodyY: bodyScreen.y * 100,
        distance: formatDistance(b.distance),
      }
    })

    // Heading arrow — convert heading to CSS rotation degrees
    const heading = this.shuttleController.heading
    const headingDeg = -(heading * 180 / Math.PI) + 90

    // Gravity rings — project influence and event horizon radii to screen %
    const gravityRings = bodies
      .filter((b) => b.mass >= mapOverlayData.influenceMassThreshold)
      .map((b) => {
        const center = this.mapCamera!.projectToScreen(new THREE.Vector3(b.x, 0, b.z))
        const infR = influenceRadius(b.mass, MAP_GRAVITY_CONFIG)
        const horR = eventHorizonRadius(b.mass, MAP_GRAVITY_CONFIG)

        // Project radius: offset point vs center to get screen-space radius
        const edgeInf = this.mapCamera!.projectToScreen(new THREE.Vector3(b.x + infR, 0, b.z))
        const edgeHor = this.mapCamera!.projectToScreen(new THREE.Vector3(b.x + horR, 0, b.z))

        return {
          name: b.name,
          centerX: center.x * 100,
          centerY: center.y * 100,
          influenceRadius: Math.abs(edgeInf.x - center.x) * 100,
          horizonRadius: Math.abs(edgeHor.x - center.x) * 100,
        }
      })

    this.onMapOverlay({
      visible: true,
      labels,
      shipX: shipScreen.x * 100,
      shipY: shipScreen.y * 100,
      headingDeg,
      speed: this.shuttleController.speed,
      distances,
      gravityRings,
    })
  }
```

- [ ] **Step 7: Add the RenderPass import**

Ensure `RenderPass` is imported at the top (it already is on line 13):

```ts
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
```

Already imported — no change needed.

- [ ] **Step 8: Wire MapOverlay into MapView.vue**

Update `src/views/MapView.vue`:

Add import:
```ts
import MapOverlay from '@/components/MapOverlay.vue'
import type { MapOverlayState } from '@/lib/ShuttleTelemetry'
```

Add reactive state after `deathCause`:
```ts
const mapOverlay = reactive<MapOverlayState>({
  visible: false,
  labels: [],
  shipX: 0,
  shipY: 0,
  headingDeg: 0,
  speed: 0,
  distances: [],
  gravityRings: [],
})
```

Add callback in `onMounted` after the `onDeathOverlay` callback:
```ts
    viewController.onMapOverlay = (s) => {
      Object.assign(mapOverlay, s)
    }
```

Add component to template after `DeathOverlay`:
```vue
  <MapOverlay :overlay="mapOverlay" />
```

- [ ] **Step 9: Gate orrery and thrusters during map state**

The orrery and thruster tickables are registered separately on the TickHandler, so they run even when `tick()` returns early. Add early-return guards:

In `tickOrrery(dt)` at line 724, add at the top:

```ts
    // Pause simulation while map is open
    if (this.mapState.isOpen) return
```

In the thruster tickable registration (line 305), the ThrusterEffectController reads shuttle inputs — since shuttle is frozen and input is disabled, thrusters will naturally show nothing. No change needed.

However, the VehicleCamera tickable still runs and will lerp the perspective camera. Since we swap the render pass camera to ortho, this is invisible but wastes work. Add a guard in the camera tick section — or just disable the vehicle camera controls in `onOpenMap()` (already done). The VehicleCamera tick with no target movement is essentially a no-op.

- [ ] **Step 10: Add MapCamera to dispose**

In the `dispose()` method, add cleanup:

```ts
    this.mapCamera = null
```

- [ ] **Step 11: Verify build + type-check**

Run: `bun run type-check`
Expected: No type errors

- [ ] **Step 12: Run dev server and test manually**

Run: `bun dev`
Test:
1. Navigate to map view
2. Press M — camera should transition to top-down ortho view
3. Verify all HUD elements appear (labels, ship marker, gravity rings, distance lines)
4. Verify ship doesn't move, no thruster animation
5. Press M or Escape — camera transitions back
6. Verify flight resumes normally

- [ ] **Step 13: Commit**

```bash
git add src/views/MapViewController.ts src/views/MapView.vue src/lib/defaultBindings.ts src/lib/ShuttleTelemetry.ts
git commit -m "feat(map): wire map state, camera swap, and overlay into MapViewController"
```

---

### Task 8: Lint and Final Polish

**Files:**
- All modified files

- [ ] **Step 1: Run linter**

Run: `bun lint`
Fix any issues found.

- [ ] **Step 2: Run all tests**

Run: `bun test:unit`
Expected: All existing tests pass + new map tests pass

- [ ] **Step 3: Final commit if any fixes**

```bash
git add -u
git commit -m "fix(map): lint fixes and polish"
```
