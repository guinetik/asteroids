/**
 * Runtime wiring for the SCI-gun rocket-survey hidden utility.
 *
 * Owns the callback plumbing between:
 * - {@link ProjectileSystem} science-bolt rocket hits
 * - {@link GatherMinigame} quota state and rocket placement
 * - {@link RockYieldSystem} rock candidate enumeration
 * - {@link SurfaceRockController} world positions for the closest-rock pick
 * - {@link WaypointMarkers} surface-beam placement / removal
 * - host UI callbacks (toast + audio)
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-26-rocket-survey-design.md
 */
import * as THREE from 'three'
import type { GatherMinigame } from '@/lib/minigame/GatherMinigame'
import type { Heightmap } from '@/lib/terrain/heightmap'
import type { LevelAudioDirector } from '@/audio/LevelAudioDirector'
import type { ProjectileSystem } from '@/lib/fps/projectileSystem'
import type { RockYieldSystem } from '@/lib/mining/rockYieldSystem'
import type { SurfaceRockController } from '@/three/controllers/SurfaceRockController'
import type { ParticleEmitter } from '@/three/ParticleEmitter'
import type { FpsCamera } from '@/three/FpsCamera'
import { removeWaypointMarker } from '@/three/WaypointMarkers'
import { RocketSurveyState } from './rocketSurveyState'
import {
  ROCKET_SURVEY_FLASH_HIT_DURATION,
  ROCKET_SURVEY_FLASH_REVEAL_DURATION,
  ROCKET_SURVEY_TOAST_LABEL,
} from './rocketSurveyConstants'

/** Half-extent X (world units) for the rocket AABB. Sized to cover body + nose. */
const ROCKET_AABB_HALF_X = 1.4
/** Half-extent Y (world units) for the rocket AABB. */
const ROCKET_AABB_HALF_Y = 6.0
/** Half-extent Z (world units) for the rocket AABB. */
const ROCKET_AABB_HALF_Z = 1.4
/** Host bindings the facade needs. */
export interface RocketSurveyBindings {
  /** Toast sink: the survey successfully revealed a marker. */
  onSurvey: (label: string) => void
}

/** Runtime collaborators the facade needs. */
export interface RocketSurveyDeps {
  /** Three.js scene to attach the waypoint markers to. */
  scene: THREE.Scene
  /** Projectile system the facade registers the rocket AABB on. */
  projectileSystem: ProjectileSystem
  /** Rock yield system queried for matching active rocks. */
  rockYieldSystem: RockYieldSystem
  /** Surface rock controller used to look up world centers for the closest pick. */
  surfaceRocks: SurfaceRockController
  /** Heightmap used for terrain Y at the marker placement point. */
  heightmap: Heightmap
  /** Particle emitter used for per-hit chip bursts. */
  impactEmitter: ParticleEmitter
  /** FPS camera used for spatial audio panning at the rocket. */
  fpsCamera: FpsCamera
  /** Level audio director used for the reveal cue. */
  levelAudio: LevelAudioDirector
  /** Active gather minigame whose rocket and quotas drive the survey. */
  gather: GatherMinigame
}

/**
 * Facade owning the rocket-survey lifecycle. Mirrors the
 * `LevelCombatMiningFacade` shape used elsewhere.
 */
export class RocketSurveyFacade {
  private readonly state: RocketSurveyState
  private readonly deps: RocketSurveyDeps
  private readonly bindings: RocketSurveyBindings
  private readonly halfExtents = new THREE.Vector3(
    ROCKET_AABB_HALF_X,
    ROCKET_AABB_HALF_Y,
    ROCKET_AABB_HALF_Z,
  )
  private activeMarkerSpawnIndex: number | null = null
  private activeMarkerItemId: string | null = null
  private previousOnConsume: ((spawnIndex: number) => void) | null = null
  private hadPreviousOnConsume = false
  private readonly _scratchCenter = new THREE.Vector3()

  /**
   * @param deps - Runtime collaborators the facade coordinates.
   * @param bindings - Host UI callbacks the facade fires on survey events.
   */
  constructor(deps: RocketSurveyDeps, bindings: RocketSurveyBindings) {
    this.deps = deps
    this.bindings = bindings
    this.state = new RocketSurveyState({
      rockAvailability: (itemId) => this.findClosestRock(itemId),
    })
  }

  /** Wire callbacks and register the rocket AABB on the projectile system. */
  attach(): void {
    this.deps.projectileSystem.setSurveyTarget(this.deps.gather.rocketGroup, this.halfExtents)
    this.deps.projectileSystem.onScienceRocketHit = (impactPos) => this.onBoltHit(impactPos)

    this.deps.gather.onQuotaChange = (quotas) => {
      this.state.setQuotas(
        quotas.map((q) => ({
          itemId: q.itemId,
          minedKg: q.minedKg,
          targetKg: q.targetKg,
        })),
      )
    }
    this.state.setQuotas(
      this.deps.gather.mineralQuotas.map((q) => ({
        itemId: q.itemId,
        minedKg: q.minedKg,
        targetKg: q.targetKg,
      })),
    )

    // Chain onConsume so we can release the marker when its rock is mined out.
    this.previousOnConsume = this.deps.rockYieldSystem.onConsume
    this.hadPreviousOnConsume = true
    this.deps.rockYieldSystem.onConsume = (spawnIndex) => {
      this.previousOnConsume?.(spawnIndex)
      this.handleRockConsumed(spawnIndex)
    }
  }

  /** Tear down callbacks and dispose any active marker. */
  detach(): void {
    this.deps.projectileSystem.setSurveyTarget(null, null)
    this.deps.projectileSystem.onScienceRocketHit = null
    this.deps.gather.onQuotaChange = null
    if (this.hadPreviousOnConsume) {
      this.deps.rockYieldSystem.onConsume = this.previousOnConsume
      this.previousOnConsume = null
      this.hadPreviousOnConsume = false
    }
    if (this.activeMarkerSpawnIndex !== null) {
      removeWaypointMarker(`rocket-survey-${this.activeMarkerSpawnIndex}`, this.deps.scene)
      this.activeMarkerSpawnIndex = null
      this.activeMarkerItemId = null
    }
    this.state.detach()
  }

  /** Per-bolt rocket hit handler. Implementation lands in Task 13. */
  private onBoltHit(_impactPos: THREE.Vector3): void {
    // Implemented in Task 13.
  }

  /** Closest-rock-by-itemId helper for the state machine. Implementation lands in Task 13. */
  private findClosestRock(_itemId: string): { spawnIndex: number } | null {
    return null
  }

  /** onConsume chain — release the lockout when the marked rock is mined. */
  private handleRockConsumed(spawnIndex: number): void {
    if (this.activeMarkerSpawnIndex !== spawnIndex) return
    const itemId = this.activeMarkerItemId
    removeWaypointMarker(`rocket-survey-${spawnIndex}`, this.deps.scene)
    this.activeMarkerSpawnIndex = null
    this.activeMarkerItemId = null
    if (itemId !== null) this.state.notifyMarkerConsumed(itemId)
  }
}

/** Re-exports of tunables consumers reach for. */
export {
  ROCKET_SURVEY_FLASH_HIT_DURATION,
  ROCKET_SURVEY_FLASH_REVEAL_DURATION,
  ROCKET_SURVEY_TOAST_LABEL,
}
