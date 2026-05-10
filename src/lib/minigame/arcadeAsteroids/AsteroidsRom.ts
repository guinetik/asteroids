/**
 * Adapter that wraps the pure AsteroidsGame simulation as an ArcadeRom for the
 * cabinet system.
 *
 * @author guinetik
 * @date 2026-05-10
 * @spec docs/superpowers/specs/2026-05-09-arcade-cabinet-projection-design.md
 */
import type {
  ArcadeRom,
  ArcadeRomDeps,
  ArcadeRomFactory,
  ArcadeInputs,
  ArcadeRomEvent,
  RomHudSnapshot,
} from '@/lib/minigame/cabinet/types'
import { ASTEROIDS_IDLE_INPUTS, AsteroidsGame } from './AsteroidsGame'
import { drawAsteroidsScene } from './render'
import type { AsteroidsInputs } from './types'

/** Maximum score value that can be written to persistent storage. */
const MAX_STORED_SCORE = 9999990

/** Minimum score delta in one tick that counts as a saucer kill (= small-saucer score). */
const SAUCER_KILL_SCORE_MIN = 200

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
  let prevSaucerPresent = false
  let prevScore = 0
  let prevPhase: string = 'attract'
  const queue: ArcadeRomEvent[] = []

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

  /**
   * Diff the latest snapshot against the previous tick's state and push any
   * observable events ({@link ArcadeRomEvent}) onto the internal queue.
   *
   * Detection rules:
   * - `saucerKill` — previous tick had a saucer, this tick has none, AND the
   *   score rose by at least {@link SAUCER_KILL_SCORE_MIN} points.
   * - `runEnded` — phase transitions to `'gameOver'` for the first time (once
   *   per run).
   */
  function detectAndEnqueueEvents(): void {
    const s = game.snapshot()
    const saucerNow = s.saucer !== null && s.saucer !== undefined
    const scoreDelta = s.score - prevScore

    if (prevSaucerPresent && !saucerNow && scoreDelta >= SAUCER_KILL_SCORE_MIN) {
      queue.push({ type: 'event', eventId: 'saucerKill', score: s.score, wave: s.wave })
    }

    if (prevPhase !== 'gameOver' && s.phase === 'gameOver') {
      queue.push({ type: 'runEnded', score: s.score, wave: s.wave })
    }

    prevSaucerPresent = saucerNow
    prevScore = s.score
    prevPhase = s.phase
  }

  return {
    tick(dt: number, inputs: ArcadeInputs): void {
      const mapped = toAsteroidsInputs(inputs)
      lastThrust = mapped.thrust
      game.tick(dt, mapped)
      persistIfBeaten()
      detectAndEnqueueEvents()
    },
    render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
      drawAsteroidsScene(ctx, game.snapshot(), { width, height, thrust: lastThrust })
    },
    attractTick(dt: number): void {
      game.tick(dt, ASTEROIDS_IDLE_INPUTS)
      lastThrust = false
      persistIfBeaten()
      detectAndEnqueueEvents()
    },
    attractRender(ctx: CanvasRenderingContext2D, width: number, height: number): void {
      drawAsteroidsScene(ctx, game.snapshot(), { width, height, thrust: false })
    },
    start(): void {
      game.startRun()
      // Reset diff trackers so a freshly started run doesn't re-fire saucerKill
      // from leftover state, then enqueue runStarted with current snapshot stats.
      const s = game.snapshot()
      prevSaucerPresent = s.saucer !== null && s.saucer !== undefined
      prevScore = s.score
      prevPhase = s.phase
      queue.push({ type: 'runStarted', score: s.score, wave: s.wave })
    },
    reset(): void {
      // Rebuild the game from scratch — matches the existing
      // ArcadeAsteroidsOverlayController.resetHighScore() pattern.
      game = buildGame()
      lastThrust = false
      const s = game.snapshot()
      prevSaucerPresent = s.saucer !== null && s.saucer !== undefined
      prevScore = s.score
      prevPhase = s.phase
      queue.length = 0
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
    consumeEvents() {
      const out = queue.slice()
      queue.length = 0
      return out
    },
  }
}


