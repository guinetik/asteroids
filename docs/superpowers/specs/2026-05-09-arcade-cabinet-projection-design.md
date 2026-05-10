# Arcade Cabinet Projection & ROM System

- **Author:** guinetik
- **Date:** 2026-05-09
- **Status:** Approved
- **Supersedes:** `docs/superpowers/specs/2026-05-09-arcade-asteroids-design.md` (DOM overlay variant)

## Goal

Replace the DOM overlay arcade with an in-world cabinet. The selected ROM is rendered into an offscreen 2D canvas, uploaded each frame as a `THREE.CanvasTexture` mapped onto the habitat arcade cabinet's screen submesh. The player engages the cabinet with F (telescope-style camera push-in), picks a ROM from a boot menu, and plays. ESC unwinds the session.

This delivers the actual arcade feel (pixel-perfect on the cabinet bezel, attract loop running ambiently) and removes the projection-transition problem entirely.

## Non-goals

- Sushi (cat) behavior changes — she keeps her routine and may remain perched on the cabinet during play.
- Touch / mobile input.
- Per-ROM scoreboard UI beyond local high score persistence.
- A second ROM. The system is built ROM-pluggable; only Asteroids ships.

## User Flow

1. Player walks into the habitat. Cabinet's screen shows Asteroids' attract loop, drifting asteroids, "PRESS START" flashing. This is live, not a static image.
2. Player approaches and gets the existing F prompt at the cabinet.
3. F → camera tweens to the cabinet's close-use pose. FPS controls suspend. Habitat input keys (F/H/M/etc.) are blocked while engaged.
4. Cabinet draws a "SELECT GAME" menu inside the canvas. Currently lists only ASTEROIDS. Up/Down navigates, ENTER selects.
5. ENTER → ROM enters its own attract phase (the existing `AsteroidsGame` flow), ENTER again starts a run. SCORE / HIGH / LIVES / WAVE are drawn into the canvas.
6. ESC during play → returns to menu. ESC at menu → camera tweens back, FPS controls resume.

## Architecture

### State machine — `ArcadeCabinetSession`

Lives in `src/lib/minigame/cabinet/ArcadeCabinetSession.ts`. Pure TS, no Vue/Three deps beyond the renderer it owns.

States:

- `idle` — selected ROM ticks its attract loop and renders into the cabinet texture every frame. No input capture, no camera change. Session begins here on habitat boot.
- `engaging` — camera tween to close-use pose is in flight. Inputs locked out (no arcade input yet, FPS already suspended). Resolves to `menu`.
- `menu` — canvas draws ROM list. Inputs: Up/Down, Enter, Esc.
- `playing` — selected ROM ticks + draws. Inputs forwarded to ROM. Esc returns to `menu`.
- `disengaging` — camera tween back. Esc/inputs ignored. Resolves to `idle`.

Transitions are explicit: `engage()`, `selectRom(id)`, `exitToMenu()`, `disengage()`. Only valid transitions are accepted; the rest are no-ops with a single dev-warn.

### ROM contract — `src/lib/minigame/cabinet/types.ts`

```ts
export interface ArcadeRom {
  /** Tick the active run. Called only in `playing`. */
  tick(dt: number, inputs: ArcadeInputs): void
  /** Draw the active run into the offscreen canvas context. */
  render(ctx: CanvasRenderingContext2D, width: number, height: number): void
  /** Tick the attract loop. Called in `idle` and `menu`. */
  attractTick(dt: number): void
  /** Draw the attract loop. Called in `idle` and `menu` (under the menu in `menu`). */
  attractRender(ctx: CanvasRenderingContext2D, width: number, height: number): void
  /** Begin a fresh run from the menu. */
  start(): void
  /** Return to attract state (e.g., on disengage). */
  reset(): void
  /** Returns true once the current run has fully ended (game over acknowledged). */
  isRunComplete(): boolean
  /** Local high score for HUD; persistence handled by the ROM. */
  highScore(): number
  /** Optional HUD line for the cabinet header. */
  hudSnapshot(): RomHudSnapshot
}

export interface ArcadeInputs {
  rotateLeft: boolean
  rotateRight: boolean
  thrust: boolean
  fire: boolean
  hyperspace: boolean
  start: boolean
  // Menu navigation
  up: boolean
  down: boolean
  enter: boolean
}

export interface RomHudSnapshot {
  score: number
  highScore: number
  lives: number
  wave: number
  phaseLabel: string
}

export interface ArcadeRomDeps {
  /** Logical canvas width the ROM should target (matches the offscreen canvas). */
  width: number
  /** Logical canvas height. */
  height: number
  /** Local persistence; defaults to window.localStorage when available. */
  storage: ArcadeRomStorage | null
  /** Optional deterministic RNG for tests. */
  random?: () => number
  /** Metadata entry from arcade-roms.json (id, title, year, blurb, highScoreKey). */
  meta: RomMeta
}

export interface ArcadeRomStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type ArcadeRomFactory = (deps: ArcadeRomDeps) => ArcadeRom
```

### Registry — `ArcadeRomRegistry`

`src/lib/minigame/cabinet/ArcadeRomRegistry.ts`.

- Loads metadata from `src/data/arcade-roms.json`:
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
- A static `Map<string, ArcadeRomFactory>` registers factories by id at module-load time. New ROMs add a JSON entry + a factory registration.
- Throws on session construction if any JSON id has no registered factory (fail loud at dev time).

### Asteroids adapter — `AsteroidsRom`

`src/lib/minigame/arcadeAsteroids/AsteroidsRom.ts`. Thin wrapper around the existing `AsteroidsGame` and the existing high-score persistence (`ARCADE_ASTEROIDS_HIGH_SCORE_KEY`). The pure simulation in `AsteroidsGame.ts`, `config.ts`, `geometry.ts`, `rng.ts`, `types.ts` is **unchanged**.

The adapter:
- Owns the `AsteroidsGame` instance built at the cabinet's offscreen canvas size.
- Exposes `attractTick`/`attractRender` by ticking the game with `ASTEROIDS_IDLE_INPUTS` and drawing it. (The game's `attract` phase already handles this.)
- Persists high score via the same `localStorage` key, keyed off the registry metadata's `highScoreKey`.
- `start()` calls `game.startRun()`.

### Renderer — `ArcadeScreenRenderer`

`src/lib/minigame/cabinet/ArcadeScreenRenderer.ts`.

- Owns a single offscreen `HTMLCanvasElement` at fixed logical size **640 × 480** (a CRT-ish 4:3 chunk that's readable on the cabinet bezel without overcommitting GPU bandwidth). Constants are named.
- Owns the `THREE.CanvasTexture`. Settings: `minFilter = NearestFilter`, `magFilter = NearestFilter`, `generateMipmaps = false`, `colorSpace = SRGBColorSpace`. Sets `needsUpdate = true` each frame the canvas is dirty.
- `render(state, rom)` is called by the session every frame:
  - Clears canvas.
  - Draws ROM (attract or play).
  - In `menu`, overlays the menu on top of the attract render.
  - Always draws the HUD strip.
- Pure: knows nothing about Three.js scene wiring beyond the texture it produces. The cabinet model consumes the texture.

### HUD — `RetroHud`

`src/lib/minigame/cabinet/RetroHud.ts`. Draws the top strip (SCORE / HIGH / LIVES / WAVE / MODE) and bottom hint line directly into the offscreen canvas. Reuses the Datatype font that the existing `drawMessage` already pulls in. Centralized so each ROM doesn't reinvent it.

### Cabinet model — `HabitatArcadeMachineModel` changes

- After GLTF load, look up the screen submesh by name (the cabinet GLTF has a flat plane for the screen — name to be confirmed during implementation; fall back to a name match on `/screen|display|crt/i` and dev-warn if not found).
- Expose `setScreenTexture(tex: THREE.Texture): void`. Replaces the submesh material's map with the provided texture, sets `material.emissiveMap = tex`, `emissive = white`, `emissiveIntensity ~ 1.0` so the screen self-illuminates in the dim habitat.
- Emit a `screenWorldPose` (eye target + look-at) for the camera close-use tween.

### Habitat scene wiring — `HabitatInteriorScene`

- Construct `ArcadeCabinetSession` once on scene init. Pass it the registry, the renderer, and the cabinet model.
- After arcade GLTF resolves: `arcadeMachine.setScreenTexture(renderer.texture)`, then `session.start()` (enters `idle`).
- In the existing per-frame update, call `session.tick(dt)`. Cheap when `idle` (one ROM attract tick + one canvas draw + one texture upload).
- The F-prompt path that today opens the overlay (the `MapHabitatFacade` callback `onArcade(true)` from `'arcade'` target) instead calls `session.engage()`.
- A `session.isEngaged()` flag is queried by the FPS controller to suspend movement and by the habitat input layer to suppress global hotkeys (F/H/M/etc.) while engaged. ESC during a session is handled inside the session, not by the habitat input layer.

### Camera tween

Reuse the same close-use tween helper used by the telescope. Pose is computed once on cabinet load: eye = a fixed offset in front of the cabinet at the screen's height; look-at = the screen submesh center.

### Input

`src/lib/minigame/cabinet/ArcadeCabinetInput.ts`.

- Window-level keydown/keyup, registered when entering `menu`, removed on `disengage`.
- For every recognized arcade key (Arrows, WASD, Space, Enter, KeyX, Esc): `event.preventDefault()` + `event.stopImmediatePropagation()`. Same defense the current overlay controller uses.
- ESC is special: routed straight to the session (`playing` → `menu`, `menu` → `disengage()`), not to the ROM.
- Maintains the same `AsteroidsInputs` mapping the existing controller has, plus `up/down/enter` for the menu.

## Data Flow

```
window keydown/up
  └─► ArcadeCabinetInput  (only while engaged)
        └─► ArcadeCabinetSession
              ├─► (Esc) state transitions
              └─► (rest) ArcadeRom.tick / menu nav

scene RAF
  └─► HabitatInteriorScene.tick(dt)
        └─► ArcadeCabinetSession.tick(dt)
              ├─► ROM.attractTick or ROM.tick
              └─► ArcadeScreenRenderer.render(state, rom)
                    └─► offscreen canvas → CanvasTexture.needsUpdate = true
                          └─► cabinet screen submesh material.map
```

## Files

### Added

- `src/lib/minigame/cabinet/types.ts`
- `src/lib/minigame/cabinet/ArcadeCabinetSession.ts`
- `src/lib/minigame/cabinet/ArcadeRomRegistry.ts`
- `src/lib/minigame/cabinet/ArcadeScreenRenderer.ts`
- `src/lib/minigame/cabinet/ArcadeCabinetInput.ts`
- `src/lib/minigame/cabinet/RetroHud.ts`
- `src/lib/minigame/cabinet/__tests__/ArcadeCabinetSession.spec.ts`
- `src/lib/minigame/cabinet/__tests__/ArcadeRomRegistry.spec.ts`
- `src/lib/minigame/arcadeAsteroids/AsteroidsRom.ts`
- `src/lib/minigame/arcadeAsteroids/__tests__/AsteroidsRom.spec.ts`
- `src/data/arcade-roms.json`

### Deleted

- `src/components/ArcadeAsteroidsOverlay.vue`
- `src/components/ArcadeAsteroidsCanvas.vue`
- `src/components/ArcadeAsteroidsOverlayController.ts`
- `src/components/__tests__/ArcadeAsteroidsOverlayController.spec.ts`
- `src/assets/css/arcade-asteroids-overlay.css`
- `docs/superpowers/specs/2026-05-09-arcade-asteroids-design.md` (superseded; replaced by this doc)

### Changed

- `src/three/HabitatInteriorScene.ts` — own session, drive tick, expose engaged flag, route F-prompt to `session.engage()`, suspend FPS movement while engaged.
- `src/three/HabitatArcadeMachineModel.ts` — locate screen submesh, `setScreenTexture`, expose `screenWorldPose`.
- `src/lib/map/habitat/MapHabitatFacade.ts` — remove `onArcade` overlay callback entirely. The cabinet F-prompt routes directly to `HabitatInteriorScene`, which calls `session.engage()`. Habitat input suspension is gated on `session.isEngaged()`, no facade callback needed.
- `src/views/MapViewController.ts` — drop `onArcade` plumbing.
- `src/views/MapView.vue` — drop `<ArcadeAsteroidsOverlay>` mount, drop `arcadeVisible` ref, remove `arcade-asteroids-overlay.css` import gating.
- `src/assets/css/main.css` — remove overlay CSS import.

## Testing

Pure-TS targets only (per ground rule 2):

- `ArcadeCabinetSession.spec.ts` — state transitions; engage from idle; menu Up/Down wraps; selectRom transitions to playing; Esc playing→menu; Esc menu→disengaging; disengage transitions to idle; invalid transitions are no-ops; tick routes to the right ROM hook per state.
- `ArcadeRomRegistry.spec.ts` — JSON loads; missing factory fails loud; duplicate ids fail loud; lookup by id works.
- `AsteroidsRom.spec.ts` — adapter delegates to `AsteroidsGame`; high score persists via injected storage; attract vs. play hooks call the right `AsteroidsGame` paths.

No new tests for `ArcadeScreenRenderer` (canvas drawing), `ArcadeCabinetInput` (DOM events), or scene wiring — those are integration surfaces consistent with the codebase's "test math/domain only" rule.

## Acceptance

- `bun run type-check` clean.
- `bun run lint` — 0 errors, 0 warnings.
- `bun run test:unit` — all green, including the new specs.
- Manual: walking into the habitat shows live attract on the cabinet; F at the cabinet pushes camera in and shows the SELECT GAME menu; ENTER on ASTEROIDS plays the game inside the cabinet bezel; ESC unwinds back to free roam; FPS movement and habitat hotkeys are suspended while engaged and restored on disengage.

## Risks / Open Questions

- **Screen submesh name.** The cabinet GLTF's screen plane name isn't confirmed in this spec. Implementation step one is to print the submesh names on load and pick the right one. Fallback regex match documented above; no behavior change if it lands first try.
- **Texture readability at oblique angles.** The 640×480 logical size is a guess. If the cabinet screen reads small or blurry from the close-use pose, we bump to 800×600. Constants are named so this is a one-line change.
- **Habitat input suspension surface.** The exact integration point for "block F/H/M/etc. while engaged" depends on how `MapHabitatFacade` and the FPS controller currently share state — confirmed during implementation; the session exposes `isEngaged()` as the single source of truth.
