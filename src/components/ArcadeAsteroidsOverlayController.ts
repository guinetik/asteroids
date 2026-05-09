/**
 * Vue-facing controller for the habitat arcade Asteroids overlay.
 *
 * @author guinetik
 * @date 2026-05-09
 * @spec docs/superpowers/specs/2026-05-09-arcade-asteroids-design.md
 */

import { ref, type Ref } from 'vue'
import {
  ASTEROIDS_IDLE_INPUTS,
  AsteroidsGame,
} from '@/lib/minigame/arcadeAsteroids/AsteroidsGame'
import type {
  AsteroidsGameOptions,
  AsteroidsGameState,
  AsteroidsInputs,
  RandomSource,
} from '@/lib/minigame/arcadeAsteroids/types'

/** Storage key for the local arcade high score. */
export const ARCADE_ASTEROIDS_HIGH_SCORE_KEY = 'asteroid-lander-arcade-asteroids-high-score-v1'

/** Minimal storage surface used by the overlay controller. */
export interface ArcadeAsteroidsStorage {
  /** Read a string value by key. */
  getItem: (key: string) => string | null
  /** Store a string value by key. */
  setItem: (key: string, value: string) => void
  /** Remove a value by key. */
  removeItem: (key: string) => void
}

/** Constructor dependencies for {@link ArcadeAsteroidsOverlayController}. */
export interface ArcadeAsteroidsOverlayControllerOptions {
  /** Optional storage provider. Defaults to `window.localStorage` when available. */
  storage?: ArcadeAsteroidsStorage | null
  /** Optional deterministic random source for tests. */
  random?: RandomSource
}

/** Event side-effects needed to keep arcade controls from leaking to habitat input. */
export interface ArcadeAsteroidsKeyboardEventControls {
  /** Prevent browser defaults such as page scroll on space/arrow keys. */
  preventDefault: () => void
  /** Stop the event before the habitat's window-level InputManager sees it. */
  stopPropagation: () => void
}

const DEFAULT_WIDTH = 800
const DEFAULT_HEIGHT = 600
const MAX_STORED_SCORE = 9999990
const HABITAT_EXIT_KEY = 'KeyH'
const RESERVED_ARCADE_KEYS = new Set(['KeyS'])

/**
 * Bridge between Vue overlay input/rendering and the pure {@link AsteroidsGame}
 * simulation.
 */
export class ArcadeAsteroidsOverlayController {
  /** Mutable input bag consumed by the simulation each frame. */
  readonly inputs: AsteroidsInputs = { ...ASTEROIDS_IDLE_INPUTS }

  /** Reactive state snapshot rendered by Vue/canvas. */
  readonly snapshot: Ref<AsteroidsGameState>

  /** Reactive locally persisted high score. */
  readonly highScore: Ref<number>

  private readonly storage: ArcadeAsteroidsStorage | null
  private readonly random?: RandomSource
  private game: AsteroidsGame

  /**
   * Build an overlay controller.
   *
   * @param options - Optional storage and deterministic RNG dependencies.
   */
  constructor(options: ArcadeAsteroidsOverlayControllerOptions = {}) {
    this.storage = options.storage === undefined ? getBrowserStorage() : options.storage
    this.random = options.random
    const loadedHighScore = this.loadHighScore()
    this.highScore = ref(loadedHighScore)
    this.game = this.createGame(DEFAULT_WIDTH, DEFAULT_HEIGHT, loadedHighScore)
    this.snapshot = ref(this.game.snapshot())
  }

  /**
   * Resize the simulation viewport. Starts a fresh attract-state cabinet screen.
   *
   * @param width - Canvas width in CSS pixels.
   * @param height - Canvas height in CSS pixels.
   */
  resize(width: number, height: number): void {
    const nextWidth = Math.max(1, Math.round(width))
    const nextHeight = Math.max(1, Math.round(height))
    const current = this.game.snapshot()
    if (current.width === nextWidth && current.height === nextHeight) return
    this.game = this.createGame(nextWidth, nextHeight, this.highScore.value)
    this.snapshot.value = this.game.snapshot()
  }

  /**
   * Advance the game one frame and refresh the reactive snapshot.
   *
   * @param dt - Delta time in seconds.
   */
  tick(dt: number): void {
    this.game.tick(dt, this.inputs)
    this.snapshot.value = this.game.snapshot()
    this.persistHighScoreFromGame()
  }

  /** Start or restart a run from the overlay start button. */
  start(): void {
    this.game.startRun()
    this.snapshot.value = this.game.snapshot()
  }

  /**
   * Restore a known state. This is used by tests and would also support future
   * save-state/attract-sequence work.
   *
   * @param state - State to load into a new simulation instance.
   */
  replaceStateForRestore(state: AsteroidsGameState): void {
    this.game = this.createGame(state.width, state.height, state.highScore, state)
    this.snapshot.value = this.game.snapshot()
  }

  /** Persist the current game high score if it beats the stored value. */
  persistHighScoreFromGame(): void {
    const score = Math.max(this.highScore.value, this.snapshot.value.highScore)
    if (score <= this.highScore.value) return
    this.highScore.value = score
    this.storage?.setItem(ARCADE_ASTEROIDS_HIGH_SCORE_KEY, String(score))
  }

  /** Clear the local high score and reset the current cabinet attract state. */
  resetHighScore(): void {
    this.highScore.value = 0
    this.storage?.removeItem(ARCADE_ASTEROIDS_HIGH_SCORE_KEY)
    const current = this.game.snapshot()
    this.game = this.createGame(current.width, current.height, 0)
    this.snapshot.value = this.game.snapshot()
  }

  /**
   * Convert a keyboard down event into held inputs.
   *
   * @param event - Browser keyboard event.
   * @param controls - Optional event side-effect hooks for tests.
   */
  handleKeydown(
    event: KeyboardEvent,
    controls: ArcadeAsteroidsKeyboardEventControls = event,
  ): void {
    if (!this.setInputForCode(event.code, true)) return
    controls.preventDefault()
    controls.stopPropagation()
  }

  /**
   * Convert a keyboard up event into released inputs.
   *
   * @param event - Browser keyboard event.
   * @param controls - Optional event side-effect hooks for tests.
   */
  handleKeyup(event: KeyboardEvent, controls: ArcadeAsteroidsKeyboardEventControls = event): void {
    if (!this.setInputForCode(event.code, false)) return
    controls.preventDefault()
    controls.stopPropagation()
  }

  /** Clear held inputs when the overlay closes or loses focus. */
  clearInputs(): void {
    Object.assign(this.inputs, ASTEROIDS_IDLE_INPUTS)
  }

  private createGame(
    width: number,
    height: number,
    highScore: number,
    initialState?: AsteroidsGameState,
  ): AsteroidsGame {
    const options: AsteroidsGameOptions = {
      width,
      height,
      highScore,
      initialState,
    }
    if (this.random) options.random = this.random
    return new AsteroidsGame(options)
  }

  private loadHighScore(): number {
    const raw = this.storage?.getItem(ARCADE_ASTEROIDS_HIGH_SCORE_KEY)
    if (!raw) return 0
    const parsed = Number.parseInt(raw, 10)
    if (!Number.isFinite(parsed)) return 0
    return Math.max(0, Math.min(MAX_STORED_SCORE, parsed))
  }

  private setInputForCode(code: string, pressed: boolean): boolean {
    switch (code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.inputs.rotateLeft = pressed
        return true
      case 'ArrowRight':
      case 'KeyD':
        this.inputs.rotateRight = pressed
        return true
      case 'ArrowUp':
      case 'KeyW':
        this.inputs.thrust = pressed
        return true
      case 'Space':
        this.inputs.fire = pressed
        return true
      case 'KeyX':
        this.inputs.hyperspace = pressed
        return true
      case HABITAT_EXIT_KEY:
        return true
      case 'Enter':
        this.inputs.start = pressed
        return true
      default:
        return RESERVED_ARCADE_KEYS.has(code)
    }
  }
}

/** Resolve browser localStorage when available and accessible. */
function getBrowserStorage(): ArcadeAsteroidsStorage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}
