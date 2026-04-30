/**
 * Multiplicative shuttle-buff application. Reads `profile.shuttleBuffs` and
 * compounds every registered multiplier into a base stat value.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-29-jovian-outcome-side-effects-design.md
 */
import type { PlayerProfile } from '@/lib/player/types'

/**
 * Apply registered shuttle buffs to a base stat value. Multiplies the base by
 * every registered buff's multiplier (compounding if multiple buffs target the
 * same stat — currently only `jovianEmpowerment` is registered).
 *
 * @param profile - Player profile (read-only).
 * @param baseValue - Unbuffed stat value.
 * @param _statKey - Reserved for future per-stat buffs. `jovianEmpowerment` is
 * global, so the key is currently ignored.
 * @returns Buffed stat value (compounded multiplicatively).
 */
export function applyShuttleBuffs(
  profile: PlayerProfile,
  baseValue: number,
  _statKey: string,
): number {
  const buffs = profile.shuttleBuffs
  if (!buffs) return baseValue
  let value = baseValue
  for (const multiplier of Object.values(buffs)) {
    value *= multiplier
  }
  return value
}
