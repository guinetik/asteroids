# Multi-Tool Mode Switching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mode switching (drill/weapon/heal) with per-mode trigger patterns, ADS zoom, gun tinting, per-mode crosshairs, and action bar HUD.

**Architecture:** Pure-TS `MultiToolState` owns mode, aiming, and trigger logic (Tickable). `MultiToolController` reads state for visual tinting. `FpsCamera` reads state for ADS FOV zoom. `FpsHud` displays action bar and per-mode crosshair. `FpsViewController` wires mouse events and keybinds to state.

**Tech Stack:** TypeScript, Three.js, Vue 3, Vitest

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/data/fps/multitool-config.json` | Mode labels, colors, trigger types, fire rate, ADS config |
| `src/lib/fps/multiToolState.ts` | Mode, ADS, trigger patterns, isFiring — pure TS, Tickable |
| `src/lib/fps/__tests__/multiToolState.spec.ts` | Tests for mode switching, trigger types, ADS gating |
| `src/lib/defaultBindings.ts` | Add tool keybinds to FPS_BINDINGS |
| `src/three/MultiToolController.ts` | Add setMode() for mesh emissive tinting |
| `src/three/FpsCamera.ts` | Add setAiming() for FOV lerp |
| `src/components/FpsHud.vue` | Action bar + per-mode crosshair + new telemetry fields |
| `src/views/FpsViewController.ts` | Mouse events, wire MultiToolState, sync all systems |

---

### Task 1: Data config + input bindings

**Files:**
- Create: `src/data/fps/multitool-config.json`
- Modify: `src/lib/defaultBindings.ts`

- [ ] **Step 1: Create the data config**

Create `src/data/fps/multitool-config.json`:

```json
{
  "modes": {
    "drill": { "label": "DRL", "color": "#3b82f6", "trigger": "hold" },
    "weapon": { "label": "LAS", "color": "#ef4444", "trigger": "auto", "fireRate": 5 },
    "heal": { "label": "MED", "color": "#22c55e", "trigger": "click" }
  },
  "ads": {
    "fovMultiplier": 0.85,
    "zoomSpeed": 8
  }
}
```

- [ ] **Step 2: Add tool keybinds to FPS_BINDINGS**

In `src/lib/defaultBindings.ts`, add three entries to the existing `FPS_BINDINGS` object:

```ts
/** FPS on-foot key bindings */
export const FPS_BINDINGS: Record<string, string[]> = {
  moveForward: ['KeyW'],
  moveBack: ['KeyS'],
  moveLeft: ['KeyA'],
  moveRight: ['KeyD'],
  jump: ['Space'],
  sprint: ['ShiftLeft'],
  toolDrill: ['Digit1'],
  toolWeapon: ['Digit2'],
  toolHeal: ['Digit3'],
}
```

- [ ] **Step 3: Type-check**

Run: `bun run type-check`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add src/data/fps/multitool-config.json src/lib/defaultBindings.ts
git commit -m "feat(multitool): add config JSON and tool keybinds"
```

---

### Task 2: MultiToolState

**Files:**
- Create: `src/lib/fps/multiToolState.ts`
- Test: `src/lib/fps/__tests__/multiToolState.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/fps/__tests__/multiToolState.spec.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MultiToolState } from '../multiToolState'
import type { MultiToolMode } from '../multiToolState'
import multiToolConfigJson from '@/data/fps/multitool-config.json'

function createState(): MultiToolState {
  return new MultiToolState(multiToolConfigJson)
}

describe('MultiToolState', () => {
  let state: MultiToolState

  beforeEach(() => {
    state = createState()
  })

  it('defaults to drill mode', () => {
    expect(state.mode).toBe('drill')
  })

  it('switches mode via setMode', () => {
    state.setMode('weapon')
    expect(state.mode).toBe('weapon')
  })

  it('defaults to not aiming', () => {
    expect(state.aiming).toBe(false)
  })

  it('sets aiming state', () => {
    state.setAiming(true)
    expect(state.aiming).toBe(true)
  })

  it('isFiring is false by default', () => {
    expect(state.isFiring).toBe(false)
  })

  // --- Trigger: hold (drill) ---

  it('hold trigger: fires every frame while mouse held + aiming', () => {
    state.setMode('drill')
    state.setAiming(true)
    state.setInput(true, true)
    state.tick(0.016)
    expect(state.isFiring).toBe(true)
  })

  it('hold trigger: keeps firing while mouse held', () => {
    state.setMode('drill')
    state.setAiming(true)
    state.setInput(true, true)
    state.tick(0.016)
    expect(state.isFiring).toBe(true)
    state.setInput(true, false) // held, not just pressed
    state.tick(0.016)
    expect(state.isFiring).toBe(true)
  })

  it('hold trigger: does not fire without aiming', () => {
    state.setMode('drill')
    state.setAiming(false)
    state.setInput(true, true)
    state.tick(0.016)
    expect(state.isFiring).toBe(false)
  })

  it('hold trigger: stops firing when mouse released', () => {
    state.setMode('drill')
    state.setAiming(true)
    state.setInput(true, true)
    state.tick(0.016)
    expect(state.isFiring).toBe(true)
    state.setInput(false, false)
    state.tick(0.016)
    expect(state.isFiring).toBe(false)
  })

  // --- Trigger: auto (weapon) ---

  it('auto trigger: fires at fixed rate while held + aiming', () => {
    state.setMode('weapon')
    state.setAiming(true)
    // fireRate = 5, so 1 shot every 0.2s
    state.setInput(true, true)
    state.tick(0.016) // first frame always fires
    expect(state.isFiring).toBe(true)
    // Tick small amounts — should not fire until 0.2s
    state.setInput(true, false)
    state.tick(0.1)
    expect(state.isFiring).toBe(false)
    state.setInput(true, false)
    state.tick(0.11) // total 0.21s > 0.2s interval
    expect(state.isFiring).toBe(true)
  })

  it('auto trigger: resets timer when mouse released', () => {
    state.setMode('weapon')
    state.setAiming(true)
    state.setInput(true, true)
    state.tick(0.1)
    state.setInput(false, false)
    state.tick(0.016)
    expect(state.isFiring).toBe(false)
    // Next press should fire immediately
    state.setInput(true, true)
    state.tick(0.016)
    expect(state.isFiring).toBe(true)
  })

  // --- Trigger: click (heal) ---

  it('click trigger: fires once on mouse down', () => {
    state.setMode('heal')
    state.setAiming(true)
    state.setInput(true, true)
    state.tick(0.016)
    expect(state.isFiring).toBe(true)
  })

  it('click trigger: does not fire while held (must release)', () => {
    state.setMode('heal')
    state.setAiming(true)
    state.setInput(true, true)
    state.tick(0.016)
    expect(state.isFiring).toBe(true)
    state.setInput(true, false) // still held, not just pressed
    state.tick(0.016)
    expect(state.isFiring).toBe(false)
  })

  it('click trigger: fires again after release + re-press', () => {
    state.setMode('heal')
    state.setAiming(true)
    state.setInput(true, true)
    state.tick(0.016)
    state.setInput(false, false) // release
    state.tick(0.016)
    state.setInput(true, true) // re-press
    state.tick(0.016)
    expect(state.isFiring).toBe(true)
  })

  // --- isFiring resets each tick ---

  it('isFiring resets to false at start of tick', () => {
    state.setMode('drill')
    state.setAiming(true)
    state.setInput(true, true)
    state.tick(0.016)
    expect(state.isFiring).toBe(true)
    state.setInput(false, false)
    state.tick(0.016)
    expect(state.isFiring).toBe(false)
  })

  // --- Console log on fire ---

  it('logs to console when firing', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    state.setMode('weapon')
    state.setAiming(true)
    state.setInput(true, true)
    state.tick(0.016)
    expect(spy).toHaveBeenCalledWith('[MultiTool] fire: weapon')
    spy.mockRestore()
  })

  // --- Config access ---

  it('exposes mode config for current mode', () => {
    state.setMode('weapon')
    const cfg = state.modeConfig
    expect(cfg.label).toBe('LAS')
    expect(cfg.color).toBe('#ef4444')
    expect(cfg.trigger).toBe('auto')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/fps/__tests__/multiToolState.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement MultiToolState**

Create `src/lib/fps/multiToolState.ts`:

```ts
/**
 * Multi-tool mode, aiming, and trigger state.
 *
 * Pure TS — no Three.js dependency. Owns mode selection, ADS state,
 * and per-mode trigger pattern interpretation. Future home of power
 * system and targeting.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-multitool-switching-design.md
 */
import type { Tickable } from '@/lib/Tickable'

/** Available multi-tool modes. */
export type MultiToolMode = 'drill' | 'weapon' | 'heal'

/** Trigger pattern — how mouse input maps to firing. */
export type TriggerType = 'hold' | 'auto' | 'click'

/** Per-mode configuration from JSON. */
export interface ModeConfig {
  /** HUD label (e.g. "DRL"). */
  label: string
  /** Mode color hex string. */
  color: string
  /** Trigger pattern type. */
  trigger: TriggerType
  /** Shots per second for auto trigger. */
  fireRate?: number
}

/** Shape of multitool-config.json. */
export interface MultiToolConfig {
  /** Per-mode configuration. */
  modes: Record<MultiToolMode, ModeConfig>
  /** ADS (aim down sights) configuration. */
  ads: {
    /** FOV multiplier when aiming (e.g. 0.85 = 85% of base FOV). */
    fovMultiplier: number
    /** How fast FOV lerps to target (per second). */
    zoomSpeed: number
  }
}

/**
 * Multi-tool state machine — mode, aiming, and trigger patterns.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-multitool-switching-design.md
 */
export class MultiToolState implements Tickable {
  private _mode: MultiToolMode = 'drill'
  private _aiming = false
  private _isFiring = false
  private _mouseDown = false
  private _mouseJustPressed = false
  private autoTimer = 0
  private readonly config: MultiToolConfig

  constructor(config: MultiToolConfig) {
    this.config = config
  }

  /** Current active mode. */
  get mode(): MultiToolMode {
    return this._mode
  }

  /** Whether ADS is active. */
  get aiming(): boolean {
    return this._aiming
  }

  /** Whether a shot/action was triggered this frame. */
  get isFiring(): boolean {
    return this._isFiring
  }

  /** Config for the current mode. */
  get modeConfig(): ModeConfig {
    return this.config.modes[this._mode]
  }

  /** ADS configuration. */
  get adsConfig(): MultiToolConfig['ads'] {
    return this.config.ads
  }

  /** Switch active mode. */
  setMode(mode: MultiToolMode): void {
    this._mode = mode
    this.autoTimer = 0
  }

  /** Toggle ADS state. */
  setAiming(aiming: boolean): void {
    this._aiming = aiming
  }

  /**
   * Feed raw mouse state each frame.
   *
   * @param mouseDown - Whether left mouse button is currently held
   * @param mouseJustPressed - Whether left mouse was pressed this frame
   */
  setInput(mouseDown: boolean, mouseJustPressed: boolean): void {
    this._mouseDown = mouseDown
    this._mouseJustPressed = mouseJustPressed
  }

  tick(dt: number): void {
    this._isFiring = false

    if (!this._aiming) {
      this.autoTimer = 0
      return
    }

    const cfg = this.config.modes[this._mode]

    switch (cfg.trigger) {
      case 'hold':
        this._isFiring = this._mouseDown
        break

      case 'auto': {
        if (this._mouseDown) {
          if (this._mouseJustPressed) {
            // First press always fires
            this._isFiring = true
            this.autoTimer = 0
          } else {
            const interval = 1 / (cfg.fireRate ?? 1)
            this.autoTimer += dt
            if (this.autoTimer >= interval) {
              this._isFiring = true
              this.autoTimer -= interval
            }
          }
        } else {
          this.autoTimer = 0
        }
        break
      }

      case 'click':
        this._isFiring = this._mouseJustPressed
        break
    }

    if (this._isFiring) {
      console.log(`[MultiTool] fire: ${this._mode}`)
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/fps/__tests__/multiToolState.spec.ts`
Expected: ALL PASS

- [ ] **Step 5: Run full test suite**

Run: `bun test:unit`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/fps/multiToolState.ts src/lib/fps/__tests__/multiToolState.spec.ts
git commit -m "feat(multitool): MultiToolState with mode switching and trigger patterns"
```

---

### Task 3: MultiToolController tinting

**Files:**
- Modify: `src/three/MultiToolController.ts`

- [ ] **Step 1: Add setMode method**

Add a `setMode` method to `MultiToolController` that tints the model mesh via `material.emissive`. Add an import for `Color` from three (already imported as `* as THREE`).

Add after the `setState` method (around line 91):

```ts
/**
 * Tint the model mesh to reflect the active tool mode.
 *
 * @param color - Hex color string (e.g. "#3b82f6")
 */
setMode(color: string): void {
  if (!this.model) return
  const emissiveColor = new THREE.Color(color)
  this.model.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
      child.material.emissive.copy(emissiveColor)
      child.material.emissiveIntensity = 0.15
      child.material.needsUpdate = true
    }
  })
}
```

- [ ] **Step 2: Type-check**

Run: `bun run type-check`
Expected: Clean

- [ ] **Step 3: Commit**

```bash
git add src/three/MultiToolController.ts
git commit -m "feat(multitool): gun tinting via emissive color per mode"
```

---

### Task 4: FpsCamera ADS zoom

**Files:**
- Modify: `src/three/FpsCamera.ts`

- [ ] **Step 1: Add ADS fields and method**

Add private fields after the existing terrain fields (around line 64):

```ts
private _aiming = false
private currentFov: number
private baseFov: number
private targetFov: number
private adsZoomSpeed = 8
```

Update the constructor to initialize the FOV fields (after the camera creation line):

```ts
constructor(config: FpsCameraConfig) {
  this.config = config
  this.camera = new THREE.PerspectiveCamera(config.fov, 1, 0.01, 5000)
  this.baseFov = config.fov
  this.currentFov = config.fov
  this.targetFov = config.fov
}
```

Add the `setAiming` method after `setVelocity`:

```ts
/**
 * Toggle ADS (aim down sights) zoom.
 *
 * @param aiming - Whether player is aiming
 * @param fovMultiplier - FOV multiplier when aiming (e.g. 0.85)
 * @param zoomSpeed - Lerp speed for FOV transition
 */
setAiming(aiming: boolean, fovMultiplier = 0.85, zoomSpeed = 8): void {
  this._aiming = aiming
  this.targetFov = aiming ? this.baseFov * fovMultiplier : this.baseFov
  this.adsZoomSpeed = zoomSpeed
}
```

- [ ] **Step 2: Add FOV lerp to tick**

Add at the beginning of the `tick` method, after the `if (!this.target) return` guard:

```ts
// ADS FOV zoom
if (this.currentFov !== this.targetFov) {
  this.currentFov += (this.targetFov - this.currentFov) * Math.min(1, this.adsZoomSpeed * dt)
  if (Math.abs(this.currentFov - this.targetFov) < 0.01) {
    this.currentFov = this.targetFov
  }
  this.camera.fov = this.currentFov
  this.camera.updateProjectionMatrix()
}
```

- [ ] **Step 3: Type-check**

Run: `bun run type-check`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add src/three/FpsCamera.ts
git commit -m "feat(multitool): ADS FOV zoom with smooth lerp"
```

---

### Task 5: FpsHud — action bar + per-mode crosshair

**Files:**
- Modify: `src/components/FpsHud.vue`

- [ ] **Step 1: Update FpsTelemetry interface**

Add three new fields to the `FpsTelemetry` interface:

```ts
/** Active multi-tool mode */
activeMode: 'drill' | 'weapon' | 'heal'
/** Whether player is aiming (ADS) */
aiming: boolean
/** Whether tool fired this frame */
isFiring: boolean
```

- [ ] **Step 2: Add mode config constants**

Add after the O2 color constants:

```ts
const MODE_LABELS: Record<string, { key: string; label: string; color: string; icon: string }> = {
  drill: { key: '1', label: 'DRL', color: '#3b82f6', icon: '⊙' },
  weapon: { key: '2', label: 'LAS', color: '#ef4444', icon: '+' },
  heal: { key: '3', label: 'MED', color: '#22c55e', icon: '✚' },
}

function modeColor(): string {
  return MODE_LABELS[props.telemetry.activeMode]?.color ?? '#ffffff'
}
```

- [ ] **Step 3: Replace crosshair with per-mode version**

Replace the static crosshair div:

```html
<!-- Crosshair -->
<div class="absolute inset-0 flex items-center justify-center text-2xl text-white/40 select-none">+</div>
```

With per-mode crosshairs:

```html
<!-- Per-mode Crosshair -->
<div class="absolute inset-0 flex items-center justify-center select-none"
  :style="{ color: modeColor(), opacity: telemetry.aiming ? 1 : 0.4 }">
  <!-- Drill: circle + cross -->
  <svg v-if="telemetry.activeMode === 'drill'" width="32" height="32" viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="12" fill="none" :stroke="modeColor()" stroke-width="1.5" />
    <line x1="16" y1="8" x2="16" y2="24" :stroke="modeColor()" stroke-width="1" />
    <line x1="8" y1="16" x2="24" y2="16" :stroke="modeColor()" stroke-width="1" />
  </svg>
  <!-- Weapon: standard cross -->
  <svg v-else-if="telemetry.activeMode === 'weapon'" width="32" height="32" viewBox="0 0 32 32">
    <line x1="16" y1="6" x2="16" y2="13" :stroke="modeColor()" stroke-width="2" />
    <line x1="16" y1="19" x2="16" y2="26" :stroke="modeColor()" stroke-width="2" />
    <line x1="6" y1="16" x2="13" y2="16" :stroke="modeColor()" stroke-width="2" />
    <line x1="19" y1="16" x2="26" y2="16" :stroke="modeColor()" stroke-width="2" />
  </svg>
  <!-- Heal: plus -->
  <svg v-else width="32" height="32" viewBox="0 0 32 32">
    <rect x="13" y="8" width="6" height="16" rx="1" :fill="modeColor()" />
    <rect x="8" y="13" width="16" height="6" rx="1" :fill="modeColor()" />
  </svg>
</div>
```

- [ ] **Step 4: Add action bar**

Add before the closing `</div>` of the root HUD div, after the death timer:

```html
<!-- Action Bar -->
<div class="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1">
  <div
    v-for="(cfg, mode) in MODE_LABELS"
    :key="mode"
    class="flex items-center gap-1 px-3 py-1.5 rounded text-xs tracking-wider uppercase transition-all duration-150"
    :class="telemetry.activeMode === mode ? 'bg-white/15' : 'bg-white/5 opacity-50'"
    :style="telemetry.activeMode === mode ? { borderBottom: '2px solid ' + cfg.color, color: cfg.color } : {}"
  >
    <span class="text-white/40">{{ cfg.key }}</span>
    <span>{{ cfg.label }}</span>
  </div>
</div>
```

- [ ] **Step 5: Type-check**

Run: `bun run type-check`
Expected: Clean

- [ ] **Step 6: Commit**

```bash
git add src/components/FpsHud.vue
git commit -m "feat(multitool): action bar HUD and per-mode crosshairs"
```

---

### Task 6: Wire everything in FpsViewController

**Files:**
- Modify: `src/views/FpsViewController.ts`
- Modify: `src/views/FpsView.vue`

- [ ] **Step 1: Add imports and fields**

Add imports at the top of `src/views/FpsViewController.ts`:

```ts
import { MultiToolState } from '@/lib/fps/multiToolState'
import type { MultiToolConfig } from '@/lib/fps/multiToolState'
import multiToolConfigJson from '@/data/fps/multitool-config.json'
```

Add field after `private multiTool`:

```ts
private multiToolState: MultiToolState | null = null
private leftMouseDown = false
private leftMouseJustPressed = false
private rightMouseDown = false
```

- [ ] **Step 2: Create MultiToolState in init**

In the `init` method, after the multi-tool controller load, add:

```ts
// Multi-tool state
this.multiToolState = new MultiToolState(multiToolConfigJson as MultiToolConfig)
```

- [ ] **Step 3: Register MultiToolState in tick order**

Update the tick registration block. Add the MultiToolState after physics:

```ts
// Register tick order
this.tickHandler.register(this.playerController, TICK_PRIORITY_PHYSICS)
this.tickHandler.register(this.multiToolState, TICK_PRIORITY_PHYSICS + 1)
this.tickHandler.register(this.fpsCamera, TICK_PRIORITY_RENDER - 2)
this.tickHandler.register(this.multiTool, TICK_PRIORITY_RENDER - 2)
this.tickHandler.register(this, TICK_PRIORITY_RENDER - 1)
this.tickHandler.register(this.sceneManager, TICK_PRIORITY_RENDER)
```

- [ ] **Step 4: Add mouse button tracking to setupPointerLock**

In `setupPointerLock()`, add mousedown/mouseup listeners after the mousemove listener:

```ts
// Mouse buttons → tool state
const onMouseDown = (e: MouseEvent): void => {
  if (document.pointerLockElement !== canvas) return
  if (e.button === 0) {
    this.leftMouseDown = true
    this.leftMouseJustPressed = true
  }
  if (e.button === 2) this.rightMouseDown = true
}
const onMouseUp = (e: MouseEvent): void => {
  if (e.button === 0) this.leftMouseDown = false
  if (e.button === 2) this.rightMouseDown = false
}
document.addEventListener('mousedown', onMouseDown)
document.addEventListener('mouseup', onMouseUp)

// Prevent context menu on right-click
canvas.addEventListener('contextmenu', (e) => e.preventDefault())
```

- [ ] **Step 5: Update self-tick to sync all systems**

Replace the existing `tick` method body with:

```ts
tick(_dt: number): void {
  // --- Tool keybinds ---
  if (this.inputManager && this.multiToolState) {
    if (this.inputManager.wasActionPressed('toolDrill')) this.multiToolState.setMode('drill')
    if (this.inputManager.wasActionPressed('toolWeapon')) this.multiToolState.setMode('weapon')
    if (this.inputManager.wasActionPressed('toolHeal')) this.multiToolState.setMode('heal')

    // Feed mouse state to tool
    this.multiToolState.setAiming(this.rightMouseDown)
    this.multiToolState.setInput(this.leftMouseDown, this.leftMouseJustPressed)
    this.leftMouseJustPressed = false // consume the just-pressed flag
  }

  // --- Sync tool visuals ---
  if (this.multiToolState && this.multiTool) {
    this.multiTool.setMode(this.multiToolState.modeConfig.color)
  }

  // --- ADS camera zoom ---
  if (this.multiToolState && this.fpsCamera) {
    const ads = this.multiToolState.adsConfig
    this.fpsCamera.setAiming(
      this.multiToolState.aiming,
      ads.fovMultiplier,
      ads.zoomSpeed,
    )
  }

  // Feed player velocity to camera and multi-tool for bob/wobble
  if (this.playerController && this.fpsCamera) {
    const pos = this.playerController.group.position
    const slope = this.heightmap?.slopeAt(pos.x, pos.z) ?? 0
    this.fpsCamera.setVelocity(
      this.playerController.speed,
      this.playerController.body.velocityY,
      slope,
    )
    this.multiTool?.setState(
      this.playerController.speed,
      this.inputManager!.isActionActive('sprint'),
      this.playerController.grounded,
    )
  }

  if (this.playerController && this.onTelemetry) {
    const ts = this.playerController.thrusterSystem
    this.onTelemetry({
      o2Level: this.playerController.o2Level,
      o2Capacity: this.playerController.o2Capacity,
      sprintCharge: ts.getState('sprint').charge,
      sprintCapacity: ts.getState('sprint').capacity,
      speed: this.playerController.speed,
      grounded: this.playerController.grounded,
      deathTimer: this.playerController.deathTimer,
      activeMode: this.multiToolState?.mode ?? 'drill',
      aiming: this.multiToolState?.aiming ?? false,
      isFiring: this.multiToolState?.isFiring ?? false,
    })
  }
}
```

- [ ] **Step 6: Update FpsView.vue telemetry defaults**

In `src/views/FpsView.vue`, add the new fields to the reactive telemetry object:

```ts
const telemetry = reactive<FpsTelemetry>({
  o2Level: 100,
  o2Capacity: 100,
  sprintCharge: 50,
  sprintCapacity: 50,
  speed: 0,
  grounded: false,
  deathTimer: null,
  activeMode: 'drill',
  aiming: false,
  isFiring: false,
})
```

- [ ] **Step 7: Type-check**

Run: `bun run type-check`
Expected: Clean

- [ ] **Step 8: Run full test suite**

Run: `bun test:unit`
Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
git add src/views/FpsViewController.ts src/views/FpsView.vue
git commit -m "feat(multitool): wire mode switching, ADS, mouse events, telemetry"
```

---

### Task 7: Lint + manual verification

**Files:** All new/modified files

- [ ] **Step 1: Run linter**

Run: `bun lint`

Fix any issues (likely TSDoc on new exports).

- [ ] **Step 2: Run full test suite**

Run: `bun test:unit`
Expected: ALL PASS

- [ ] **Step 3: Run type-check**

Run: `bun run type-check`
Expected: Clean

- [ ] **Step 4: Manual test**

Run: `bun dev`, navigate to `/fps`

Verify:
- Press 1/2/3 → action bar highlights, crosshair changes shape/color, gun tints
- Right-click → camera zooms slightly (ADS)
- Left-click while ADS → console logs `[MultiTool] fire: {mode}`
- Left-click without ADS → nothing
- Drill (1): hold left click while ADS → continuous fire logs
- Weapon (2): hold left click while ADS → periodic fire logs (~5/s)
- Heal (3): click while ADS → one log per click, holding does nothing
- Release right-click → camera unzooms

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "chore(multitool): lint fixes and polish"
```
