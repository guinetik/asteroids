/**
 * Typed enemy-type configuration loader.
 *
 * Imports enemy stats from JSON data and exposes typed configs.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-enemy-system-design.md
 */
import enemyTypesJson from '@/data/fps/enemy-types.json'

/** Configuration for a single enemy type — loaded from enemy-types.json. */
export interface EnemyTypeConfig {
  /** Maximum health points. */
  maxHp: number
  /** Collision radius for projectile hit detection. */
  hitRadius: number
  /** Chase movement speed (units/s). */
  speed: number
  /** Distance at which the enemy starts chasing the player. */
  aggroRadius: number
  /** Distance at which the enemy gives up chasing and returns to idle. */
  leashRadius: number
  /** Distance at which the enemy becomes visually agitated. */
  agitateRadius: number
  /** Maximum wander distance from spawn point when idle. */
  wanderRadius: number
  /** Movement speed while wandering (units/s). */
  wanderSpeed: number
  /** Damage dealt on player contact. */
  contactDamage: number
  /** Distance threshold for contact damage. */
  contactRadius: number
  /** Cooldown between contact damage ticks (seconds). */
  contactCooldown: number
}

/** All enemy type configs keyed by type name. */
const ENEMY_TYPES = enemyTypesJson as Record<string, EnemyTypeConfig>

/**
 * Get the config for an enemy type.
 *
 * @param type - Enemy type key (e.g. 'bacteriophage')
 * @returns The typed config
 * @throws If the type is not found
 */
export function getEnemyTypeConfig(type: string): EnemyTypeConfig {
  const config = ENEMY_TYPES[type]
  if (!config) throw new Error(`Unknown enemy type: ${type}`)
  return config
}
