# Outbound Portal Boundary Walls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 red grid walls at the SpaceTimeGrid edges that fade in on proximity and trigger `VibePortal.depart()` when crossed.

**Architecture:** `PortalBoundary` handles a single wall's mesh and opacity. `PortalBoundarySystem` manages all 4 walls, checks proximity/crossing each frame, and triggers departure. View controller wires it in with ~5 lines.

**Tech Stack:** Three.js (LineSegments, LineBasicMaterial, BufferGeometry), VibePortal from `src/lib/portal.ts`.

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/three/PortalBoundary.ts` | Single wall mesh + opacity control |
| Create | `src/three/PortalBoundarySystem.ts` | 4-wall manager, proximity, crossing, departure |
| Create | `src/three/__tests__/PortalBoundarySystem.spec.ts` | Unit tests for proximity opacity and crossing detection |
| Modify | `src/views/ShuttleViewController.ts` | Wire boundary system into shuttle scene |

---

### Task 1: Create PortalBoundary — single wall mesh

**Files:**
- Create: `src/three/PortalBoundary.ts`

- [ ] **Step 1: Create the PortalBoundary class**

Create `src/three/PortalBoundary.ts`:

```ts
/**
 * A single outbound portal wall — a vertical grid of red line segments
 * that fades in based on proximity to the player.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-portal-boundary-design.md
 */
import * as THREE from 'three'

const WALL_COLOR = 0xff2222
const WALL_MAX_OPACITY = 0.6
const WALL_GRID_SEGMENTS = 20

/** Axis the wall is perpendicular to. */
export type WallAxis = 'x' | 'z'

/**
 * A single portal boundary wall.
 * Call {@link updateOpacity} each frame with the shuttle's distance to this wall.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-portal-boundary-design.md
 */
export class PortalBoundary {
  readonly mesh: THREE.LineSegments
  private readonly material: THREE.LineBasicMaterial

  /** The wall's fixed coordinate on its perpendicular axis. */
  readonly wallPosition: number

  /** Which axis this wall is perpendicular to. */
  readonly axis: WallAxis

  constructor(position: number, axis: WallAxis, width: number, height: number) {
    this.wallPosition = position
    this.axis = axis

    this.material = new THREE.LineBasicMaterial({
      color: WALL_COLOR,
      transparent: true,
      opacity: 0,
    })

    const geometry = this.createGridGeometry(width, height)
    this.mesh = new THREE.LineSegments(geometry, this.material)

    // Position and orient the wall
    if (axis === 'x') {
      this.mesh.position.set(position, 0, 0)
    } else {
      this.mesh.position.set(0, 0, position)
      this.mesh.rotation.y = Math.PI / 2
    }
  }

  /** Update wall opacity based on distance from the shuttle. 0 = invisible, 1 = closest. */
  updateOpacity(distance: number, visibilityDistance: number): void {
    if (distance >= visibilityDistance) {
      this.material.opacity = 0
    } else {
      const t = 1 - distance / visibilityDistance
      this.material.opacity = WALL_MAX_OPACITY * t
    }
  }

  /** Clean up geometry and material. */
  dispose(): void {
    this.mesh.geometry.dispose()
    this.material.dispose()
  }

  private createGridGeometry(width: number, height: number): THREE.BufferGeometry {
    const vertices: number[] = []
    const halfWidth = width / 2
    const hStep = width / WALL_GRID_SEGMENTS
    const vStep = height / WALL_GRID_SEGMENTS

    // Horizontal lines (along width, at each height step)
    for (let row = 0; row <= WALL_GRID_SEGMENTS; row++) {
      const y = row * vStep
      vertices.push(-halfWidth, y, 0)
      vertices.push(halfWidth, y, 0)
    }

    // Vertical lines (along height, at each width step)
    for (let col = 0; col <= WALL_GRID_SEGMENTS; col++) {
      const x = -halfWidth + col * hStep
      vertices.push(x, 0, 0)
      vertices.push(x, height, 0)
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    return geometry
  }
}
```

- [ ] **Step 2: Run type-check**

Run: `bun run type-check`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/three/PortalBoundary.ts
git commit -m "feat(portal): add PortalBoundary wall mesh with proximity opacity"
```

---

### Task 2: Write tests for PortalBoundarySystem

**Files:**
- Create: `src/three/__tests__/PortalBoundarySystem.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `src/three/__tests__/PortalBoundarySystem.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { PortalBoundarySystem } from '../PortalBoundarySystem'

describe('PortalBoundarySystem', () => {
  it('creates 4 walls', () => {
    const pos = new THREE.Vector3(0, 0, 0)
    const system = new PortalBoundarySystem(4000, pos, () => ({}))
    expect(system.walls).toHaveLength(4)
  })

  it('walls are invisible when shuttle is at center', () => {
    const pos = new THREE.Vector3(0, 0, 0)
    const system = new PortalBoundarySystem(4000, pos, () => ({}))
    system.tick(0.016)

    for (const wall of system.walls) {
      const mat = wall.material as THREE.LineBasicMaterial
      expect(mat.opacity).toBe(0)
    }
  })

  it('wall fades in when shuttle is within visibility distance', () => {
    const pos = new THREE.Vector3(1700, 0, 0) // 300 units from east wall (x=2000)
    const system = new PortalBoundarySystem(4000, pos, () => ({}))
    system.tick(0.016)

    // East wall (x=+2000) should be visible
    const eastWall = system.walls.find((w) => {
      const mesh = w as THREE.LineSegments
      return mesh.position.x === 2000
    })!
    const mat = eastWall.material as THREE.LineBasicMaterial
    expect(mat.opacity).toBeGreaterThan(0)
  })

  it('calls onDepart when shuttle crosses boundary', () => {
    const pos = new THREE.Vector3(2001, 0, 0) // past east wall
    const onDepart = vi.fn()
    const system = new PortalBoundarySystem(4000, pos, () => ({ speed: 50 }))
    system.onDepart = onDepart
    system.tick(0.016)

    expect(onDepart).toHaveBeenCalledOnce()
    expect(onDepart).toHaveBeenCalledWith({ speed: 50 })
  })

  it('does not call onDepart when shuttle is inside bounds', () => {
    const pos = new THREE.Vector3(1999, 0, 0) // just inside
    const onDepart = vi.fn()
    const system = new PortalBoundarySystem(4000, pos, () => ({ speed: 50 }))
    system.onDepart = onDepart
    system.tick(0.016)

    expect(onDepart).not.toHaveBeenCalled()
  })

  it('detects crossing on all 4 axes', () => {
    const crossings = [
      new THREE.Vector3(2001, 0, 0),
      new THREE.Vector3(-2001, 0, 0),
      new THREE.Vector3(0, 0, 2001),
      new THREE.Vector3(0, 0, -2001),
    ]

    for (const crossPos of crossings) {
      const onDepart = vi.fn()
      const system = new PortalBoundarySystem(4000, crossPos, () => ({}))
      system.onDepart = onDepart
      system.tick(0.016)
      expect(onDepart).toHaveBeenCalledOnce()
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/three/__tests__/PortalBoundarySystem.spec.ts`
Expected: FAIL — `PortalBoundarySystem` module not found.

- [ ] **Step 3: Commit failing tests**

```bash
git add src/three/__tests__/PortalBoundarySystem.spec.ts
git commit -m "test(portal): add PortalBoundarySystem proximity and crossing tests (red)"
```

---

### Task 3: Implement PortalBoundarySystem

**Files:**
- Create: `src/three/PortalBoundarySystem.ts`

- [ ] **Step 1: Create the system**

Create `src/three/PortalBoundarySystem.ts`:

```ts
/**
 * Manages 4 outbound portal boundary walls at the edges of the SpaceTimeGrid.
 * Walls fade in on proximity and trigger departure when crossed.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-portal-boundary-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { VibeJamParams } from '@/lib/portal'
import { PortalBoundary } from './PortalBoundary'

const WALL_VISIBILITY_DISTANCE = 500
const WALL_HEIGHT = 200

/**
 * Outbound portal boundary system.
 * Creates 4 walls at the grid edges, fades them on proximity, triggers departure on crossing.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-portal-boundary-design.md
 */
export class PortalBoundarySystem implements Tickable {
  private readonly boundaries: PortalBoundary[]
  private readonly halfSize: number
  private readonly shuttlePosition: THREE.Vector3
  private readonly getShuttleState: () => Partial<VibeJamParams>
  private departed = false

  /** Fired once when the shuttle crosses a boundary. */
  onDepart: ((state: Partial<VibeJamParams>) => void) | null = null

  /** All wall meshes — add each to the scene. */
  readonly walls: THREE.LineSegments[]

  constructor(
    gridSize: number,
    shuttlePosition: THREE.Vector3,
    getShuttleState: () => Partial<VibeJamParams>,
  ) {
    this.halfSize = gridSize / 2
    this.shuttlePosition = shuttlePosition
    this.getShuttleState = getShuttleState

    this.boundaries = [
      new PortalBoundary(this.halfSize, 'x', gridSize, WALL_HEIGHT),   // east
      new PortalBoundary(-this.halfSize, 'x', gridSize, WALL_HEIGHT),  // west
      new PortalBoundary(this.halfSize, 'z', gridSize, WALL_HEIGHT),   // south
      new PortalBoundary(-this.halfSize, 'z', gridSize, WALL_HEIGHT),  // north
    ]

    this.walls = this.boundaries.map((b) => b.mesh)
  }

  tick(_dt: number): void {
    if (this.departed) return

    for (const boundary of this.boundaries) {
      const distance = boundary.axis === 'x'
        ? Math.abs(this.shuttlePosition.x - boundary.wallPosition)
        : Math.abs(this.shuttlePosition.z - boundary.wallPosition)

      boundary.updateOpacity(distance, WALL_VISIBILITY_DISTANCE)
    }

    // Check crossing
    const x = this.shuttlePosition.x
    const z = this.shuttlePosition.z
    if (
      x > this.halfSize
      || x < -this.halfSize
      || z > this.halfSize
      || z < -this.halfSize
    ) {
      this.departed = true
      this.onDepart?.(this.getShuttleState())
    }
  }

  /** Clean up all wall geometries and materials. */
  dispose(): void {
    for (const boundary of this.boundaries) {
      boundary.dispose()
    }
  }
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `bun test:unit src/three/__tests__/PortalBoundarySystem.spec.ts`
Expected: All 6 tests PASS.

- [ ] **Step 3: Run type-check**

Run: `bun run type-check`
Expected: No errors.

- [ ] **Step 4: Run lint**

Run: `bun lint`
Expected: No errors (or only pre-existing warnings).

- [ ] **Step 5: Commit**

```bash
git add src/three/PortalBoundarySystem.ts
git commit -m "feat(portal): add PortalBoundarySystem with proximity fade and crossing detection"
```

---

### Task 4: Wire into ShuttleViewController

**Files:**
- Modify: `src/views/ShuttleViewController.ts`

- [ ] **Step 1: Add imports**

At the top of `src/views/ShuttleViewController.ts`, add after the existing portal import:

```ts
import { PortalBoundarySystem } from '@/three/PortalBoundarySystem'
import { VibePortal } from '@/lib/portal'
```

- [ ] **Step 2: Add field**

In the class field declarations, add:

```ts
private boundarySystem: PortalBoundarySystem | null = null
```

- [ ] **Step 3: Add boundary setup in init()**

After the line `this.tickHandler.register(this.shuttleController, TICK_PRIORITY_PHYSICS)` (after the portal arrival / normal spawn block), add:

```ts
    // Outbound portal walls at grid edges
    this.boundarySystem = new PortalBoundarySystem(
      4000,
      this.shuttleController.group.position,
      () => ({
        speed: this.shuttleController?.speed,
        rotation_y: this.shuttleController?.heading,
      }),
    )
    for (const wall of this.boundarySystem.walls) {
      this.sceneManager.addToScene(wall)
    }
    this.tickHandler.register(this.boundarySystem, TICK_PRIORITY_ANIMATION)
    this.boundarySystem.onDepart = (state) => {
      new VibePortal().depart(state as Record<string, string | number>)
    }
```

- [ ] **Step 4: Add cleanup in dispose()**

In `dispose()`, add after `this.portalArrival?.dispose()`:

```ts
    this.boundarySystem?.dispose()
```

- [ ] **Step 5: Run type-check**

Run: `bun run type-check`
Expected: No errors.

- [ ] **Step 6: Run lint**

Run: `bun lint`
Expected: No errors (or only pre-existing warnings).

- [ ] **Step 7: Commit**

```bash
git add src/views/ShuttleViewController.ts
git commit -m "feat(portal): wire outbound boundary walls into shuttle scene"
```

---

### Task 5: Manual smoke test

- [ ] **Step 1: Test walls invisible at center**

Run: `bun dev`
Open `http://localhost:5173/shuttle`
Expected: No red walls visible when shuttle spawns at normal orbital distance.

- [ ] **Step 2: Test wall fade-in on approach**

Fly the shuttle toward any edge of the grid (hold W toward one direction).
Expected: Red grid wall fades in as you approach within ~500 units. Gets more opaque as you get closer.

- [ ] **Step 3: Test departure on crossing**

Fly through the wall.
Expected: Browser immediately redirects to `https://jam.pieter.com/portal/2026?portal=true&ref=localhost:5173&speed=...&rotation_y=...`

- [ ] **Step 4: Commit any fixes from smoke testing**

```bash
git add -u
git commit -m "fix(portal): boundary wall adjustments from smoke testing"
```
