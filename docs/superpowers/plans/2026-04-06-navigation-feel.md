# Navigation Feel Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make solar system map navigation feel responsive and legible — softer physics penalties, world-space velocity indicator, earlier reticle visibility, and orbit preview ring on approach.

**Architecture:** Data-driven physics tuning in JSON, visual fixes in MapViewController constants and tick logic, one new public method on OrbitCaptureSystem to expose nearest-body preview data.

**Tech Stack:** Three.js, TypeScript, Vitest

---

### Task 1: Soften map physics tuning

**Files:**
- Modify: `src/data/shuttle/shuttle-physics.json` (map block, lines 18–34)

- [ ] **Step 1: Update map physics values**

In `src/data/shuttle/shuttle-physics.json`, change the `"map"` block to:

```json
"map": {
    "thrustForce": 0.4,
    "brakeFactor": 0.93,
    "brakeDepthPenalty": 0.002,
    "yawTorque": 1.5,
    "yawLateralForce": 0.16,
    "yawMaxSpeed": 2.0,
    "yawDamping": 0.98,
    "maxThrustSpeed": 2,
    "speedReturnEquilibriumSpeed": 2.9,
    "maxGravitySpeed": 5,
    "thrustAlignMinMultiplier": 0.72,
    "thrustAlignMaxMultiplier": 1.05,
    "rcsAlignMinMultiplier": 0.72,
    "rcsAlignMaxMultiplier": 1.08,
    "speedExcessReturnRate": 0.35
}
```

Changes from current values:
- `yawLateralForce`: 0.08 → 0.16 (doubled RCS)
- `thrustAlignMinMultiplier`: 0.45 → 0.72 (softer sideways penalty)
- `thrustAlignMaxMultiplier`: 1.0 → 1.05 (small on-heading reward)
- `rcsAlignMinMultiplier`: 0.48 → 0.72 (softer RCS penalty)
- `speedExcessReturnRate`: 0.95 → 0.35 (gentle speed bleed)

- [ ] **Step 2: Type-check**

Run: `bun run type-check`
Expected: No errors (JSON values, no type changes)

- [ ] **Step 3: Commit**

```bash
git add src/data/shuttle/shuttle-physics.json
git commit -m "tune: soften map physics — stronger RCS, gentler alignment penalty and speed bleed"
```

---

### Task 2: Fix velocity wedge to use world-space heading

**Files:**
- Modify: `src/views/MapViewController.ts:229-257` (reticle constants)
- Modify: `src/views/MapViewController.ts:2229-2253` (wedge rotation logic in `tickShuttleScale`)

The current wedge rotation uses NDC projection (`_reticleProjA`/`_reticleProjB` → `atan2(ndcDy, ndcDx)`), which couples the arrow to camera orientation. The fix computes world-space velocity heading and offsets by the camera's azimuthal angle so the wedge stays stable as the player orbits the view.

- [ ] **Step 1: Update reticle fade constants**

In `src/views/MapViewController.ts`, change the two fade constants:

```ts
/**
 * Shuttle overscale multiplier at which the reticle begins fading in.
 * Below this factor the shuttle model is still clearly visible on its own.
 */
const MAP_RETICLE_FADE_START = 0.8

/**
 * Shuttle overscale multiplier at which the reticle reaches full opacity.
 * Above this the shuttle is so small only the reticle marks its position.
 */
const MAP_RETICLE_FADE_END = 2.0
```

- [ ] **Step 2: Remove the NDC delta threshold constant**

Delete the `MAP_RETICLE_MIN_NDC_DELTA_SQ` constant (line 257) — it's no longer needed since we won't be projecting through the camera. The speed threshold (`MAP_RETICLE_MIN_SPEED`) already gates jitter.

```ts
// DELETE this block:
/**
 * If projected motion direction in NDC has squared length below this, skip updating
 * the wedge rotation for this frame.
 */
const MAP_RETICLE_MIN_NDC_DELTA_SQ = 1e-10
```

- [ ] **Step 3: Remove the unused projection scratch vectors**

In the class body, find and delete these three private fields (they were only used for the NDC projection approach):

```ts
// DELETE these three lines from the class body:
private readonly _reticleProjA = new THREE.Vector3()
private readonly _reticleProjB = new THREE.Vector3()
private readonly _reticleVelPlanar = new THREE.Vector3()
```

- [ ] **Step 4: Replace the wedge rotation logic in `tickShuttleScale`**

In `tickShuttleScale`, replace the entire velocity-wedge block (from `const cam = this.vehicleCamera.camera` through the closing `}` of the `else` branch at line 2253) with world-space heading logic:

Replace this block (lines 2229–2253):
```ts
        const cam = this.vehicleCamera.camera
        const vel = this.shuttleController.currentVelocity
        const speed = Math.hypot(vel.x, vel.z)
        if (speed >= MAP_RETICLE_MIN_SPEED) {
          this._reticleVelPlanar.set(vel.x, 0, vel.z).normalize()
          this._reticleProjA.copy(this.shuttleController.group.position).project(cam)
          this._reticleProjB
            .copy(this.shuttleController.group.position)
            .add(this._reticleVelPlanar)
            .project(cam)
          const ndcDx = this._reticleProjB.x - this._reticleProjA.x
          const ndcDy = this._reticleProjB.y - this._reticleProjA.y
          if (ndcDx * ndcDx + ndcDy * ndcDy >= MAP_RETICLE_MIN_NDC_DELTA_SQ) {
            this.shipReticlePointer.visible = true
            ;(this.shipReticlePointer.material as THREE.SpriteMaterial).rotation = Math.atan2(
              ndcDy,
              ndcDx,
            )
            ;(this.shipReticlePointer.material as THREE.SpriteMaterial).opacity = reticleAlpha
          } else {
            this.shipReticlePointer.visible = false
          }
        } else {
          this.shipReticlePointer.visible = false
        }
```

With this:
```ts
        const vel = this.shuttleController.currentVelocity
        const speed = Math.hypot(vel.x, vel.z)
        if (speed >= MAP_RETICLE_MIN_SPEED) {
          // World-space velocity heading: atan2(x, z) gives angle from +Z axis
          const worldHeading = Math.atan2(vel.x, vel.z)
          // Camera azimuthal angle from OrbitControls
          const camAzimuth = this.vehicleCamera!.controls.getAzimuthalAngle()
          // Sprite rotation is screen-space: offset world heading by camera azimuth
          // and rotate 90° so the wedge (drawn along +X in canvas) points correctly
          const spriteAngle = worldHeading - camAzimuth - Math.PI / 2
          this.shipReticlePointer.visible = true
          ;(this.shipReticlePointer.material as THREE.SpriteMaterial).rotation = spriteAngle
          ;(this.shipReticlePointer.material as THREE.SpriteMaterial).opacity = reticleAlpha
        } else {
          this.shipReticlePointer.visible = false
        }
```

Key insight: `atan2(vel.x, vel.z)` gives the world heading (angle from +Z). Subtracting `camAzimuth` converts to screen space. The extra `- Math.PI / 2` compensates for the wedge being drawn along the +X axis in the canvas texture.

- [ ] **Step 5: Type-check**

Run: `bun run type-check`
Expected: No errors. The removed `_reticleProjA`, `_reticleProjB`, `_reticleVelPlanar` fields and `MAP_RETICLE_MIN_NDC_DELTA_SQ` constant should have no other references.

- [ ] **Step 6: Commit**

```bash
git add src/views/MapViewController.ts
git commit -m "fix: velocity wedge uses world-space heading, visible at moderate zoom"
```

---

### Task 3: Add orbit preview ring on approach

**Files:**
- Modify: `src/lib/orbitCapture.ts` — add `getNearestPreviewBody` public method
- Test: `src/lib/__tests__/orbitCapture.spec.ts` — test the new method
- Modify: `src/views/MapViewController.ts` — add preview ring logic in free-flight tick

#### Step 3a: Add `getNearestPreviewBody` to OrbitCaptureSystem

- [ ] **Step 1: Write the failing test**

Create or append to `src/lib/__tests__/orbitCapture.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { OrbitCaptureSystem } from '../orbitCapture'

describe('OrbitCaptureSystem.getNearestPreviewBody', () => {
  const bodies = [
    {
      name: 'TestPlanet',
      displayRadius: 1,
      getWorldX: () => 100,
      getWorldZ: () => 0,
    },
  ]

  it('returns body data when ship is within preview range and heading toward it', () => {
    const system = new OrbitCaptureSystem(bodies)
    // Ship at (60, 0) heading right toward planet at (100, 0)
    // velocity pointing +X (toward planet)
    const result = system.getNearestPreviewBody(60, 0, 1, 0, 2.0)
    expect(result).not.toBeNull()
    expect(result!.name).toBe('TestPlanet')
    expect(result!.orbitRadius).toBeGreaterThan(0)
  })

  it('returns null when ship is outside preview range', () => {
    const system = new OrbitCaptureSystem(bodies)
    // Ship at (0, 0) — far from planet at (100, 0)
    const result = system.getNearestPreviewBody(0, 0, 1, 0, 2.0)
    expect(result).toBeNull()
  })

  it('returns null when ship is heading away from the body', () => {
    const system = new OrbitCaptureSystem(bodies)
    // Ship at (60, 0), velocity pointing -X (away from planet)
    const result = system.getNearestPreviewBody(60, 0, -1, 0, 2.0)
    expect(result).toBeNull()
  })

  it('returns null when ship speed is near zero', () => {
    const system = new OrbitCaptureSystem(bodies)
    const result = system.getNearestPreviewBody(60, 0, 0, 0, 2.0)
    expect(result).toBeNull()
  })

  it('returns null when already captured', () => {
    const system = new OrbitCaptureSystem(bodies)
    // Begin capture first — ship must be within capture radius
    system.beginCapture(100, 0)
    const result = system.getNearestPreviewBody(60, 0, 1, 0, 2.0)
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test:unit src/lib/__tests__/orbitCapture.spec.ts`
Expected: FAIL — `getNearestPreviewBody` does not exist

- [ ] **Step 3: Implement `getNearestPreviewBody`**

In `src/lib/orbitCapture.ts`, add this public method to `OrbitCaptureSystem` after the existing `get target()` getter (around line 241):

```ts
  /**
   * Returns the nearest body within a preview range when the ship is heading toward it.
   * Used to show a dimmed orbit ring before capture triggers.
   *
   * @param shipX - Ship world X position.
   * @param shipZ - Ship world Z position.
   * @param velX - Ship velocity X component.
   * @param velZ - Ship velocity Z component.
   * @param previewMultiplier - Preview zone is this × capture radius.
   * @returns Body name, world position, and orbit radius — or null.
   */
  getNearestPreviewBody(
    shipX: number,
    shipZ: number,
    velX: number,
    velZ: number,
    previewMultiplier: number,
  ): { name: string; worldX: number; worldZ: number; orbitRadius: number } | null {
    if (this.state !== 'free') return null

    const speed = Math.sqrt(velX * velX + velZ * velZ)
    if (speed < 1e-6) return null

    const nvx = velX / speed
    const nvz = velZ / speed

    let nearest: BodyData | null = null
    let nearestDistSq = Infinity

    for (const bd of this.bodyData) {
      const bx = bd.body.getWorldX()
      const bz = bd.body.getWorldZ()
      const dx = bx - shipX
      const dz = bz - shipZ
      const distSq = dx * dx + dz * dz
      const previewRadius = bd.captureRadius * previewMultiplier
      if (distSq > previewRadius * previewRadius) continue
      // Already inside capture radius — regular capture handles this
      if (distSq <= bd.captureRadiusSq) continue

      // Check heading: dot(normalize(vel), normalize(toBody)) > 0.3
      const dist = Math.sqrt(distSq)
      const dot = (nvx * dx + nvz * dz) / dist
      if (dot <= 0.3) continue

      if (distSq < nearestDistSq) {
        nearestDistSq = distSq
        nearest = bd
      }
    }

    if (!nearest) return null
    return {
      name: nearest.body.name,
      worldX: nearest.body.getWorldX(),
      worldZ: nearest.body.getWorldZ(),
      orbitRadius: nearest.orbitRadius,
    }
  }
```

Note: `BodyData` is a private type inside the file. The method accesses `this.bodyData` directly — no need to export `BodyData`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test:unit src/lib/__tests__/orbitCapture.spec.ts`
Expected: All 5 new tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/orbitCapture.ts src/lib/__tests__/orbitCapture.spec.ts
git commit -m "feat: add getNearestPreviewBody to OrbitCaptureSystem"
```

#### Step 3b: Wire orbit preview ring into MapViewController

**Files:**
- Modify: `src/views/MapViewController.ts` — new constants + preview ring logic in free-flight tick

- [ ] **Step 6: Add preview ring constants**

In `src/views/MapViewController.ts`, after the existing orbit ring constants (line 334), add:

```ts
/**
 * Preview zone is this multiple of the body's capture radius.
 * The orbit ring appears dimmed when the ship is within this range and heading toward the body.
 */
const ORBIT_PREVIEW_MULTIPLIER = 2.0

/** Opacity of the preview orbit ring (dimmer than the captured ring at 0.4). */
const ORBIT_PREVIEW_OPACITY = 0.3
```

- [ ] **Step 7: Add preview ring field and modify `showOrbitRing` to accept opacity**

Add a field to track whether the current ring is a preview (so we don't thrash create/destroy every frame). Find the `private orbitRing` field (line 406) and add after it:

```ts
  /** True when the orbit ring is showing a preview (dimmed, pre-capture). */
  private orbitRingIsPreview = false
```

Then modify `showOrbitRing` to accept an optional opacity parameter:

Replace the current `showOrbitRing` method:
```ts
  /** Create a dashed circle ring at the given radius and add to scene. */
  private showOrbitRing(radius: number): void {
    this.hideOrbitRing()
    const points: THREE.Vector3[] = []
    for (let i = 0; i <= ORBIT_RING_SEGMENTS; i++) {
      const angle = (i / ORBIT_RING_SEGMENTS) * Math.PI * 2
      points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius))
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineDashedMaterial({
      color: ORBIT_RING_COLOR,
      transparent: true,
      opacity: ORBIT_RING_OPACITY,
      dashSize: ORBIT_RING_DASH_SIZE,
      gapSize: ORBIT_RING_GAP_SIZE,
    })
    this.orbitRing = new THREE.LineLoop(geometry, material)
    this.orbitRing.computeLineDistances()
    this.sceneObjects?.scene.add(this.orbitRing)
  }
```

With:
```ts
  /** Create a dashed circle ring at the given radius and add to scene. */
  private showOrbitRing(radius: number, opacity = ORBIT_RING_OPACITY): void {
    this.hideOrbitRing()
    const points: THREE.Vector3[] = []
    for (let i = 0; i <= ORBIT_RING_SEGMENTS; i++) {
      const angle = (i / ORBIT_RING_SEGMENTS) * Math.PI * 2
      points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius))
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineDashedMaterial({
      color: ORBIT_RING_COLOR,
      transparent: true,
      opacity,
      dashSize: ORBIT_RING_DASH_SIZE,
      gapSize: ORBIT_RING_GAP_SIZE,
    })
    this.orbitRing = new THREE.LineLoop(geometry, material)
    this.orbitRing.computeLineDistances()
    this.sceneObjects?.scene.add(this.orbitRing)
  }
```

And update `hideOrbitRing` to reset the preview flag:

Replace:
```ts
  /** Remove the orbit ring from scene. */
  private hideOrbitRing(): void {
    if (this.orbitRing) {
      this.sceneObjects?.scene.remove(this.orbitRing)
      this.orbitRing.geometry.dispose()
      ;(this.orbitRing.material as THREE.LineDashedMaterial).dispose()
      this.orbitRing = null
    }
  }
```

With:
```ts
  /** Remove the orbit ring from scene. */
  private hideOrbitRing(): void {
    if (this.orbitRing) {
      this.sceneObjects?.scene.remove(this.orbitRing)
      this.orbitRing.geometry.dispose()
      ;(this.orbitRing.material as THREE.LineDashedMaterial).dispose()
      this.orbitRing = null
    }
    this.orbitRingIsPreview = false
  }
```

- [ ] **Step 8: Add preview ring logic in the free-flight orbit tick**

In the orbit action section of the tick method, find the block that starts with `// Free → press E to capture` (line 1064). **Before** this block (after `const eHeld = ...` on line 1062), insert the preview ring logic:

```ts
      // Preview orbit ring — show dimmed ring when heading toward a body in preview range
      if (state === 'free' && this.shuttleController) {
        const vel = this.shuttleController.currentVelocity
        const preview = this.orbitSystem.getNearestPreviewBody(
          this.shuttleController.position.x,
          this.shuttleController.position.z,
          vel.x,
          vel.z,
          ORBIT_PREVIEW_MULTIPLIER,
        )
        if (preview) {
          if (!this.orbitRingIsPreview) {
            this.showOrbitRing(preview.orbitRadius, ORBIT_PREVIEW_OPACITY)
            this.orbitRingIsPreview = true
          }
          if (this.orbitRing) {
            this.orbitRing.position.set(preview.worldX, 0, preview.worldZ)
          }
        } else if (this.orbitRingIsPreview) {
          this.hideOrbitRing()
        }
      }
```

This creates the ring once when entering preview range, updates its position each frame (planets move), and removes it when leaving range or turning away. The `orbitRingIsPreview` flag prevents re-creating the ring every frame.

- [ ] **Step 9: Ensure capture clears the preview flag**

In the `// Free → press E to capture` block (line 1065), the existing `showOrbitRing` call already disposes the old ring via `hideOrbitRing()` internally. But we need to reset the preview flag. After the existing `this.showOrbitRing(this.orbitSystem.targetOrbitRadius)` call (line 1075), add:

```ts
          this.orbitRingIsPreview = false
```

- [ ] **Step 10: Type-check**

Run: `bun run type-check`
Expected: No errors

- [ ] **Step 11: Run all tests**

Run: `bun test:unit`
Expected: All tests pass

- [ ] **Step 12: Commit**

```bash
git add src/views/MapViewController.ts
git commit -m "feat: show dimmed orbit preview ring when heading toward a planet"
```
