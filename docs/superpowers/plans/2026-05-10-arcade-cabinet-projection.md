# Arcade Cabinet Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the DOM-overlay arcade with a real in-world cabinet whose screen displays a ROM via `THREE.CanvasTexture`, with a boot menu and a JSON-driven ROM registry.

**Architecture:** A pure-TS state machine (`ArcadeCabinetSession`) drives a `RomRegistry` of pluggable ROMs, drawing into an offscreen canvas that is uploaded to the cabinet's screen submesh material. Camera engagement reuses the existing `tableSequenceActive` lerp pattern in `HabitatInteriorScene`. Input capture mirrors the existing overlay's window-event-with-stopImmediatePropagation defense.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Three.js, Vue 3, Vitest, Bun.

**Spec:** `docs/superpowers/specs/2026-05-09-arcade-cabinet-projection-design.md`

---

## File Map

**Create**
- `src/data/arcade-roms.json` — registry metadata
- `src/lib/minigame/cabinet/types.ts` — `ArcadeRom`, `ArcadeInputs`, `ArcadeRomFactory`, `ArcadeRomDeps`, `RomMeta`, `RomHudSnapshot`, `ArcadeRomStorage`
- `src/lib/minigame/cabinet/ArcadeRomRegistry.ts`
- `src/lib/minigame/cabinet/ArcadeScreenRenderer.ts`
- `src/lib/minigame/cabinet/ArcadeCabinetSession.ts`
- `src/lib/minigame/cabinet/ArcadeCabinetInput.ts`
- `src/lib/minigame/cabinet/RetroHud.ts`
- `src/lib/minigame/cabinet/__tests__/ArcadeRomRegistry.spec.ts`
- `src/lib/minigame/cabinet/__tests__/ArcadeCabinetSession.spec.ts`
- `src/lib/minigame/arcadeAsteroids/AsteroidsRom.ts`
- `src/lib/minigame/arcadeAsteroids/__tests__/AsteroidsRom.spec.ts`

**Modify**
- `src/three/HabitatArcadeMachineModel.ts` — locate screen submesh, expose `setScreenTexture`, expose `screenWorldPose`
- `src/three/HabitatInteriorScene.ts` — own session, mirror table-look sequence for arcade engage, drive session tick, route F-prompt to `session.engage()`, suspend habitat hotkeys via `session.isEngaged()`
- `src/lib/map/habitat/MapHabitatFacade.ts` — drop `onArcade`
- `src/views/MapViewController.ts` — drop `onArcade` plumbing
- `src/views/MapView.vue` — drop overlay mount, ref, and CSS gating
- `src/assets/css/main.css` — drop overlay CSS import

**Delete**
- `src/components/ArcadeAsteroidsOverlay.vue`
- `src/components/ArcadeAsteroidsCanvas.vue`
- `src/components/ArcadeAsteroidsOverlayController.ts`
- `src/components/__tests__/ArcadeAsteroidsOverlayController.spec.ts`
- `src/assets/css/arcade-asteroids-overlay.css`
- `docs/superpowers/specs/2026-05-09-arcade-asteroids-design.md` (superseded by the projection spec)

---

## Conventions for Every Task

- File header on every new `src/lib/**` and `src/three/**` file:
  ```ts
  /**
   * <module description>
   *
   * @author guinetik
   * @date 2026-05-10
   * @spec docs/superpowers/specs/2026-05-09-arcade-cabinet-projection-design.md
   */
  ```
- Every exported symbol has TSDoc.
- No magic numbers — name every numeric constant at module scope.
- Run `bun run type-check && bun run lint && bun test:unit` before each commit. **Required to be clean** (lint runs `--max-warnings 0`).

---

## Task 1: Cabinet types + ROM JSON

**Files:**
- Create: `src/lib/minigame/cabinet/types.ts`
- Create: `src/data/arcade-roms.json`

- [ ] **Step 1: Create the type file**

```ts
/**
 * Public contracts for the arcade cabinet ROM system.
 *
 * @author guinetik
 * @date 2026-05-10
 * @spec docs/superpowers/specs/2026-05-09-arcade-cabinet-projection-design.md
 */

/** Held-button bag the cabinet hands to a ROM each tick. */
export interface ArcadeInputs {
  /** Player-1 left rotate / menu navigation up. */
  rotateLeft: boolean
  /** Player-1 right rotate. */
  rotateRight: boolean
  /** Forward thrust. */
  thrust: boolean
  /** Primary fire. */
  fire: boolean
  /** Hyperspace / panic. */
  hyperspace: boolean
  /** Coin / start. */
  start: boolean
  /** Menu navigate up. */
  up: boolean
  /** Menu navigate down. */
  down: boolean
  /** Menu confirm. */
  enter: boolean
}

/** Idle-input singleton for ROM attract ticks. */
export const ARCADE_IDLE_INPUTS: ArcadeInputs = {
  rotateLeft: false,
  rotateRight: false,
  thrust: false,
  fire: false,
  hyperspace: false,
  start: false,
  up: false,
  down: false,
  enter: false,
}

/** HUD snapshot the cabinet draws above the play area. */
export interface RomHudSnapshot {
  /** Current run score. */
  score: number
  /** Local-best high score. */
  highScore: number
  /** Lives remaining. */
  lives: number
  /** Current wave / level. */
  wave: number
  /** Short label for the current ROM phase ("ATTRACT", "PLAY", "GAME OVER"). */
  phaseLabel: string
}

/** Minimal storage surface a ROM can use to persist its high score. */
export interface ArcadeRomStorage {
  /** Read a string by key. */
  getItem(key: string): string | null
  /** Write a string by key. */
  setItem(key: string, value: string): void
  /** Remove a value by key. */
  removeItem(key: string): void
}

/** Static metadata for one ROM (one entry in arcade-roms.json). */
export interface RomMeta {
  /** Stable id used as registry key. */
  id: string
  /** Display title shown on the menu. */
  title: string
  /** Display year flavor (e.g. "1979"). */
  year: string
  /** One-line blurb shown under the title in the menu. */
  blurb: string
  /** localStorage key the ROM uses for its high score. */
  highScoreKey: string
}

/** Dependencies the registry hands to a ROM factory. */
export interface ArcadeRomDeps {
  /** Logical canvas width the ROM should target. */
  width: number
  /** Logical canvas height. */
  height: number
  /** Persistence surface; null disables saving. */
  storage: ArcadeRomStorage | null
  /** Optional deterministic RNG for tests. */
  random?: () => number
  /** Metadata entry from arcade-roms.json. */
  meta: RomMeta
}

/** A loaded ROM. Tick + render hooks are split for attract vs. play. */
export interface ArcadeRom {
  /** Tick the active run; only called in `playing`. */
  tick(dt: number, inputs: ArcadeInputs): void
  /** Render the active run. */
  render(ctx: CanvasRenderingContext2D, width: number, height: number): void
  /** Tick the attract loop (idle / menu states). */
  attractTick(dt: number): void
  /** Render the attract loop. */
  attractRender(ctx: CanvasRenderingContext2D, width: number, height: number): void
  /** Begin a fresh run from the menu. */
  start(): void
  /** Return to attract state. */
  reset(): void
  /** True once the current run has fully ended (game-over acknowledged). */
  isRunComplete(): boolean
  /** HUD snapshot for cabinet chrome. */
  hudSnapshot(): RomHudSnapshot
}

/** Factory that constructs a ROM from cabinet-provided dependencies. */
export type ArcadeRomFactory = (deps: ArcadeRomDeps) => ArcadeRom
```

- [ ] **Step 2: Create the JSON data file**

```json
[
  {
    "id": "asteroids",
    "title": "ASTEROIDS",
    "year": "1979",
    "blurb": "DESTROY THE ROCKS · AVOID THE SAUCER",
    "highScoreKey": "asteroid-lander-arcade-asteroids-high-score-v1"
  }
]
```

- [ ] **Step 3: Verify**

Run: `bun run type-check`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/minigame/cabinet/types.ts src/data/arcade-roms.json
git commit -m "feat(arcade): add cabinet ROM types and registry data"
```

---

## Task 2: ArcadeRomRegistry — failing tests first

**Files:**
- Create: `src/lib/minigame/cabinet/__tests__/ArcadeRomRegistry.spec.ts`
- Create: `src/lib/minigame/cabinet/ArcadeRomRegistry.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it, vi } from 'vitest'
import { ArcadeRomRegistry } from '../ArcadeRomRegistry'
import type { ArcadeRom, ArcadeRomDeps, ArcadeRomFactory, RomMeta } from '../types'

const META: RomMeta = {
  id: 'asteroids',
  title: 'ASTEROIDS',
  year: '1979',
  blurb: 'DESTROY THE ROCKS',
  highScoreKey: 'k',
}

function stubRom(): ArcadeRom {
  return {
    tick: () => {},
    render: () => {},
    attractTick: () => {},
    attractRender: () => {},
    start: () => {},
    reset: () => {},
    isRunComplete: () => true,
    hudSnapshot: () => ({ score: 0, highScore: 0, lives: 0, wave: 0, phaseLabel: 'ATTRACT' }),
  }
}

function deps(): ArcadeRomDeps {
  return { width: 640, height: 480, storage: null, meta: META }
}

describe('ArcadeRomRegistry', () => {
  it('lists metadata in catalog order', () => {
    const factory: ArcadeRomFactory = vi.fn(stubRom)
    const registry = new ArcadeRomRegistry([META], { asteroids: factory })
    expect(registry.list()).toEqual([META])
  })

  it('creates a ROM via the registered factory', () => {
    const factory: ArcadeRomFactory = vi.fn(stubRom)
    const registry = new ArcadeRomRegistry([META], { asteroids: factory })
    registry.create('asteroids', deps())
    expect(factory).toHaveBeenCalledOnce()
  })

  it('throws when a meta entry has no factory', () => {
    expect(() => new ArcadeRomRegistry([META], {})).toThrow(/no factory/i)
  })

  it('throws when the catalog has duplicate ids', () => {
    expect(() => new ArcadeRomRegistry([META, META], { asteroids: stubRom })).toThrow(/duplicate/i)
  })

  it('throws on create with an unknown id', () => {
    const registry = new ArcadeRomRegistry([META], { asteroids: stubRom })
    expect(() => registry.create('pong', deps())).toThrow(/unknown/i)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/minigame/cabinet/__tests__/ArcadeRomRegistry.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the registry**

```ts
/**
 * Registry that maps ROM ids from arcade-roms.json to factory functions.
 *
 * @author guinetik
 * @date 2026-05-10
 * @spec docs/superpowers/specs/2026-05-09-arcade-cabinet-projection-design.md
 */
import type { ArcadeRom, ArcadeRomDeps, ArcadeRomFactory, RomMeta } from './types'

/** Map of ROM id to its factory function. */
export type ArcadeRomFactoryMap = Record<string, ArcadeRomFactory>

/**
 * Holds the catalog of available ROMs and resolves factories by id. Fails loud
 * at construction time when a meta entry has no factory or ids collide.
 */
export class ArcadeRomRegistry {
  private readonly catalog: ReadonlyArray<RomMeta>
  private readonly factories: ArcadeRomFactoryMap

  /**
   * Build a registry from metadata + factory map.
   *
   * @param catalog - Ordered list of ROM metadata (typically `arcade-roms.json`).
   * @param factories - Map of id → factory. Must cover every catalog id.
   */
  constructor(catalog: ReadonlyArray<RomMeta>, factories: ArcadeRomFactoryMap) {
    const seen = new Set<string>()
    for (const meta of catalog) {
      if (seen.has(meta.id)) {
        throw new Error(`ArcadeRomRegistry: duplicate id "${meta.id}" in catalog`)
      }
      seen.add(meta.id)
      if (!factories[meta.id]) {
        throw new Error(`ArcadeRomRegistry: no factory registered for id "${meta.id}"`)
      }
    }
    this.catalog = catalog
    this.factories = factories
  }

  /** Return the catalog in declaration order. */
  list(): ReadonlyArray<RomMeta> {
    return this.catalog
  }

  /**
   * Construct a ROM by id.
   *
   * @param id - Catalog id.
   * @param deps - Per-instance dependencies.
   * @returns A fresh ROM instance.
   */
  create(id: string, deps: ArcadeRomDeps): ArcadeRom {
    const factory = this.factories[id]
    if (!factory) throw new Error(`ArcadeRomRegistry: unknown ROM id "${id}"`)
    return factory(deps)
  }
}
```

- [ ] **Step 4: Run tests, lint, type-check**

Run: `bun test:unit src/lib/minigame/cabinet/__tests__/ArcadeRomRegistry.spec.ts && bun run type-check && bun run lint`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/minigame/cabinet/ArcadeRomRegistry.ts src/lib/minigame/cabinet/__tests__/ArcadeRomRegistry.spec.ts
git commit -m "feat(arcade): cabinet ROM registry with strict catalog validation"
```

---

## Task 3: AsteroidsRom adapter — failing test first

**Files:**
- Create: `src/lib/minigame/arcadeAsteroids/__tests__/AsteroidsRom.spec.ts`
- Create: `src/lib/minigame/arcadeAsteroids/AsteroidsRom.ts`

The adapter wraps the existing `AsteroidsGame` to satisfy `ArcadeRom`. It uses the existing `ASTEROIDS_IDLE_INPUTS` for attract ticks and persists high score under `meta.highScoreKey`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { createAsteroidsRom } from '../AsteroidsRom'
import type { ArcadeRomDeps } from '@/lib/minigame/cabinet/types'

const META = {
  id: 'asteroids',
  title: 'ASTEROIDS',
  year: '1979',
  blurb: '',
  highScoreKey: 'test-key',
}

class MemStorage {
  store = new Map<string, string>()
  getItem = (k: string) => this.store.get(k) ?? null
  setItem = (k: string, v: string) => void this.store.set(k, v)
  removeItem = (k: string) => void this.store.delete(k)
}

function deps(storage: MemStorage = new MemStorage()): ArcadeRomDeps {
  return { width: 640, height: 480, storage, meta: META, random: () => 0.5 }
}

describe('AsteroidsRom adapter', () => {
  it('reports an attract phase before start', () => {
    const rom = createAsteroidsRom(deps())
    expect(rom.hudSnapshot().phaseLabel).toBe('ATTRACT')
  })

  it('loads the persisted high score from storage', () => {
    const storage = new MemStorage()
    storage.setItem(META.highScoreKey, '4200')
    const rom = createAsteroidsRom(deps(storage))
    expect(rom.hudSnapshot().highScore).toBe(4200)
  })

  it('start() leaves attract and begins a run', () => {
    const rom = createAsteroidsRom(deps())
    rom.start()
    expect(['PLAY', 'RESPAWN']).toContain(rom.hudSnapshot().phaseLabel)
  })

  it('reset() returns the ROM to attract', () => {
    const rom = createAsteroidsRom(deps())
    rom.start()
    rom.reset()
    expect(rom.hudSnapshot().phaseLabel).toBe('ATTRACT')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/minigame/arcadeAsteroids/__tests__/AsteroidsRom.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the adapter**

```ts
/**
 * Adapter that wraps the pure AsteroidsGame simulation as an ArcadeRom for the
 * cabinet system.
 *
 * @author guinetik
 * @date 2026-05-10
 * @spec docs/superpowers/specs/2026-05-09-arcade-cabinet-projection-design.md
 */
import {
  ArcadeRom,
  ArcadeRomDeps,
  ArcadeRomFactory,
  ArcadeInputs,
  RomHudSnapshot,
} from '@/lib/minigame/cabinet/types'
import { ASTEROIDS_IDLE_INPUTS, AsteroidsGame } from './AsteroidsGame'
import { drawAsteroidsScene } from './render'
import type { AsteroidsInputs } from './types'

const MAX_STORED_SCORE = 9999990

/** Map cabinet inputs → asteroids inputs. */
function toAsteroidsInputs(src: ArcadeInputs): AsteroidsInputs {
  return {
    rotateLeft: src.rotateLeft,
    rotateRight: src.rotateRight,
    thrust: src.thrust,
    fire: src.fire,
    hyperspace: src.hyperspace,
    start: src.start || src.enter,
  }
}

/** Translate an AsteroidsGame phase to the HUD label. */
function phaseLabel(phase: string): string {
  if (phase === 'attract') return 'ATTRACT'
  if (phase === 'playing') return 'PLAY'
  if (phase === 'respawning') return 'RESPAWN'
  return 'GAME OVER'
}

/**
 * Build the Asteroids ROM. Exposed as a named factory and the default export
 * `createAsteroidsRom` that the cabinet registry uses.
 *
 * @param deps - Cabinet-provided dependencies.
 */
export const createAsteroidsRom: ArcadeRomFactory = (deps: ArcadeRomDeps): ArcadeRom => {
  const storage = deps.storage
  let highScore = loadHighScore(storage, deps.meta.highScoreKey)
  let lastThrust = false

  function buildGame(): AsteroidsGame {
    return new AsteroidsGame({
      width: deps.width,
      height: deps.height,
      highScore,
      ...(deps.random ? { random: deps.random } : {}),
    })
  }

  let game = buildGame()

  function persistIfBeaten(): void {
    const current = game.snapshot().highScore
    if (current <= highScore) return
    highScore = current
    if (storage) {
      storage.setItem(deps.meta.highScoreKey, String(Math.min(MAX_STORED_SCORE, highScore)))
    }
  }

  return {
    tick(dt, inputs) {
      const mapped = toAsteroidsInputs(inputs)
      lastThrust = mapped.thrust
      game.tick(dt, mapped)
      persistIfBeaten()
    },
    render(ctx, width, height) {
      drawAsteroidsScene(ctx, game.snapshot(), { width, height, thrust: lastThrust })
    },
    attractTick(dt) {
      game.tick(dt, ASTEROIDS_IDLE_INPUTS)
      lastThrust = false
      persistIfBeaten()
    },
    attractRender(ctx, width, height) {
      drawAsteroidsScene(ctx, game.snapshot(), { width, height, thrust: false })
    },
    start() {
      game.startRun()
    },
    reset() {
      // Rebuild the game from scratch — matches the existing
      // ArcadeAsteroidsOverlayController.resetHighScore() pattern.
      game = buildGame()
      lastThrust = false
    },
    isRunComplete() {
      return game.snapshot().phase === 'gameOver'
    },
    hudSnapshot(): RomHudSnapshot {
      const s = game.snapshot()
      return {
        score: s.score,
        highScore: Math.max(highScore, s.highScore),
        lives: s.lives,
        wave: s.wave,
        phaseLabel: phaseLabel(s.phase),
      }
    },
  }
}

function loadHighScore(storage: ArcadeRomDeps['storage'], key: string): number {
  if (!storage) return 0
  const raw = storage.getItem(key)
  if (!raw) return 0
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(MAX_STORED_SCORE, parsed))
}
```

> NOTE: The `drawAsteroidsScene(ctx, state, { width, height, thrust })` helper is imported from a new `render.ts` extracted in **Task 4**. The `reset()` hook here rebuilds the `AsteroidsGame` from scratch — the same approach `ArcadeAsteroidsOverlayController.resetHighScore` uses today — so no changes are needed to `AsteroidsGame.ts`.

- [ ] **Step 4: Run tests + type-check + lint**

Run: `bun test:unit src/lib/minigame/arcadeAsteroids/__tests__/AsteroidsRom.spec.ts && bun run type-check && bun run lint`
Expected: PASS / clean. (May fail on `render.ts` import — that's Task 4.)

If tests fail only because `drawAsteroidsScene` doesn't exist yet, **proceed to Task 4 first**, then return and re-run.

- [ ] **Step 5: Commit (after Task 4 lands)**

```bash
git add src/lib/minigame/arcadeAsteroids/AsteroidsRom.ts src/lib/minigame/arcadeAsteroids/__tests__/AsteroidsRom.spec.ts
git commit -m "feat(arcade): AsteroidsRom adapter wraps AsteroidsGame as a cabinet ROM"
```

---

## Task 4: Extract Asteroids drawing into a pure renderer module

The existing `ArcadeAsteroidsCanvas.vue` mixes draw logic into the Vue layer (violates ground rule 5). Extract it as a pure module the ROM adapter can call. This is a straight move + small adaptation.

**Files:**
- Create: `src/lib/minigame/arcadeAsteroids/render.ts`

- [ ] **Step 1: Implement the renderer**

Copy the bodies of `drawGrid`, `drawShip`, `drawAsteroid`, `drawSaucer`, `drawBullet`, and `drawMessage` from `src/components/ArcadeAsteroidsCanvas.vue`, plus all the `*_FACTOR` constants. Wrap them in a single `drawAsteroidsScene` entry point.

```ts
/**
 * Pure 2D renderer for the Asteroids ROM. Imported by AsteroidsRom; never
 * touches Vue or Three.js.
 *
 * @author guinetik
 * @date 2026-05-10
 * @spec docs/superpowers/specs/2026-05-09-arcade-cabinet-projection-design.md
 */
import type {
  AsteroidEntity,
  AsteroidsGameState,
  AsteroidsShip,
  SaucerEntity,
} from './types'

const SHIP_NOSE_FACTOR = 1.35
const SHIP_WING_BACK_FACTOR = 0.9
const SHIP_WING_SIDE_FACTOR = 0.72
const SAUCER_HALF_WIDTH_FACTOR = 1.4
const SAUCER_BODY_HEIGHT_FACTOR = 0.42
const SAUCER_DOME_HEIGHT_FACTOR = 0.72
const THRUST_FLAME_LENGTH_FACTOR = 1.25
const THRUST_FLAME_SIDE_FACTOR = 0.45
const GRID_DIVISIONS = 12
const GRID_ALPHA = 0.12
const ASTEROID_LINE_WIDTH = 2
const SHIP_LINE_WIDTH = 2

/** Render parameters for the scene draw. */
export interface AsteroidsDrawOptions {
  /** Logical canvas width matching `state.width`. */
  width: number
  /** Logical canvas height matching `state.height`. */
  height: number
  /** Whether thruster flame should be drawn this frame. */
  thrust: boolean
}

/**
 * Draw the entire Asteroids scene to a 2D context whose transform already maps
 * logical → pixel space.
 */
export function drawAsteroidsScene(
  ctx: CanvasRenderingContext2D,
  state: AsteroidsGameState,
  opts: AsteroidsDrawOptions,
): void {
  drawGrid(ctx, state)
  for (const a of state.asteroids) drawAsteroid(ctx, a)
  for (const b of state.bullets) drawBullet(ctx, b.x, b.y, b.radius)
  for (const b of state.saucerBullets) drawBullet(ctx, b.x, b.y, b.radius)
  if (state.saucer) drawSaucer(ctx, state.saucer)
  if (state.ship.visible) drawShip(ctx, state.ship, opts.thrust)
  drawMessage(ctx, state)
}

// ... drawGrid / drawShip / drawAsteroid / drawSaucer / drawBullet / drawMessage
// Copy bodies verbatim from ArcadeAsteroidsCanvas.vue, removing the screen-space
// transform setup (which now lives in ArcadeScreenRenderer).
```

> Engineer note: The Vue file's `draw()` function does `ctx.setTransform(sx, 0, 0, sy, 0, 0); ctx.clearRect(0, 0, state.width, state.height)`. **Do not include those two lines here** — the cabinet's `ArcadeScreenRenderer` (Task 6) owns transform + clear.

- [ ] **Step 2: Type-check**

Run: `bun run type-check && bun run lint`
Expected: clean.

- [ ] **Step 3: Re-run Task 3's tests**

Run: `bun test:unit src/lib/minigame/arcadeAsteroids/__tests__/AsteroidsRom.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit (combined with Task 3)**

```bash
git add src/lib/minigame/arcadeAsteroids/render.ts src/lib/minigame/arcadeAsteroids/AsteroidsRom.ts src/lib/minigame/arcadeAsteroids/__tests__/AsteroidsRom.spec.ts
git commit -m "feat(arcade): extract Asteroids renderer + adapter for cabinet ROM"
```

---

## Task 5: RetroHud helper

A small canvas-drawing helper for the cabinet HUD strip drawn on top of every ROM render. No tests (canvas drawing is integration; per ground rule 2 the lib tests focus on math).

**Files:**
- Create: `src/lib/minigame/cabinet/RetroHud.ts`

- [ ] **Step 1: Implement**

```ts
/**
 * Cabinet HUD overlay. Drawn by ArcadeScreenRenderer above the ROM render.
 *
 * @author guinetik
 * @date 2026-05-10
 * @spec docs/superpowers/specs/2026-05-09-arcade-cabinet-projection-design.md
 */
import type { RomHudSnapshot } from './types'

const HUD_FONT_FAMILY = 'Datatype, monospace'
const HUD_FONT_SIZE_PX = 14
const HUD_PADDING_X = 12
const HUD_PADDING_Y = 8
const HUD_FOREGROUND = '#6effd2'
const HUD_DIM = 'rgba(216, 255, 242, 0.72)'
const HUD_HINT = 'rgba(216, 255, 242, 0.55)'

/** Draw the score/lives/wave/mode strip across the top of the cabinet screen. */
export function drawCabinetHudHeader(
  ctx: CanvasRenderingContext2D,
  width: number,
  hud: RomHudSnapshot,
): void {
  ctx.save()
  ctx.font = `${HUD_FONT_SIZE_PX}px ${HUD_FONT_FAMILY}`
  ctx.textBaseline = 'top'
  const cells = [
    `SCORE ${hud.score.toLocaleString()}`,
    `HIGH ${hud.highScore.toLocaleString()}`,
    `LIVES ${hud.lives}`,
    `WAVE ${hud.wave}`,
    `MODE ${hud.phaseLabel}`,
  ]
  let x = HUD_PADDING_X
  for (const cell of cells) {
    ctx.fillStyle = HUD_DIM
    ctx.fillText(cell, x, HUD_PADDING_Y)
    x += ctx.measureText(cell).width + 18
  }
  // Underline
  ctx.strokeStyle = 'rgba(110, 255, 210, 0.18)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, HUD_PADDING_Y + HUD_FONT_SIZE_PX + 6)
  ctx.lineTo(width, HUD_PADDING_Y + HUD_FONT_SIZE_PX + 6)
  ctx.stroke()
  ctx.restore()
  // Suppress unused-import lint on HUD_FOREGROUND/HUD_HINT in some toolchains
  void HUD_FOREGROUND
  void HUD_HINT
}

/** Draw the keybinds hint strip across the bottom of the cabinet screen. */
export function drawCabinetHudFooter(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  text: string,
): void {
  ctx.save()
  ctx.font = `${HUD_FONT_SIZE_PX - 2}px ${HUD_FONT_FAMILY}`
  ctx.textBaseline = 'bottom'
  ctx.textAlign = 'center'
  ctx.fillStyle = HUD_HINT
  ctx.fillText(text, width / 2, height - HUD_PADDING_Y)
  ctx.restore()
}
```

> Drop the `void HUD_FOREGROUND` / `void HUD_HINT` lines if both constants are referenced; they're a placeholder for any color you decide to bring in for the score values.

- [ ] **Step 2: Type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/minigame/cabinet/RetroHud.ts
git commit -m "feat(arcade): RetroHud helper for cabinet header/footer"
```

---

## Task 6: ArcadeScreenRenderer

Owns the offscreen canvas and the `THREE.CanvasTexture`. Composes ROM render + HUD + (when needed) menu draw. No tests for the canvas/texture wiring per the codebase rule.

**Files:**
- Create: `src/lib/minigame/cabinet/ArcadeScreenRenderer.ts`

- [ ] **Step 1: Implement**

```ts
/**
 * Owns the offscreen 2D canvas + CanvasTexture used as the cabinet screen.
 *
 * @author guinetik
 * @date 2026-05-10
 * @spec docs/superpowers/specs/2026-05-09-arcade-cabinet-projection-design.md
 */
import * as THREE from 'three'
import { drawCabinetHudFooter, drawCabinetHudHeader } from './RetroHud'
import type { ArcadeRom, RomMeta } from './types'

const SCREEN_LOGICAL_WIDTH = 640
const SCREEN_LOGICAL_HEIGHT = 480
const FOOTER_HINT_PLAY = 'ARROWS MOVE · SPACE FIRE · X HYPERSPACE · ESC EXIT'
const FOOTER_HINT_MENU = 'UP/DOWN SELECT · ENTER START · ESC EXIT'
const MENU_TITLE = 'SELECT GAME'
const MENU_TITLE_FONT_SIZE_PX = 28
const MENU_ROW_FONT_SIZE_PX = 20
const MENU_ROW_HEIGHT_PX = 36
const MENU_FONT = 'Datatype, monospace'
const MENU_BG_ALPHA = 0.6

/** Camera-facing summary of the menu state to draw. */
export interface ArcadeMenuView {
  /** Catalog displayed in the menu. */
  entries: ReadonlyArray<RomMeta>
  /** Currently highlighted index. */
  selectedIndex: number
}

/** Cabinet screen renderer — all draws funnel through here. */
export class ArcadeScreenRenderer {
  /** The backing offscreen canvas. */
  readonly canvas: HTMLCanvasElement
  /** Three.js texture wrapping {@link canvas}. */
  readonly texture: THREE.CanvasTexture
  /** Logical canvas width. */
  readonly width = SCREEN_LOGICAL_WIDTH
  /** Logical canvas height. */
  readonly height = SCREEN_LOGICAL_HEIGHT
  private readonly ctx: CanvasRenderingContext2D

  /** Build a screen renderer with a fresh detached canvas + texture. */
  constructor() {
    this.canvas = document.createElement('canvas')
    this.canvas.width = SCREEN_LOGICAL_WIDTH
    this.canvas.height = SCREEN_LOGICAL_HEIGHT
    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('ArcadeScreenRenderer: 2D context unavailable')
    this.ctx = ctx
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.minFilter = THREE.NearestFilter
    this.texture.magFilter = THREE.NearestFilter
    this.texture.generateMipmaps = false
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.flipY = false
  }

  /** Render the ROM's ATTRACT loop. */
  drawAttract(rom: ArcadeRom): void {
    this.beginFrame()
    rom.attractRender(this.ctx, this.width, this.height)
    drawCabinetHudHeader(this.ctx, this.width, rom.hudSnapshot())
    drawCabinetHudFooter(this.ctx, this.width, this.height, FOOTER_HINT_MENU)
    this.endFrame()
  }

  /** Render the boot menu over the ROM's attract loop. */
  drawMenu(rom: ArcadeRom, menu: ArcadeMenuView): void {
    this.beginFrame()
    rom.attractRender(this.ctx, this.width, this.height)
    this.drawMenuOverlay(menu)
    drawCabinetHudHeader(this.ctx, this.width, rom.hudSnapshot())
    drawCabinetHudFooter(this.ctx, this.width, this.height, FOOTER_HINT_MENU)
    this.endFrame()
  }

  /** Render the active ROM run. */
  drawPlay(rom: ArcadeRom): void {
    this.beginFrame()
    rom.render(this.ctx, this.width, this.height)
    drawCabinetHudHeader(this.ctx, this.width, rom.hudSnapshot())
    drawCabinetHudFooter(this.ctx, this.width, this.height, FOOTER_HINT_PLAY)
    this.endFrame()
  }

  /** Free the texture (call on scene dispose). */
  dispose(): void {
    this.texture.dispose()
  }

  private beginFrame(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.ctx.clearRect(0, 0, this.width, this.height)
  }

  private endFrame(): void {
    this.texture.needsUpdate = true
  }

  private drawMenuOverlay(menu: ArcadeMenuView): void {
    const ctx = this.ctx
    ctx.save()
    ctx.fillStyle = `rgba(0, 8, 6, ${MENU_BG_ALPHA})`
    ctx.fillRect(0, 0, this.width, this.height)
    ctx.fillStyle = '#6effd2'
    ctx.font = `${MENU_TITLE_FONT_SIZE_PX}px ${MENU_FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(MENU_TITLE, this.width / 2, this.height * 0.32)

    ctx.font = `${MENU_ROW_FONT_SIZE_PX}px ${MENU_FONT}`
    const top = this.height * 0.45
    menu.entries.forEach((entry, i) => {
      const y = top + i * MENU_ROW_HEIGHT_PX
      const selected = i === menu.selectedIndex
      ctx.fillStyle = selected ? '#f8fff9' : 'rgba(216, 255, 242, 0.6)'
      const prefix = selected ? '> ' : '  '
      ctx.fillText(`${prefix}${entry.title}  ·  ${entry.year}`, this.width / 2, y)
    })
    ctx.restore()
  }
}
```

- [ ] **Step 2: Type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/minigame/cabinet/ArcadeScreenRenderer.ts
git commit -m "feat(arcade): ArcadeScreenRenderer composes ROM, HUD, and menu draws"
```

---

## Task 7: ArcadeCabinetSession state machine — TDD

**Files:**
- Create: `src/lib/minigame/cabinet/__tests__/ArcadeCabinetSession.spec.ts`
- Create: `src/lib/minigame/cabinet/ArcadeCabinetSession.ts`

The session has states `idle | engaging | menu | playing | disengaging`. Mocks for the renderer are pure no-ops; we only assert state transitions and ROM hook routing.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it, vi } from 'vitest'
import { ArcadeCabinetSession } from '../ArcadeCabinetSession'
import { ArcadeRomRegistry } from '../ArcadeRomRegistry'
import type {
  ArcadeRom,
  ArcadeRomDeps,
  ArcadeRomFactory,
  RomMeta,
} from '../types'

const META: RomMeta = {
  id: 'asteroids',
  title: 'ASTEROIDS',
  year: '1979',
  blurb: '',
  highScoreKey: 'k',
}

function makeRom(): ArcadeRom & { calls: Record<string, number> } {
  const calls: Record<string, number> = {
    tick: 0,
    render: 0,
    attractTick: 0,
    attractRender: 0,
    start: 0,
    reset: 0,
  }
  return {
    calls,
    tick: () => void calls.tick++,
    render: () => void calls.render++,
    attractTick: () => void calls.attractTick++,
    attractRender: () => void calls.attractRender++,
    start: () => void calls.start++,
    reset: () => void calls.reset++,
    isRunComplete: () => false,
    hudSnapshot: () => ({ score: 0, highScore: 0, lives: 3, wave: 1, phaseLabel: 'ATTRACT' }),
  }
}

function makeSession(): {
  session: ArcadeCabinetSession
  rom: ReturnType<typeof makeRom>
  drawAttract: ReturnType<typeof vi.fn>
  drawMenu: ReturnType<typeof vi.fn>
  drawPlay: ReturnType<typeof vi.fn>
} {
  const rom = makeRom()
  const factory: ArcadeRomFactory = (_deps: ArcadeRomDeps) => rom
  const registry = new ArcadeRomRegistry([META], { asteroids: factory })
  const drawAttract = vi.fn()
  const drawMenu = vi.fn()
  const drawPlay = vi.fn()
  const session = new ArcadeCabinetSession({
    registry,
    width: 640,
    height: 480,
    storage: null,
    renderer: { drawAttract, drawMenu, drawPlay },
  })
  return { session, rom, drawAttract, drawMenu, drawPlay }
}

describe('ArcadeCabinetSession', () => {
  it('starts in idle and ticks attract', () => {
    const { session, rom, drawAttract } = makeSession()
    expect(session.state).toBe('idle')
    session.tick(0.016)
    expect(rom.calls.attractTick).toBe(1)
    expect(drawAttract).toHaveBeenCalledOnce()
  })

  it('engage() transitions idle → engaging', () => {
    const { session } = makeSession()
    session.engage()
    expect(session.state).toBe('engaging')
  })

  it('completeEngage() advances engaging → menu', () => {
    const { session, drawMenu } = makeSession()
    session.engage()
    session.completeEngage()
    expect(session.state).toBe('menu')
    session.tick(0.016)
    expect(drawMenu).toHaveBeenCalledOnce()
  })

  it('menu Down then Up wraps the selection inside [0, list.length)', () => {
    const { session } = makeSession()
    session.engage()
    session.completeEngage()
    expect(session.menuIndex).toBe(0)
    session.menuDown()
    expect(session.menuIndex).toBe(0) // single ROM, wraps to itself
    session.menuUp()
    expect(session.menuIndex).toBe(0)
  })

  it('menuConfirm() transitions menu → playing and calls rom.start', () => {
    const { session, rom } = makeSession()
    session.engage()
    session.completeEngage()
    session.menuConfirm()
    expect(session.state).toBe('playing')
    expect(rom.calls.start).toBe(1)
  })

  it('escape() in playing → menu, in menu → disengaging', () => {
    const { session } = makeSession()
    session.engage()
    session.completeEngage()
    session.menuConfirm()
    expect(session.state).toBe('playing')
    session.escape()
    expect(session.state).toBe('menu')
    session.escape()
    expect(session.state).toBe('disengaging')
  })

  it('completeDisengage() returns to idle and resets the ROM', () => {
    const { session, rom } = makeSession()
    session.engage()
    session.completeEngage()
    session.escape()
    session.completeDisengage()
    expect(session.state).toBe('idle')
    expect(rom.calls.reset).toBe(1)
  })

  it('isEngaged() is true while not in idle', () => {
    const { session } = makeSession()
    expect(session.isEngaged()).toBe(false)
    session.engage()
    expect(session.isEngaged()).toBe(true)
    session.completeEngage()
    expect(session.isEngaged()).toBe(true)
    session.escape()
    expect(session.isEngaged()).toBe(true)
    session.completeDisengage()
    expect(session.isEngaged()).toBe(false)
  })

  it('invalid transitions are no-ops', () => {
    const { session } = makeSession()
    session.menuConfirm() // from idle, ignored
    expect(session.state).toBe('idle')
    session.escape() // from idle, ignored
    expect(session.state).toBe('idle')
  })
})
```

- [ ] **Step 2: Run tests, expect failures**

Run: `bun test:unit src/lib/minigame/cabinet/__tests__/ArcadeCabinetSession.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
/**
 * State machine that drives the in-world arcade cabinet. Owns the active ROM,
 * routes per-frame ticks, and gates input.
 *
 * @author guinetik
 * @date 2026-05-10
 * @spec docs/superpowers/specs/2026-05-09-arcade-cabinet-projection-design.md
 */
import type { ArcadeRomRegistry } from './ArcadeRomRegistry'
import {
  ARCADE_IDLE_INPUTS,
  ArcadeInputs,
  ArcadeRom,
  ArcadeRomStorage,
} from './types'

/** Cabinet states. See spec §Architecture for transitions. */
export type ArcadeCabinetState = 'idle' | 'engaging' | 'menu' | 'playing' | 'disengaging'

/** Minimal renderer surface the session calls into. */
export interface ArcadeRendererSurface {
  drawAttract(rom: ArcadeRom): void
  drawMenu(rom: ArcadeRom, menu: { entries: ReadonlyArray<{ id: string; title: string; year: string; blurb: string; highScoreKey: string }>; selectedIndex: number }): void
  drawPlay(rom: ArcadeRom): void
}

/** Constructor options. */
export interface ArcadeCabinetSessionOptions {
  /** ROM registry to source factories from. */
  registry: ArcadeRomRegistry
  /** Logical screen width handed to ROMs. */
  width: number
  /** Logical screen height handed to ROMs. */
  height: number
  /** High-score persistence; null disables saves. */
  storage: ArcadeRomStorage | null
  /** Renderer surface (cabinet screen). */
  renderer: ArcadeRendererSurface
}

/** Default first-listed ROM is selected on construction. */
export class ArcadeCabinetSession {
  /** Current state. */
  state: ArcadeCabinetState = 'idle'
  /** Index in registry.list() the menu is highlighting. */
  menuIndex = 0
  /** Held inputs; written by ArcadeCabinetInput. */
  readonly inputs: ArcadeInputs = { ...ARCADE_IDLE_INPUTS }

  private readonly options: ArcadeCabinetSessionOptions
  private readonly catalog: ReadonlyArray<{ id: string; title: string; year: string; blurb: string; highScoreKey: string }>
  private rom: ArcadeRom

  /**
   * Build a session, instantiating the first catalog entry as the default ROM.
   *
   * @param options - Session deps.
   */
  constructor(options: ArcadeCabinetSessionOptions) {
    this.options = options
    this.catalog = options.registry.list()
    if (this.catalog.length === 0) {
      throw new Error('ArcadeCabinetSession: registry has no ROMs')
    }
    const first = this.catalog[0]!
    this.rom = options.registry.create(first.id, {
      width: options.width,
      height: options.height,
      storage: options.storage,
      meta: first,
    })
  }

  /** True while engaged with the cabinet (not idle). */
  isEngaged(): boolean {
    return this.state !== 'idle'
  }

  /** Per-frame update. Routes to the right ROM hook + draw call. */
  tick(dt: number): void {
    if (this.state === 'idle' || this.state === 'engaging' || this.state === 'disengaging') {
      this.rom.attractTick(dt)
      this.options.renderer.drawAttract(this.rom)
      return
    }
    if (this.state === 'menu') {
      this.rom.attractTick(dt)
      this.options.renderer.drawMenu(this.rom, {
        entries: this.catalog,
        selectedIndex: this.menuIndex,
      })
      return
    }
    // playing
    this.rom.tick(dt, this.inputs)
    this.options.renderer.drawPlay(this.rom)
  }

  /** Begin the camera engage; caller drives the camera tween + completeEngage(). */
  engage(): void {
    if (this.state !== 'idle') return
    this.state = 'engaging'
  }

  /** Caller signals camera tween-in finished. */
  completeEngage(): void {
    if (this.state !== 'engaging') return
    this.state = 'menu'
    this.menuIndex = 0
  }

  /** Move menu cursor up (wraps). */
  menuUp(): void {
    if (this.state !== 'menu') return
    this.menuIndex = (this.menuIndex - 1 + this.catalog.length) % this.catalog.length
  }

  /** Move menu cursor down (wraps). */
  menuDown(): void {
    if (this.state !== 'menu') return
    this.menuIndex = (this.menuIndex + 1) % this.catalog.length
  }

  /** Confirm menu selection: rebuild ROM if changed, start the run. */
  menuConfirm(): void {
    if (this.state !== 'menu') return
    const meta = this.catalog[this.menuIndex]!
    // Only rebuild if a different ROM was picked (single-ROM today: same id).
    this.rom = this.options.registry.create(meta.id, {
      width: this.options.width,
      height: this.options.height,
      storage: this.options.storage,
      meta,
    })
    this.rom.start()
    this.state = 'playing'
  }

  /** ESC handler: playing → menu, menu → disengaging. No-op elsewhere. */
  escape(): void {
    if (this.state === 'playing') {
      this.rom.reset()
      this.state = 'menu'
      return
    }
    if (this.state === 'menu') {
      this.state = 'disengaging'
    }
  }

  /** Caller signals camera tween-out finished. */
  completeDisengage(): void {
    if (this.state !== 'disengaging') return
    this.rom.reset()
    this.state = 'idle'
    Object.assign(this.inputs, ARCADE_IDLE_INPUTS)
  }
}
```

- [ ] **Step 4: Run tests + type-check + lint**

Run: `bun test:unit src/lib/minigame/cabinet/__tests__/ArcadeCabinetSession.spec.ts && bun run type-check && bun run lint`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/minigame/cabinet/ArcadeCabinetSession.ts src/lib/minigame/cabinet/__tests__/ArcadeCabinetSession.spec.ts
git commit -m "feat(arcade): ArcadeCabinetSession state machine"
```

---

## Task 8: ArcadeCabinetInput

DOM event subscriber. Translates window keydown/keyup → session calls. Suppresses propagation so habitat hotkeys don't fire while engaged.

**Files:**
- Create: `src/lib/minigame/cabinet/ArcadeCabinetInput.ts`

- [ ] **Step 1: Implement**

```ts
/**
 * Window-level keyboard subscriber that drives an ArcadeCabinetSession while
 * engaged. Stops propagation so habitat hotkeys (F/H/M…) don't fire under it.
 *
 * @author guinetik
 * @date 2026-05-10
 * @spec docs/superpowers/specs/2026-05-09-arcade-cabinet-projection-design.md
 */
import type { ArcadeCabinetSession } from './ArcadeCabinetSession'

const RECOGNIZED_CODES = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'KeyA',
  'KeyD',
  'KeyW',
  'KeyS',
  'Space',
  'KeyX',
  'Enter',
  'Escape',
])

/** DOM-side input gateway. Attach once, call setSession() to bind. */
export class ArcadeCabinetInput {
  private session: ArcadeCabinetSession | null = null
  private readonly onKeydown = (e: KeyboardEvent): void => this.handle(e, true)
  private readonly onKeyup = (e: KeyboardEvent): void => this.handle(e, false)

  /** Wire DOM listeners. Idempotent across calls; second call is a no-op. */
  attach(session: ArcadeCabinetSession): void {
    this.session = session
    window.addEventListener('keydown', this.onKeydown, true)
    window.addEventListener('keyup', this.onKeyup, true)
  }

  /** Remove DOM listeners. */
  detach(): void {
    this.session = null
    window.removeEventListener('keydown', this.onKeydown, true)
    window.removeEventListener('keyup', this.onKeyup, true)
  }

  private handle(event: KeyboardEvent, pressed: boolean): void {
    const session = this.session
    if (!session || !session.isEngaged()) return
    if (!RECOGNIZED_CODES.has(event.code)) return

    event.preventDefault()
    event.stopImmediatePropagation()

    if (event.code === 'Escape') {
      if (pressed) session.escape()
      return
    }
    if (session.state === 'menu') {
      if (!pressed) return
      if (event.code === 'ArrowUp' || event.code === 'KeyW') session.menuUp()
      else if (event.code === 'ArrowDown' || event.code === 'KeyS') session.menuDown()
      else if (event.code === 'Enter') session.menuConfirm()
      return
    }
    if (session.state === 'playing') {
      const inputs = session.inputs
      switch (event.code) {
        case 'ArrowLeft':
        case 'KeyA':
          inputs.rotateLeft = pressed
          break
        case 'ArrowRight':
        case 'KeyD':
          inputs.rotateRight = pressed
          break
        case 'ArrowUp':
        case 'KeyW':
          inputs.thrust = pressed
          break
        case 'Space':
          inputs.fire = pressed
          break
        case 'KeyX':
          inputs.hyperspace = pressed
          break
        case 'Enter':
          inputs.enter = pressed
          inputs.start = pressed
          break
      }
    }
  }
}
```

- [ ] **Step 2: Type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/minigame/cabinet/ArcadeCabinetInput.ts
git commit -m "feat(arcade): ArcadeCabinetInput captures keys while engaged"
```

---

## Task 9: HabitatArcadeMachineModel — screen submesh + texture hook + pose

**Files:**
- Modify: `src/three/HabitatArcadeMachineModel.ts`

The cabinet GLB contains a screen plane mesh. We don't know the exact name yet; the implementation logs every mesh name on first load and picks the screen by a regex (with override hook).

- [ ] **Step 1: Add screen-mesh detection + texture hook**

In `HabitatArcadeMachineModel`:

1. Add a private field `private screenMesh: THREE.Mesh | null = null`.
2. Add named constants near the existing ones:
   ```ts
   /** Regex used to pick the cabinet screen submesh by name. Override via setScreenMesh if wrong. */
   const ARCADE_SCREEN_MESH_NAME_PATTERN = /screen|display|crt|monitor/i
   /** Emissive intensity for the screen submesh once a live texture is bound. */
   const ARCADE_SCREEN_EMISSIVE_INTENSITY = 1.0
   ```
3. At the end of `load()` (after the `this.inner = inner` line), add:
   ```ts
   this.screenMesh = this.findScreenMesh(inner)
   if (!this.screenMesh && import.meta.env.DEV) {
     const names: string[] = []
     inner.traverse((c) => {
       if (c instanceof THREE.Mesh) names.push(c.name || '<unnamed>')
     })
     console.warn(
       '[HabitatArcadeMachineModel] No screen submesh matched',
       ARCADE_SCREEN_MESH_NAME_PATTERN,
       '— available mesh names:',
       names,
     )
   }
   ```
4. Add the helper:
   ```ts
   private findScreenMesh(root: THREE.Object3D): THREE.Mesh | null {
     let found: THREE.Mesh | null = null
     root.traverse((child) => {
       if (found || !(child instanceof THREE.Mesh)) return
       if (ARCADE_SCREEN_MESH_NAME_PATTERN.test(child.name)) found = child
     })
     return found
   }
   ```
5. Add the public hook:
   ```ts
   /**
    * Replace the screen submesh's material map with the supplied texture and
    * wire it as a self-emissive map so it reads under cabin lighting.
    *
    * @param texture - CanvasTexture supplied by ArcadeScreenRenderer.
    * @returns true if the texture was bound.
    */
   setScreenTexture(texture: THREE.Texture): boolean {
     const mesh = this.screenMesh
     if (!mesh) return false
     const mat = mesh.material as THREE.MeshStandardMaterial
     mat.map = texture
     mat.emissiveMap = texture
     mat.emissive = new THREE.Color(0xffffff)
     mat.emissiveIntensity = ARCADE_SCREEN_EMISSIVE_INTENSITY
     mat.needsUpdate = true
     return true
   }

   /**
    * Eye+target poses suitable for a close-use camera lerp.
    *
    * @returns World-space position of the screen center, plus a forward-facing
    *   eye offset 1.1 m in front of the cabinet at the screen's height. Returns
    *   null until the GLB has loaded.
    */
   screenWorldPose(): { eye: THREE.Vector3; target: THREE.Vector3 } | null {
     const mesh = this.screenMesh
     if (!mesh) return null
     mesh.updateMatrixWorld(true)
     const target = new THREE.Vector3()
     mesh.getWorldPosition(target)
     const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion)
     const eye = target.clone().add(forward.multiplyScalar(1.1))
     return { eye, target }
   }
   ```

- [ ] **Step 2: Type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: clean.

- [ ] **Step 3: Manual smoke**

Run: `bun dev`. Walk to the arcade machine. Open devtools console; if the screen mesh name doesn't match the regex, the dev-warn lists every available mesh name. Pick the right name — either rename the regex, or add a fallback exact-name string to `findScreenMesh` (e.g., `child.name === 'CRT_Screen' || ARCADE_SCREEN_MESH_NAME_PATTERN.test(child.name)`). Confirm `setScreenTexture` returns true.

- [ ] **Step 4: Commit**

```bash
git add src/three/HabitatArcadeMachineModel.ts
git commit -m "feat(arcade): expose screen submesh hook + close-use pose on cabinet model"
```

---

## Task 10: HabitatInteriorScene — own session + arcade-look sequence + F-prompt route

**Files:**
- Modify: `src/three/HabitatInteriorScene.ts`

Mirrors the existing `tableSequenceActive`/`tickTableLookSequence` pattern for the cabinet. Adds session ownership and per-frame tick.

- [ ] **Step 1: Add named constants near the table-look constants (~ line 870)**

```ts
/** Lerp factor (per second) for the camera turn when engaging the arcade cabinet. */
const ARCADE_CAMERA_TURN_RATE = 7.5
/** Total seconds the arcade engage camera-turn sequence lasts. */
const ARCADE_CAMERA_TURN_DURATION_S = 0.55
/** Logical pixel width of the arcade screen offscreen canvas. */
const ARCADE_SCREEN_WIDTH = 640
/** Logical pixel height of the arcade screen offscreen canvas. */
const ARCADE_SCREEN_HEIGHT = 480
```

- [ ] **Step 2: Add imports at the top of the file**

```ts
import { ArcadeCabinetInput } from '@/lib/minigame/cabinet/ArcadeCabinetInput'
import { ArcadeCabinetSession } from '@/lib/minigame/cabinet/ArcadeCabinetSession'
import { ArcadeRomRegistry } from '@/lib/minigame/cabinet/ArcadeRomRegistry'
import { ArcadeScreenRenderer } from '@/lib/minigame/cabinet/ArcadeScreenRenderer'
import { createAsteroidsRom } from '@/lib/minigame/arcadeAsteroids/AsteroidsRom'
import arcadeRomCatalog from '@/data/arcade-roms.json'
```

- [ ] **Step 3: Declare the session fields next to the existing arcade fields (~ line 1090)**

```ts
private arcadeRenderer: ArcadeScreenRenderer | null = null
private arcadeSession: ArcadeCabinetSession | null = null
private readonly arcadeInput = new ArcadeCabinetInput()
private arcadeSequenceActive = false
private arcadeSequenceTime = 0
```

- [ ] **Step 4: Build the session inside `loadArcadeMachineAsync()` after `this.scene.add(this.arcadeMachine.group)` (~ line 1833)**

```ts
this.arcadeRenderer = new ArcadeScreenRenderer()
const registry = new ArcadeRomRegistry(arcadeRomCatalog, { asteroids: createAsteroidsRom })
this.arcadeSession = new ArcadeCabinetSession({
  registry,
  width: ARCADE_SCREEN_WIDTH,
  height: ARCADE_SCREEN_HEIGHT,
  storage: typeof window === 'undefined' ? null : window.localStorage,
  renderer: this.arcadeRenderer,
})
this.arcadeMachine.setScreenTexture(this.arcadeRenderer.texture)
this.arcadeInput.attach(this.arcadeSession)
```

- [ ] **Step 5: Tick the session in the existing per-frame `tick(dt)` near other appliance ticks**

```ts
this.arcadeSession?.tick(dt)
```

- [ ] **Step 6: Mirror the table-look sequence pair for the arcade**

```ts
private startArcadeLookSequence(): void {
  this.arcadeSequenceActive = true
  this.arcadeSequenceTime = 0
  this.arcadeSession?.engage()
}

private tickArcadeLookSequence(dt: number): boolean {
  if (!this.arcadeSequenceActive) return false
  this.arcadeSequenceTime += dt
  const session = this.arcadeSession
  const pose = this.arcadeMachine.screenWorldPose()
  if (pose) {
    const cam = this.fpsCamera.camera
    const dx = pose.target.x - cam.position.x
    const dy = pose.target.y - cam.position.y
    const dz = pose.target.z - cam.position.z
    const horiz = Math.hypot(dx, dz)
    if (horiz > 1e-4) {
      const desiredYaw = Math.atan2(-dx, -dz)
      const desiredPitch = Math.atan2(dy, horiz)
      const k = Math.min(1, ARCADE_CAMERA_TURN_RATE * dt)
      let yawErr = desiredYaw - this.fpsCamera.yaw
      while (yawErr > Math.PI) yawErr -= Math.PI * 2
      while (yawErr < -Math.PI) yawErr += Math.PI * 2
      this.fpsCamera.yaw += yawErr * k
      this.fpsCamera.pitch += (desiredPitch - this.fpsCamera.pitch) * k
      this.fpsCamera.pitch = Math.max(-HABITAT_PITCH_CLAMP, Math.min(HABITAT_PITCH_CLAMP, this.fpsCamera.pitch))
    }
  }
  if (this.arcadeSequenceTime >= ARCADE_CAMERA_TURN_DURATION_S) {
    this.arcadeSequenceActive = false
    session?.completeEngage()
  }
  return true
}
```

- [ ] **Step 7: Wire the arcade tick into the same place `tickTableLookSequence` is called from `tick()`**

Find the existing call (search for `tickTableLookSequence`) and add a sibling call:

```ts
if (this.tickTableLookSequence(dt) || this.tickArcadeLookSequence(dt)) {
  // movement suppressed during cinematic
  return
}
```

(Replace the existing `if (this.tickTableLookSequence(dt))` block with the combined check; preserve the surrounding logic.)

- [ ] **Step 8: Route the F-prompt at the cabinet to the new sequence**

Find the existing `tickInteraction` branch where `target === 'arcade'` triggers `this.onInteract?.('arcade')`. Replace the call with:

```ts
this.startArcadeLookSequence()
```

(Remove `onInteract('arcade')`. The cabinet no longer signals out — the session is owned in-scene.)

- [ ] **Step 9: Suppress prompts + movement while engaged**

Near the top of `tickInteraction()`, after the `hatchExitActive` early-return, add:

```ts
if (this.arcadeSession?.isEngaged()) return
```

In `tick()` where movement is gated by `tableSequenceActive`, OR in the same sentinel:

```ts
if (this.arcadeSession?.isEngaged()) {
  // Arcade owns input + camera. Skip player movement and other interaction logic.
  this.arcadeSession.tick(dt)
  return
}
```

(Place this **before** the table-sequence branch but **after** the existing hatch branch; mirror the existing pattern. Verify by reading the surrounding `tick()` code; do not remove existing logic.)

- [ ] **Step 10: Disengage path — listen for the session leaving menu state**

After the `this.arcadeSession?.tick(dt)` line where it's called normally, add:

```ts
if (this.arcadeSession?.state === 'disengaging') {
  this.arcadeSession.completeDisengage()
}
```

(Camera tween-out is omitted for now — disengage is instant per Q5/Q6 baby-step. We can add a reverse `tickArcadeLookSequence` later if it feels too snappy.)

- [ ] **Step 11: Dispose**

In `dispose()` near the existing `this.scene.remove(this.arcadeMachine.group)`:

```ts
this.arcadeInput.detach()
this.arcadeRenderer?.dispose()
this.arcadeRenderer = null
this.arcadeSession = null
```

- [ ] **Step 12: Type-check + lint + tests**

Run: `bun run type-check && bun run lint && bun test:unit`
Expected: all clean.

- [ ] **Step 13: Manual smoke (golden path)**

Run: `bun dev`. Walk into the habitat → cabinet shows live attract. Press F at the cabinet → camera tilts toward the screen, menu appears with ASTEROIDS highlighted. Enter starts a run, controls work. Esc returns to menu. Esc again returns control to FPS movement. Habitat hotkeys (H/M/etc.) do not fire while engaged.

- [ ] **Step 14: Commit**

```bash
git add src/three/HabitatInteriorScene.ts
git commit -m "feat(arcade): wire cabinet session into habitat scene with F-prompt engage"
```

---

## Task 11: Drop the DOM overlay from MapView / Controller / Facade

**Files:**
- Modify: `src/lib/map/habitat/MapHabitatFacade.ts`
- Modify: `src/views/MapViewController.ts`
- Modify: `src/views/MapView.vue`
- Modify: `src/assets/css/main.css`

- [ ] **Step 1: `MapHabitatFacade.ts` — remove `onArcade`**

- Delete the `onArcade?: (visible: boolean) => void` field from the `MapHabitatFacadeCallbacks` interface (line ~107-108).
- Inside `tickInteraction` (or wherever `target === 'arcade'`), delete the entire branch — the F-prompt is now consumed inside `HabitatInteriorScene.tickInteraction` directly. Confirm no other reference remains.
- Delete the `deps.callbacks.onArcade?.(false)` call in the leave-habitat path (line ~579).

- [ ] **Step 2: `MapViewController.ts` — drop the field and plumbing**

- Delete the `onArcade: ((visible: boolean) => void) | null = null` field (line ~639).
- Delete the `onArcade: (visible) => this.onArcade?.(visible),` line in the facade construction block (line ~1025).

- [ ] **Step 3: `MapView.vue` — drop the overlay**

- Remove the import: `import ArcadeAsteroidsOverlay from '@/components/ArcadeAsteroidsOverlay.vue'` (line ~20).
- Remove the `arcadeVisible` ref (line ~366).
- Remove the `viewController.onArcade = (visible) => { arcadeVisible.value = visible }` block (line ~976).
- Remove the `closeArcadeAsteroids()` function (line ~1306).
- Remove the `<ArcadeAsteroidsOverlay :visible="arcadeVisible" @close="closeArcadeAsteroids" />` element (line ~2041).
- Remove `&& !arcadeVisible` from the two `:visible="…"` predicates that referenced it (lines ~2257, ~2263).

- [ ] **Step 4: `main.css` — drop the overlay CSS import**

Find the `@import './arcade-asteroids-overlay.css'` line (or `@import url('./arcade-asteroids-overlay.css')`) and delete it.

- [ ] **Step 5: Type-check + lint + tests**

Run: `bun run type-check && bun run lint && bun test:unit`
Expected: clean.

- [ ] **Step 6: Manual smoke**

Run: `bun dev`. Confirm the cabinet still works end-to-end (Task 10 path) and there is no DOM overlay flicker on F-press.

- [ ] **Step 7: Commit**

```bash
git add src/lib/map/habitat/MapHabitatFacade.ts src/views/MapViewController.ts src/views/MapView.vue src/assets/css/main.css
git commit -m "refactor(arcade): drop DOM overlay; cabinet session owns engage flow"
```

---

## Task 12: Delete the obsolete overlay components and superseded spec

**Files (all deleted):**
- `src/components/ArcadeAsteroidsOverlay.vue`
- `src/components/ArcadeAsteroidsCanvas.vue`
- `src/components/ArcadeAsteroidsOverlayController.ts`
- `src/components/__tests__/ArcadeAsteroidsOverlayController.spec.ts`
- `src/assets/css/arcade-asteroids-overlay.css`
- `docs/superpowers/specs/2026-05-09-arcade-asteroids-design.md`

- [ ] **Step 1: Delete the files**

```bash
rm src/components/ArcadeAsteroidsOverlay.vue \
   src/components/ArcadeAsteroidsCanvas.vue \
   src/components/ArcadeAsteroidsOverlayController.ts \
   src/components/__tests__/ArcadeAsteroidsOverlayController.spec.ts \
   src/assets/css/arcade-asteroids-overlay.css \
   docs/superpowers/specs/2026-05-09-arcade-asteroids-design.md
```

- [ ] **Step 2: Type-check + lint + tests**

Run: `bun run type-check && bun run lint && bun test:unit`
Expected: clean. (If any stale import survives from Task 11, fix it now.)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(arcade): remove DOM overlay sources + superseded spec"
```

---

## Task 13: Final acceptance

- [ ] **Step 1: Full pipeline**

Run: `bun run type-check && bun run lint && bun test:unit`
Expected: all clean. Lint must be 0 errors and 0 warnings.

- [ ] **Step 2: Manual end-to-end (golden path)**

Run: `bun dev`.

1. Walk into the habitat. Cabinet screen shows live attract.
2. Press F at cabinet. Camera tilts to screen. Menu appears, ASTEROIDS selected.
3. Enter. Run starts. Score / lives / wave update. Thrust + fire + hyperspace work.
4. Take a hit until game over. Press Enter. Run restarts.
5. Esc. Returns to menu. Esc again. Returns to free roam, FPS controls restored.
6. While engaged, press H. Habitat-exit hotkey does **not** fire.
7. Stand under Sushi (if perched on cabinet). She continues her routine — unaffected.

- [ ] **Step 3: Verify no regressions in other views**

- `/level` still loads (the lander + EVA flow).
- `/map` solar map still loads.
- The observatory (telescope) still opens.

- [ ] **Step 4: No commit needed unless fixes were made.**

---

## Open Items / Risks (carry-forward)

- **Screen submesh name.** First `bun dev` after Task 9 will print every cabinet mesh name to the console if the regex misses. Real name lands in code via the fallback string in Task 9 step 3.
- **Texture readability.** Logical 640×480 may need bumping to 800×600 if the bezel reads small or blurry. Constants are named for one-line edits.
- **Disengage tween.** Currently snaps. If it feels jarring, mirror Task 10 step 6 in reverse with a `disengaging` branch.
