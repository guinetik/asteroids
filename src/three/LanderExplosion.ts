/**
 * Lander crash explosion VFX — particle burst scaled to impact speed.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-lander-crash-mechanics-design.md
 */
import { Vector3, Color } from 'three'
import { ParticleEmitter } from './ParticleEmitter'
import type { Tickable } from '@/lib/Tickable'

/** Minimum particles for a low-speed crash. */
const MIN_PARTICLES = 8
/** Maximum particles for a terminal-velocity crash. */
const MAX_PARTICLES = 96
/** Speed at which explosion is at full intensity. */
const MAX_IMPACT_SPEED = 20
/** Minimum burst force (gentle bump). */
const BURST_FORCE_MIN = 6
/** Maximum burst force (destruction). */
const BURST_FORCE_MAX = 35

/**
 * Crash explosion — emits fire + debris particles scaled to impact speed.
 * Create once per level, call `explode()` on each hard landing.
 *
 * @author guinetik
 * @date 2026-04-06
 */
export class LanderExplosion implements Tickable {
  /** Fire/sparks emitter (orange). */
  readonly fireEmitter: ParticleEmitter
  /** Debris emitter (grey). */
  readonly debrisEmitter: ParticleEmitter

  constructor() {
    this.fireEmitter = new ParticleEmitter({
      poolSize: MAX_PARTICLES,
      color: new Color(0xff6a1f),
      size: 2.2,
      lifetime: 0.65,
      spread: 12,
      opacity: 0.42,
      soft: true,
    })
    this.debrisEmitter = new ParticleEmitter({
      poolSize: MAX_PARTICLES,
      color: new Color(0x666666),
      size: 2,
      lifetime: 1.2,
      spread: 8,
      opacity: 0.4,
    })
  }

  /**
   * Trigger an explosion at the given position.
   *
   * @param position - World position of the crash
   * @param impactSpeed - Absolute impact velocity (higher = bigger explosion)
   */
  explode(position: Vector3, impactSpeed: number): void {
    const ratio = Math.min(1, impactSpeed / MAX_IMPACT_SPEED)
    const count = Math.round(MIN_PARTICLES + (MAX_PARTICLES - MIN_PARTICLES) * ratio * ratio)
    const force = BURST_FORCE_MIN + (BURST_FORCE_MAX - BURST_FORCE_MIN) * ratio
    /** Higher elevation spread for violent impacts — debris goes everywhere. */
    const elevationRange = 0.3 + ratio * 0.5

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const elevation = Math.random() * Math.PI * elevationRange
      const particleForce = force * (0.4 + Math.random() * 0.6)
      const dir = new Vector3(
        Math.cos(angle) * Math.cos(elevation),
        Math.sin(elevation),
        Math.sin(angle) * Math.cos(elevation),
      ).multiplyScalar(particleForce)
      this.fireEmitter.emit(position, dir)
    }

    const debrisCount = Math.round(count * (0.3 + ratio * 0.4))
    for (let i = 0; i < debrisCount; i++) {
      const angle = Math.random() * Math.PI * 2
      const elevation = Math.random() * Math.PI * elevationRange * 0.8
      const particleForce = force * (0.3 + Math.random() * 0.5)
      const dir = new Vector3(
        Math.cos(angle) * Math.cos(elevation),
        Math.sin(elevation),
        Math.sin(angle) * Math.cos(elevation),
      ).multiplyScalar(particleForce)
      this.debrisEmitter.emit(position, dir)
    }
  }

  /** Tick both emitters. */
  tick(dt: number): void {
    this.fireEmitter.tick(dt)
    this.debrisEmitter.tick(dt)
  }

  /** Dispose both emitters. */
  dispose(): void {
    this.fireEmitter.dispose()
    this.debrisEmitter.dispose()
  }
}
