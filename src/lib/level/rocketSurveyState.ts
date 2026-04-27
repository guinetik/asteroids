/**
 * Pure-TS state machine for the SCI-gun rocket-survey hidden utility.
 *
 * Owns the per-bolt HP ramp, target-mineral selection, and the
 * "awaitingMarkerConsume" lockout that runs from a successful reveal
 * until the marked rock is mined. The facade injects a
 * `rockAvailability` predicate so the state machine stays renderer-
 * and game-state-free.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-26-rocket-survey-design.md
 */

/** Lifecycle phase reported by {@link RocketSurveyState}. */
export type RocketSurveyPhase = 'idle' | 'ramping' | 'awaitingMarkerConsume' | 'exhausted'

/** Snapshot of one gather-mission quota the facade pushes in. */
export interface SurveyQuotaSnapshot {
  /** Inventory item id for the quota (matches `RockYieldSystem` itemIds). */
  itemId: string
  /** Total kg already mined across all rocks for this mineral. */
  minedKg: number
  /** Target kg the gather minigame is asking the player to mine. */
  targetKg: number
}

/** Result returned by {@link RocketSurveyState.scienceHit}. */
export interface ScienceHitResult {
  /** Phase after this hit. */
  phase: RocketSurveyPhase
  /** Survey HP after this hit. */
  surveyHp: number
  /** Survey HP at the start of the current scan cycle (used by VFX). */
  surveyHpInitial: number
  /** Whether THIS hit revealed a marker. */
  justRevealed: boolean
  /** Item id of the revealed mineral (only set when `justRevealed`). */
  targetItemId: string | null
  /** Spawn index of the revealed rock (only set when `justRevealed`). */
  targetSpawnIndex: number | null
}

/** Construction options for {@link RocketSurveyState}. */
export interface RocketSurveyStateOptions {
  /**
   * Predicate that asks the facade whether a mineable rock exists for
   * `itemId`. Returns `{ spawnIndex }` for the closest matching rock to
   * the rocket, or `null` when no such rock exists. The state machine
   * calls this only at the reveal step.
   */
  rockAvailability: (itemId: string) => { spawnIndex: number } | null
}

/**
 * Pure-TS rocket-survey state machine. Side effects flow through the
 * return value of {@link scienceHit}; no callbacks fire from inside.
 */
export class RocketSurveyState {
  private _phase: RocketSurveyPhase = 'idle'
  private _surveyHp = 0
  private _surveyHpInitial = 0
  private _targetItemId: string | null = null
  private _quotas: readonly SurveyQuotaSnapshot[] = []
  private readonly _skipped = new Set<string>()
  private readonly _rockAvailability: (itemId: string) => { spawnIndex: number } | null

  constructor(options: RocketSurveyStateOptions) {
    this._rockAvailability = options.rockAvailability
  }

  /** Current lifecycle phase. */
  get phase(): RocketSurveyPhase {
    return this._phase
  }

  /** Survey HP at the current point in the ramp (0 outside `ramping`). */
  get surveyHp(): number {
    return this._surveyHp
  }

  /** Survey HP at the start of the current scan cycle. */
  get surveyHpInitial(): number {
    return this._surveyHpInitial
  }

  /** Currently targeted mineral, or `null` when no scan is active. */
  get targetItemId(): string | null {
    return this._targetItemId
  }

  /**
   * Push a fresh quota snapshot from the gather minigame. Call on every
   * quota change (mining grant or completion). Transitions to
   * `exhausted` when no quota has remaining work.
   */
  setQuotas(quotas: readonly SurveyQuotaSnapshot[]): void {
    this._quotas = quotas
    if (this.allQuotasMet()) {
      this._phase = 'exhausted'
      this._surveyHp = 0
      this._targetItemId = null
    }
  }

  private allQuotasMet(): boolean {
    if (this._quotas.length === 0) return false
    for (const quota of this._quotas) {
      if (quota.minedKg < quota.targetKg) return false
    }
    return true
  }
}
