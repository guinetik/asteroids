/**
 * Chimera projectile burst helper shared by surface and FPS enemy controllers.
 *
 * @author guinetik
 * @date 2026-04-28
 * @spec docs/superpowers/specs/2026-04-05-enemy-system-design.md
 */

const CHIMERA_PROJECTILE_BURST_COUNT = 3
const CHIMERA_PROJECTILE_BURST_INTERVAL_SECONDS = 0.06
const AIM_EPSILON = 0.01

/**
 * Callable that schedules enemy projectiles as a short sequential burst.
 *
 * @author guinetik
 * @date 2026-04-28
 * @spec docs/superpowers/specs/2026-04-05-enemy-system-design.md
 */
export type ChimeraProjectileBurstSpawn = (
  /**
   * Projectile origin X in world units, e.g. an eye muzzle X coordinate.
   */
  x: number,
  /**
   * Projectile origin Y in world units, e.g. an eye muzzle Y coordinate.
   */
  y: number,
  /**
   * Projectile origin Z in world units, e.g. an eye muzzle Z coordinate.
   */
  z: number,
  /**
   * Normalized direction X component in the range -1..1.
   */
  dirX: number,
  /**
   * Normalized direction Y component in the range -1..1.
   */
  dirY: number,
  /**
   * Normalized direction Z component in the range -1..1.
   */
  dirZ: number,
  /**
   * Projectile speed in world units per second.
   */
  speed: number,
  /**
   * Damage dealt when the projectile hits the player or hostage.
   */
  damage: number,
  /**
   * Number of shots in the burst, e.g. `3`.
   */
  count: number,
  /**
   * Seconds between shots, e.g. `0.06`.
   */
  intervalSeconds: number,
) => unknown

/**
 * Parameters for spawning a three-shot Chimera projectile burst.
 *
 * @author guinetik
 * @date 2026-04-28
 * @spec docs/superpowers/specs/2026-04-05-enemy-system-design.md
 */
export interface ChimeraProjectileBurstParams {
  /** World-space X coordinate for the firing muzzle, e.g. `12.5`. */
  originX: number
  /** World-space Y coordinate for the firing muzzle, e.g. `4.2`. */
  originY: number
  /** World-space Z coordinate for the firing muzzle, e.g. `-18`. */
  originZ: number
  /** World-space X coordinate for the aim target, usually the player or hostage. */
  targetX: number
  /** World-space Y coordinate for the aim target, usually the player or hostage. */
  targetY: number
  /** World-space Z coordinate for the aim target, usually the player or hostage. */
  targetZ: number
  /** Projectile speed in world units per second; valid values are positive numbers. */
  projectileSpeed: number
  /** Damage dealt per projectile; valid values are positive hit point amounts. */
  projectileDamage: number
  /** Function that schedules the burst in the owning enemy projectile system. */
  spawnBurst: ChimeraProjectileBurstSpawn
}

/**
 * Spawn the Chimera's attack as a three-shot same-direction burst.
 *
 * @param params - Origin, target, projectile tuning, and spawn callback.
 * @returns Number of projectiles spawned; zero when the aim vector is too short.
 *
 * @author guinetik
 * @date 2026-04-28
 * @spec docs/superpowers/specs/2026-04-05-enemy-system-design.md
 */
export function spawnChimeraProjectileBurst(params: ChimeraProjectileBurstParams): number {
  const dx = params.targetX - params.originX
  const dy = params.targetY - params.originY
  const dz = params.targetZ - params.originZ
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
  if (dist <= AIM_EPSILON) return 0

  const dirX = dx / dist
  const dirY = dy / dist
  const dirZ = dz / dist
  params.spawnBurst(
    params.originX,
    params.originY,
    params.originZ,
    dirX,
    dirY,
    dirZ,
    params.projectileSpeed,
    params.projectileDamage,
    CHIMERA_PROJECTILE_BURST_COUNT,
    CHIMERA_PROJECTILE_BURST_INTERVAL_SECONDS,
  )
  return CHIMERA_PROJECTILE_BURST_COUNT
}
