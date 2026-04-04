# Portal Wormhole Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an arrival portal wormhole to the shuttle demo scene that spawns when a player arrives from another Vibe Jam game, ejects the shuttle with incoming velocity, then collapses.

**Architecture:** New `PortalWormhole` controller in `src/three/` handles the 3D visuals and collapse animation. A `setVelocity()` method is added to `ShuttleController` so the view controller can inject ejection velocity. `ShuttleViewController` wires everything together by checking `VibePortal.isArrival` during init.

**Tech Stack:** Three.js (SphereGeometry, AdditiveBlending, LineBasicMaterial), existing SpaceTimeGrid negative-mass deformation, VibePortal from `src/lib/portal.ts`.

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/three/PortalWormhole.ts` | Wormhole mesh, glow, grid source, collapse animation |
| Create | `src/three/__tests__/PortalWormhole.spec.ts` | Unit tests for wormhole state machine and collapse timing |
| Modify | `src/three/ShuttleController.ts:76` | Add public `setVelocity()` method |
| Modify | `src/views/ShuttleViewController.ts:53-131` | Wire portal arrival → wormhole → shuttle ejection |

---

### Task 1: Add `setVelocity()` to ShuttleController

**Files:**
- Modify: `src/three/ShuttleController.ts:76`

- [ ] **Step 1: Add the public setter**

In `src/three/ShuttleController.ts`, after line 76 (`private velocity = new THREE.Vector3()`), add:

```ts
/** Inject an external velocity (e.g. portal ejection). */
setVelocity(v: THREE.Vector3): void {
  this.velocity.copy(v)
}
```

- [ ] **Step 2: Verify type-check passes**

Run: `bun run type-check`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/three/ShuttleController.ts
git commit -m "feat(shuttle): add public setVelocity method for portal ejection"
```

---

### Task 2: Create PortalWormhole controller — tests first

**Files:**
- Create: `src/three/__tests__/PortalWormhole.spec.ts`

- [ ] **Step 1: Write failing tests for the wormhole state machine**

Create `src/three/__tests__/PortalWormhole.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { PortalWormhole } from '../PortalWormhole'
import * as THREE from 'three'

/**
 * Minimal SpaceTimeGrid stub — only the addSource interface matters.
 * The real grid deforms vertices; we just verify the source gets registered.
 */
function createMockGrid() {
  const sources: { x: number; z: number; mass: number }[] = []
  return {
    addSource(s: { x: number; z: number; mass: number }) {
      sources.push(s)
    },
    getDepthAt(_x: number, _z: number) {
      return 0
    },
    sources,
  }
}

describe('PortalWormhole', () => {
  it('starts in idle state', () => {
    const grid = createMockGrid()
    const wormhole = new PortalWormhole(new THREE.Vector3(100, 0, 50), grid)
    expect(wormhole.state).toBe('idle')
    expect(wormhole.isDone).toBe(false)
  })

  it('registers a negative-mass source on the grid', () => {
    const grid = createMockGrid()
    const pos = new THREE.Vector3(100, 0, 50)
    new PortalWormhole(pos, grid)
    expect(grid.sources).toHaveLength(1)
    expect(grid.sources[0].mass).toBeLessThan(0)
    expect(grid.sources[0].x).toBe(100)
    expect(grid.sources[0].z).toBe(50)
  })

  it('transitions idle → ejecting → collapsing → done', () => {
    const grid = createMockGrid()
    const wormhole = new PortalWormhole(new THREE.Vector3(0, 0, 0), grid)

    // Trigger ejection
    wormhole.eject()
    expect(wormhole.state).toBe('ejecting')

    // Tick through the pulse duration (0.3s)
    wormhole.tick(0.35)
    expect(wormhole.state).toBe('collapsing')

    // Tick through collapse duration (3s)
    wormhole.tick(3.1)
    expect(wormhole.state).toBe('done')
    expect(wormhole.isDone).toBe(true)
  })

  it('lerps grid source mass to zero during collapse', () => {
    const grid = createMockGrid()
    const wormhole = new PortalWormhole(new THREE.Vector3(0, 0, 0), grid)
    const initialMass = grid.sources[0].mass

    wormhole.eject()
    wormhole.tick(0.35) // finish pulse → collapsing

    // Halfway through collapse
    wormhole.tick(1.5)
    const midMass = grid.sources[0].mass
    expect(Math.abs(midMass)).toBeLessThan(Math.abs(initialMass))
    expect(Math.abs(midMass)).toBeGreaterThan(0)

    // Finish collapse
    wormhole.tick(1.6)
    expect(grid.sources[0].mass).toBe(0)
  })

  it('calls onDone callback when collapse finishes', () => {
    const grid = createMockGrid()
    const wormhole = new PortalWormhole(new THREE.Vector3(0, 0, 0), grid)
    const onDone = vi.fn()
    wormhole.onDone = onDone

    wormhole.eject()
    wormhole.tick(0.35) // pulse done
    wormhole.tick(3.1) // collapse done
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('does not tick past done state', () => {
    const grid = createMockGrid()
    const wormhole = new PortalWormhole(new THREE.Vector3(0, 0, 0), grid)
    const onDone = vi.fn()
    wormhole.onDone = onDone

    wormhole.eject()
    wormhole.tick(0.35)
    wormhole.tick(3.1) // done
    wormhole.tick(1.0) // extra tick — should not fire onDone again
    expect(onDone).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/three/__tests__/PortalWormhole.spec.ts`
Expected: FAIL — `PortalWormhole` module not found.

- [ ] **Step 3: Commit the failing tests**

```bash
git add src/three/__tests__/PortalWormhole.spec.ts
git commit -m "test(portal): add PortalWormhole state machine tests (red)"
```

---

### Task 3: Implement PortalWormhole controller

**Files:**
- Create: `src/three/PortalWormhole.ts`

- [ ] **Step 1: Create the controller**

Create `src/three/PortalWormhole.ts`:

```ts
/**
 * Arrival wormhole — an inverted gravity well that ejects the shuttle
 * into the scene, pulses, then collapses back to flat spacetime.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-portal-wormhole-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'

/** Wormhole lifecycle states. */
export type WormholeState = 'idle' | 'ejecting' | 'collapsing' | 'done'

/** Minimal grid interface — avoids importing the full SpaceTimeGrid class. */
export interface GridSource {
  addSource(source: { x: number; z: number; mass: number }): void
}

const WORMHOLE_MASS = -0.6
const WORMHOLE_RADIUS = 15
const GLOW_COLOR = 0x4488ff
const GLOW_SCALE = 2.0
const GLOW_OPACITY = 0.25

const PULSE_DURATION = 0.3
const PULSE_SCALE = 1.5
const COLLAPSE_DURATION = 3.0

/**
 * Arrival portal wormhole controller.
 * Implements {@link Tickable} for per-frame animation updates.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-portal-wormhole-design.md
 */
export class PortalWormhole implements Tickable {
  readonly group = new THREE.Group()
  private readonly gridSource: { x: number; z: number; mass: number }
  private readonly initialMass: number

  private readonly bodyMesh: THREE.Mesh
  private readonly glowMesh: THREE.Mesh

  private currentState: WormholeState = 'idle'
  private phaseTimer = 0

  /** Fired once when collapse finishes. */
  onDone: (() => void) | null = null

  constructor(position: THREE.Vector3, grid: GridSource) {
    // Body sphere — small bright core
    const bodyGeo = new THREE.SphereGeometry(WORMHOLE_RADIUS, 24, 24)
    const bodyMat = new THREE.MeshBasicMaterial({
      color: GLOW_COLOR,
      transparent: true,
      opacity: 0.8,
    })
    this.bodyMesh = new THREE.Mesh(bodyGeo, bodyMat)
    this.group.add(this.bodyMesh)

    // Glow sphere — larger, additive blended
    const glowRadius = WORMHOLE_RADIUS * GLOW_SCALE
    const glowGeo = new THREE.SphereGeometry(glowRadius, 24, 24)
    const glowMat = new THREE.MeshBasicMaterial({
      color: GLOW_COLOR,
      transparent: true,
      opacity: GLOW_OPACITY,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    })
    this.glowMesh = new THREE.Mesh(glowGeo, glowMat)
    this.group.add(this.glowMesh)

    this.group.position.copy(position)

    // Register negative-mass source for upward grid deformation
    this.initialMass = WORMHOLE_MASS
    this.gridSource = { x: position.x, z: position.z, mass: WORMHOLE_MASS }
    grid.addSource(this.gridSource)
  }

  /** Current lifecycle state. */
  get state(): WormholeState {
    return this.currentState
  }

  /** Whether the wormhole has fully collapsed and can be removed. */
  get isDone(): boolean {
    return this.currentState === 'done'
  }

  /** The peak position where the shuttle should spawn. */
  get peakPosition(): THREE.Vector3 {
    return this.group.position
  }

  /** Trigger the ejection pulse → collapse sequence. */
  eject(): void {
    if (this.currentState !== 'idle') return
    this.currentState = 'ejecting'
    this.phaseTimer = 0
  }

  tick(dt: number): void {
    if (this.currentState === 'idle' || this.currentState === 'done') return

    this.phaseTimer += dt

    if (this.currentState === 'ejecting') {
      this.tickEjecting()
    } else if (this.currentState === 'collapsing') {
      this.tickCollapsing()
    }
  }

  /** Clean up geometry and materials. */
  dispose(): void {
    this.bodyMesh.geometry.dispose()
    ;(this.bodyMesh.material as THREE.MeshBasicMaterial).dispose()
    this.glowMesh.geometry.dispose()
    ;(this.glowMesh.material as THREE.MeshBasicMaterial).dispose()
  }

  private tickEjecting(): void {
    const t = Math.min(this.phaseTimer / PULSE_DURATION, 1)

    // Scale up during pulse, then back down
    const scale = 1 + (PULSE_SCALE - 1) * Math.sin(t * Math.PI)
    this.glowMesh.scale.setScalar(scale)

    if (this.phaseTimer >= PULSE_DURATION) {
      this.currentState = 'collapsing'
      this.phaseTimer = 0
      this.glowMesh.scale.setScalar(1)
    }
  }

  private tickCollapsing(): void {
    const t = Math.min(this.phaseTimer / COLLAPSE_DURATION, 1)

    // Lerp grid mass toward zero
    this.gridSource.mass = this.initialMass * (1 - t)

    // Fade glow and body opacity
    const bodyMat = this.bodyMesh.material as THREE.MeshBasicMaterial
    const glowMat = this.glowMesh.material as THREE.MeshBasicMaterial
    bodyMat.opacity = 0.8 * (1 - t)
    glowMat.opacity = GLOW_OPACITY * (1 - t)

    // Shrink meshes
    const scale = 1 - t * 0.8
    this.bodyMesh.scale.setScalar(scale)
    this.glowMesh.scale.setScalar(scale)

    if (t >= 1) {
      this.gridSource.mass = 0
      this.currentState = 'done'
      this.group.visible = false
      this.onDone?.()
    }
  }
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `bun test:unit src/three/__tests__/PortalWormhole.spec.ts`
Expected: All 6 tests PASS.

- [ ] **Step 3: Run type-check**

Run: `bun run type-check`
Expected: No errors.

- [ ] **Step 4: Run lint**

Run: `bun lint`
Expected: No errors (or only pre-existing warnings).

- [ ] **Step 5: Commit**

```bash
git add src/three/PortalWormhole.ts
git commit -m "feat(portal): add PortalWormhole controller with collapse animation"
```

---

### Task 4: Wire portal arrival in ShuttleViewController

**Files:**
- Modify: `src/views/ShuttleViewController.ts:1-131`

- [ ] **Step 1: Add imports**

At the top of `src/views/ShuttleViewController.ts`, add these imports after the existing ones:

```ts
import { VibePortal } from '@/lib/portal'
import { PortalWormhole } from '@/three/PortalWormhole'
```

- [ ] **Step 2: Add portal constants**

After the existing constants (line 29, `SPAWN_MAX_RADIUS = 1500`), add:

```ts
const PORTAL_SPAWN_RADIUS = 150
const PORTAL_DEFAULT_EJECT_SPEED = 40
```

- [ ] **Step 3: Add wormhole field**

In the class field declarations (around line 48), add:

```ts
private portalWormhole: PortalWormhole | null = null
```

- [ ] **Step 4: Add portal arrival logic in init()**

Replace the shuttle spawn block in `init()` (lines 107–113):

```ts
    const spawnAngle = Math.random() * Math.PI * 2
    const spawnRadius = SPAWN_MIN_RADIUS + Math.random() * (SPAWN_MAX_RADIUS - SPAWN_MIN_RADIUS)
    this.shuttleController.group.position.set(
      Math.cos(spawnAngle) * spawnRadius,
      0,
      Math.sin(spawnAngle) * spawnRadius,
    )
```

With the portal-aware version:

```ts
    // Portal arrival or normal spawn
    const portal = new VibePortal()
    if (portal.isArrival && this.spaceTimeGrid) {
      const angle = Math.random() * Math.PI * 2
      const wormholePos = new Vector3(
        Math.cos(angle) * PORTAL_SPAWN_RADIUS,
        0,
        Math.sin(angle) * PORTAL_SPAWN_RADIUS,
      )

      this.portalWormhole = new PortalWormhole(wormholePos, this.spaceTimeGrid)
      this.sceneManager.addToScene(this.portalWormhole.group)
      this.tickHandler.register(this.portalWormhole, TICK_PRIORITY_ANIMATION)

      // Position shuttle at wormhole peak
      this.shuttleController.group.position.copy(wormholePos)

      // Eject away from the sun (origin)
      const awayDir = wormholePos.clone().normalize()
      const ejectVelocity = portal.arrival.speed_x !== undefined
        && portal.arrival.speed_z !== undefined
        ? new Vector3(portal.arrival.speed_x, 0, portal.arrival.speed_z)
        : awayDir.clone().multiplyScalar(portal.arrival.speed ?? PORTAL_DEFAULT_EJECT_SPEED)
      this.shuttleController.setVelocity(ejectVelocity)

      // Point shuttle away from sun
      this.shuttleController.group.rotation.y = Math.atan2(awayDir.z, awayDir.x)

      // Trigger pulse → collapse
      this.portalWormhole.eject()
      this.portalWormhole.onDone = () => {
        if (this.portalWormhole) {
          this.tickHandler?.unregister(this.portalWormhole)
          this.portalWormhole.dispose()
          this.sceneManager?.removeFromScene(this.portalWormhole.group)
          this.portalWormhole = null
        }
      }
    } else {
      const spawnAngle = Math.random() * Math.PI * 2
      const spawnRadius = SPAWN_MIN_RADIUS + Math.random() * (SPAWN_MAX_RADIUS - SPAWN_MIN_RADIUS)
      this.shuttleController.group.position.set(
        Math.cos(spawnAngle) * spawnRadius,
        0,
        Math.sin(spawnAngle) * spawnRadius,
      )
    }
```

- [ ] **Step 5: Add wormhole cleanup in dispose()**

In the `dispose()` method, after `this.thrusterController?.dispose()`, add:

```ts
    this.portalWormhole?.dispose()
```

- [ ] **Step 6: Run type-check**

Run: `bun run type-check`
Expected: No errors.

- [ ] **Step 7: Run lint**

Run: `bun lint`
Expected: No errors (or only pre-existing warnings).

- [ ] **Step 8: Commit**

```bash
git add src/views/ShuttleViewController.ts
git commit -m "feat(portal): wire arrival wormhole into shuttle scene"
```

---

### Task 5: Manual smoke test

- [ ] **Step 1: Test normal spawn (no portal params)**

Run: `bun dev`
Open `http://localhost:5173/shuttle` in the browser.
Expected: Shuttle spawns at random orbital distance as before. No wormhole visible.

- [ ] **Step 2: Test portal arrival**

Open `http://localhost:5173/shuttle?portal=true&speed=50&username=tester`
Expected:
1. Blue/white glowing wormhole appears near the sun (~150 units out).
2. Shuttle starts at the wormhole position.
3. Shuttle ejects away from the sun at ~50 units/s.
4. Wormhole pulses (glow scales up briefly).
5. Wormhole collapses over ~3 seconds (grid flattens, glow fades, mesh shrinks).
6. After collapse, wormhole is removed from the scene.

- [ ] **Step 3: Test portal with velocity components**

Open `http://localhost:5173/shuttle?portal=true&speed_x=30&speed_z=-20`
Expected: Shuttle ejects with the given velocity vector instead of default away-from-sun direction.

- [ ] **Step 4: Commit any fixes from smoke testing**

If any adjustments were needed, commit them:

```bash
git add -u
git commit -m "fix(portal): adjustments from smoke testing"
```
