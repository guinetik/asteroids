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
