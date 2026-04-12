# Prograde/Retrograde Slingshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add prograde/retrograde HUD markers to the orbit slingshot, W/S snap-to-align, alignment-based speed bonus, and smooth camera exit transition.

**Architecture:** Domain math in `orbitCapture.ts` (prograde heading, alignment). Facade drives W/S snap and passes alignment to HUD. Visual markers in `MapSceneVisuals`. Camera exit blend in `slingshotChargeCamera.ts`. All launch direction still derived from visual heading — arrow = launch guaranteed.

**Tech Stack:** TypeScript, Three.js, Vue 3, Vitest

**Spec:** `docs/superpowers/specs/2026-04-12-prograde-retrograde-slingshot-design.md`

---

### File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/data/shuttle/orbit-capture.json` | Alignment thresholds + multipliers |
| Modify | `src/lib/orbitCapture.ts` | `getProgradeHeading()`, `getRetrogradeHeading()`, `getAlignment()`, rework `launchSlingshot()` |
| Modify | `src/lib/__tests__/orbitCapture.spec.ts` | Tests for prograde/retro heading, alignment, launch bonus |
| Modify | `src/lib/map/orbit/MapOrbitFacade.ts` | W/S snap in `tickOrbit()`, alignment in HUD state, exit camera drive |
| Modify | `src/three/MapSceneVisuals.ts` | Prograde/retrograde marker sprites |
| Modify | `src/three/slingshotChargeCamera.ts` | `buildSlingshotExitCameraConfig()` |
| Modify | `src/views/MapViewController.ts` | Camera exit transition tick, marker lifecycle wiring |
| Modify | `src/views/MapView.vue` | Alignment field in reactive orbit state |

---

### Task 1: Prograde/Retrograde Domain Math

**Files:**
- Modify: `src/data/shuttle/orbit-capture.json`
- Modify: `src/lib/orbitCapture.ts`
- Modify: `src/lib/__tests__/orbitCapture.spec.ts`

- [ ] **Step 1: Add alignment config to orbit-capture.json**

Add these fields to `src/data/shuttle/orbit-capture.json`:

```json
{
  "captureMultiplier": 20,
  "orbitMultiplier": 1.8,
  "minOrbitRadius": 0.5,
  "minCaptureRadius": 1.0,
  "approachThrustFactor": 0.8,
  "orbitVisualSpeed": 0.75,
  "orbitLaunchSpeed": 3.14,
  "slingshotSettleDuration": 3,
  "slingshotLaunchFxDuration": 0.99,
  "slingshotDecayRate": 0.0001,
  "progradeAlignmentThreshold": 0.85,
  "progradeSpeedMultiplier": 0.4,
  "retrogradeAlignmentThreshold": -0.85,
  "retrogradeSpeedMultiplier": 0.15,
  "progradeSnapLerpSpeed": 8
}
```

- [ ] **Step 2: Write failing tests for prograde/retrograde heading**

Add to `src/lib/__tests__/orbitCapture.spec.ts`, in a new `describe('prograde / retrograde')` block:

```typescript
describe('prograde / retrograde', () => {
  it('returns null when not orbiting', () => {
    expect(system.getProgradeHeading()).toBeNull()
    expect(system.getRetrogradeHeading()).toBeNull()
  })

  it('returns prograde heading perpendicular to radius (tangent in direction of travel)', () => {
    system.beginCapture(20, 0)
    system.checkArrival(20, 0)
    // orbitAngle is initialized from atan2(dz, dx) where shuttle is at (20,0) relative to body at (0,0)
    // orbitAngle = atan2(0, 20) = 0
    // prograde tangent = orbitAngle + PI/2 = PI/2
    // heading convention: atan2(-sin(angle), cos(angle))
    const heading = system.getProgradeHeading()
    expect(heading).not.toBeNull()
    // At orbitAngle=0, prograde direction vector is (-sin(0), cos(0)) = (0, 1) in XZ
    // heading = atan2(-1, 0) = -PI/2  (atan2(-vz, vx) where vx=0, vz=1)
    expect(heading).toBeCloseTo(-Math.PI / 2, 5)
  })

  it('returns retrograde opposite to prograde', () => {
    system.beginCapture(20, 0)
    system.checkArrival(20, 0)
    const pro = system.getProgradeHeading()!
    const retro = system.getRetrogradeHeading()!
    // Retrograde should differ from prograde by PI (mod 2PI)
    const diff = Math.abs(retro - pro)
    const normalizedDiff = Math.min(diff, 2 * Math.PI - diff)
    expect(normalizedDiff).toBeCloseTo(Math.PI, 5)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test:unit src/lib/__tests__/orbitCapture.spec.ts`
Expected: FAIL — `getProgradeHeading is not a function`

- [ ] **Step 4: Implement getProgradeHeading, getRetrogradeHeading**

Add to `OrbitCaptureSystem` in `src/lib/orbitCapture.ts`, after `tickOrbit()`:

```typescript
/**
 * Prograde heading — tangent to the orbit circle in the direction of travel.
 * Returns the heading in the same convention as {@link launchSlingshot}'s `facingAngle`.
 *
 * @returns Heading in radians, or `null` when not orbiting.
 */
getProgradeHeading(): number | null {
  if (!this.fsm.is('orbiting')) return null
  // Orbit position: (cos(angle), sin(angle)) * R + body
  // Tangent (derivative): (-sin(angle), cos(angle)) — perpendicular, in direction of increasing angle
  const tx = -Math.sin(this.orbitAngle)
  const tz = Math.cos(this.orbitAngle)
  return Math.atan2(-tz, tx)
}

/**
 * Retrograde heading — opposite to prograde (against direction of travel).
 *
 * @returns Heading in radians, or `null` when not orbiting.
 */
getRetrogradeHeading(): number | null {
  if (!this.fsm.is('orbiting')) return null
  const tx = Math.sin(this.orbitAngle)
  const tz = -Math.cos(this.orbitAngle)
  return Math.atan2(-tz, tx)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test:unit src/lib/__tests__/orbitCapture.spec.ts`
Expected: PASS

- [ ] **Step 6: Write failing test for getAlignment**

Add to the same `describe('prograde / retrograde')` block:

```typescript
it('returns +1 alignment when facing exactly prograde', () => {
  system.beginCapture(20, 0)
  system.checkArrival(20, 0)
  const prograde = system.getProgradeHeading()!
  expect(system.getAlignment(prograde)).toBeCloseTo(1, 5)
})

it('returns -1 alignment when facing exactly retrograde', () => {
  system.beginCapture(20, 0)
  system.checkArrival(20, 0)
  const retro = system.getRetrogradeHeading()!
  expect(system.getAlignment(retro)).toBeCloseTo(-1, 5)
})

it('returns ~0 alignment when facing perpendicular to orbit', () => {
  system.beginCapture(20, 0)
  system.checkArrival(20, 0)
  // Face radially outward (along +X from body center) — perpendicular to tangent
  const radialHeading = 0
  expect(Math.abs(system.getAlignment(radialHeading))).toBeLessThan(0.1)
})

it('returns null-safe 0 when not orbiting', () => {
  expect(system.getAlignment(0)).toBe(0)
})
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `bun test:unit src/lib/__tests__/orbitCapture.spec.ts`
Expected: FAIL — `getAlignment is not a function`

- [ ] **Step 8: Implement getAlignment**

Add to `OrbitCaptureSystem` after `getRetrogradeHeading()`:

```typescript
/**
 * Dot product of the aim direction with the prograde tangent.
 *
 * @param facingAngle - Shuttle heading in the same convention as {@link launchSlingshot}.
 * @returns −1 (retrograde) to +1 (prograde). Returns 0 when not orbiting.
 */
getAlignment(facingAngle: number): number {
  if (!this.fsm.is('orbiting')) return 0
  const aimX = Math.cos(facingAngle)
  const aimZ = -Math.sin(facingAngle)
  const tx = -Math.sin(this.orbitAngle)
  const tz = Math.cos(this.orbitAngle)
  return aimX * tx + aimZ * tz
}
```

- [ ] **Step 9: Run all tests to verify they pass**

Run: `bun test:unit src/lib/__tests__/orbitCapture.spec.ts`
Expected: ALL PASS

- [ ] **Step 10: Commit**

```bash
git add src/data/shuttle/orbit-capture.json src/lib/orbitCapture.ts src/lib/__tests__/orbitCapture.spec.ts
git commit -m "feat(orbit): prograde/retrograde heading + alignment math"
```

---

### Task 2: Alignment-Based Launch Bonus

**Files:**
- Modify: `src/lib/orbitCapture.ts` (rework `launchSlingshot()`)
- Modify: `src/lib/__tests__/orbitCapture.spec.ts`

- [ ] **Step 1: Write failing tests for alignment-based launch speed**

Add to `src/lib/__tests__/orbitCapture.spec.ts`:

```typescript
describe('alignment launch bonus', () => {
  it('gives 1.4x speed when aiming exactly prograde', () => {
    system.beginCapture(20, 0)
    system.checkArrival(20, 0)
    system.tickOrbit(0.016) // advance one frame so prevPlanet is set
    const prograde = system.getProgradeHeading()!
    const result = system.launchSlingshot(prograde, 0.016)
    const speed = Math.sqrt(result.vx ** 2 + result.vz ** 2)
    const baseSpeed = 3.14 // orbitLaunchSpeed from JSON
    expect(speed).toBeCloseTo(baseSpeed * 1.4, 1)
  })

  it('gives 1.0x speed when aiming perpendicular to orbit', () => {
    system.beginCapture(20, 0)
    system.checkArrival(20, 0)
    system.tickOrbit(0.016)
    const radialHeading = 0 // face +X, perpendicular to tangent
    const result = system.launchSlingshot(radialHeading, 0.016)
    const speed = Math.sqrt(result.vx ** 2 + result.vz ** 2)
    const baseSpeed = 3.14
    expect(speed).toBeCloseTo(baseSpeed, 1)
  })

  it('gives up to 1.15x speed when aiming exactly retrograde', () => {
    system.beginCapture(20, 0)
    system.checkArrival(20, 0)
    system.tickOrbit(0.016)
    const retro = system.getRetrogradeHeading()!
    const result = system.launchSlingshot(retro, 0.016)
    const speed = Math.sqrt(result.vx ** 2 + result.vz ** 2)
    const baseSpeed = 3.14
    expect(speed).toBeCloseTo(baseSpeed * 1.15, 1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/__tests__/orbitCapture.spec.ts`
Expected: FAIL — speeds don't match the new multipliers

- [ ] **Step 3: Rework launchSlingshot to use alignment bonus**

Replace the body of `launchSlingshot()` in `src/lib/orbitCapture.ts`:

```typescript
launchSlingshot(facingAngle: number, _dt: number): Vel2 {
  const speedMultiplier = this.targetData?.orbitalSpeedMultiplier ?? 1
  const aimX = Math.cos(facingAngle)
  const aimZ = -Math.sin(facingAngle)

  const alignment = this.getAlignment(facingAngle)
  const baseSpeed = orbitConfig.orbitLaunchSpeed * Math.max(1, speedMultiplier)

  let speed = baseSpeed
  if (alignment > orbitConfig.progradeAlignmentThreshold) {
    speed = baseSpeed * (1 + orbitConfig.progradeSpeedMultiplier * alignment)
  } else if (alignment < orbitConfig.retrogradeAlignmentThreshold) {
    speed = baseSpeed * (1 + orbitConfig.retrogradeSpeedMultiplier * Math.abs(alignment))
  }

  const vx = aimX * speed
  const vz = aimZ * speed

  this.fsm.trigger('launch')
  this.targetData = null

  return { vx, vz }
}
```

Note: `_dt` parameter kept for signature compatibility but no longer used (planet velocity tracking removed).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/__tests__/orbitCapture.spec.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/orbitCapture.ts src/lib/__tests__/orbitCapture.spec.ts
git commit -m "feat(orbit): alignment-based slingshot speed bonus replaces planet velocity boost"
```

---

### Task 3: Add Alignment to OrbitHudState + W/S Snap

**Files:**
- Modify: `src/lib/orbitCapture.ts` (add `progradeAlignment` to `OrbitHudState`)
- Modify: `src/lib/map/orbit/MapOrbitFacade.ts` (W/S snap + alignment in HUD)
- Modify: `src/views/MapView.vue` (reactive state field)
- Modify: `src/views/MapViewController.ts` (pass snap input to tickOrbit)

- [ ] **Step 1: Add progradeAlignment to OrbitHudState**

In `src/lib/orbitCapture.ts`, add to the `OrbitHudState` interface:

```typescript
export interface OrbitHudState {
  state: OrbitCaptureState
  nearestBodyName: string | null
  orbitalSpeed: number
  slingshotSpeed: number
  chargeLevel: number
  inspectMode: boolean
  /** Dot product of shuttle heading with prograde tangent. −1 (retro) to +1 (pro). */
  progradeAlignment: number
}
```

Update `getHudState()` return to include `progradeAlignment: 0` (default; facade will overwrite with live value).

- [ ] **Step 2: Update MapView.vue reactive state**

In `src/views/MapView.vue`, add `progradeAlignment: 0` to the `orbitState` reactive:

```typescript
const orbitState = reactive<OrbitHudState>({
  state: 'free',
  nearestBodyName: null,
  orbitalSpeed: 0,
  slingshotSpeed: 0,
  chargeLevel: 0,
  inspectMode: false,
  progradeAlignment: 0,
})
```

- [ ] **Step 3: Add W/S snap to MapOrbitFacade.tickOrbit**

In `src/lib/map/orbit/MapOrbitFacade.ts`, in `tickOrbit()`, after the existing yaw-left / yaw-right block and before the thruster tick, add prograde/retrograde snap:

```typescript
// W snaps nose toward prograde, S toward retrograde
const thrustSnap =
  !mapIntroControlsLocked && inputManager.isActionActive('thrust')
const brakeSnap =
  !mapIntroControlsLocked && inputManager.isActionActive('brake')
if ((thrustSnap || brakeSnap) && this._system) {
  const targetHeading = thrustSnap
    ? this._system.getProgradeHeading()
    : this._system.getRetrogradeHeading()
  if (targetHeading !== null) {
    const current = shuttleController.group.rotation.y
    // Shortest-arc lerp using MathUtils.damp
    let delta = targetHeading - current
    // Normalize to [-PI, PI]
    delta = ((delta + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI
    shuttleController.group.rotation.y = current + delta * Math.min(1, dt * orbitConfig.progradeSnapLerpSpeed)
  }
}
```

- [ ] **Step 4: Pass alignment to HUD state in buildHudState**

In `src/lib/map/orbit/MapOrbitFacade.ts`, update `buildHudState()`:

```typescript
buildHudState(shuttleController: ShuttleController, inspectMode: boolean): OrbitHudState | null {
  if (!this._system) return null
  const hudState = this._system.getHudState(shuttleController.position.x, shuttleController.position.z)
  hudState.chargeLevel = this._slingshotCharge
  hudState.inspectMode = inspectMode
  // Compute live alignment from shuttle heading
  const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(shuttleController.group.quaternion)
  const heading = Math.atan2(-fwd.z, fwd.x)
  hudState.progradeAlignment = this._system.getAlignment(heading)
  return hudState
}
```

- [ ] **Step 5: Run tests**

Run: `bun test:unit src/lib/__tests__/orbitCapture.spec.ts`
Expected: ALL PASS (HUD state tests should still work with new field defaulting to 0)

- [ ] **Step 6: Commit**

```bash
git add src/lib/orbitCapture.ts src/lib/map/orbit/MapOrbitFacade.ts src/views/MapView.vue
git commit -m "feat(orbit): W/S snap to prograde/retrograde, alignment in HUD state"
```

---

### Task 4: Prograde/Retrograde HUD Markers

**Files:**
- Modify: `src/three/MapSceneVisuals.ts`
- Modify: `src/lib/map/orbit/MapOrbitFacade.ts`
- Modify: `src/views/MapViewController.ts`

- [ ] **Step 1: Add marker sprites to MapSceneVisuals**

In `src/three/MapSceneVisuals.ts`, add a new interface and field:

```typescript
interface ProgradeMarkerVisuals {
  readonly progradeSprite: THREE.Sprite
  readonly retrogradeSprite: THREE.Sprite
}
```

Add field: `private progradeMarkers: ProgradeMarkerVisuals | null = null`

Add three methods:

```typescript
showProgradeMarkers(): void {
  if (this.progradeMarkers) return

  const progradeSprite = this.createMarkerSprite('#34ff88', 'circle')
  const retrogradeSprite = this.createMarkerSprite('#ffaa44', 'cross')
  progradeSprite.renderOrder = 13
  retrogradeSprite.renderOrder = 13

  this.scene.add(progradeSprite)
  this.scene.add(retrogradeSprite)

  this.progradeMarkers = { progradeSprite, retrogradeSprite }
}

updateProgradeMarkers(
  progradePos: THREE.Vector3,
  retrogradePos: THREE.Vector3,
  alignment: number,
  dt: number,
): void {
  if (!this.progradeMarkers) return
  const { progradeSprite, retrogradeSprite } = this.progradeMarkers

  progradeSprite.position.copy(progradePos)
  retrogradeSprite.position.copy(retrogradePos)

  // Pulse prograde marker brightness when aligned
  const progradeMat = progradeSprite.material as THREE.SpriteMaterial
  const baseOpacity = 0.7
  const alignGlow = alignment > 0.85 ? 0.3 * ((alignment - 0.85) / 0.15) : 0
  progradeMat.opacity = baseOpacity + alignGlow

  const retroMat = retrogradeSprite.material as THREE.SpriteMaterial
  const retroGlow = alignment < -0.85 ? 0.3 * ((Math.abs(alignment) - 0.85) / 0.15) : 0
  retroMat.opacity = baseOpacity + retroGlow
}

hideProgradeMarkers(): void {
  if (!this.progradeMarkers) return
  const { progradeSprite, retrogradeSprite } = this.progradeMarkers
  this.scene.remove(progradeSprite)
  this.scene.remove(retrogradeSprite)
  progradeSprite.material.dispose()
  retrogradeSprite.material.dispose()
  ;(progradeSprite.material as THREE.SpriteMaterial).map?.dispose()
  ;(retrogradeSprite.material as THREE.SpriteMaterial).map?.dispose()
  this.progradeMarkers = null
}
```

Add private helper to create canvas-based sprite textures:

```typescript
private createMarkerSprite(color: string, shape: 'circle' | 'cross'): THREE.Sprite {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const half = size / 2

  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 4

  if (shape === 'circle') {
    ctx.beginPath()
    ctx.arc(half, half, half * 0.6, 0, Math.PI * 2)
    ctx.fill()
  } else {
    const arm = half * 0.5
    ctx.beginPath()
    ctx.moveTo(half - arm, half - arm)
    ctx.lineTo(half + arm, half + arm)
    ctx.moveTo(half + arm, half - arm)
    ctx.lineTo(half - arm, half + arm)
    ctx.stroke()
    // small circle outline
    ctx.beginPath()
    ctx.arc(half, half, half * 0.6, 0, Math.PI * 2)
    ctx.stroke()
  }

  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const sprite = new THREE.Sprite(material)
  sprite.scale.setScalar(0.3)
  return sprite
}
```

Update `dispose()` to call `this.hideProgradeMarkers()`.

- [ ] **Step 2: Wire markers in MapOrbitFacade**

In `MapOrbitFacade.tickOrbit()`, after updating the orbit ring position, add:

```typescript
// Update prograde/retrograde markers
if (this._system) {
  const proAngle = this._system.getProgradeAngle()
  const retroAngle = proAngle + Math.PI
  if (proAngle !== null && this._system.target) {
    const bx = this._system.target.getWorldX()
    const by = this._system.target.getWorldY()
    const bz = this._system.target.getWorldZ()
    const r = this._system.targetOrbitRadius
    const proPos = new THREE.Vector3(bx + Math.cos(proAngle) * r, by, bz + Math.sin(proAngle) * r)
    const retroPos = new THREE.Vector3(bx + Math.cos(retroAngle) * r, by, bz + Math.sin(retroAngle) * r)
    const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(shuttleController.group.quaternion)
    const heading = Math.atan2(-fwd.z, fwd.x)
    const alignment = this._system.getAlignment(heading)
    sceneVisuals?.updateProgradeMarkers(proPos, retroPos, alignment, dt)
  }
}
```

This requires a new method `getProgradeAngle()` on `OrbitCaptureSystem` that returns the raw `orbitAngle + PI/2` (the world-space angle for positioning). Add it:

```typescript
/**
 * Raw prograde angle in world space for marker positioning.
 * This is the orbit angle offset by π/2 (tangent direction).
 *
 * @returns Angle in radians, or `null` when not orbiting.
 */
getProgradeAngle(): number | null {
  if (!this.fsm.is('orbiting')) return null
  return this.orbitAngle + Math.PI / 2
}
```

Also expose `targetOrbitRadius` as a public getter if not already:

```typescript
get targetOrbitRadius(): number {
  return this.targetData?.orbitRadius ?? 0
}
```

Check if this getter already exists. If it does, reuse it.

- [ ] **Step 3: Show/hide markers on orbit start/end**

In `MapOrbitFacade`:
- In `beginForcedOrbit()`, after `showOrbitRing()`: add `sceneVisuals?.showProgradeMarkers()`
- In the approach-complete block (end of `tickApproach`), after `showOrbitRing`: add `sceneVisuals?.showProgradeMarkers()`
- In `handleOrbitInput()` at the launch block (after `hideOrbitRing`): add `sceneVisuals?.hideProgradeMarkers()`
- In `cancelApproachFromMap()`: add `sceneVisuals?.hideProgradeMarkers()`

- [ ] **Step 4: Run type check**

Run: `bun run type-check`
Expected: No new errors from these changes.

- [ ] **Step 5: Test in browser**

Run: `bun dev`, orbit a planet, verify:
- Green circle ahead on orbit ring, amber X behind
- W snaps nose toward green marker
- S snaps nose toward amber marker
- Markers move with orbit

- [ ] **Step 6: Commit**

```bash
git add src/three/MapSceneVisuals.ts src/lib/orbitCapture.ts src/lib/map/orbit/MapOrbitFacade.ts
git commit -m "feat(orbit): prograde/retrograde HUD markers on orbit ring"
```

---

### Task 5: Smooth Camera Exit Transition

**Files:**
- Modify: `src/three/slingshotChargeCamera.ts`
- Modify: `src/lib/map/orbit/MapOrbitFacade.ts`
- Modify: `src/views/MapViewController.ts`

- [ ] **Step 1: Add buildSlingshotExitCameraConfig**

In `src/three/slingshotChargeCamera.ts`, add:

```typescript
/** Duration of the orbit → free-flight camera blend after slingshot release. */
const SLINGSHOT_EXIT_CAMERA_DURATION_SEC = 1.0

/** Seconds into the exit blend — exported so MapViewController can drive it. */
export { SLINGSHOT_EXIT_CAMERA_DURATION_SEC }

/**
 * Blend orbit camera toward free-flight chase framing after slingshot release.
 *
 * @param progress - Exit blend progress in the `[0, 1]` range (0 = orbit, 1 = free-flight).
 * @returns Camera config interpolated between orbit and free-flight framing.
 */
export function buildSlingshotExitCameraConfig(progress: number): VehicleCameraConfig {
  const t = Math.max(0, Math.min(1, progress))

  return {
    idleOffset: MAP_ORBIT_CAMERA_CONFIG.idleOffset.clone().lerp(
      MAP_CAMERA_CONFIG.idleOffset,
      t,
    ),
    lerpSpeed: THREE.MathUtils.lerp(
      MAP_ORBIT_CAMERA_CONFIG.lerpSpeed,
      MAP_CAMERA_CONFIG.lerpSpeed,
      t,
    ),
    idleTimeout: 0,
    minY: THREE.MathUtils.lerp(
      MAP_ORBIT_CAMERA_CONFIG.minY,
      MAP_CAMERA_CONFIG.minY === -Infinity ? -1000 : MAP_CAMERA_CONFIG.minY,
      t,
    ),
    fov: THREE.MathUtils.lerp(
      MAP_ORBIT_CAMERA_CONFIG.fov,
      MAP_CAMERA_CONFIG.fov,
      t,
    ),
    maxDistance: MAP_CAMERA_CONFIG.maxDistance,
  }
}
```

Import `MAP_CAMERA_CONFIG` at the top:

```typescript
import { MAP_ORBIT_CAMERA_CONFIG, MAP_CAMERA_CONFIG, type VehicleCameraConfig } from './VehicleCamera'
```

- [ ] **Step 2: Add exit camera state to MapOrbitFacade**

In `src/lib/map/orbit/MapOrbitFacade.ts`, add fields:

```typescript
private _exitCameraProgress = 0
private _exitCameraActive = false
```

Add a method:

```typescript
/** Whether the slingshot exit camera transition is active. */
get exitCameraActive(): boolean {
  return this._exitCameraActive
}

/** Current exit camera blend progress (0 = orbit, 1 = free-flight). */
get exitCameraProgress(): number {
  return this._exitCameraProgress
}
```

In the slingshot release block (where `vehicleCamera?.setConfig(MAP_CAMERA_CONFIG)` is called), replace:

```typescript
// OLD:
vehicleCamera?.setConfig(MAP_CAMERA_CONFIG)

// NEW:
this._exitCameraProgress = 0
this._exitCameraActive = true
```

Add a tick method:

```typescript
/**
 * Advance the slingshot exit camera transition.
 * Called from MapViewController.tick() during slingshot settle.
 */
tickExitCamera(dt: number, vehicleCamera: VehicleCamera | null): void {
  if (!this._exitCameraActive) return
  this._exitCameraProgress = Math.min(1, this._exitCameraProgress + dt / SLINGSHOT_EXIT_CAMERA_DURATION_SEC)
  vehicleCamera?.applyConfigTuning(buildSlingshotExitCameraConfig(this._exitCameraProgress))
  if (this._exitCameraProgress >= 1) {
    this._exitCameraActive = false
    vehicleCamera?.setConfig(MAP_CAMERA_CONFIG)
  }
}
```

Import `buildSlingshotExitCameraConfig` and `SLINGSHOT_EXIT_CAMERA_DURATION_SEC` from `slingshotChargeCamera.ts`.

- [ ] **Step 3: Drive exit camera from MapViewController.tick**

In `src/views/MapViewController.ts`, in the `tick()` method, after the slingshot speed lines block (~line 1282), add:

```typescript
// Slingshot exit camera transition
this.orbitFacade.tickExitCamera(dt, this.vehicleCamera)
```

- [ ] **Step 4: Test in browser**

Run: `bun dev`, orbit a planet, charge slingshot, release. Verify:
- Camera smoothly blends from overhead orbit view to behind-ship chase over ~1s
- No jitter or snap at release
- After 1s, camera behaves normally in free flight

- [ ] **Step 5: Commit**

```bash
git add src/three/slingshotChargeCamera.ts src/lib/map/orbit/MapOrbitFacade.ts src/views/MapViewController.ts
git commit -m "feat(orbit): smooth camera exit transition on slingshot release"
```

---

### Task 6: Launch Arrow Alignment Color Feedback

**Files:**
- Modify: `src/lib/map/orbit/MapOrbitFacade.ts`
- Modify: `src/three/MapSceneVisuals.ts`

- [ ] **Step 1: Pass alignment to launch arrow color**

In `MapOrbitFacade.handleOrbitInput()`, in the charge block where `updateLaunchArrow` is called, compute alignment and pass it:

In `MapOrbitFacade`, update the existing `updateLaunchArrow` call (or add a new call after it) to also set arrow color based on alignment:

```typescript
// After this.updateLaunchArrow(shuttleController, sceneVisuals):
if (this._system && sceneVisuals) {
  const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(shuttleController.group.quaternion)
  const heading = Math.atan2(-fwd.z, fwd.x)
  const alignment = this._system.getAlignment(heading)
  const trajectoryBlocked = this.isAimingAtPlanet(shuttleController)
  // Green when prograde-aligned, default cyan otherwise, red when blocked
  if (trajectoryBlocked) {
    sceneVisuals.updateLaunchArrowColor(MAP_CONFIG.ARROW_COLOR_BLOCKED)
  } else if (alignment > orbitConfig.progradeAlignmentThreshold) {
    sceneVisuals.updateLaunchArrowColor(0x34ff88)
  } else if (alignment < orbitConfig.retrogradeAlignmentThreshold) {
    sceneVisuals.updateLaunchArrowColor(0xffaa44)
  } else {
    sceneVisuals.updateLaunchArrowColor(MAP_CONFIG.ARROW_COLOR_SAFE)
  }
}
```

- [ ] **Step 2: Add updateLaunchArrowColor to MapSceneVisuals**

In `src/three/MapSceneVisuals.ts`:

```typescript
updateLaunchArrowColor(color: number): void {
  if (!this.launchArrow) return
  this.launchArrow.setColor(new THREE.Color(color))
}
```

- [ ] **Step 3: Test in browser**

Run: `bun dev`, orbit, charge slingshot:
- Arrow turns green when aligned with prograde marker
- Arrow turns amber when aligned with retrograde
- Arrow stays cyan for off-axis
- Arrow turns red when blocked by planet

- [ ] **Step 4: Commit**

```bash
git add src/lib/map/orbit/MapOrbitFacade.ts src/three/MapSceneVisuals.ts
git commit -m "feat(orbit): launch arrow color feedback for prograde/retrograde alignment"
```
