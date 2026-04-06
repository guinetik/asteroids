# Level Arrival Sequence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the minimal 3-second arrival intro with a cinematic shuttle arrival sequence — approach, flip, open doors, lander detaches, shuttle departs, camera follows lander to gameplay.

**Architecture:** New `ArrivalSequence` class loads the shuttle GLB independently (no ShuttleController dependency), runs a timeline-driven animation, then removes itself. Integrated via the existing `arrival` state in `levelStateMachine.ts`.

**Tech Stack:** Three.js, TypeScript, GLTFLoader

---

### Task 1: Create ArrivalSequence Class

**Files:**
- Create: `src/three/ArrivalSequence.ts`

This is the core class. It loads the shuttle model, sets up door animation, positions the lander inside the cargo bay, and exposes a `tick(dt)` that drives a scripted timeline.

- [ ] **Step 1: Create the file**

Create `src/three/ArrivalSequence.ts`:

```ts
/**
 * Cinematic arrival sequence for the asteroid level.
 *
 * Loads the shuttle model, animates approach → flip → doors open →
 * lander detach → shuttle departs. Manages a cinematic camera
 * that transitions to follow the lander at the end.
 *
 * @author guinetik
 * @date 2026-04-06
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { FuelTank } from './FuelTank'
import { HabitatModule } from './HabitatModule'

const SHUTTLE_MODEL_PATH = '/models/shuttle.glb'
const DRACO_DECODER_PATH = '/node_modules/three/examples/jsm/libs/draco/'

/** NASA model is in centimeters. Scale to meters. */
const MODEL_SCALE = 0.01

/** Model orientation correction: rotate -90° around X to lay flat on XZ. */
const MODEL_ROTATION_X = -Math.PI / 2

/** Cargo bay door open angle (radians). */
const DOOR_OPEN_ANGLE = Math.PI * 0.6

/** Cargo bay door animation speed (radians/sec). */
const DOOR_ANIM_SPEED = 1.5

/** Scale for the lander model inside the cargo bay (raw shuttle cm space). */
const CARGO_LANDER_SCALE = 30

/** Lander position inside the bay — raw model coords. */
const CARGO_LANDER_OFFSET = new THREE.Vector3(-320, 0, 20)

// ── Timeline phase durations (seconds) ──────────────────────────
/** Shuttle approaches from distance. */
const PHASE_APPROACH_DURATION = 4.0
/** Shuttle rotates 180° (flip maneuver). */
const PHASE_FLIP_DURATION = 2.5
/** Doors open, brief pause. */
const PHASE_DOORS_DURATION = 2.5
/** Lander detaches and drifts out. */
const PHASE_DETACH_DURATION = 2.0
/** Shuttle closes doors and flies away. */
const PHASE_DEPART_DURATION = 3.0
/** Camera transitions to follow lander. */
const PHASE_CAMERA_TRANSITION_DURATION = 1.5

/** Total sequence duration. */
export const ARRIVAL_SEQUENCE_DURATION =
  PHASE_APPROACH_DURATION +
  PHASE_FLIP_DURATION +
  PHASE_DOORS_DURATION +
  PHASE_DETACH_DURATION +
  PHASE_DEPART_DURATION +
  PHASE_CAMERA_TRANSITION_DURATION

// ── Approach path ───────────────────────────────────────────────
/** Shuttle starts this far from the asteroid (world units). */
const APPROACH_START_DISTANCE = 800
/** Shuttle stops this far from the lander spawn point. */
const APPROACH_END_DISTANCE = 60
/** Shuttle approach altitude (Y). */
const APPROACH_ALTITUDE = 400
/** Shuttle visual scale in the level scene. */
const SHUTTLE_LEVEL_SCALE = 1.0

/** Lander separation drift speed (world units/sec). */
const LANDER_DETACH_SPEED = 15

/** Shuttle departure speed (world units/sec, accelerating). */
const SHUTTLE_DEPART_ACCELERATION = 40

/** Timeline phase identifiers. */
type ArrivalPhase = 'approach' | 'flip' | 'doors' | 'detach' | 'depart' | 'camera-transition' | 'done'

/**
 * Cinematic arrival sequence for the asteroid level.
 *
 * @author guinetik
 * @date 2026-04-06
 */
export class ArrivalSequence {
  /** Root group added to the scene. */
  readonly shuttleGroup = new THREE.Group()

  /** The cinematic camera managed by this sequence. */
  readonly camera: THREE.PerspectiveCamera

  /** Whether the sequence has finished. */
  get isDone(): boolean {
    return this.phase === 'done'
  }

  /** World position where the lander should spawn after detach. */
  get landerSpawnPosition(): THREE.Vector3 {
    return this.landerWorldPos.clone()
  }

  private phase: ArrivalPhase = 'approach'
  private elapsed = 0
  private phaseElapsed = 0

  // Model nodes
  private doorPortNode: THREE.Object3D | null = null
  private doorStbNode: THREE.Object3D | null = null
  private doorPortClosedRotX = 0
  private doorStbClosedRotX = 0
  private doorProgress = 0
  private landerModel: THREE.Object3D | null = null
  private landerDetached = false
  private landerWorldPos = new THREE.Vector3()

  // Shuttle flight state
  private shuttleStartPos = new THREE.Vector3()
  private shuttleEndPos = new THREE.Vector3()
  private shuttleHeading = 0
  private departSpeed = 0

  // Camera state
  private cameraStartPos = new THREE.Vector3()
  private cameraStartTarget = new THREE.Vector3()
  private cameraEndPos = new THREE.Vector3()
  private cameraEndTarget = new THREE.Vector3()

  /** Called when the lander detaches — passes world position for LanderController placement. */
  onLanderDetach: ((position: THREE.Vector3) => void) | null = null

  /** Called when the full sequence completes. */
  onComplete: (() => void) | null = null

  constructor(private readonly landerSpawnTarget: THREE.Vector3) {
    this.camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 15000)

    // Shuttle approaches from behind the camera toward the lander spawn
    this.shuttleEndPos.set(
      landerSpawnTarget.x,
      APPROACH_ALTITUDE,
      landerSpawnTarget.z - APPROACH_END_DISTANCE,
    )
    this.shuttleStartPos.set(
      landerSpawnTarget.x,
      APPROACH_ALTITUDE,
      landerSpawnTarget.z - APPROACH_START_DISTANCE,
    )
    this.shuttleGroup.position.copy(this.shuttleStartPos)
  }

  /** Load the shuttle model and set up internal structure. */
  async load(): Promise<void> {
    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath(DRACO_DECODER_PATH)
    const gltfLoader = new GLTFLoader()
    gltfLoader.setDRACOLoader(dracoLoader)

    const gltf = await gltfLoader.loadAsync(SHUTTLE_MODEL_PATH)
    gltf.scene.scale.setScalar(MODEL_SCALE)
    gltf.scene.rotation.x = MODEL_ROTATION_X
    this.shuttleGroup.add(gltf.scene)
    this.shuttleGroup.scale.setScalar(SHUTTLE_LEVEL_SCALE)

    // Find door nodes
    this.doorPortNode = this.findNode(gltf.scene, 'door-prt')
    this.doorStbNode = this.findNode(gltf.scene, 'door-stb')
    if (this.doorPortNode) this.doorPortClosedRotX = this.doorPortNode.rotation.x
    if (this.doorStbNode) this.doorStbClosedRotX = this.doorStbNode.rotation.x

    // Fuel tanks (cosmetic, always full)
    const landerTank = new FuelTank({
      radius: 80,
      length: 120,
      position: new THREE.Vector3(-125, 0, 15),
      color: 0xcc6633,
    })
    landerTank.update(1.0)
    gltf.scene.add(landerTank.group)

    const shuttleTank = new FuelTank({
      radius: 80,
      length: 220,
      position: new THREE.Vector3(35, 0, 15),
      color: 0x999999,
    })
    shuttleTank.update(1.0)
    gltf.scene.add(shuttleTank.group)

    // Habitat module (cosmetic)
    const habitat = new HabitatModule({
      radius: 80,
      length: 260,
      position: new THREE.Vector3(290, 0, 15),
    })
    habitat.setVisible(true)
    gltf.scene.add(habitat.group)

    // Lander inside cargo bay — will be detached later
    const landerGltf = await gltfLoader.loadAsync('/models/lander.glb')
    this.landerModel = landerGltf.scene
    this.landerModel.scale.setScalar(CARGO_LANDER_SCALE)
    this.landerModel.position.copy(CARGO_LANDER_OFFSET)
    this.landerModel.rotation.set(0, 0, -Math.PI / 2)
    gltf.scene.add(this.landerModel)

    dracoLoader.dispose()

    // Initial camera: behind and above the shuttle, looking at it
    this.camera.position.set(
      this.shuttleStartPos.x,
      this.shuttleStartPos.y + 30,
      this.shuttleStartPos.z - 120,
    )
    this.camera.lookAt(this.shuttleStartPos)
  }

  /** Advance the sequence by dt seconds. */
  tick(dt: number): void {
    if (this.phase === 'done') return

    this.elapsed += dt
    this.phaseElapsed += dt

    switch (this.phase) {
      case 'approach':
        this.tickApproach(dt)
        break
      case 'flip':
        this.tickFlip(dt)
        break
      case 'doors':
        this.tickDoors(dt)
        break
      case 'detach':
        this.tickDetach(dt)
        break
      case 'depart':
        this.tickDepart(dt)
        break
      case 'camera-transition':
        this.tickCameraTransition(dt)
        break
    }
  }

  /** Remove shuttle from scene. Call after sequence completes. */
  dispose(): void {
    this.shuttleGroup.removeFromParent()
    this.shuttleGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose())
        } else {
          child.material.dispose()
        }
      }
    })
  }

  // ── Phase tickers ─────────────────────────────────────────────

  private tickApproach(_dt: number): void {
    const t = Math.min(1, this.phaseElapsed / PHASE_APPROACH_DURATION)
    const eased = this.easeInOut(t)

    // Shuttle moves from start to end
    this.shuttleGroup.position.lerpVectors(this.shuttleStartPos, this.shuttleEndPos, eased)

    // Camera follows behind and slightly above
    this.camera.position.set(
      this.shuttleGroup.position.x + 20,
      this.shuttleGroup.position.y + 25,
      this.shuttleGroup.position.z - 80,
    )
    this.camera.lookAt(this.shuttleGroup.position)

    if (t >= 1) this.nextPhase('flip')
  }

  private tickFlip(_dt: number): void {
    const t = Math.min(1, this.phaseElapsed / PHASE_FLIP_DURATION)
    const eased = this.easeInOut(t)

    // Rotate 180° around Y — nose was pointing +Z, now points -Z
    this.shuttleGroup.rotation.y = eased * Math.PI
    this.shuttleHeading = this.shuttleGroup.rotation.y

    // Camera orbits around to see the flip from the side
    const angle = eased * Math.PI * 0.5
    const camDist = 100
    this.camera.position.set(
      this.shuttleGroup.position.x + Math.sin(angle) * camDist,
      this.shuttleGroup.position.y + 20,
      this.shuttleGroup.position.z - Math.cos(angle) * camDist,
    )
    this.camera.lookAt(this.shuttleGroup.position)

    if (t >= 1) this.nextPhase('doors')
  }

  private tickDoors(dt: number): void {
    const t = Math.min(1, this.phaseElapsed / PHASE_DOORS_DURATION)

    // Open doors
    this.doorProgress = Math.min(1, this.doorProgress + DOOR_ANIM_SPEED * dt)
    this.updateDoorRotation()

    // Camera moves to see the open cargo bay
    const camTarget = this.shuttleGroup.position.clone()
    camTarget.y -= 10
    this.camera.position.set(
      this.shuttleGroup.position.x + 60,
      this.shuttleGroup.position.y - 5,
      this.shuttleGroup.position.z + 40,
    )
    this.camera.lookAt(camTarget)

    if (t >= 1) this.nextPhase('detach')
  }

  private tickDetach(dt: number): void {
    const t = Math.min(1, this.phaseElapsed / PHASE_DETACH_DURATION)

    if (!this.landerDetached && this.landerModel) {
      // Reparent lander to scene root
      const worldPos = new THREE.Vector3()
      this.landerModel.getWorldPosition(worldPos)
      const worldQuat = new THREE.Quaternion()
      this.landerModel.getWorldQuaternion(worldQuat)

      this.landerModel.removeFromParent()
      // Don't re-add — the lander model is just for the cinematic.
      // Signal position so LanderController can be placed there.
      this.landerWorldPos.copy(worldPos)
      this.landerDetached = true
      this.onLanderDetach?.(worldPos)
    }

    // Camera watches the lander position while shuttle hovers
    this.camera.position.set(
      this.landerWorldPos.x + 40,
      this.landerWorldPos.y + 20,
      this.landerWorldPos.z + 30,
    )
    this.camera.lookAt(this.landerWorldPos)

    if (t >= 1) this.nextPhase('depart')
  }

  private tickDepart(dt: number): void {
    const t = Math.min(1, this.phaseElapsed / PHASE_DEPART_DURATION)

    // Close doors
    this.doorProgress = Math.max(0, this.doorProgress - DOOR_ANIM_SPEED * dt)
    this.updateDoorRotation()

    // Shuttle accelerates away
    this.departSpeed += SHUTTLE_DEPART_ACCELERATION * dt
    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(this.shuttleGroup.quaternion)
    forward.normalize()
    this.shuttleGroup.position.addScaledVector(forward, this.departSpeed * dt)
    // Rise as it departs
    this.shuttleGroup.position.y += this.departSpeed * 0.3 * dt

    // Camera stays watching the lander area
    this.camera.lookAt(this.landerWorldPos)

    if (t >= 1) {
      // Store camera state for transition
      this.cameraStartPos.copy(this.camera.position)
      this.cameraStartTarget.copy(this.landerWorldPos)
      // Final camera: typical lander gameplay view
      this.cameraEndPos.set(
        this.landerWorldPos.x + 80,
        this.landerWorldPos.y + 30,
        this.landerWorldPos.z + 60,
      )
      this.cameraEndTarget.copy(this.landerWorldPos)
      this.nextPhase('camera-transition')
    }
  }

  private tickCameraTransition(_dt: number): void {
    const t = Math.min(1, this.phaseElapsed / PHASE_CAMERA_TRANSITION_DURATION)
    const eased = this.easeInOut(t)

    this.camera.position.lerpVectors(this.cameraStartPos, this.cameraEndPos, eased)
    const target = new THREE.Vector3().lerpVectors(this.cameraStartTarget, this.cameraEndTarget, eased)
    this.camera.lookAt(target)

    if (t >= 1) {
      this.phase = 'done'
      this.onComplete?.()
    }
  }

  // ── Helpers ───────────────────────────────────────────────────

  private nextPhase(next: ArrivalPhase): void {
    this.phase = next
    this.phaseElapsed = 0
  }

  private updateDoorRotation(): void {
    const angle = this.doorProgress * DOOR_OPEN_ANGLE
    if (this.doorPortNode) {
      this.doorPortNode.rotation.x = this.doorPortClosedRotX - angle
    }
    if (this.doorStbNode) {
      this.doorStbNode.rotation.x = this.doorStbClosedRotX + angle
    }
  }

  private easeInOut(t: number): number {
    return t * t * (3 - 2 * t)
  }

  private findNode(root: THREE.Object3D, name: string): THREE.Object3D | null {
    let found: THREE.Object3D | null = null
    root.traverse((child) => {
      if (child.name === name && !found) found = child
    })
    return found
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/three/ArrivalSequence.ts
git commit -m "feat(level): add cinematic ArrivalSequence class"
```

---

### Task 2: Update Level State Machine Duration

**Files:**
- Modify: `src/lib/level/levelStateMachine.ts`

- [ ] **Step 1: Import and use the arrival sequence duration**

In `src/lib/level/levelStateMachine.ts`, update the arrival duration:

Change:
```ts
/** Duration of the arrival cutscene in seconds. */
export const ARRIVAL_DURATION = 3.0
```

To:
```ts
import { ARRIVAL_SEQUENCE_DURATION } from '@/three/ArrivalSequence'

/** Duration of the arrival cutscene in seconds. */
export const ARRIVAL_DURATION = ARRIVAL_SEQUENCE_DURATION
```

- [ ] **Step 2: Run tests**

Run: `bun test:unit src/lib/level/`
Expected: Tests pass (duration changed but state machine logic unchanged).

- [ ] **Step 3: Commit**

```bash
git add src/lib/level/levelStateMachine.ts
git commit -m "feat(level): extend arrival duration to match cinematic sequence"
```

---

### Task 3: Integrate ArrivalSequence into LevelViewController

**Files:**
- Modify: `src/views/LevelViewController.ts`

- [ ] **Step 1: Add import**

```ts
import { ArrivalSequence } from '@/three/ArrivalSequence'
```

- [ ] **Step 2: Add state field**

Near the existing lander/camera fields:

```ts
  /** Cinematic arrival sequence (loaded once, disposed after use). */
  private arrivalSequence: ArrivalSequence | null = null
```

- [ ] **Step 3: Load ArrivalSequence in init()**

In the `init()` method, after the lander is loaded and positioned but BEFORE the state machine is created, add:

```ts
    // Load cinematic arrival sequence
    const landerSpawn = new THREE.Vector3(0, LANDER_SPAWN_HEIGHT, 0)
    this.arrivalSequence = new ArrivalSequence(landerSpawn)
    await this.arrivalSequence.load()
    this.sceneManager!.scene.add(this.arrivalSequence.shuttleGroup)

    // When lander detaches from shuttle, position the lander controller
    this.arrivalSequence.onLanderDetach = (position) => {
      if (this.landerController) {
        this.landerController.group.position.copy(position)
      }
    }

    // When sequence completes, clean up
    this.arrivalSequence.onComplete = () => {
      this.arrivalSequence?.dispose()
      this.arrivalSequence = null
    }
```

Note: The existing lander starts hidden or at the spawn height. During the cinematic, the lander should be invisible (the shuttle's cargo lander is the visual). Make the lander visible when detach happens. You may need to:
- Set `this.landerController.group.visible = false` at init
- Set `this.landerController.group.visible = true` in `onLanderDetach`

- [ ] **Step 4: Update enterArrival()**

Replace the current `enterArrival()`:

```ts
  private enterArrival(): void {
    // Hide the gameplay lander — the shuttle's cargo lander is visible during the cinematic
    if (this.landerController) {
      this.landerController.group.visible = false
    }

    // Use the arrival sequence camera
    if (this.arrivalSequence) {
      this.sceneManager!.setActiveCamera(this.arrivalSequence.camera)
    }

    // Disable orbit controls during arrival
    this.vehicleCamera!.controls.enabled = false

    // Letterbox
    this.onLetterbox?.(true)
  }
```

Note: Do NOT register the lander controller for physics during arrival. The lander shouldn't fall while inside the shuttle.

- [ ] **Step 5: Update exitArrival()**

Replace:

```ts
  private exitArrival(): void {
    // Show the lander for gameplay
    if (this.landerController) {
      this.landerController.group.visible = true
    }

    // Letterbox starts closing
    this.onLetterbox?.(false)
  }
```

- [ ] **Step 6: Add arrival sequence tick**

In the `tick()` method of `LevelViewController`, find where the state machine and lander are ticked. Add a check to tick the arrival sequence when it exists:

```ts
    // Tick arrival sequence if active
    if (this.arrivalSequence) {
      this.arrivalSequence.tick(dt)
    }
```

This should be added in the main tick, ideally at `TICK_PRIORITY_ANIMATION` or just before the state machine tick. Since `LevelViewController` itself is a `Tickable`, add it in its `tick(dt)` method.

- [ ] **Step 7: Clean up existing arrival camera code**

The `updateArrivalCamera()` method and `arrivalCamera` field are no longer needed — the `ArrivalSequence` manages its own camera. Remove:
- The `arrivalCamera` field declaration
- The `arrivalCamera` creation in `init()`
- The `updateArrivalCamera()` method
- Any tick call to `updateArrivalCamera()`
- The `ARRIVAL_CAM_OFFSET`, `ARRIVAL_CAM_FOV`, `ARRIVAL_CAM_NEAR`, `ARRIVAL_CAM_FAR` constants

- [ ] **Step 8: Run type-check**

Run: `bun run type-check`

- [ ] **Step 9: Commit**

```bash
git add src/views/LevelViewController.ts
git commit -m "feat(level): integrate ArrivalSequence into level controller"
```

---

### Task 4: Final Verification

- [ ] **Step 1: Run type-check**

Run: `bun run type-check`
Expected: Clean.

- [ ] **Step 2: Run tests**

Run: `bun test:unit`
Expected: All pass.

- [ ] **Step 3: Run lint**

Run: `bun lint`
Expected: No blocking errors.

- [ ] **Step 4: Smoke test**

Run: `bun dev`

Manual verification:
1. Accept an asteroid mission, fly to waypoint, press E
2. Level loads — shuttle approaches from distance
3. Shuttle flips 180°
4. Cargo doors open
5. Lander detaches
6. Shuttle closes doors and flies away
7. Camera transitions to follow lander
8. Player gets control of lander

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "chore(level): fix arrival sequence issues"
```

---

**Note:** The timeline phases, camera positions, and offsets are best-guess starting points. Expect to iterate on them after seeing them in-game. The constants are all named and grouped at the top of `ArrivalSequence.ts` for easy tuning.
