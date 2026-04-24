/**
 * Level HUD telemetry throttling + payload composition helpers.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
import { OBJECTIVE_LABELS } from '@/lib/minigame/MiniGame'
import type { ConcreteObjective } from '@/lib/missions/types'
import {
  headingRadToCompassDeg,
  worldBearingDegTo,
  signedRelativeBearingDeg,
} from '@/lib/math/bearing'
import type { FpsTelemetry, CompassObjective, RockTargetInfo } from '@/lib/ui/fpsHudTypes'
import type { LanderTelemetry } from '@/lib/ui/landerHudTypes'

/**
 * State prompt payload consumed by level HUD action prompts.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export interface LevelStateInfoTelemetry {
  /** Active state-machine state key. */
  state: string
  /** Whether the lander is currently grounded. */
  grounded: boolean
  /** Whether exfil can be triggered this frame. */
  canExfil: boolean
  /** Whether entering the lander can be triggered this frame. */
  canEnterLander: boolean
}

/**
 * Callback sinks owned by the level view host.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export interface LevelTelemetryCallbacks {
  /** State prompt sink shown every frame. */
  onStateInfo: ((info: LevelStateInfoTelemetry) => void) | null
  /** Lander HUD telemetry sink. */
  onLanderTelemetry: ((telemetry: LanderTelemetry) => void) | null
  /** FPS HUD telemetry sink. */
  onFpsTelemetry: ((telemetry: FpsTelemetry) => void) | null
  /** Minimap player-position sink. */
  onPlayerPosition: ((x: number, z: number) => void) | null
}

/**
 * Snapshot of lander telemetry inputs for the current frame.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export interface LevelLanderTelemetrySnapshot {
  /** Source telemetry payload already assembled by the host. */
  telemetry: LanderTelemetry
  /** Lander world X coordinate for minimap updates. */
  x: number
  /** Lander world Z coordinate for minimap updates. */
  z: number
}

/**
 * Snapshot of FPS telemetry inputs for the current frame.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export interface LevelFpsTelemetrySnapshot {
  /** Shared fields from `FpsTelemetry` excluding heading/objective composition. */
  telemetry: Omit<FpsTelemetry, 'headingRad' | 'objectives' | 'rockTarget'> & {
    rockTarget?: RockTargetInfo | null
  }
  /** Camera heading in radians. */
  headingRad: number
  /** Player world X coordinate for compass + minimap. */
  x: number
  /** Player world Z coordinate for compass + minimap. */
  z: number
  /** Concrete mission objectives used to build compass markers. */
  missionObjectives: readonly ConcreteObjective[]
  /** Current drill-target readout (or null when none). */
  rockTarget: RockTargetInfo | null
}

/**
 * Per-frame telemetry input snapshot.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export interface LevelTelemetrySnapshot {
  /** Frame delta time in seconds. */
  dt: number
  /** Current level state key. */
  state: string
  /** Whether exfil can be triggered this frame. */
  canExfil: boolean
  /** Whether entering the lander can be triggered this frame. */
  canEnterLander: boolean
  /** Lander telemetry inputs, when available. */
  lander: LevelLanderTelemetrySnapshot | null
  /** FPS telemetry inputs, when available. */
  fps: LevelFpsTelemetrySnapshot | null
}

/**
 * Throttles level HUD telemetry and emits callback payloads.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export class LevelTelemetryFacade {
  /**
   * HUD telemetry cadence (15 Hz). Low enough to avoid HUD churn stutter while
   * still feeling real-time for cockpit/FPS readouts.
   */
  static readonly DEFAULT_INTERVAL_S = 1 / 15

  private accumulator = LevelTelemetryFacade.DEFAULT_INTERVAL_S

  /**
   * @param intervalS - Optional throttle interval in seconds.
   */
  constructor(private readonly intervalS = LevelTelemetryFacade.DEFAULT_INTERVAL_S) {}

  /** Reset throttle so the next tick emits immediately. */
  resetThrottle(): void {
    this.accumulator = this.intervalS
  }

  /**
   * Emit per-frame state info plus throttled lander/FPS telemetry.
   *
   * @param callbacks - Host-owned callback sinks.
   * @param snapshot - Current frame telemetry inputs.
   */
  tick(callbacks: LevelTelemetryCallbacks, snapshot: LevelTelemetrySnapshot): void {
    callbacks.onStateInfo?.({
      state: snapshot.state,
      grounded: snapshot.lander?.telemetry.grounded ?? false,
      canExfil: snapshot.canExfil,
      canEnterLander: snapshot.canEnterLander,
    })

    this.accumulator += snapshot.dt
    if (this.accumulator < this.intervalS) return
    this.accumulator = 0

    if (snapshot.state === 'lander' && snapshot.lander) {
      callbacks.onLanderTelemetry?.(snapshot.lander.telemetry)
      callbacks.onPlayerPosition?.(snapshot.lander.x, snapshot.lander.z)
      return
    }

    if (snapshot.state !== 'eva' || !snapshot.fps) return

    const fps = snapshot.fps
    const compassHeading = headingRadToCompassDeg(fps.headingRad)
    const objectives: CompassObjective[] = fps.missionObjectives.map((objective, index) => ({
      id: `obj-${index}`,
      label: (OBJECTIVE_LABELS[objective.type] ?? objective.type).toUpperCase(),
      relativeDeg: signedRelativeBearingDeg(
        compassHeading,
        worldBearingDegTo(fps.x, fps.z, objective.x, objective.z),
      ),
      type: objective.type,
    }))

    callbacks.onFpsTelemetry?.({
      ...fps.telemetry,
      headingRad: fps.headingRad,
      objectives,
      rockTarget: fps.rockTarget,
    })
    callbacks.onPlayerPosition?.(fps.x, fps.z)
  }
}
