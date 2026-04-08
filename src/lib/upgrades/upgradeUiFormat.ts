/**
 * Format upgrade definition stats for engineering-bay UI (current vs next tier).
 *
 * @author guinetik
 * @date 2026-04-08
 * @spec docs/superpowers/specs/2026-04-07-upgrade-system-design.md
 */
import type { NumericUpgradeDefinition } from '@/lib/upgrades'

/**
 * Read the numeric value for a tier, clamped to 0..maxLevel.
 *
 * @param def - Upgrade definition from catalog.
 * @param level - Tier index (0 = baseline).
 */
export function statValueAtDisplayLevel(def: NumericUpgradeDefinition, level: number): number {
  const clamped = Math.max(0, Math.min(def.maxLevel, Math.floor(level)))
  const v = def.valuesByLevel[clamped]
  return v ?? def.valuesByLevel[0]!
}

/**
 * Pretty-print a stat for UI (trim trailing zeros, finite guard).
 *
 * @param n - Raw multiplier or coefficient from `valuesByLevel`.
 */
export function formatUpgradeStatValue(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const s = n.toFixed(2)
  return s.replace(/\.?0+$/, '')
}
