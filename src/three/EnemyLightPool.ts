/**
 * Pre-allocated pool of {@link THREE.PointLight}s shared by procedural enemy
 * controllers so the level's lit materials do not recompile every time an
 * enemy spawns or despawns.
 *
 * Three.js bakes visible-light counts (per type) into every PBR program's
 * cache key. Allocating a fresh `THREE.PointLight` at runtime — or toggling
 * one's `.visible` flag — mutates `NUM_POINT_LIGHTS` and forces every lit
 * material in the scene to recompile on the next render. With a level full
 * of `MeshStandardMaterial` (terrain, lander, hostages, props), that is the
 * multi-second main-thread stall players see when an enemy appears.
 *
 * The pool keeps a fixed number of `THREE.PointLight`s in the scene tree
 * for the level's full lifetime. Controllers `acquire` a slot, reparent it
 * onto their own body group (still counted by `traverseVisible`), and call
 * `release` on despawn — the slot returns to the pool's home with intensity
 * zeroed, never leaving the scene tree.
 *
 * @author guinetik
 * @date 2026-05-03
 */
import * as THREE from 'three'

/** Distance assigned to released slots — non-zero so attenuation math stays valid. */
const POOL_LIGHT_OFF_DISTANCE = 0.001

/** Intensity assigned to released slots. */
const POOL_LIGHT_OFF_INTENSITY = 0

/** Default fallback color for released slots (white). */
const POOL_LIGHT_DEFAULT_COLOR = 0xffffff

/**
 * Fixed-size pool of `THREE.PointLight` slots reused across enemy spawns.
 *
 * @author guinetik
 * @date 2026-05-03
 */
export class EnemyLightPool {
  private readonly slots: THREE.PointLight[] = []
  private readonly free: THREE.PointLight[] = []
  private readonly home: THREE.Object3D

  /**
   * Allocate `size` lights and parent every one under `home` so they are
   * counted by Three.js's `traverseVisible` light pass before anything is
   * acquired.
   *
   * @param home - Container the lights live in when idle (typically the level scene).
   * @param size - Number of slots to pre-allocate. Should be sized to the worst-case
   *   simultaneous enemy-light demand of the level (e.g. warmup max + runtime max).
   */
  constructor(home: THREE.Object3D, size: number) {
    this.home = home
    for (let i = 0; i < size; i++) {
      const light = new THREE.PointLight(
        POOL_LIGHT_DEFAULT_COLOR,
        POOL_LIGHT_OFF_INTENSITY,
        POOL_LIGHT_OFF_DISTANCE,
      )
      light.visible = true
      home.add(light)
      this.slots.push(light)
      this.free.push(light)
    }
  }

  /** Total slots in the pool (free + in-use). */
  get size(): number {
    return this.slots.length
  }

  /**
   * Reserve one slot. Caller assigns its color/distance/intensity and may
   * reparent it onto a body group — the light remains counted by Three.js.
   *
   * @returns A free slot, or `null` when the pool is exhausted.
   */
  acquire(): THREE.PointLight | null {
    return this.free.pop() ?? null
  }

  /**
   * Return a slot to the pool. Zeroes intensity, neutralizes color, and
   * reparents the light back under {@link home} so `NUM_POINT_LIGHTS` stays
   * pinned at the pool size.
   *
   * @param light - A light previously returned by {@link acquire}.
   */
  release(light: THREE.PointLight): void {
    light.intensity = POOL_LIGHT_OFF_INTENSITY
    light.distance = POOL_LIGHT_OFF_DISTANCE
    light.color.setHex(POOL_LIGHT_DEFAULT_COLOR)
    if (light.parent !== this.home) {
      this.home.add(light)
    }
    if (!this.free.includes(light)) {
      this.free.push(light)
    }
  }

  /** Detach and dispose every slot. Call when tearing down the level. */
  dispose(): void {
    for (const l of this.slots) {
      l.removeFromParent()
      l.dispose()
    }
    this.slots.length = 0
    this.free.length = 0
  }
}
