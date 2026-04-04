# Shuttle Scene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundational game loop, input system, and a flyable shuttle scene with door animations, thruster effects, and star background.

**Architecture:** Pure-TS game systems (GameLoop, TickHandler, InputManager) in `src/lib/` with zero framework deps. Three.js controllers in `src/three/` implement `Tickable` and register with the tick system. Vue routes are game "maps" — each mounts/disposes its own loop and controllers via a ViewController.

**Tech Stack:** Vue 3, Three.js r183, TypeScript, Vitest, Tailwind CSS v4, Bun

**Spec:** `docs/superpowers/specs/2026-04-04-shuttle-scene-design.md`

**Test runner:** `bun test:unit` (Vitest + JSDOM). Single file: `bun test:unit src/path/to/test.spec.ts`

**Lint (Windows):** `bun run lint:oxlint && bun run lint:eslint`

**TSDoc:** All exported classes, interfaces, and functions must have TSDoc with `@author guinetik`, `@date 2026-04-04`, `@spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md`. Code in tasks below shows TSDoc on key exports; apply the same pattern to all exports in each file.

---

### Task 1: Tickable Interface and TickHandler

**Files:**
- Create: `src/lib/Tickable.ts`
- Create: `src/lib/TickHandler.ts`
- Create: `src/lib/__tests__/TickHandler.spec.ts`

The `Tickable` interface and `TickHandler` are the backbone — everything subscribes to ticks.

- [ ] **Step 1: Write the Tickable interface**

```ts
// src/lib/Tickable.ts
/**
 * Contract for objects that receive per-frame updates from the game loop.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
export interface Tickable {
  tick(dt: number): void
}
```

- [ ] **Step 2: Write failing tests for TickHandler**

```ts
// src/lib/__tests__/TickHandler.spec.ts
import { describe, it, expect, vi } from 'vitest'
import { TickHandler } from '../TickHandler'
import type { Tickable } from '../Tickable'

function makeTickable(): Tickable & { tick: ReturnType<typeof vi.fn> } {
  return { tick: vi.fn() }
}

describe('TickHandler', () => {
  it('calls registered tickables with delta time', () => {
    const handler = new TickHandler()
    const a = makeTickable()
    handler.register(a)

    handler.tick(0.016)

    expect(a.tick).toHaveBeenCalledWith(0.016)
  })

  it('does not call unregistered tickables', () => {
    const handler = new TickHandler()
    const a = makeTickable()
    handler.register(a)
    handler.unregister(a)

    handler.tick(0.016)

    expect(a.tick).not.toHaveBeenCalled()
  })

  it('calls tickables in priority order (lower first)', () => {
    const handler = new TickHandler()
    const order: string[] = []
    const a: Tickable = { tick: () => order.push('a') }
    const b: Tickable = { tick: () => order.push('b') }
    const c: Tickable = { tick: () => order.push('c') }

    handler.register(c, 30)
    handler.register(a, 0)
    handler.register(b, 10)

    handler.tick(0.016)

    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('uses default priority 0 when none specified', () => {
    const handler = new TickHandler()
    const order: string[] = []
    const a: Tickable = { tick: () => order.push('a') }
    const b: Tickable = { tick: () => order.push('b') }

    handler.register(b, 10)
    handler.register(a) // default 0

    handler.tick(0.016)

    expect(order).toEqual(['a', 'b'])
  })

  it('ignores duplicate registration', () => {
    const handler = new TickHandler()
    const a = makeTickable()
    handler.register(a)
    handler.register(a)

    handler.tick(0.016)

    expect(a.tick).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test:unit src/lib/__tests__/TickHandler.spec.ts`
Expected: FAIL — `TickHandler` module not found

- [ ] **Step 4: Implement TickHandler**

```ts
// src/lib/TickHandler.ts
import type { Tickable } from './Tickable'

interface TickEntry {
  tickable: Tickable
  priority: number
}

const DEFAULT_PRIORITY = 0

/**
 * Central registry for per-frame update callbacks, dispatched in priority order.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
export class TickHandler {
  private entries: TickEntry[] = []

  register(tickable: Tickable, priority: number = DEFAULT_PRIORITY): void {
    if (this.entries.some((e) => e.tickable === tickable)) return
    this.entries.push({ tickable, priority })
    this.entries.sort((a, b) => a.priority - b.priority)
  }

  unregister(tickable: Tickable): void {
    this.entries = this.entries.filter((e) => e.tickable !== tickable)
  }

  tick(dt: number): void {
    for (const entry of this.entries) {
      entry.tickable.tick(dt)
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test:unit src/lib/__tests__/TickHandler.spec.ts`
Expected: All 5 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/Tickable.ts src/lib/TickHandler.ts src/lib/__tests__/TickHandler.spec.ts
git commit -m "feat(lib): add Tickable interface and TickHandler with priority dispatch"
```

---

### Task 2: GameLoop

**Files:**
- Create: `src/lib/GameLoop.ts`
- Create: `src/lib/__tests__/GameLoop.spec.ts`

GameLoop owns `requestAnimationFrame` and drives TickHandler each frame.

- [ ] **Step 1: Write failing tests for GameLoop**

```ts
// src/lib/__tests__/GameLoop.spec.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GameLoop } from '../GameLoop'
import { TickHandler } from '../TickHandler'

describe('GameLoop', () => {
  let tickHandler: TickHandler
  let loop: GameLoop

  beforeEach(() => {
    tickHandler = new TickHandler()
    loop = new GameLoop(tickHandler)
    vi.spyOn(tickHandler, 'tick')
  })

  afterEach(() => {
    loop.stop()
    vi.restoreAllMocks()
  })

  it('is not running initially', () => {
    expect(loop.isRunning).toBe(false)
  })

  it('is running after start()', () => {
    loop.start()
    expect(loop.isRunning).toBe(true)
  })

  it('is not running after stop()', () => {
    loop.start()
    loop.stop()
    expect(loop.isRunning).toBe(false)
  })

  it('does not double-start', () => {
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame')
    loop.start()
    loop.start()
    expect(rafSpy).toHaveBeenCalledTimes(1)
  })

  it('clamps delta time to MAX_DELTA', () => {
    loop.start()

    // Simulate first frame at t=0 (skipped, sets lastTime)
    const rafCalls = vi.mocked(globalThis.requestAnimationFrame).mock.calls
    const firstCallback = rafCalls[0]![0]!
    firstCallback(0)

    // Simulate second frame at t=500ms (huge gap, should clamp)
    const secondCallback = vi.mocked(globalThis.requestAnimationFrame).mock.calls[1]![0]!
    secondCallback(500)

    expect(tickHandler.tick).toHaveBeenCalledWith(0.1) // MAX_DELTA_S = 0.1
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/__tests__/GameLoop.spec.ts`
Expected: FAIL — `GameLoop` module not found

- [ ] **Step 3: Implement GameLoop**

```ts
// src/lib/GameLoop.ts
import type { TickHandler } from './TickHandler'

const MAX_DELTA_MS = 100
const MAX_DELTA_S = MAX_DELTA_MS / 1000
const MS_TO_S = 1 / 1000

export class GameLoop {
  private _isRunning = false
  private rafId = 0
  private lastTime = 0

  constructor(private readonly tickHandler: TickHandler) {}

  get isRunning(): boolean {
    return this._isRunning
  }

  start(): void {
    if (this._isRunning) return
    this._isRunning = true
    this.lastTime = 0
    this.rafId = requestAnimationFrame(this.frame)
  }

  stop(): void {
    if (!this._isRunning) return
    this._isRunning = false
    cancelAnimationFrame(this.rafId)
  }

  private frame = (timeMs: number): void => {
    if (!this._isRunning) return

    if (this.lastTime === 0) {
      this.lastTime = timeMs
      this.rafId = requestAnimationFrame(this.frame)
      return
    }

    const rawDelta = (timeMs - this.lastTime) * MS_TO_S
    const dt = Math.min(rawDelta, MAX_DELTA_S)
    this.lastTime = timeMs

    this.tickHandler.tick(dt)

    this.rafId = requestAnimationFrame(this.frame)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/__tests__/GameLoop.spec.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/GameLoop.ts src/lib/__tests__/GameLoop.spec.ts
git commit -m "feat(lib): add GameLoop with rAF-driven tick dispatch and delta clamping"
```

---

### Task 3: InputManager

**Files:**
- Create: `src/lib/InputManager.ts`
- Create: `src/lib/__tests__/InputManager.spec.ts`

Centralized action-based input. Controllers query actions, not raw keys.

- [ ] **Step 1: Write failing tests for InputManager**

```ts
// src/lib/__tests__/InputManager.spec.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { InputManager } from '../InputManager'

const TEST_BINDINGS: Record<string, string[]> = {
  thrust: ['KeyW'],
  brake: ['KeyS'],
  toggleDoors: ['KeyF'],
}

function pressKey(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code }))
}

function releaseKey(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keyup', { code }))
}

describe('InputManager', () => {
  let input: InputManager

  beforeEach(() => {
    input = new InputManager(TEST_BINDINGS)
  })

  afterEach(() => {
    input.dispose()
  })

  it('reports inactive actions when no keys pressed', () => {
    expect(input.isActionActive('thrust')).toBe(false)
    expect(input.isActionActive('brake')).toBe(false)
  })

  it('reports active action when key is held', () => {
    pressKey('KeyW')
    expect(input.isActionActive('thrust')).toBe(true)
  })

  it('reports inactive action after key released', () => {
    pressKey('KeyW')
    releaseKey('KeyW')
    expect(input.isActionActive('thrust')).toBe(false)
  })

  it('detects action pressed this frame via wasActionPressed', () => {
    pressKey('KeyF')
    input.tick(0) // process the frame

    expect(input.wasActionPressed('toggleDoors')).toBe(true)
  })

  it('wasActionPressed returns false on subsequent frames', () => {
    pressKey('KeyF')
    input.tick(0) // frame 1: pressed
    input.tick(0) // frame 2: still held, but not "just pressed"

    expect(input.wasActionPressed('toggleDoors')).toBe(false)
  })

  it('wasActionPressed resets after release and re-press', () => {
    pressKey('KeyF')
    input.tick(0)
    releaseKey('KeyF')
    input.tick(0)

    pressKey('KeyF')
    input.tick(0)

    expect(input.wasActionPressed('toggleDoors')).toBe(true)
  })

  it('returns false for unknown actions', () => {
    expect(input.isActionActive('nonexistent')).toBe(false)
    expect(input.wasActionPressed('nonexistent')).toBe(false)
  })

  it('does not respond to keys after dispose', () => {
    input.dispose()
    pressKey('KeyW')
    expect(input.isActionActive('thrust')).toBe(false)
  })

  it('supports rebinding via setBindings', () => {
    input.setBindings({ thrust: ['ArrowUp'] })

    pressKey('KeyW')
    expect(input.isActionActive('thrust')).toBe(false)

    pressKey('ArrowUp')
    expect(input.isActionActive('thrust')).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/__tests__/InputManager.spec.ts`
Expected: FAIL — `InputManager` module not found

- [ ] **Step 3: Implement InputManager**

```ts
// src/lib/InputManager.ts
import type { Tickable } from './Tickable'

export class InputManager implements Tickable {
  private heldKeys = new Set<string>()
  private justPressed = new Set<string>()
  private previousKeys = new Set<string>()
  private bindings: Record<string, string[]>
  private disposed = false

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    this.heldKeys.add(e.code)
  }

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.heldKeys.delete(e.code)
  }

  constructor(bindings: Record<string, string[]>) {
    this.bindings = { ...bindings }
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
  }

  setBindings(bindings: Record<string, string[]>): void {
    this.bindings = { ...bindings }
  }

  isActionActive(action: string): boolean {
    if (this.disposed) return false
    const keys = this.bindings[action]
    if (!keys) return false
    return keys.some((key) => this.heldKeys.has(key))
  }

  wasActionPressed(action: string): boolean {
    const keys = this.bindings[action]
    if (!keys) return false
    return keys.some((key) => this.justPressed.has(key))
  }

  tick(_dt: number): void {
    this.justPressed.clear()
    for (const key of this.heldKeys) {
      if (!this.previousKeys.has(key)) {
        this.justPressed.add(key)
      }
    }
    this.previousKeys = new Set(this.heldKeys)
  }

  dispose(): void {
    this.disposed = true
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.heldKeys.clear()
    this.justPressed.clear()
    this.previousKeys.clear()
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/__tests__/InputManager.spec.ts`
Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/InputManager.ts src/lib/__tests__/InputManager.spec.ts
git commit -m "feat(lib): add InputManager with action bindings and edge detection"
```

---

### Task 4: Tick Priority Constants

**Files:**
- Create: `src/lib/tickPriorities.ts`

Named constants for tick ordering, used by all controllers.

- [ ] **Step 1: Create tick priorities**

```ts
// src/lib/tickPriorities.ts
export const TICK_PRIORITY_INPUT = 0
export const TICK_PRIORITY_PHYSICS = 10
export const TICK_PRIORITY_ANIMATION = 20
export const TICK_PRIORITY_RENDER = 30
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/tickPriorities.ts
git commit -m "feat(lib): add tick priority constants"
```

---

### Task 5: SceneManager

**Files:**
- Create: `src/three/SceneManager.ts`

Three.js orchestrator. Implements `Tickable`. Creates renderer, camera, controls.

- [ ] **Step 1: Implement SceneManager**

```ts
// src/three/SceneManager.ts
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { Tickable } from '@/lib/Tickable'

const CAMERA_FOV = 60
const CAMERA_NEAR = 0.1
const CAMERA_FAR = 2000
const CAMERA_INITIAL_OFFSET = new THREE.Vector3(0, 15, 20)
const CHASE_CAM_OFFSET = new THREE.Vector3(0, 10, -15)
const CHASE_CAM_LERP_SPEED = 5

export class SceneManager implements Tickable {
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  readonly renderer: THREE.WebGLRenderer
  readonly controls: OrbitControls

  private container: HTMLElement | null = null
  private chaseMode = false
  private shuttleRef: THREE.Object3D | null = null

  constructor() {
    this.scene = new THREE.Scene()

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, CAMERA_NEAR, CAMERA_FAR)
    this.camera.position.copy(CAMERA_INITIAL_OFFSET)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setClearColor(0x000000)
    this.renderer.setPixelRatio(window.devicePixelRatio)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true

    window.addEventListener('resize', this.onResize)
  }

  mount(container: HTMLElement): void {
    this.container = container
    const { clientWidth, clientHeight } = container
    this.renderer.setSize(clientWidth, clientHeight)
    this.camera.aspect = clientWidth / clientHeight
    this.camera.updateProjectionMatrix()
    container.appendChild(this.renderer.domElement)
  }

  setShuttleRef(object: THREE.Object3D): void {
    this.shuttleRef = object
  }

  toggleCamera(): void {
    this.chaseMode = !this.chaseMode
    this.controls.enabled = !this.chaseMode
  }

  addToScene(object: THREE.Object3D): void {
    this.scene.add(object)
  }

  removeFromScene(object: THREE.Object3D): void {
    this.scene.remove(object)
  }

  tick(dt: number): void {
    if (this.shuttleRef) {
      const shuttlePos = this.shuttleRef.position

      if (this.chaseMode) {
        const offset = CHASE_CAM_OFFSET.clone().applyQuaternion(this.shuttleRef.quaternion)
        const targetPos = shuttlePos.clone().add(offset)
        this.camera.position.lerp(targetPos, CHASE_CAM_LERP_SPEED * dt)
        this.camera.lookAt(shuttlePos)
      } else {
        this.controls.target.copy(shuttlePos)
        this.controls.update()
      }
    } else {
      this.controls.update()
    }

    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize)
    this.controls.dispose()
    this.renderer.dispose()
    if (this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }

  private onResize = (): void => {
    if (!this.container) return
    const { clientWidth, clientHeight } = this.container
    this.renderer.setSize(clientWidth, clientHeight)
    this.camera.aspect = clientWidth / clientHeight
    this.camera.updateProjectionMatrix()
  }
}
```

- [ ] **Step 2: Delete the placeholder .gitkeep**

```bash
rm src/three/.gitkeep
```

- [ ] **Step 3: Verify it compiles**

Run: `bun run type-check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/three/SceneManager.ts
git rm src/three/.gitkeep
git commit -m "feat(three): add SceneManager with orbit/chase camera modes"
```

---

### Task 6: StarFieldController

**Files:**
- Create: `src/three/StarFieldController.ts`

Static particle field — no tick needed.

- [ ] **Step 1: Implement StarFieldController**

```ts
// src/three/StarFieldController.ts
import * as THREE from 'three'

const STAR_COUNT = 2000
const STAR_SPHERE_RADIUS = 500
const STAR_SIZE = 1.5

export class StarFieldController {
  readonly points: THREE.Points

  constructor() {
    const positions = new Float32Array(STAR_COUNT * 3)

    for (let i = 0; i < STAR_COUNT; i++) {
      const i3 = i * 3
      // Random point on sphere surface using spherical coordinates
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = STAR_SPHERE_RADIUS * (0.8 + Math.random() * 0.2)

      positions[i3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      positions[i3 + 2] = r * Math.cos(phi)
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: STAR_SIZE,
      sizeAttenuation: true,
      depthWrite: false,
    })

    this.points = new THREE.Points(geometry, material)
  }

  dispose(): void {
    this.points.geometry.dispose()
    ;(this.points.material as THREE.PointsMaterial).dispose()
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `bun run type-check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/three/StarFieldController.ts
git commit -m "feat(three): add StarFieldController with random particle sphere"
```

---

### Task 7: ShuttleController — Model Loading and Door Animation

**Files:**
- Create: `src/three/ShuttleController.ts`

Load the shuttle GLB, set up AnimationMixer, implement door toggle. Movement comes in the next task.

- [ ] **Step 1: Implement ShuttleController (loading + doors)**

```ts
// src/three/ShuttleController.ts
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import type { Tickable } from '@/lib/Tickable'
import type { InputManager } from '@/lib/InputManager'

const SHUTTLE_MODEL_PATH = '/models/shuttle.glb'
const DRACO_DECODER_PATH = '/node_modules/three/examples/jsm/libs/draco/'

const SHUTTLE_ANIMATION_NAME = 'shutAction'

const THRUST_FORCE = 8
const BRAKE_FACTOR = 0.95
const STRAFE_FORCE = 6
const YAW_SPEED = 2
const MAX_SPEED = 30

export class ShuttleController implements Tickable {
  readonly group = new THREE.Group()

  private mixer: THREE.AnimationMixer | null = null
  private doorAction: THREE.AnimationAction | null = null
  private doorsOpen = false
  private velocity = new THREE.Vector3()
  private readonly inputManager: InputManager

  constructor(inputManager: InputManager) {
    this.inputManager = inputManager
  }

  async load(): Promise<void> {
    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath(DRACO_DECODER_PATH)

    const gltfLoader = new GLTFLoader()
    gltfLoader.setDRACOLoader(dracoLoader)

    const gltf = await gltfLoader.loadAsync(SHUTTLE_MODEL_PATH)
    this.group.add(gltf.scene)

    this.mixer = new THREE.AnimationMixer(gltf.scene)

    const doorClip = gltf.animations.find((clip) => clip.name === SHUTTLE_ANIMATION_NAME)
    if (doorClip) {
      this.doorAction = this.mixer.clipAction(doorClip)
      this.doorAction.clampWhenFinished = true
      this.doorAction.loop = THREE.LoopOnce
    }

    this.placeNozzles(gltf.scene)

    dracoLoader.dispose()
  }

  toggleDoors(): void {
    if (!this.doorAction) return

    if (this.doorsOpen) {
      this.doorAction.timeScale = -1
      this.doorAction.paused = false
      if (this.doorAction.time === 0) {
        this.doorAction.time = this.doorAction.getClip().duration
      }
      this.doorAction.play()
    } else {
      this.doorAction.timeScale = 1
      this.doorAction.paused = false
      this.doorAction.reset()
      this.doorAction.play()
    }

    this.doorsOpen = !this.doorsOpen
  }

  get position(): THREE.Vector3 {
    return this.group.position
  }

  get isThrusting(): boolean {
    return this.inputManager.isActionActive('thrust')
  }

  get isBraking(): boolean {
    return this.inputManager.isActionActive('brake')
  }

  tick(dt: number): void {
    this.updateMovement(dt)
    this.mixer?.update(dt)
  }

  dispose(): void {
    this.mixer?.stopAllAction()
    this.group.traverse((child) => {
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

  private updateMovement(dt: number): void {
    const input = this.inputManager
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion)
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.group.quaternion)

    // Yaw
    if (input.isActionActive('yawLeft')) {
      this.group.rotateY(YAW_SPEED * dt)
    }
    if (input.isActionActive('yawRight')) {
      this.group.rotateY(-YAW_SPEED * dt)
    }

    // Thrust
    if (input.isActionActive('thrust')) {
      this.velocity.addScaledVector(forward, THRUST_FORCE * dt)
    }

    // Brake (inertia dampener)
    if (input.isActionActive('brake')) {
      this.velocity.multiplyScalar(BRAKE_FACTOR)
    }

    // Strafe
    if (input.isActionActive('strafeLeft')) {
      this.velocity.addScaledVector(right, -STRAFE_FORCE * dt)
    }
    if (input.isActionActive('strafeRight')) {
      this.velocity.addScaledVector(right, STRAFE_FORCE * dt)
    }

    // Clamp speed
    if (this.velocity.length() > MAX_SPEED) {
      this.velocity.setLength(MAX_SPEED)
    }

    // Apply velocity
    this.group.position.addScaledVector(this.velocity, dt)
  }

  private placeNozzles(scene: THREE.Object3D): void {
    // Find nozzle nodes added by the merge
    const engNode = this.findNode(scene, 'eng')
    const rcsNode = this.findNode(scene, 'rcs')

    // Find OMS pod reference nodes for positioning
    const omsBackNodes: THREE.Object3D[] = []
    scene.traverse((child) => {
      if (child.name.includes('OMS') && child.name.toLowerCase().includes('back')) {
        omsBackNodes.push(child)
      }
    })

    // If we found OMS reference points, position nozzles relative to them
    if (omsBackNodes.length > 0 && engNode) {
      const targetPos = new THREE.Vector3()
      omsBackNodes[0]!.getWorldPosition(targetPos)
      engNode.position.copy(targetPos)
    }

    if (omsBackNodes.length > 1 && rcsNode) {
      const targetPos = new THREE.Vector3()
      omsBackNodes[1]!.getWorldPosition(targetPos)
      rcsNode.position.copy(targetPos)
    }

    // Note: exact offsets will need visual tuning — these are starting positions.
    // The pipeline doc says to iterate on offset constants until alignment looks right.
  }

  private findNode(root: THREE.Object3D, name: string): THREE.Object3D | null {
    let found: THREE.Object3D | null = null
    root.traverse((child) => {
      if (child.name === name && !found) {
        found = child
      }
    })
    return found
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `bun run type-check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/three/ShuttleController.ts
git commit -m "feat(three): add ShuttleController with model loading, door animation, and movement"
```

---

### Task 8: ThrusterEffectController

**Files:**
- Create: `src/three/ThrusterEffectController.ts`

Particle effects for thrust (orange) and brake (blue).

- [ ] **Step 1: Implement ThrusterEffectController**

```ts
// src/three/ThrusterEffectController.ts
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { ShuttleController } from './ShuttleController'

const PARTICLE_COUNT = 200
const THRUST_SPAWN_RATE = 80 // particles per second
const BRAKE_SPAWN_RATE = 60
const PARTICLE_LIFETIME = 0.5 // seconds
const THRUST_SPREAD = 0.5
const BRAKE_SPREAD = 1.5
const PARTICLE_SIZE = 0.3
const THRUST_COLOR = new THREE.Color(0xff8800)
const BRAKE_COLOR = new THREE.Color(0x4488ff)
const THRUST_OFFSET = new THREE.Vector3(0, 0, -2) // behind shuttle
const BRAKE_OFFSET = new THREE.Vector3(0, 0, 2) // in front of shuttle

interface Particle {
  alive: boolean
  age: number
  position: THREE.Vector3
  velocity: THREE.Vector3
}

export class ThrusterEffectController implements Tickable {
  readonly thrustPoints: THREE.Points
  readonly brakePoints: THREE.Points

  private thrustParticles: Particle[]
  private brakeParticles: Particle[]
  private thrustSpawnAccumulator = 0
  private brakeSpawnAccumulator = 0
  private readonly shuttle: ShuttleController

  constructor(shuttle: ShuttleController) {
    this.shuttle = shuttle

    this.thrustParticles = this.createParticlePool()
    this.brakeParticles = this.createParticlePool()

    this.thrustPoints = this.createPoints(THRUST_COLOR)
    this.brakePoints = this.createPoints(BRAKE_COLOR)
  }

  tick(dt: number): void {
    const isThrusting = this.shuttle.isThrusting
    const isBraking = this.shuttle.isBraking

    if (isThrusting) {
      this.thrustSpawnAccumulator += THRUST_SPAWN_RATE * dt
      while (this.thrustSpawnAccumulator >= 1) {
        this.spawnParticle(this.thrustParticles, THRUST_OFFSET, THRUST_SPREAD)
        this.thrustSpawnAccumulator -= 1
      }
    } else {
      this.thrustSpawnAccumulator = 0
    }

    if (isBraking) {
      this.brakeSpawnAccumulator += BRAKE_SPAWN_RATE * dt
      while (this.brakeSpawnAccumulator >= 1) {
        this.spawnParticle(this.brakeParticles, BRAKE_OFFSET, BRAKE_SPREAD)
        this.brakeSpawnAccumulator -= 1
      }
    } else {
      this.brakeSpawnAccumulator = 0
    }

    this.updateParticles(this.thrustParticles, this.thrustPoints, dt)
    this.updateParticles(this.brakeParticles, this.brakePoints, dt)
  }

  dispose(): void {
    this.thrustPoints.geometry.dispose()
    ;(this.thrustPoints.material as THREE.PointsMaterial).dispose()
    this.brakePoints.geometry.dispose()
    ;(this.brakePoints.material as THREE.PointsMaterial).dispose()
  }

  private createParticlePool(): Particle[] {
    return Array.from({ length: PARTICLE_COUNT }, () => ({
      alive: false,
      age: 0,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
    }))
  }

  private createPoints(color: THREE.Color): THREE.Points {
    const positions = new Float32Array(PARTICLE_COUNT * 3)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const material = new THREE.PointsMaterial({
      color,
      size: PARTICLE_SIZE,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.8,
    })

    return new THREE.Points(geometry, material)
  }

  private spawnParticle(pool: Particle[], offset: THREE.Vector3, spread: number): void {
    const particle = pool.find((p) => !p.alive)
    if (!particle) return

    particle.alive = true
    particle.age = 0

    const worldOffset = offset.clone().applyQuaternion(this.shuttle.group.quaternion)
    particle.position.copy(this.shuttle.position).add(worldOffset)

    particle.velocity.set(
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread,
    )

    // Add shuttle-relative push direction
    const pushDir = offset.clone().normalize().multiplyScalar(-3)
    pushDir.applyQuaternion(this.shuttle.group.quaternion)
    particle.velocity.add(pushDir)
  }

  private updateParticles(pool: Particle[], points: THREE.Points, dt: number): void {
    const posAttr = points.geometry.getAttribute('position') as THREE.BufferAttribute
    const positions = posAttr.array as Float32Array

    for (let i = 0; i < pool.length; i++) {
      const p = pool[i]!
      if (!p.alive) {
        positions[i * 3] = 0
        positions[i * 3 + 1] = 0
        positions[i * 3 + 2] = 0
        continue
      }

      p.age += dt
      if (p.age >= PARTICLE_LIFETIME) {
        p.alive = false
        positions[i * 3] = 0
        positions[i * 3 + 1] = 0
        positions[i * 3 + 2] = 0
        continue
      }

      p.position.addScaledVector(p.velocity, dt)
      positions[i * 3] = p.position.x
      positions[i * 3 + 1] = p.position.y
      positions[i * 3 + 2] = p.position.z
    }

    posAttr.needsUpdate = true

    // Fade opacity based on active particle count
    const aliveCount = pool.filter((p) => p.alive).length
    ;(points.material as THREE.PointsMaterial).opacity = aliveCount > 0 ? 0.8 : 0
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `bun run type-check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/three/ThrusterEffectController.ts
git commit -m "feat(three): add ThrusterEffectController with orange thrust and blue brake particles"
```

---

### Task 9: Default Input Bindings

**Files:**
- Create: `src/lib/defaultBindings.ts`

Data-driven keybind config used by the home scene.

- [ ] **Step 1: Create default bindings**

```ts
// src/lib/defaultBindings.ts
export const DEFAULT_BINDINGS: Record<string, string[]> = {
  thrust: ['KeyW'],
  brake: ['KeyS'],
  strafeLeft: ['KeyA'],
  strafeRight: ['KeyD'],
  yawLeft: ['KeyQ'],
  yawRight: ['KeyE'],
  toggleDoors: ['KeyF'],
  toggleCamera: ['KeyC'],
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/defaultBindings.ts
git commit -m "feat(lib): add default keybind configuration"
```

---

### Task 10: HomeView and HomeViewController

**Files:**
- Create: `src/views/HomeView.vue`
- Create: `src/views/HomeViewController.ts`
- Modify: `src/router/index.ts`
- Modify: `src/App.vue`

Wire everything together — Vue route mounts the game.

- [ ] **Step 1: Create HomeViewController**

```ts
// src/views/HomeViewController.ts
import { GameLoop } from '@/lib/GameLoop'
import { TickHandler } from '@/lib/TickHandler'
import { InputManager } from '@/lib/InputManager'
import { DEFAULT_BINDINGS } from '@/lib/defaultBindings'
import {
  TICK_PRIORITY_INPUT,
  TICK_PRIORITY_PHYSICS,
  TICK_PRIORITY_ANIMATION,
  TICK_PRIORITY_RENDER,
} from '@/lib/tickPriorities'
import { SceneManager } from '@/three/SceneManager'
import { ShuttleController } from '@/three/ShuttleController'
import { ThrusterEffectController } from '@/three/ThrusterEffectController'
import { StarFieldController } from '@/three/StarFieldController'

export class HomeViewController {
  private gameLoop: GameLoop | null = null
  private tickHandler: TickHandler | null = null
  private inputManager: InputManager | null = null
  private sceneManager: SceneManager | null = null
  private shuttleController: ShuttleController | null = null
  private thrusterController: ThrusterEffectController | null = null
  private starFieldController: StarFieldController | null = null

  async init(container: HTMLElement): Promise<void> {
    // Core systems
    this.inputManager = new InputManager(DEFAULT_BINDINGS)
    this.tickHandler = new TickHandler()
    this.tickHandler.register(this.inputManager, TICK_PRIORITY_INPUT)

    // Scene
    this.sceneManager = new SceneManager()
    this.sceneManager.mount(container)
    this.tickHandler.register(this.sceneManager, TICK_PRIORITY_RENDER)

    // Stars
    this.starFieldController = new StarFieldController()
    this.sceneManager.addToScene(this.starFieldController.points)

    // Ambient light so the shuttle is visible
    const ambientLight = new (await import('three')).AmbientLight(0xffffff, 1)
    const dirLight = new (await import('three')).DirectionalLight(0xffffff, 2)
    dirLight.position.set(5, 10, 5)
    this.sceneManager.addToScene(ambientLight)
    this.sceneManager.addToScene(dirLight)

    // Shuttle
    this.shuttleController = new ShuttleController(this.inputManager)
    await this.shuttleController.load()
    this.sceneManager.addToScene(this.shuttleController.group)
    this.sceneManager.setShuttleRef(this.shuttleController.group)
    this.tickHandler.register(this.shuttleController, TICK_PRIORITY_PHYSICS)

    // Thruster effects
    this.thrusterController = new ThrusterEffectController(this.shuttleController)
    this.sceneManager.addToScene(this.thrusterController.thrustPoints)
    this.sceneManager.addToScene(this.thrusterController.brakePoints)
    this.tickHandler.register(this.thrusterController, TICK_PRIORITY_ANIMATION)

    // Start the loop
    this.gameLoop = new GameLoop(this.tickHandler)
    this.gameLoop.start()
  }

  tick(): void {
    // Handle one-shot actions that bridge input → controllers
    if (this.inputManager?.wasActionPressed('toggleDoors')) {
      this.shuttleController?.toggleDoors()
    }
    if (this.inputManager?.wasActionPressed('toggleCamera')) {
      this.sceneManager?.toggleCamera()
    }
  }

  dispose(): void {
    this.gameLoop?.stop()
    this.thrusterController?.dispose()
    this.shuttleController?.dispose()
    this.starFieldController?.dispose()
    this.sceneManager?.dispose()
    this.inputManager?.dispose()
  }
}
```

**Wait** — the `tick()` method for one-shot actions needs to be registered with the tick handler too. Let's make `HomeViewController` implement `Tickable`:

Update the class to add this at the end of `init()`, before starting the game loop:

```ts
// Add after thruster registration, before gameLoop creation:
this.tickHandler.register(this, TICK_PRIORITY_INPUT + 1)
```

And add `implements Tickable` to the class, with this import:

```ts
import type { Tickable } from '@/lib/Tickable'
```

The full `init` ending becomes:

```ts
    // One-shot action bridge (runs just after input)
    this.tickHandler.register(this, TICK_PRIORITY_INPUT + 1)

    // Start the loop
    this.gameLoop = new GameLoop(this.tickHandler)
    this.gameLoop.start()
```

Here is the **complete final file**:

```ts
// src/views/HomeViewController.ts
import type { Tickable } from '@/lib/Tickable'
import { GameLoop } from '@/lib/GameLoop'
import { TickHandler } from '@/lib/TickHandler'
import { InputManager } from '@/lib/InputManager'
import { DEFAULT_BINDINGS } from '@/lib/defaultBindings'
import {
  TICK_PRIORITY_INPUT,
  TICK_PRIORITY_PHYSICS,
  TICK_PRIORITY_ANIMATION,
  TICK_PRIORITY_RENDER,
} from '@/lib/tickPriorities'
import { SceneManager } from '@/three/SceneManager'
import { ShuttleController } from '@/three/ShuttleController'
import { ThrusterEffectController } from '@/three/ThrusterEffectController'
import { StarFieldController } from '@/three/StarFieldController'
import { AmbientLight, DirectionalLight } from 'three'

const ONE_SHOT_PRIORITY = TICK_PRIORITY_INPUT + 1

export class HomeViewController implements Tickable {
  private gameLoop: GameLoop | null = null
  private tickHandler: TickHandler | null = null
  private inputManager: InputManager | null = null
  private sceneManager: SceneManager | null = null
  private shuttleController: ShuttleController | null = null
  private thrusterController: ThrusterEffectController | null = null
  private starFieldController: StarFieldController | null = null

  async init(container: HTMLElement): Promise<void> {
    // Core systems
    this.inputManager = new InputManager(DEFAULT_BINDINGS)
    this.tickHandler = new TickHandler()
    this.tickHandler.register(this.inputManager, TICK_PRIORITY_INPUT)

    // Scene
    this.sceneManager = new SceneManager()
    this.sceneManager.mount(container)
    this.tickHandler.register(this.sceneManager, TICK_PRIORITY_RENDER)

    // Stars
    this.starFieldController = new StarFieldController()
    this.sceneManager.addToScene(this.starFieldController.points)

    // Lighting
    const ambientLight = new AmbientLight(0xffffff, 1)
    const dirLight = new DirectionalLight(0xffffff, 2)
    dirLight.position.set(5, 10, 5)
    this.sceneManager.addToScene(ambientLight)
    this.sceneManager.addToScene(dirLight)

    // Shuttle
    this.shuttleController = new ShuttleController(this.inputManager)
    await this.shuttleController.load()
    this.sceneManager.addToScene(this.shuttleController.group)
    this.sceneManager.setShuttleRef(this.shuttleController.group)
    this.tickHandler.register(this.shuttleController, TICK_PRIORITY_PHYSICS)

    // Thruster effects
    this.thrusterController = new ThrusterEffectController(this.shuttleController)
    this.sceneManager.addToScene(this.thrusterController.thrustPoints)
    this.sceneManager.addToScene(this.thrusterController.brakePoints)
    this.tickHandler.register(this.thrusterController, TICK_PRIORITY_ANIMATION)

    // One-shot action bridge (runs just after input)
    this.tickHandler.register(this, ONE_SHOT_PRIORITY)

    // Start the loop
    this.gameLoop = new GameLoop(this.tickHandler)
    this.gameLoop.start()
  }

  tick(_dt: number): void {
    if (this.inputManager?.wasActionPressed('toggleDoors')) {
      this.shuttleController?.toggleDoors()
    }
    if (this.inputManager?.wasActionPressed('toggleCamera')) {
      this.sceneManager?.toggleCamera()
    }
  }

  dispose(): void {
    this.gameLoop?.stop()
    this.thrusterController?.dispose()
    this.shuttleController?.dispose()
    this.starFieldController?.dispose()
    this.sceneManager?.dispose()
    this.inputManager?.dispose()
  }
}
```

- [ ] **Step 2: Create HomeView.vue**

```vue
<!-- src/views/HomeView.vue -->
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { HomeViewController } from './HomeViewController'

const container = ref<HTMLElement>()
const viewController = new HomeViewController()

onMounted(async () => {
  if (container.value) {
    await viewController.init(container.value)
  }
})

onUnmounted(() => {
  viewController.dispose()
})
</script>

<template>
  <div ref="container" class="scene-container"></div>
</template>
```

- [ ] **Step 3: Add the scene-container class to main.css**

Add to `src/assets/css/main.css`:

```css
.scene-container {
  @apply(w-screen h-screen overflow-hidden);
}
```

- [ ] **Step 4: Update the router**

Replace `src/router/index.ts`:

```ts
import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
  ],
})

export default router
```

- [ ] **Step 5: Update App.vue to use router-view**

Replace `src/App.vue`:

```vue
<script setup lang="ts"></script>

<template>
  <RouterView />
</template>
```

- [ ] **Step 6: Delete views and components .gitkeep files**

```bash
rm src/views/.gitkeep src/components/.gitkeep
```

- [ ] **Step 7: Verify it compiles**

Run: `bun run type-check`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src/views/HomeView.vue src/views/HomeViewController.ts src/router/index.ts src/App.vue src/assets/css/main.css
git rm src/views/.gitkeep src/components/.gitkeep
git commit -m "feat(views): add HomeView with game loop wiring and router setup"
```

---

### Task 11: Manual Smoke Test

No automated tests for Three.js rendering — verify visually.

- [ ] **Step 1: Start dev server**

Run: `bun dev`

- [ ] **Step 2: Verify in browser**

Open `http://localhost:5173`. Check:

1. **Stars visible** — white dots scattered in a sphere around the scene
2. **Shuttle loads** — 3D shuttle model appears at origin
3. **Orbit controls** — click-drag rotates camera, scroll zooms
4. **WASD movement** — W thrusts forward, S brakes, A/D strafe, Q/E yaw
5. **F key** — toggles door animation open/close
6. **C key** — toggles between orbit controls and chase cam
7. **Thrust particles** — orange particles trail from engines when W held
8. **Brake particles** — blue particles appear when S held
9. **No console errors**

- [ ] **Step 3: Tune nozzle placement if needed**

If `eng`/`rcs` nodes are visually misaligned, adjust the offset constants in `ShuttleController.placeNozzles()`. This is expected to require iteration — the pipeline doc warns about this.

- [ ] **Step 4: Tune thruster particle spawn points if needed**

Adjust `THRUST_OFFSET` and `BRAKE_OFFSET` in `ThrusterEffectController.ts` so particles emit from sensible positions relative to the shuttle mesh.

- [ ] **Step 5: Commit any tuning changes**

```bash
git add -u
git commit -m "fix(three): tune nozzle placement and thruster particle offsets"
```

---

### Task 12: Lint and Final Verification

- [ ] **Step 1: Run linter**

Run: `bun run lint:oxlint && bun run lint:eslint`
Fix any issues reported.

- [ ] **Step 2: Run type-check**

Run: `bun run type-check`
Expected: No errors

- [ ] **Step 3: Run all tests**

Run: `bun test:unit`
Expected: All tests pass (TickHandler, GameLoop, InputManager, plus existing portal tests)

- [ ] **Step 4: Commit any lint fixes**

```bash
git add -u
git commit -m "chore: fix lint issues"
```
