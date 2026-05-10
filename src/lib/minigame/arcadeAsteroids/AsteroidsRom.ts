/**
 * Adapter that wraps the pure AsteroidsGame simulation as an ArcadeRom for the
 * cabinet system.
 *
 * @author guinetik
 * @date 2026-05-10
 * @spec docs/superpowers/specs/2026-05-09-arcade-cabinet-projection-design.md
 */
import type { ArcadeRom, ArcadeRomDeps, ArcadeRomFactory, ArcadeInputs, RomHudSnapshot } from '@/lib/minigame/cabinet/types'
import { ASTEROIDS_IDLE_INPUTS, AsteroidsGame } from './AsteroidsGame'
import { drawAsteroidsScene } from './render'
import type { AsteroidsInputs } from './types'

/** Maximum score value that can be written to persistent storage. */
const MAX_STORED_SCORE = 9999990

/**
 * Map cabinet inputs → asteroids inputs.
 *
 * @param src - Generic cabinet input bag.
 * @returns Asteroids-specific input bag.
 */
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

/**
 * Translate an AsteroidsGame phase to the HUD label.
 *
 * @param phase - Raw phase string from the simulation.
 * @returns Short human-readable label shown in the cabinet HUD.
 */
function phaseLabel(phase: string): string {
  if (phase === 'attract') return 'ATTRACT'
  if (phase === 'playing') return 'PLAY'
  if (phase === 'respawning') return 'RESPAWN'
  return 'GAME OVER'
}

/**
 * Load and clamp the persisted high score from storage.
 *
 * @param storage - Persistence surface; null disables loading.
 * @param key - Storage key for the high score.
 * @returns Parsed score clamped to [0, MAX_STORED_SCORE], or 0 on any error.
 */
function loadHighScore(storage: ArcadeRomDeps['storage'], key: string): number {
  if (!storage) return 0
  const raw = storage.getItem(key)
  if (!raw) return 0
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(MAX_STORED_SCORE, parsed))
}

/**
 * Build the Asteroids ROM. Exposed as a named factory `createAsteroidsRom`
 * that the cabinet registry uses.
 *
 * @param deps - Cabinet-provided dependencies.
 * @returns A fully initialised ArcadeRom wrapping an AsteroidsGame instance.
 */
export const createAsteroidsRom: ArcadeRomFactory = (deps: ArcadeRomDeps): ArcadeRom => {
  const storage = deps.storage
  let highScore = loadHighScore(storage, deps.meta.highScoreKey)
  let lastThrust = false

  /** Construct a fresh AsteroidsGame using cabinet-provided dimensions and RNG. */
  function buildGame(): AsteroidsGame {
    return new AsteroidsGame({
      width: deps.width,
      height: deps.height,
      highScore,
      ...(deps.random ? { random: deps.random } : {}),
    })
  }

  let game = buildGame()

  /** Write the high score to storage if the current run beat it. */
  function persistIfBeaten(): void {
    const current = game.snapshot().highScore
    if (current <= highScore) return
    highScore = current
    if (storage) {
      storage.setItem(deps.meta.highScoreKey, String(Math.min(MAX_STORED_SCORE, highScore)))
    }
  }

  return {
    tick(dt: number, inputs: ArcadeInputs): void {
      const mapped = toAsteroidsInputs(inputs)
      lastThrust = mapped.thrust
      game.tick(dt, mapped)
      persistIfBeaten()
    },
    render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
      drawAsteroidsScene(ctx, game.snapshot(), { width, height, thrust: lastThrust })
    },
    attractTick(dt: number): void {
      game.tick(dt, ASTEROIDS_IDLE_INPUTS)
      lastThrust = false
      persistIfBeaten()
    },
    attractRender(ctx: CanvasRenderingContext2D, width: number, height: number): void {
      drawAsteroidsScene(ctx, game.snapshot(), { width, height, thrust: false })
    },
    start(): void {
      game.startRun()
    },
    reset(): void {
      // Rebuild the game from scratch — matches the existing
      // ArcadeAsteroidsOverlayController.resetHighScore() pattern.
      game = buildGame()
      lastThrust = false
    },
    isRunComplete(): boolean {
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


