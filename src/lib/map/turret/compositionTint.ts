/**
 * Stable, deterministic composition tinting for asteroid belt instances.
 *
 * Lets the player infer an asteroid's primary mineral before entering the turret
 * by recolouring each instance once at map init. The same (seed, beltMeshIndex,
 * localIndex) hash is used by the turret session, so the mineral actually mined
 * out of a rock always matches the tint the player saw flying past it.
 *
 * @author guinetik
 * @date 2026-04-21
 * @spec docs/superpowers/specs/2026-04-20-turret-mode-design.md
 */
import * as THREE from 'three'
import { resolveCompositionItemId } from '@/lib/asteroids/mineralItemMap'
import { MINERAL_VISUALS } from '@/lib/asteroids/minerals'
import { getItemDefinition } from '@/lib/inventory/catalog'
import type { MineralEntry } from '@/lib/asteroids/types'
import type { AsteroidBeltController } from '@/three/controllers/AsteroidBeltController'
import { pickTier, type TurretBeltId } from './turretTiers'

/**
 * Fixed seed used for every composition tint roll. Keeps the distribution of
 * colours across a belt stable between sessions so players can learn the map.
 */
export const COMPOSITION_TINT_SEED = 0x5f3759df

/**
 * Belt id → turret belt id map. Any belt not listed here is decorative (not
 * tintable, not mineable). Adding a new belt means extending both this map
 * and the `tiers` block in `turret-config.json`.
 */
const MINEABLE_BELTS: ReadonlyMap<string, TurretBeltId> = new Map<string, TurretBeltId>([
  ['main-belt', 'main-belt'],
  ['kuiper-belt', 'kuiper-belt'],
])

/**
 * Whether a belt participates in the turret composition system (tinting +
 * mining). Keyed on {@link THREE.Object3D.name}, which
 * {@link AsteroidBeltController} sets to the belt's data id.
 */
export function isMineableBelt(belt: AsteroidBeltController): boolean {
  return MINEABLE_BELTS.has(belt.group.name)
}

/**
 * Resolve the turret belt id for a controller, or `null` if it isn't
 * participating in turret mining.
 */
export function getTurretBeltId(belt: AsteroidBeltController): TurretBeltId | null {
  return MINEABLE_BELTS.get(belt.group.name) ?? null
}

/** Readable palette: one bright per mineral so tier reads at a glance. */
const READABLE_PALETTE: Record<string, [number, number, number]> = {
  // Main-belt rocks/metals
  olivine: [1.05, 0.88, 0.52],
  magnetite: [1.05, 1.05, 1.1],
  pyroxene: [2.05, 1.15, 0.45],
  'iron-nickel-alloy': [1.85, 1.92, 2.08],
  // Kuiper ices — cool/pale to read as icy at a glance
  'water-ice': [0.9, 1.5, 2.1],
  'carbon-dioxide-ice': [1.7, 1.85, 1.95],
  'sodium-chloride': [2.0, 1.65, 1.7],
}

/** HSL nudge floor/ceiling for minerals not in {@link READABLE_PALETTE}. */
const FALLBACK_SATURATION_BOOST = 1.45
const FALLBACK_SATURATION_OFFSET = 0.08
const FALLBACK_LIGHTNESS_CEILING = 0.72
const FALLBACK_LIGHTNESS_SCALE = 1.08
const FALLBACK_LIGHTNESS_OFFSET = 0.04

/**
 * Map a rolled mineral item id to the belt-instance tint used everywhere
 * (map preview + turret session).
 *
 * @param itemId - Catalog item id (e.g. `'olivine'`).
 * @returns Fresh THREE.Color each call so callers can mutate safely.
 */
export function getCompositionTintColor(itemId: string): THREE.Color {
  const palette = READABLE_PALETTE[itemId]
  if (palette) return new THREE.Color(palette[0], palette[1], palette[2])

  const fallback = new THREE.Color(1, 1, 1)
  const label = getItemDefinition(itemId)?.label
  if (!label) return fallback
  const visual = MINERAL_VISUALS[label]
  if (!visual) return fallback
  const color = new THREE.Color(visual.color[0], visual.color[1], visual.color[2])
  const hsl = { h: 0, s: 0, l: 0 }
  color.getHSL(hsl)
  color.setHSL(
    hsl.h,
    Math.min(1, hsl.s * FALLBACK_SATURATION_BOOST + FALLBACK_SATURATION_OFFSET),
    Math.min(
      FALLBACK_LIGHTNESS_CEILING,
      hsl.l * FALLBACK_LIGHTNESS_SCALE + FALLBACK_LIGHTNESS_OFFSET,
    ),
  )
  return color
}

/**
 * Stable float in `[0, 1)` from two integers. Same math as
 * {@link RockYieldSystem}'s private `pseudoRandom` so rolls produced here match
 * rolls produced there when both systems share a seed.
 */
function pseudoRandom(seed: number, salt: number): number {
  let s = ((seed | 0) * 0x9e3779b1) ^ ((salt | 0) * 0x85ebca77)
  s = (s + 0x6d2b79f5) | 0
  let t = Math.imul(s ^ (s >>> 15), 1 | s)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Prime used to weave (beltMeshIndex, localIndex) into a single roll salt. */
const INSTANCE_HASH_MIX = 1000003

/**
 * Compose a stable per-instance salt so (beltIndex, beltMeshIndex, localIndex)
 * always maps to the same roll, independent of enumeration order.
 */
export function instanceSalt(beltIndex: number, beltMeshIndex: number, localIndex: number): number {
  return ((beltIndex * INSTANCE_HASH_MIX + beltMeshIndex) * INSTANCE_HASH_MIX + localIndex) | 0
}

/**
 * Deterministically pick one mineral item id from a composition, weighted by
 * percentage. Returns `null` if the composition has no resolvable entries.
 */
export function rollCompositionItemId(
  composition: readonly MineralEntry[],
  seed: number,
  salt: number,
): string | null {
  const items: { itemId: string; weight: number }[] = []
  for (const entry of composition) {
    const itemId = resolveCompositionItemId(entry.name)
    if (itemId === null) continue
    const weight = Math.max(0, entry.percentage)
    if (weight <= 0) continue
    items.push({ itemId, weight })
  }
  if (items.length === 0) return null

  const totalWeight = items.reduce((sum, entry) => sum + entry.weight, 0)
  const target = pseudoRandom(seed, salt) * totalWeight
  let acc = 0
  for (const entry of items) {
    acc += entry.weight
    if (target < acc) return entry.itemId
  }
  return items[items.length - 1]!.itemId
}

/**
 * Paint every visible belt instance with its primary-mineral tint. Called once
 * after belts are built so the map shows composition without needing the
 * turret to register them first.
 *
 * @param belts - All asteroid belt controllers present in the scene.
 */
export function applyBeltCompositionTints(belts: readonly AsteroidBeltController[]): void {
  for (let beltIndex = 0; beltIndex < belts.length; beltIndex++) {
    const belt = belts[beltIndex]!
    const turretBeltId = getTurretBeltId(belt)
    if (!turretBeltId) continue
    for (const snap of belt.enumerateInstances()) {
      const tier = pickTier(snap.radius, turretBeltId)
      const salt = instanceSalt(beltIndex, snap.beltMeshIndex, snap.localIndex)
      const itemId = rollCompositionItemId(tier.composition, COMPOSITION_TINT_SEED, salt)
      if (!itemId) continue
      belt.setInstanceBaseTint(snap.beltMeshIndex, snap.localIndex, getCompositionTintColor(itemId))
    }
  }
}
