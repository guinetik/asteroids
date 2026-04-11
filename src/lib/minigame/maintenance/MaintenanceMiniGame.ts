/**
 * Neptune solar panel maintenance minigame.
 *
 * Puzzle game: rotate orbital solar panels to redirect sunlight beams
 * toward highlighted surface targets on Neptune. Chain panels to reach
 * targets on the dark side. All targets illuminated = mission complete.
 *
 * Pure game logic — no DOM or canvas. The Vue component reads state
 * and renders.
 *
 * @author guinetik
 * @date 2026-04-11
 * @spec docs/superpowers/specs/2026-04-10-orbital-minigame-design.md
 */
import type {
  OrbitalMiniGame,
  OrbitalMiniGameContext,
  OrbitalMiniGameEvents,
  OrbitalMiniGameStatus,
  OrbitalMiniGameStep,
} from '../OrbitalMiniGame'
import type { SolarPanel, SurfaceTarget, LightBeam } from './types'
import { traceAllBeams } from './lightTracer'
import {
  NEPTUNE_X,
  NEPTUNE_Y,
  NEPTUNE_R,
  PANEL_POSITIONS,
  TARGET_COUNT,
  TIME_LIMIT,
  SUN_ORBIT_RADIUS,
} from './constants'

/**
 * Fixed target positions around the planet perimeter.
 *
 * Angle in radians from planet center (0 = right, PI/2 = bottom, PI = left).
 * 3 on each side, placed between the panel rows so light must be aimed carefully.
 * Left-side targets can receive direct sun-panel light.
 * Right-side targets need chains through the top or bottom.
 */
const TARGET_ANGLES: { angle: number; pulseOffset: number }[] = [
  // Left side (sun side) — between pole and equator
  { angle: Math.PI * 0.85, pulseOffset: 0 },
  { angle: Math.PI * 1.15, pulseOffset: 3.0 },
  // Right side (shadow side) — mirror positions
  { angle: -Math.PI * 0.15, pulseOffset: 4.5 },
  { angle: Math.PI * 0.15, pulseOffset: 0.8 },
]

/**
 * Neptune maintenance minigame — solar panel light-redirect puzzle.
 *
 * @author guinetik
 * @date 2026-04-11
 */
export class MaintenanceMiniGame implements OrbitalMiniGame, OrbitalMiniGameEvents {
  /** The shuttle mission id this minigame tracks. */
  readonly missionId: string

  /** Target alignment count — all targets must be lit. */
  readonly targetCount: number

  private _status: OrbitalMiniGameStatus = 'active'
  private readonly _steps: OrbitalMiniGameStep[] = [
    { label: 'Align solar panels', complete: false, active: true },
    { label: 'All targets illuminated', complete: false, active: false },
  ]

  /** Solar panels the player can rotate. */
  panels: SolarPanel[] = []

  /** Surface targets that need illumination. */
  targets: SurfaceTarget[] = []

  /** Traced light beams for rendering (recomputed each frame). */
  beams: LightBeam[] = []

  /** Currently selected panel index (-1 = none). */
  selectedPanel = -1

  /** Sun world X — randomized each game. */
  sunX: number
  /** Sun world Y — randomized each game. */
  sunY: number

  /** Time remaining (seconds). 0 = no limit. */
  timeRemaining: number

  /** Total time for display. */
  readonly timeTotal: number

  /** Number of targets currently lit. */
  targetsLit = 0

  /** Callback fired when the minigame completes successfully. */
  onComplete: ((missionId: string) => void) | null = null
  /** Callback fired when the step list changes. */
  onStepChange: ((steps: readonly OrbitalMiniGameStep[]) => void) | null = null

  /**
   * Create a new maintenance minigame.
   *
   * @param missionId - shuttle mission id
   * @param _gatherQuantity - unused for this puzzle type
   */
  constructor(missionId: string, _gatherQuantity: number) {
    this.missionId = missionId
    this.targetCount = TARGET_COUNT
    this.timeTotal = TIME_LIMIT
    this.timeRemaining = TIME_LIMIT
    // Random sun angle each game — anywhere around the scene
    const sunAngle = Math.random() * Math.PI * 2
    this.sunX = NEPTUNE_X + Math.cos(sunAngle) * SUN_ORBIT_RADIUS
    this.sunY = NEPTUNE_Y + Math.sin(sunAngle) * SUN_ORBIT_RADIUS
    this.initPanels()
    this.initTargets()
  }

  /** Current minigame status. */
  get status(): OrbitalMiniGameStatus {
    return this._status
  }

  /** Ordered steps for the tracker HUD. */
  get steps(): readonly OrbitalMiniGameStep[] {
    return this._steps
  }

  /** Progress numerator — targets lit. */
  get progressCurrent(): number {
    return this.targetsLit
  }

  /** Progress denominator — total targets. */
  get progressTotal(): number {
    return this.targetCount
  }

  /** Per-frame update. Retraces beams, checks win. */
  tick(dt: number, _ctx: OrbitalMiniGameContext): void {
    if (this._status !== 'active') return

    if (this.timeTotal > 0) {
      this.timeRemaining -= dt
    }

    // Retrace all light beams
    this.beams = traceAllBeams(this.panels, this.targets, this.sunX, this.sunY)

    // Count lit targets
    this.targetsLit = this.targets.filter((t) => t.lit).length

    this.checkEndConditions()
  }

  /** Select a panel by index. */
  selectPanel(index: number): void {
    if (this._status !== 'active') return
    if (index >= 0 && index < this.panels.length) {
      this.selectedPanel = index
    }
  }

  /** Deselect the current panel. */
  deselectPanel(): void {
    this.selectedPanel = -1
  }

  /** Rotate the selected panel's aim angle by delta radians. */
  rotateSelectedPanel(delta: number): void {
    if (this._status !== 'active') return
    if (this.selectedPanel < 0) return
    const panel = this.panels[this.selectedPanel]
    if (!panel) return
    panel.aimAngle += delta
  }

  /** Set the selected panel's aim angle to point toward a world position. */
  aimSelectedPanelAt(worldX: number, worldY: number): void {
    if (this._status !== 'active') return
    if (this.selectedPanel < 0) return
    const panel = this.panels[this.selectedPanel]
    if (!panel) return
    panel.aimAngle = Math.atan2(worldY - panel.y, worldX - panel.x)
  }

  /** Manual complete is a no-op — completion is automatic. */
  complete(): void {
    // Completion is driven by all targets being lit
  }

  /** Clean up resources. */
  dispose(): void {
    this.panels.length = 0
    this.targets.length = 0
    this.beams.length = 0
  }

  /**
   * Initialize solar panels in two arcs curving around the planet.
   * 3 per side: north pole, equator, south pole.
   */
  private initPanels(): void {
    for (let i = 0; i < PANEL_POSITIONS.length; i++) {
      const [ox, oy] = PANEL_POSITIONS[i]!
      const x = NEPTUNE_X + ox
      const y = NEPTUNE_Y + oy
      // Left panels aim right, right panels aim left
      const aimAngle = ox < 0 ? 0 : Math.PI
      this.panels.push({
        id: i,
        ring: i % 3,
        orbitAngle: 0,
        x,
        y,
        aimAngle,
        lit: false,
      })
    }
  }

  /** Initialize surface targets at fixed positions around the planet perimeter. */
  private initTargets(): void {
    /** Distance from planet center — targets sit just inside the visible edge. */
    const targetOrbitR = NEPTUNE_R - 8
    for (let i = 0; i < TARGET_COUNT && i < TARGET_ANGLES.length; i++) {
      const seed = TARGET_ANGLES[i]!
      this.targets.push({
        lat: 0,
        lon: 0,
        x: NEPTUNE_X + Math.cos(seed.angle) * targetOrbitR,
        y: NEPTUNE_Y + Math.sin(seed.angle) * targetOrbitR,
        radius: 7 + (i % 3),
        lit: false,
        pulseOffset: seed.pulseOffset,
      })
    }
  }

  /** Check for mission completion or timeout. */
  private checkEndConditions(): void {
    if (this.targetsLit >= this.targetCount) {
      this._status = 'completed'
      this._steps[0]!.complete = true
      this._steps[0]!.active = false
      this._steps[1]!.complete = true
      this._steps[1]!.active = false
      this.onStepChange?.(this._steps)
      this.onComplete?.(this.missionId)
      return
    }

    if (this.timeTotal > 0 && this.timeRemaining <= 0) {
      this.timeRemaining = 0
      this._status = 'failed'
    }
  }
}
