/**
 * Temperature VFX — subtle fire or frost particles clinging to the shuttle hull
 * proportional to temperature extremes.
 *
 * Heat: small orange embers flicker on the hull surface.
 * Freeze: tiny blue-white ice crystals shimmer on the hull.
 *
 * Emitters are children of the shuttle group so particles move with the ship.
 * Spawn positions are in local space relative to the hull center.
 *
 * @author guinetik
 * @date 2026-04-07
 * @spec docs/superpowers/specs/2026-04-05-ship-health-temperature-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import { ParticleEmitter } from './ParticleEmitter'

/** Temperature magnitude below which no particles emit. */
const EFFECT_THRESHOLD = 15

/** Maximum spawn rate at temperature 100. */
const MAX_SPAWN_RATE = 200

/** Spawn spread along the shuttle's long axis (X in local space). */
const HULL_LENGTH_SPREAD = 12

/** Spawn spread across the shuttle's width (Z in local space). */
const HULL_WIDTH_SPREAD = 5

/** Spawn spread vertically (Y in local space). */
const HULL_Y_SPREAD = 2

/**
 * Drives subtle fire/frost particles on the shuttle based on temperature.
 * Attach to shuttle group — particles live in local space.
 *
 * @author guinetik
 * @date 2026-04-07
 */
export class TemperatureEffectController implements Tickable {
  /** Fire emitter — add fireEmitter.points to shuttle group. */
  readonly fireEmitter: ParticleEmitter
  /** Frost emitter — add frostEmitter.points to shuttle group. */
  readonly frostEmitter: ParticleEmitter

  private spawnAccumulator = 0
  private _temperature = 0

  constructor() {
    this.fireEmitter = new ParticleEmitter({
      poolSize: 250,
      color: new THREE.Color(0xff8833),
      size: 5,
      lifetime: 0.25,
      spread: 0.5,
      opacity: 0.9,
      sizeGrowth: 0.6,
    })

    this.frostEmitter = new ParticleEmitter({
      poolSize: 400,
      color: new THREE.Color(0x99ddff),
      size: 6,
      lifetime: 0.5,
      spread: 0.4,
      opacity: 0.85,
      soft: true,
      sizeGrowth: 1.2,
    })
  }

  /**
   * Set the current temperature (-100 to 100).
   *
   * @param temp - Temperature value from ShipHealth.
   */
  setTemperature(temp: number): void {
    this._temperature = temp
  }

  tick(dt: number): void {
    this.fireEmitter.tick(dt)
    this.frostEmitter.tick(dt)

    const absTemp = Math.abs(this._temperature)
    if (absTemp <= EFFECT_THRESHOLD) {
      this.spawnAccumulator = 0
      return
    }

    const ratio = (absTemp - EFFECT_THRESHOLD) / (100 - EFFECT_THRESHOLD)
    const spawnRate = MAX_SPAWN_RATE * ratio * ratio
    this.spawnAccumulator += spawnRate * dt

    const emitter = this._temperature > 0 ? this.fireEmitter : this.frostEmitter

    while (this.spawnAccumulator >= 1) {
      this.spawnAccumulator -= 1

      // Local-space position on the hull
      const spawnPos = new THREE.Vector3(
        (Math.random() - 0.5) * HULL_LENGTH_SPREAD,
        (Math.random() - 0.5) * HULL_Y_SPREAD,
        (Math.random() - 0.5) * HULL_WIDTH_SPREAD,
      )

      // Minimal velocity — particles flicker in place, don't drift away
      const upDir = this._temperature > 0 ? 1 : -0.3
      const pushVel = new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        upDir * (0.5 + Math.random()),
        (Math.random() - 0.5) * 0.5,
      )

      emitter.emit(spawnPos, pushVel)
    }
  }

  dispose(): void {
    this.fireEmitter.dispose()
    this.frostEmitter.dispose()
  }
}
