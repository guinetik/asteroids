# Habitat Interior Scene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A walkable first-person habitat interior accessible via H key from the map view, with smooth camera transition, FPS movement, and table interaction overlay.

**Architecture:** Separate Three.js scene (`HabitatInteriorScene`) with its own lighting, starfield, and FPS camera. A `HabitatState` FSM (same pattern as `MapState`) manages transitions. MapViewController orchestrates entry/exit by swapping the EffectComposer's `renderPass.scene` and `renderPass.camera`. The orbit system is completely unaware of the habitat.

**Tech Stack:** Three.js, Vue 3, TypeScript, FpsCamera (existing), Tailwind CSS

---

### Task 0: Clean Up FPS Camera Hack from MapViewController

The earlier habitat prototype added FPS camera code directly into MapViewController. All of it must be removed before implementing the proper system.

**Files:**
- Modify: `src/views/MapViewController.ts`
- Modify: `src/three/VehicleCamera.ts`
- Modify: `src/three/ShuttleController.ts`

- [ ] **Step 1: Remove FPS camera hack from MapViewController**

Remove these items from `src/views/MapViewController.ts`:
- Line 69: `import { FpsCamera } from '@/three/FpsCamera'` — delete
- Line 246: `private habitatMode = false` — delete
- Line 247: `private habitatCamera: FpsCamera | null = null` — delete
- Line 248: `private habitatCameraAnchor = new THREE.Object3D()` — delete
- Line 347: `document.addEventListener('mousemove', this.onHabitatMouseMove)` — delete
- Lines 651-658: the `if (!this.inspectMode && this.habitatMode)` block inside the F key handler — delete the habitat cleanup, keep the rest of the F key handler intact
- Lines 688-733: the entire `// Habitat focus (H key)` block — delete
- Lines 949-951: the `// Habitat mode` tick block — delete
- Lines 1533-1536: the `if (this.habitatMode)` block inside `onCloseMap` — delete
- Lines 1843-1845: the `if (!this.habitatMode)` guard in `tickStartupIntroCamera` — replace with unconditional `renderPass.camera = this.vehicleCamera.camera`
- Lines 1976-1978: the mousemove cleanup in `dispose()` — delete
- Lines 1988-1991: the `onHabitatMouseMove` handler — delete

- [ ] **Step 2: Remove MAP_HABITAT_CAMERA_CONFIG from VehicleCamera**

In `src/three/VehicleCamera.ts`, delete the `MAP_HABITAT_CAMERA_CONFIG` export (the block after `MAP_INSPECT_CAMERA_CONFIG`):
```typescript
/** Habitat focus preset: tight top-down on the cargo bay habitat module. */
export const MAP_HABITAT_CAMERA_CONFIG: VehicleCameraConfig = {
  idleOffset: new THREE.Vector3(0, 0.12, 0),
  lerpSpeed: 5,
  idleTimeout: 0,
  minY: -Infinity,
  fov: 28,
  maxDistance: 0.2,
}
```

- [ ] **Step 3: Remove habitatWorldPosition from ShuttleController**

In `src/three/ShuttleController.ts`, delete the `habitatWorldPosition` getter:
```typescript
/** World-space position of the bed inside the habitat (camera seat). */
get habitatWorldPosition(): THREE.Vector3 {
  const pos = new THREE.Vector3()
  if (this.habitat?.bedPivot) {
    this.habitat.bedPivot.getWorldPosition(pos)
  }
  return pos
}
```

Also revert `bedPivot` to a local variable in `HabitatModule.ts` — change the public field back to a local `const`:
- In `src/three/HabitatModule.ts`, remove the class field `bedPivot: THREE.Group | null = null`
- In `loadFurniture`, change `this.bedPivot = new THREE.Group()` back to `const bedPivot = new THREE.Group()` and update all `this.bedPivot` references in that method back to `bedPivot`

- [ ] **Step 4: Type-check**

Run: `bun run type-check`
Expected: Clean pass with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/views/MapViewController.ts src/three/VehicleCamera.ts src/three/ShuttleController.ts src/three/HabitatModule.ts
git commit -m "refactor: remove habitat FPS camera hack from MapViewController"
```

---

### Task 1: HabitatState FSM

**Files:**
- Create: `src/lib/habitatState.ts`
- Create: `src/lib/__tests__/habitatState.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/habitatState.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { HabitatState } from '../habitatState'

describe('HabitatState', () => {
  it('starts in map phase', () => {
    const state = new HabitatState()
    expect(state.phase).toBe('map')
    expect(state.isActive).toBe(false)
    expect(state.progress).toBe(0)
  })

  it('transitions map → transitioning_in on enter()', () => {
    const state = new HabitatState()
    expect(state.enter()).toBe(true)
    expect(state.phase).toBe('transitioning_in')
    expect(state.isActive).toBe(true)
  })

  it('blocks enter() when not in map phase', () => {
    const state = new HabitatState()
    state.enter()
    expect(state.enter()).toBe(false)
  })

  it('advances transitioning_in to habitat after duration', () => {
    const state = new HabitatState()
    state.enter()
    state.tick(0.4)
    expect(state.phase).toBe('transitioning_in')
    expect(state.progress).toBeCloseTo(0.5, 1)
    state.tick(0.4)
    expect(state.phase).toBe('habitat')
    expect(state.progress).toBe(1)
  })

  it('transitions habitat → transitioning_out on leave()', () => {
    const state = new HabitatState()
    state.enter()
    state.tick(1.0) // skip to habitat
    expect(state.leave()).toBe(true)
    expect(state.phase).toBe('transitioning_out')
  })

  it('blocks leave() when not in habitat phase', () => {
    const state = new HabitatState()
    expect(state.leave()).toBe(false)
  })

  it('advances transitioning_out to map after duration', () => {
    const state = new HabitatState()
    state.enter()
    state.tick(1.0) // skip to habitat
    state.leave()
    state.tick(0.25)
    expect(state.progress).toBeCloseTo(0.5, 1)
    state.tick(0.25)
    expect(state.phase).toBe('map')
    expect(state.progress).toBe(0)
    expect(state.isActive).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/__tests__/habitatState.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement HabitatState**

Create `src/lib/habitatState.ts`:

```typescript
/**
 * Habitat interior state machine — tracks enter/exit transitions.
 *
 * Four phases: map → transitioning_in → habitat → transitioning_out → map.
 * Provides transition progress (0–1) for camera animation.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-habitat-interior-design.md
 */

/** Possible phases of the habitat interior. */
export type HabitatPhase = 'map' | 'transitioning_in' | 'habitat' | 'transitioning_out'

/** Duration in seconds for the enter transition (camera fly-in). */
const ENTER_DURATION = 0.8

/** Duration in seconds for the exit transition (camera fly-out). */
const EXIT_DURATION = 0.5

/**
 * Tracks the habitat interior lifecycle with transition timing.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-habitat-interior-design.md
 */
export class HabitatState {
  /** Current phase of the habitat interior. */
  phase: HabitatPhase = 'map'

  /** Elapsed time in current transition phase. */
  private elapsed = 0

  /** Whether the habitat is active (transitioning or inside). */
  get isActive(): boolean {
    return this.phase !== 'map'
  }

  /**
   * Normalized transition progress (0–1).
   * During transitioning_in: 0 → 1. During habitat: 1.
   * During transitioning_out: 1 → 0. During map: 0.
   */
  get progress(): number {
    switch (this.phase) {
      case 'map':
        return 0
      case 'transitioning_in':
        return Math.min(1, this.elapsed / ENTER_DURATION)
      case 'habitat':
        return 1
      case 'transitioning_out':
        return Math.max(0, 1 - this.elapsed / EXIT_DURATION)
    }
  }

  /**
   * Enter the habitat. Returns true if the transition started.
   * Blocked if not in map phase.
   */
  enter(): boolean {
    if (this.phase !== 'map') return false
    this.phase = 'transitioning_in'
    this.elapsed = 0
    return true
  }

  /**
   * Leave the habitat. Returns true if the transition started.
   * Blocked if not in habitat phase.
   */
  leave(): boolean {
    if (this.phase !== 'habitat') return false
    this.phase = 'transitioning_out'
    this.elapsed = 0
    return true
  }

  /**
   * Advance the transition timer. Auto-advances phase when duration reached.
   *
   * @param dt - Frame delta in seconds
   */
  tick(dt: number): void {
    if (this.phase === 'transitioning_in') {
      this.elapsed += dt
      if (this.elapsed >= ENTER_DURATION) {
        this.phase = 'habitat'
        this.elapsed = 0
      }
    } else if (this.phase === 'transitioning_out') {
      this.elapsed += dt
      if (this.elapsed >= EXIT_DURATION) {
        this.phase = 'map'
        this.elapsed = 0
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/__tests__/habitatState.spec.ts`
Expected: All 7 tests PASS.

- [ ] **Step 5: Lint and commit**

```bash
bun lint
git add src/lib/habitatState.ts src/lib/__tests__/habitatState.spec.ts
git commit -m "feat: add HabitatState FSM for interior transitions"
```

---

### Task 2: Habitat Interior Bindings

**Files:**
- Modify: `src/lib/defaultBindings.ts`

The habitat reuses WASD for movement and F for interaction, but needs its own binding set so it doesn't conflict with shuttle thrust/brake.

- [ ] **Step 1: Add HABITAT_BINDINGS**

In `src/lib/defaultBindings.ts`, add after `LEVEL_BINDINGS`:

```typescript
/** Habitat interior key bindings — FPS walk + interact. */
export const HABITAT_BINDINGS: Record<string, string[]> = {
  moveForward: ['KeyW'],
  moveBack: ['KeyS'],
  moveLeft: ['KeyA'],
  moveRight: ['KeyD'],
  interact: ['KeyF'],
  exitHabitat: ['KeyH', 'Escape'],
}
```

- [ ] **Step 2: Type-check**

Run: `bun run type-check`
Expected: Clean pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/defaultBindings.ts
git commit -m "feat: add HABITAT_BINDINGS for interior FPS movement"
```

---

### Task 3: Habitat Interior Scene — Structure, Geometry & Lighting

**Files:**
- Create: `src/three/HabitatInteriorScene.ts`

This task builds the scene shell: cylinder geometry, lighting, and starfield. Furniture and FPS movement come in later tasks.

- [ ] **Step 1: Create HabitatInteriorScene**

Create `src/three/HabitatInteriorScene.ts`:

```typescript
/**
 * Walkable first-person habitat interior scene.
 *
 * A self-contained Three.js scene with the habitat cylinder at human scale,
 * furniture, lighting, decorative starfield, and FPS movement.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-habitat-interior-design.md
 */
import * as THREE from 'three'
import { FpsCamera, type FpsCameraConfig } from '@/three/FpsCamera'
import { InputManager } from '@/lib/InputManager'
import { HABITAT_BINDINGS } from '@/lib/defaultBindings'
import { loadGLB } from '@/three/loadGLB'

/** Interior cylinder radius in walkable units. */
const CYLINDER_RADIUS = 5
/** Interior cylinder length in walkable units. */
const CYLINDER_LENGTH = 16
/** Number of radial segments for cylinder geometry. */
const CYLINDER_RADIAL_SEGMENTS = 24
/** Number of height segments for girder wireframe. */
const GIRDER_SEGMENTS_HEIGHT = 6
/** Number of radial segments for girder wireframe. */
const GIRDER_SEGMENTS_RADIAL = 12
/** Glass shell color. */
const GLASS_COLOR = 0x88ccff
/** Glass shell opacity. */
const GLASS_OPACITY = 0.15
/** Girder wireframe color. */
const GIRDER_COLOR = 0x888888
/** End cap color. */
const CAP_COLOR = 0xaaaaaa
/** Number of decorative stars outside the glass. */
const STAR_COUNT = 2000
/** Radius of the decorative star sphere. */
const STAR_SPHERE_RADIUS = 200
/** Floor Y position (bottom of cylinder). */
const FLOOR_Y = 0
/** Player movement speed in units/second. */
const MOVE_SPEED = 6
/** Collision margin from cylinder wall. */
const COLLISION_MARGIN = 0.5
/** Interaction distance for furniture. */
const INTERACT_DISTANCE = 2.5

/** FPS camera config for the habitat interior. */
const HABITAT_CAMERA_CONFIG: FpsCameraConfig = {
  eyeHeight: 1.7,
  sensitivity: 0.002,
  pitchClamp: Math.PI / 3,
  fov: 70,
}

/**
 * Self-contained habitat interior scene.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-habitat-interior-design.md
 */
export class HabitatInteriorScene {
  readonly scene = new THREE.Scene()
  readonly fpsCamera: FpsCamera
  readonly inputManager: InputManager

  /** Fired when player interacts with furniture (F key in range). */
  onInteract: ((target: string) => void) | null = null
  /** Fired when player enters/leaves interaction range. */
  onPrompt: ((prompt: string | null) => void) | null = null

  private readonly player = new THREE.Object3D()
  private readonly velocity = new THREE.Vector3()
  private tablePosition = new THREE.Vector3()
  private loaded = false

  constructor() {
    this.fpsCamera = new FpsCamera(HABITAT_CAMERA_CONFIG)
    this.inputManager = new InputManager(HABITAT_BINDINGS)

    // Player starts at origin, on the floor
    this.player.position.set(0, FLOOR_Y, 0)
    this.scene.add(this.player)
    this.fpsCamera.setTarget(this.player)

    this.buildCylinder()
    this.buildLighting()
    this.buildStarfield()
    this.buildFloor()
  }

  /** Get the camera for rendering (renderPass.camera swap). */
  getCamera(): THREE.PerspectiveCamera {
    return this.fpsCamera.camera
  }

  /** Get the scene for rendering (renderPass.scene swap). */
  getScene(): THREE.Scene {
    return this.scene
  }

  /** Spawn position and facing direction for entry transition. */
  getSpawnPosition(): { position: THREE.Vector3; yaw: number } {
    return {
      position: new THREE.Vector3(0, FLOOR_Y + HABITAT_CAMERA_CONFIG.eyeHeight, 0),
      yaw: Math.PI, // face the table (toward tank end, -Z)
    }
  }

  /** Load furniture models. Call once before first use. */
  async load(): Promise<void> {
    if (this.loaded) return

    const [bedModel, tableModel] = await Promise.all([
      loadGLB('/models/bed.glb'),
      loadGLB('/models/table.glb'),
    ])

    // --- Bed: center of the cylinder ---
    const bedBox = new THREE.Box3().setFromObject(bedModel)
    const bedSize = bedBox.getSize(new THREE.Vector3())
    const bedMaxDim = Math.max(bedSize.x, bedSize.y, bedSize.z)
    const bedScale = 2.0 / bedMaxDim
    bedModel.scale.setScalar(bedScale)
    bedModel.rotation.set(Math.PI / 2, 0, 0)
    bedBox.setFromObject(bedModel)
    const bedCenter = bedBox.getCenter(new THREE.Vector3())
    bedModel.position.sub(bedCenter)
    bedModel.position.y = FLOOR_Y
    this.scene.add(bedModel)

    // --- Table: against the tank-side wall (-Z end) ---
    const tableBox = new THREE.Box3().setFromObject(tableModel)
    const tableSize = tableBox.getSize(new THREE.Vector3())
    const tableMaxDim = Math.max(tableSize.x, tableSize.y, tableSize.z)
    const tableScale = 2.0 / tableMaxDim
    tableModel.scale.setScalar(tableScale)
    tableModel.rotation.set(Math.PI / 2, Math.PI, 0)
    tableBox.setFromObject(tableModel)
    const tableCenter = tableBox.getCenter(new THREE.Vector3())
    tableModel.position.sub(tableCenter)
    tableModel.position.y = FLOOR_Y
    tableModel.position.z = -CYLINDER_LENGTH / 2 + 2
    this.tablePosition.copy(tableModel.position)
    this.scene.add(tableModel)

    // Player spawns on the bed, facing the table
    this.player.position.set(0, FLOOR_Y, 0)
    this.fpsCamera.yaw = Math.PI
    this.fpsCamera.pitch = 0

    this.loaded = true
  }

  /** Per-frame update: input, movement, interaction checks. */
  tick(dt: number): void {
    this.inputManager.tick(dt)
    this.tickMovement(dt)
    this.tickInteraction()
    this.fpsCamera.tick(dt)
  }

  dispose(): void {
    this.inputManager.dispose()
    this.fpsCamera.dispose()
    this.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        mats.forEach((m) => m.dispose())
      }
    })
  }

  // --- Private: Geometry builders ---

  private buildCylinder(): void {
    // Glass shell — transparent, open-ended, laid on its side (axis along Z)
    const glassGeo = new THREE.CylinderGeometry(
      CYLINDER_RADIUS, CYLINDER_RADIUS, CYLINDER_LENGTH,
      CYLINDER_RADIAL_SEGMENTS, 1, true,
    )
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: GLASS_COLOR,
      transparent: true,
      opacity: GLASS_OPACITY,
      roughness: 0.05,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const glass = new THREE.Mesh(glassGeo, glassMat)
    // Rotate so cylinder axis is along Z (length direction)
    glass.rotation.x = Math.PI / 2
    glass.position.y = CYLINDER_RADIUS
    this.scene.add(glass)

    // End cap — tank side (cockpit side is open)
    const capGeo = new THREE.CircleGeometry(CYLINDER_RADIUS, CYLINDER_RADIAL_SEGMENTS)
    const capMat = new THREE.MeshStandardMaterial({
      color: CAP_COLOR,
      metalness: 0.6,
      roughness: 0.4,
      side: THREE.DoubleSide,
    })
    const cap = new THREE.Mesh(capGeo, capMat)
    cap.position.set(0, CYLINDER_RADIUS, -CYLINDER_LENGTH / 2)
    this.scene.add(cap)

    // Wireframe girders
    this.buildGirders()
  }

  private buildGirders(): void {
    const verts: number[] = []
    const r = CYLINDER_RADIUS + 0.05
    const halfLen = CYLINDER_LENGTH / 2

    // Horizontal arcs (full circle for interior view)
    for (let h = 0; h <= GIRDER_SEGMENTS_HEIGHT; h++) {
      const z = -halfLen + (h / GIRDER_SEGMENTS_HEIGHT) * CYLINDER_LENGTH
      for (let s = 0; s < GIRDER_SEGMENTS_RADIAL; s++) {
        const a1 = (s / GIRDER_SEGMENTS_RADIAL) * Math.PI * 2
        const a2 = ((s + 1) / GIRDER_SEGMENTS_RADIAL) * Math.PI * 2
        verts.push(
          Math.cos(a1) * r, Math.sin(a1) * r + CYLINDER_RADIUS, z,
          Math.cos(a2) * r, Math.sin(a2) * r + CYLINDER_RADIUS, z,
        )
      }
    }

    // Vertical bars
    for (let s = 0; s <= GIRDER_SEGMENTS_RADIAL; s++) {
      const a = (s / GIRDER_SEGMENTS_RADIAL) * Math.PI * 2
      const cx = Math.cos(a) * r
      const cy = Math.sin(a) * r + CYLINDER_RADIUS
      for (let h = 0; h < GIRDER_SEGMENTS_HEIGHT; h++) {
        const z1 = -halfLen + (h / GIRDER_SEGMENTS_HEIGHT) * CYLINDER_LENGTH
        const z2 = -halfLen + ((h + 1) / GIRDER_SEGMENTS_HEIGHT) * CYLINDER_LENGTH
        verts.push(cx, cy, z1, cx, cy, z2)
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    const mat = new THREE.LineBasicMaterial({ color: GIRDER_COLOR })
    const girders = new THREE.LineSegments(geo, mat)
    this.scene.add(girders)
  }

  private buildLighting(): void {
    // Warm interior point light
    const interior = new THREE.PointLight(0xffeedd, 1.5, 20)
    interior.position.set(0, CYLINDER_RADIUS * 1.5, 0)
    this.scene.add(interior)

    // Cool ambient (simulates light through glass)
    const ambient = new THREE.AmbientLight(0x334466, 0.4)
    this.scene.add(ambient)

    // Blue-ish fill from outside the glass
    const exterior = new THREE.DirectionalLight(0x6688cc, 0.3)
    exterior.position.set(0, CYLINDER_RADIUS * 2, CYLINDER_LENGTH)
    this.scene.add(exterior)
  }

  private buildStarfield(): void {
    const positions = new Float32Array(STAR_COUNT * 3)
    for (let i = 0; i < STAR_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = STAR_SPHERE_RADIUS
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) + CYLINDER_RADIUS
      positions[i * 3 + 2] = r * Math.cos(phi)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, sizeAttenuation: true })
    this.scene.add(new THREE.Points(geo, mat))
  }

  private buildFloor(): void {
    // Flat floor at the bottom of the cylinder
    const geo = new THREE.PlaneGeometry(CYLINDER_RADIUS * 1.8, CYLINDER_LENGTH)
    const mat = new THREE.MeshStandardMaterial({
      color: 0x444455,
      metalness: 0.4,
      roughness: 0.6,
    })
    const floor = new THREE.Mesh(geo, mat)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = FLOOR_Y
    this.scene.add(floor)
  }

  // --- Private: Per-frame logic ---

  private tickMovement(dt: number): void {
    const forward = this.fpsCamera.getForwardXZ()
    const right = this.fpsCamera.getRightXZ()

    let dx = 0
    let dz = 0

    if (this.inputManager.isActionActive('moveForward')) {
      dx += forward.x
      dz += forward.y
    }
    if (this.inputManager.isActionActive('moveBack')) {
      dx -= forward.x
      dz -= forward.y
    }
    if (this.inputManager.isActionActive('moveLeft')) {
      dx -= right.x
      dz -= right.y
    }
    if (this.inputManager.isActionActive('moveRight')) {
      dx += right.x
      dz += right.y
    }

    // Normalize and apply speed
    const len = Math.sqrt(dx * dx + dz * dz)
    if (len > 0) {
      dx = (dx / len) * MOVE_SPEED * dt
      dz = (dz / len) * MOVE_SPEED * dt
    }

    // Apply movement
    this.player.position.x += dx
    this.player.position.z += dz

    // Cylindrical collision clamp
    const px = this.player.position.x
    const pz = this.player.position.z
    const dist = Math.sqrt(px * px)
    const maxDist = CYLINDER_RADIUS - COLLISION_MARGIN
    if (dist > maxDist) {
      this.player.position.x = (px / dist) * maxDist
    }

    // Clamp Z to cylinder length
    const halfLen = CYLINDER_LENGTH / 2 - COLLISION_MARGIN
    this.player.position.z = Math.max(-halfLen, Math.min(halfLen, this.player.position.z))

    // Keep on floor
    this.player.position.y = FLOOR_Y
  }

  private tickInteraction(): void {
    const dx = this.player.position.x - this.tablePosition.x
    const dz = this.player.position.z - this.tablePosition.z
    const dist = Math.sqrt(dx * dx + dz * dz)

    if (dist < INTERACT_DISTANCE) {
      this.onPrompt?.('F  Shuttle Control')
      if (this.inputManager.wasActionPressed('interact')) {
        this.onInteract?.('table')
      }
    } else {
      this.onPrompt?.(null)
    }
  }
}
```

- [ ] **Step 2: Type-check**

Run: `bun run type-check`
Expected: Clean pass.

- [ ] **Step 3: Commit**

```bash
git add src/three/HabitatInteriorScene.ts
git commit -m "feat: add HabitatInteriorScene with cylinder, lighting, starfield, FPS movement"
```

---

### Task 4: ShuttleControlOverlay Vue Component

**Files:**
- Create: `src/components/ShuttleControlOverlay.vue`

- [ ] **Step 1: Create the overlay component**

Create `src/components/ShuttleControlOverlay.vue`:

```vue
<script setup lang="ts">
defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
  }
}
</script>

<template>
  <div v-if="visible" class="ship-message-dialog" @keydown="onKeydown" tabindex="0" ref="root">
    <div class="ship-message-card" style="max-width: 36rem;">
      <div class="ship-message-card__chrome">
        <span>Shuttle Control</span>
        <button
          type="button"
          class="ship-message-card__button"
          @click="$emit('close')"
        >
          Close
        </button>
      </div>
      <div class="ship-message-card__content" style="min-height: 12rem;">
        <div class="ship-message-card__copy">
          <!-- Placeholder for future shuttle control content -->
        </div>
      </div>
      <div class="ship-message-card__footer">
        <span class="ship-message-card__hint">ESC  Close</span>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Type-check**

Run: `bun run type-check`
Expected: Clean pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/ShuttleControlOverlay.vue
git commit -m "feat: add ShuttleControlOverlay Vue component"
```

---

### Task 5: Wire Habitat into MapViewController

This is the integration task — connects HabitatState, HabitatInteriorScene, and the Vue overlay into MapViewController and MapView.vue.

**Files:**
- Modify: `src/views/MapViewController.ts`
- Modify: `src/views/MapView.vue`

- [ ] **Step 1: Add habitat state and scene to MapViewController**

In `src/views/MapViewController.ts`, add imports at the top (with the other imports):

```typescript
import { HabitatState } from '@/lib/habitatState'
import { HabitatInteriorScene } from '@/three/HabitatInteriorScene'
```

Add fields to the class (near the other private fields around line 244):

```typescript
private habitatState = new HabitatState()
private habitatScene: HabitatInteriorScene | null = null
```

Add callbacks to the public callback section (near `onDeathOverlay`, around line 290):

```typescript
/** Fired when player enters/leaves habitat. */
onHabitatActive: ((active: boolean) => void) | null = null
/** Fired when the shuttle control overlay should open/close. */
onShuttleControl: ((visible: boolean) => void) | null = null
/** Fired when the habitat interaction prompt changes. */
onHabitatPrompt: ((prompt: string | null) => void) | null = null
```

- [ ] **Step 2: Add H key handler in tick()**

In the `tick()` method, after the door toggle + inspect mode block and before the orbit action block, add the habitat entry/exit handler:

```typescript
    // Habitat interior (H key) — enter/exit first-person interior
    if (this.inputManager?.wasActionPressed('focusHabitat') && this.shuttleController && this.sceneObjects) {
      if (!this.habitatState.isActive) {
        // Enter habitat
        if (!this.inspectMode) {
          this.shuttleController.toggleDoors()
          this.inspectMode = true
        }
        this.habitatState.enter()
      } else if (this.habitatState.phase === 'habitat') {
        // Leave habitat
        this.habitatState.leave()
      }
    }
```

- [ ] **Step 3: Add habitat state tick and transition rendering**

In the `tick()` method, after the map overlay early return (after `if (this.mapState.isOpen) { ... return }`) and before the `introLocked` check, add the habitat tick:

```typescript
    // Habitat state machine
    if (this.habitatState.isActive) {
      this.habitatState.tick(dt)
      this.tickHabitatTransition()

      // When exit completes, restore map state
      if (this.habitatState.phase === 'map') {
        this.onExitHabitat()
      }

      // While in habitat, tick the interior scene
      if (this.habitatState.phase === 'habitat' && this.habitatScene) {
        this.habitatScene.tick(dt)

        // Check for exit via Escape/H inside the habitat's own input
        if (this.habitatScene.inputManager.wasActionPressed('exitHabitat')) {
          this.habitatState.leave()
        }
      }

      // Skip map gameplay while in habitat
      if (this.habitatState.phase !== 'map') return
    }
```

- [ ] **Step 4: Implement tickHabitatTransition and lifecycle methods**

Add these private methods to MapViewController:

```typescript
  /** Lazy-load the habitat interior scene on first entry. */
  private async ensureHabitatScene(): Promise<HabitatInteriorScene> {
    if (!this.habitatScene) {
      this.habitatScene = new HabitatInteriorScene()
      await this.habitatScene.load()
      this.habitatScene.onInteract = (target) => {
        if (target === 'table') {
          this.onShuttleControl?.(true)
          document.exitPointerLock()
        }
      }
      this.habitatScene.onPrompt = (prompt) => {
        this.onHabitatPrompt?.(prompt)
      }
    }
    return this.habitatScene
  }

  private tickHabitatTransition(): void {
    if (!this.sceneObjects || !this.habitatScene) return

    const renderPass = this.sceneObjects.composer.passes[0] as RenderPass
    const progress = easeInOut(this.habitatState.progress)

    if (this.habitatState.phase === 'transitioning_in') {
      // Swap to habitat scene immediately so the fly-in renders the interior
      renderPass.scene = this.habitatScene.getScene()
      renderPass.camera = this.habitatScene.getCamera()
      // Disable vehicle camera controls during transition
      if (this.vehicleCamera) {
        this.vehicleCamera.controls.enabled = false
      }
    } else if (this.habitatState.phase === 'habitat') {
      // Fully inside — render habitat
      renderPass.scene = this.habitatScene.getScene()
      renderPass.camera = this.habitatScene.getCamera()
    } else if (this.habitatState.phase === 'transitioning_out') {
      // Fly-out — still rendering habitat until complete
      renderPass.scene = this.habitatScene.getScene()
      renderPass.camera = this.habitatScene.getCamera()
    }
  }

  private onEnterHabitat(): void {
    this.onHabitatActive?.(true)
    // Request pointer lock for FPS mouse look
    this.sceneObjects?.renderer.domElement.requestPointerLock()
  }

  private onExitHabitat(): void {
    if (!this.sceneObjects) return

    // Restore map scene + camera
    const renderPass = this.sceneObjects.composer.passes[0] as RenderPass
    renderPass.scene = this.sceneObjects.scene
    if (this.vehicleCamera) {
      renderPass.camera = this.vehicleCamera.camera
      this.vehicleCamera.controls.enabled = true
    }

    // Close doors
    if (this.inspectMode) {
      this.shuttleController?.toggleDoors()
      this.inspectMode = false
    }

    document.exitPointerLock()
    this.onHabitatActive?.(false)
    this.onHabitatPrompt?.(null)
  }
```

- [ ] **Step 5: Wire habitat entry when transitioning_in completes**

The `tickHabitatTransition` runs every frame. We need to detect when `transitioning_in` first reaches `habitat` to trigger `onEnterHabitat`. Update the habitat tick block in `tick()`:

Replace the habitat state tick block from Step 3 with:

```typescript
    // Habitat state machine
    if (this.habitatState.isActive) {
      const wasTrans = this.habitatState.phase === 'transitioning_in'
      this.habitatState.tick(dt)

      // Lazy-load scene on first entry
      if (this.habitatState.phase !== 'map' && !this.habitatScene) {
        this.ensureHabitatScene()
      }

      this.tickHabitatTransition()

      // Detect transitioning_in → habitat
      if (wasTrans && this.habitatState.phase === 'habitat') {
        this.onEnterHabitat()
      }

      // When exit completes, restore map state
      if (this.habitatState.phase === 'map') {
        this.onExitHabitat()
      }

      // While in habitat, tick the interior scene
      if (this.habitatState.phase === 'habitat' && this.habitatScene) {
        this.habitatScene.tick(dt)

        // Check for exit via Escape/H inside the habitat's own input
        if (this.habitatScene.inputManager.wasActionPressed('exitHabitat')) {
          this.habitatState.leave()
        }
      }

      // Skip map gameplay while in habitat
      if (this.habitatState.phase !== 'map') return
    }
```

- [ ] **Step 6: Add mousemove handler for habitat FPS camera**

Add the event listener in `init()` (after the vehicleCamera setup, near where the old one was):

```typescript
    // Habitat FPS camera mouse look
    document.addEventListener('mousemove', this.onHabitatMouseMove)
```

Add the handler as a private arrow method (near the bottom of the class, before `dispose`):

```typescript
  /** Feed mouse deltas to the habitat FPS camera when pointer is locked. */
  private onHabitatMouseMove = (e: MouseEvent): void => {
    if (this.habitatState.phase !== 'habitat' || !this.habitatScene) return
    if (!document.pointerLockElement) return
    this.habitatScene.fpsCamera.applyMouseDelta(e.movementX, e.movementY)
  }
```

Clean up in `dispose()`:

```typescript
    document.removeEventListener('mousemove', this.onHabitatMouseMove)
    this.habitatScene?.dispose()
    this.habitatScene = null
```

- [ ] **Step 7: Guard tickStartupIntroCamera against habitat mode**

In `tickStartupIntroCamera()`, the final line sets `renderPass.camera = this.vehicleCamera.camera`. Guard it so it doesn't override the habitat camera:

```typescript
    if (!this.habitatState.isActive) {
      renderPass.camera = this.vehicleCamera.camera
    }
```

- [ ] **Step 8: Wire Vue overlay in MapView.vue**

In `src/views/MapView.vue`, add the import and reactive state:

In the `<script setup>` section, add:

```typescript
import ShuttleControlOverlay from '@/components/ShuttleControlOverlay.vue'

const habitatActive = ref(false)
const shuttleControlVisible = ref(false)
const habitatPrompt = ref<string | null>(null)
```

Wire the callbacks (in the `onMounted` block after the other callback wiring):

```typescript
viewController.onHabitatActive = (active) => {
  habitatActive.value = active
}
viewController.onShuttleControl = (visible) => {
  shuttleControlVisible.value = visible
}
viewController.onHabitatPrompt = (prompt) => {
  habitatPrompt.value = prompt
}
```

Add a close handler function:

```typescript
function closeShuttleControl() {
  shuttleControlVisible.value = false
  // Re-request pointer lock for FPS
  const canvas = document.querySelector('canvas')
  canvas?.requestPointerLock()
}
```

In the `<template>`, add after the existing overlays:

```vue
  <ShuttleControlOverlay
    :visible="shuttleControlVisible"
    @close="closeShuttleControl"
  />
  <div v-if="habitatActive && habitatPrompt && !shuttleControlVisible" class="habitat-prompt">
    <span class="orbit-prompt-action">{{ habitatPrompt }}</span>
  </div>
```

- [ ] **Step 9: Add habitat prompt CSS**

In `src/assets/css/main.css`, add:

```css
.habitat-prompt {
  @apply pointer-events-none fixed bottom-24 left-1/2 z-30 -translate-x-1/2
         rounded-lg border border-cyan-400/25 bg-slate-950/80 px-4 py-2
         font-mono text-sm uppercase tracking-widest text-cyan-200/80;
}
```

- [ ] **Step 10: Type-check**

Run: `bun run type-check`
Expected: Clean pass.

- [ ] **Step 11: Test manually**

Run: `bun dev`

Test the following:
1. Press H in map view — doors open, camera transitions into habitat interior
2. WASD to walk around inside the cylinder
3. Mouse look works (pointer lock)
4. Walk to table — see "F Shuttle Control" prompt
5. Press F — overlay appears
6. Close overlay — FPS resumes
7. Press H or Escape — camera transitions back to map
8. Map state resumes (orbit/free flight unchanged)
9. Press H while orbiting — enters habitat, exit restores orbit

- [ ] **Step 12: Commit**

```bash
git add src/views/MapViewController.ts src/views/MapView.vue src/assets/css/main.css
git commit -m "feat: wire habitat interior into MapView with transitions and shuttle control overlay"
```

---

### Task 6: Add RenderPass.scene type support

The Three.js `RenderPass` has a `.scene` property that we need to swap. If TypeScript complains about it (the types may not expose it as writable), we need a small type assertion.

**Files:**
- Possibly modify: `src/views/MapViewController.ts` (only if type errors arise in Task 5)

- [ ] **Step 1: Check if renderPass.scene assignment causes type errors**

If `bun run type-check` in Task 5 showed errors like "Cannot assign to 'scene' because it is a read-only property", add a type assertion where the scene is swapped:

```typescript
;(renderPass as { scene: THREE.Scene }).scene = this.habitatScene.getScene()
```

Apply this pattern to all `renderPass.scene =` assignments in the habitat transition code.

- [ ] **Step 2: Type-check and commit if needed**

Run: `bun run type-check`
If changes were made:
```bash
git add src/views/MapViewController.ts
git commit -m "fix: add type assertion for RenderPass.scene swap"
```

---

### Task 7: Final Lint and Full Test Suite

**Files:** None (verification only)

- [ ] **Step 1: Run full lint**

Run: `bun lint`
Expected: Clean pass. Fix any issues.

- [ ] **Step 2: Run full test suite**

Run: `bun test:unit`
Expected: All tests pass including the new `habitatState.spec.ts`.

- [ ] **Step 3: Final type-check**

Run: `bun run type-check`
Expected: Clean pass.

- [ ] **Step 4: Commit any lint fixes**

If lint required fixes:
```bash
git add -A
git commit -m "fix: lint cleanup for habitat interior"
```
