/**
 * Runtime wiring for projectile-driven rock mining in the level scene.
 *
 * Owns the callback plumbing between:
 * - {@link ProjectileSystem} rock hits
 * - {@link RockYieldSystem} yield/depletion state
 * - {@link SurfaceRockController} visual feedback + hiding
 * - inventory persistence + pickup toasts
 * - mining VFX/audio (impact chips + tractor pull)
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
import type { LevelAudioDirector } from '@/audio/LevelAudioDirector'
import type { ProjectileSystem } from '@/lib/fps/projectileSystem'
import type { LevelPersistenceFacade } from '@/lib/level/LevelPersistenceFacade'
import type { RockYieldSystem } from '@/lib/mining/rockYieldSystem'
import type { Heightmap } from '@/lib/terrain/heightmap'
import type { MultiToolController } from '@/three/MultiToolController'
import type { SurfaceRockController } from '@/three/controllers/SurfaceRockController'
import type { ParticleEmitter } from '@/three/ParticleEmitter'
import { Vector3 } from 'three'

/**
 * Host callbacks required by {@link LevelCombatMiningFacade}.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export interface LevelCombatMiningBindings {
  /** Report a successful inventory pickup to the host UI. */
  onResourcePickup: (itemId: string, quantity: number, label: string) => void
  /** Report a failed pickup (full cargo, overweight, etc.) to the host UI. */
  onResourcePickupFailed: (label: string, reason: string) => void
  /** Remove the collider for a fully depleted rock. */
  onRemoveRockCollider: (spawnIndex: number) => void
  /** Read current level elapsed time in seconds (for sizzle keepalive). */
  getElapsedSeconds: () => number
  /** Called on every science-bolt hit while the rock is being prospected (drives wireframe overlay). */
  onProspectProgress: (spawnIndex: number, scienceHp: number, initialScienceHp: number) => void
  /** Called exactly once when a rock has been fully analysed. */
  onProspectComplete: (spawnIndex: number, itemId: string) => void
  /** Optional hidden disturbance hook for every successful drill hit. */
  onMiningHit?: (spawnIndex: number) => void
  /** Optional hidden disturbance hook for a fully depleted rock. */
  onRockBreak?: (spawnIndex: number) => void
}

/**
 * Runtime collaborators used by {@link LevelCombatMiningFacade}.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export interface LevelCombatMiningDeps {
  projectileSystem: ProjectileSystem
  rockYieldSystem: RockYieldSystem
  surfaceRocks: SurfaceRockController
  heightmap: Heightmap
  impactEmitter: ParticleEmitter
  tractorEmitter: ParticleEmitter | null
  multiTool: MultiToolController
  persistence: LevelPersistenceFacade
  levelAudio: LevelAudioDirector
}

/** Particle lifetime (seconds) used by the tractor stream emitter. */
const TRACTOR_LIFETIME_SEC = 0.58
/** Particles emitted per drill hit (base before rock-size scaling). */
const TRACTOR_PARTICLES_PER_HIT = 8
/** Extra tractor particles per world-unit of rock radius. */
const TRACTOR_PARTICLES_PER_RADIUS = 1.5
/** Visible chip burst count per mining hit (base before size scaling). */
const MINING_IMPACT_PARTICLES_PER_HIT = 12
/** Extra chip particles per world-unit of rock radius. */
const MINING_IMPACT_PARTICLES_PER_RADIUS = 2.5
/** Upper cap for chip burst count so the shared pool stays healthy. */
const MAX_MINING_IMPACT_PARTICLES_PER_HIT = 28
/** Upward launch speed for mining chip particles. */
const MINING_IMPACT_VERTICAL_SPEED = 7.5
/** Random lateral scatter added to each mining chip particle. */
const MINING_IMPACT_LATERAL_SPEED = 2.2
/** Vertical launch speed for science-hit chip particles (smaller than mining hits). */
const SCIENCE_HIT_VERTICAL_SPEED = 2.5
/** Random vertical jitter added to each science-hit chip. */
const SCIENCE_HIT_VERTICAL_JITTER = 1.0
/** Lateral scatter for science-hit chips (smaller than mining hits). */
const SCIENCE_HIT_LATERAL_SPEED = 1.5
/** Strong one-shot vacuum burst when a rock is fully consumed. */
const TRACTOR_PARTICLES_ON_CONSUME = 52
/** Spawn-radius jitter for the final rock-to-gun vacuum cloud. */
const TRACTOR_CONSUME_SPAWN_RADIUS = 1.8
/** Minimum consume-burst speed fraction (arrival over a beat, not instant). */
const TRACTOR_CONSUME_MIN_SPEED_FRACTION = 0.33
/** Maximum consume-burst speed fraction for the front edge. */
const TRACTOR_CONSUME_MAX_SPEED_FRACTION = 0.82
/** Lateral jitter so consume particles read as a cloud, not a laser line. */
const TRACTOR_CONSUME_LATERAL_SPEED = 3.8

/**
 * Wires projectile hits to rock yield, inventory persistence, and mining VFX/audio.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export class LevelCombatMiningFacade {
  /** Reused scratch — launch velocity for chip bursts and consume jitter. */
  private readonly impactVel = new Vector3()
  /** Reused scratch — world position of the multi-tool muzzle. */
  private readonly tractorMuzzle = new Vector3()
  /** Reused scratch — tractor burst origin on rock/hit point. */
  private readonly tractorOrigin = new Vector3()
  /** Reused scratch — tractor velocity from origin toward muzzle. */
  private readonly tractorVel = new Vector3()
  /** Reused scratch — consume burst particle spawn offset. */
  private readonly tractorSpawnPos = new Vector3()

  constructor(
    private readonly deps: LevelCombatMiningDeps,
    private readonly bindings: LevelCombatMiningBindings,
  ) {}

  /**
   * Register every spawned surface rock into both the yield and projectile systems.
   */
  registerRocks(): void {
    const rockSpawns = this.deps.surfaceRocks.spawns
    const rockColliders = this.deps.surfaceRocks.buildColliders(this.deps.heightmap)
    for (let i = 0; i < rockSpawns.length; i++) {
      const spawn = rockSpawns[i]!
      const collider = rockColliders[i]!
      const center = typeof collider.center === 'function' ? collider.center() : collider.center
      this.deps.rockYieldSystem.registerRock({ spawnIndex: i, diameter: spawn.diameter })
      this.deps.projectileSystem.addRock({
        spawnIndex: i,
        cx: center.x,
        cy: center.y,
        cz: center.z,
        radius: collider.radius,
      })
    }
  }

  /** Attach mining/yield callbacks to projectile and rock systems. */
  attach(): void {
    this.deps.rockYieldSystem.onConsume = (spawnIndex) => {
      this.deps.levelAudio.stopMiningSizzle()
      this.deps.levelAudio.notifyRockMelt()
      this.spawnConsumeVacuumBurst(spawnIndex)
      this.deps.surfaceRocks.hideRock(spawnIndex)
      this.bindings.onRemoveRockCollider(spawnIndex)
      this.deps.projectileSystem.removeRock(spawnIndex)
      this.bindings.onRockBreak?.(spawnIndex)
    }

    this.deps.rockYieldSystem.onMineralExtracted = (itemId, kg) => {
      const quantity = Math.max(1, Math.round(kg))
      const result = this.deps.persistence.persistInventoryPickup(itemId, quantity)
      if (!result.ok) {
        this.bindings.onResourcePickupFailed(result.label, result.reason ?? 'Inventory full')
        return
      }
      this.bindings.onResourcePickup(itemId, quantity, result.label)
      this.deps.levelAudio.notifyResourcePickup()
    }

    this.deps.projectileSystem.onRockHit = (spawnIndex, impactPos) => {
      const result = this.deps.rockYieldSystem.mineRock(spawnIndex)
      if (!result) return
      this.bindings.onMiningHit?.(spawnIndex)
      if (!result.depleted) {
        this.deps.levelAudio.keepMiningSizzleAlive(this.bindings.getElapsedSeconds())
      }
      this.deps.surfaceRocks.flashRock(spawnIndex)

      const impactParticleCount = this.getMiningImpactParticleCount(spawnIndex)
      for (let i = 0; i < impactParticleCount; i++) {
        this.impactVel.set(
          (Math.random() - 0.5) * MINING_IMPACT_LATERAL_SPEED,
          MINING_IMPACT_VERTICAL_SPEED + Math.random() * 1.5,
          (Math.random() - 0.5) * MINING_IMPACT_LATERAL_SPEED,
        )
        this.deps.impactEmitter.emit(impactPos, this.impactVel)
      }

      this.spawnTractorBurst(spawnIndex, impactPos, this.getTractorParticleCount(spawnIndex))
    }

    this.deps.projectileSystem.onScienceRockHit = (spawnIndex, impactPos) => {
      const result = this.deps.rockYieldSystem.scienceHit(spawnIndex)
      if (!result) return
      // Reuse the drill flash for an immediate per-hit acknowledgement.
      this.deps.surfaceRocks.flashRock(spawnIndex)
      // Tiny chip burst at the impact point so the player sees they hit something.
      this.impactVel.set(
        (Math.random() - 0.5) * SCIENCE_HIT_LATERAL_SPEED,
        SCIENCE_HIT_VERTICAL_SPEED + Math.random() * SCIENCE_HIT_VERTICAL_JITTER,
        (Math.random() - 0.5) * SCIENCE_HIT_LATERAL_SPEED,
      )
      this.deps.impactEmitter.emit(impactPos, this.impactVel)
    }

    this.deps.rockYieldSystem.onScienceProgress = (spawnIndex, scienceHp, initialScienceHp) => {
      this.bindings.onProspectProgress(spawnIndex, scienceHp, initialScienceHp)
    }

    this.deps.rockYieldSystem.onRockProspected = (spawnIndex, itemId) => {
      this.bindings.onProspectComplete(spawnIndex, itemId)
    }
  }

  /** Clear callbacks owned by this facade. */
  detach(): void {
    this.deps.rockYieldSystem.onConsume = null
    this.deps.rockYieldSystem.onMineralExtracted = null
    this.deps.projectileSystem.onRockHit = null
    this.deps.projectileSystem.onScienceRockHit = null
    this.deps.rockYieldSystem.onScienceProgress = null
    this.deps.rockYieldSystem.onRockProspected = null
  }

  private getMiningImpactParticleCount(spawnIndex: number): number {
    const radius = this.deps.surfaceRocks.getRockRadius(spawnIndex) ?? 0
    return Math.min(
      MAX_MINING_IMPACT_PARTICLES_PER_HIT,
      Math.round(MINING_IMPACT_PARTICLES_PER_HIT + radius * MINING_IMPACT_PARTICLES_PER_RADIUS),
    )
  }

  private getTractorParticleCount(spawnIndex: number): number {
    const radius = this.deps.surfaceRocks.getRockRadius(spawnIndex) ?? 0
    return Math.round(TRACTOR_PARTICLES_PER_HIT + radius * TRACTOR_PARTICLES_PER_RADIUS)
  }

  private spawnTractorBurst(spawnIndex: number, impactPos: Vector3, particleCount: number): void {
    const tractor = this.deps.tractorEmitter
    if (!tractor || particleCount <= 0) return

    this.deps.multiTool.getMuzzleWorldPosition(this.tractorMuzzle)
    const center = this.deps.surfaceRocks.getRockCenter(
      spawnIndex,
      this.deps.heightmap,
      this.tractorOrigin,
    )
    if (!center) this.tractorOrigin.copy(impactPos)

    this.tractorVel.copy(this.tractorMuzzle).sub(this.tractorOrigin)
    const distance = this.tractorVel.length()
    if (distance < 0.01) return
    const speed = distance / TRACTOR_LIFETIME_SEC
    this.tractorVel.multiplyScalar(speed / distance)
    for (let i = 0; i < particleCount; i++) {
      tractor.emit(this.tractorOrigin, this.tractorVel)
    }
  }

  private spawnConsumeVacuumBurst(spawnIndex: number): void {
    const tractor = this.deps.tractorEmitter
    if (!tractor) return

    const center = this.deps.surfaceRocks.getRockCenter(
      spawnIndex,
      this.deps.heightmap,
      this.tractorOrigin,
    )
    if (!center) return

    this.deps.multiTool.getMuzzleWorldPosition(this.tractorMuzzle)

    for (let i = 0; i < TRACTOR_PARTICLES_ON_CONSUME; i++) {
      this.tractorSpawnPos
        .copy(this.tractorOrigin)
        .add(
          this.impactVel.set(
            (Math.random() - 0.5) * TRACTOR_CONSUME_SPAWN_RADIUS,
            (Math.random() - 0.5) * TRACTOR_CONSUME_SPAWN_RADIUS,
            (Math.random() - 0.5) * TRACTOR_CONSUME_SPAWN_RADIUS,
          ),
        )

      this.tractorVel.copy(this.tractorMuzzle).sub(this.tractorSpawnPos)
      const distance = this.tractorVel.length()
      if (distance < 0.01) continue

      const speedFraction =
        TRACTOR_CONSUME_MIN_SPEED_FRACTION +
        Math.random() * (TRACTOR_CONSUME_MAX_SPEED_FRACTION - TRACTOR_CONSUME_MIN_SPEED_FRACTION)
      const speed = (distance / TRACTOR_LIFETIME_SEC) * speedFraction
      this.tractorVel.multiplyScalar(speed / distance)
      this.tractorVel.add(
        this.impactVel.set(
          (Math.random() - 0.5) * TRACTOR_CONSUME_LATERAL_SPEED,
          (Math.random() - 0.5) * TRACTOR_CONSUME_LATERAL_SPEED,
          (Math.random() - 0.5) * TRACTOR_CONSUME_LATERAL_SPEED,
        ),
      )
      tractor.emit(this.tractorSpawnPos, this.tractorVel)
    }
  }
}
