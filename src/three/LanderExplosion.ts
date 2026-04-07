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
const MIN_PARTICLES = 16
/** Maximum particles for a terminal-velocity crash. */
const MAX_PARTICLES = 64
/** Speed at which explosion is at full intensity. */
const MAX_IMPACT_SPEED = 20
/** Explosion burst force. */
const BURST_FORCE = 30

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
      color: new Color(0xff6600),
      size: 8,
      lifetime: 1.5,
      spread: 40,
      opacity: 0.9,
    })
    this.debrisEmitter = new ParticleEmitter({
      poolSize: MAX_PARTICLES,
      color: new Color(0x888888),
      size: 4,
      lifetime: 1.5,
      spread: 40,
      opacity: 0.6,
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
    const count = Math.round(MIN_PARTICLES + (MAX_PARTICLES - MIN_PARTICLES) * ratio)
    const force = BURST_FORCE * (0.5 + ratio * 0.5)

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const elevation = Math.random() * Math.PI * 0.5
      const dir = new Vector3(
        Math.cos(angle) * Math.cos(elevation),
        Math.sin(elevation),
        Math.sin(angle) * Math.cos(elevation),
      ).multiplyScalar(force)
      this.fireEmitter.emit(position, dir)
    }

    const debrisCount = Math.round(count * 0.5)
    for (let i = 0; i < debrisCount; i++) {
      const angle = Math.random() * Math.PI * 2
      const elevation = Math.random() * Math.PI * 0.4
      const dir = new Vector3(
        Math.cos(angle) * Math.cos(elevation),
        Math.sin(elevation),
        Math.sin(angle) * Math.cos(elevation),
      ).multiplyScalar(force * 0.6)
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
