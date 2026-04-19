/**
 * Mapping between asteroid composition mineral names and inventory item IDs.
 *
 * Asteroid composition entries use human-readable names like
 * "Iron-Nickel Alloy"; the inventory catalog uses kebab-case IDs like
 * `iron-nickel-alloy`. This module provides a deterministic, pure
 * normalization between the two. Used by the gather mining loop so the
 * `RockYieldSystem` can convert the rolled mineral name into the item
 * the player receives.
 *
 * @author guinetik
 * @date 2026-04-18
 * @spec docs/superpowers/specs/2026-04-18-gather-mission-design.md
 */
import { getItemDefinition } from '@/lib/inventory/catalog'

/**
 * Convert a composition entry's `name` (human-readable, mixed case,
 * spaces and punctuation) into the canonical inventory item id.
 *
 * Lowercases, strips diacritics, replaces any non-alphanumeric run with
 * a single hyphen, and trims leading/trailing hyphens. Pure and
 * deterministic.
 *
 * @param name - Composition entry name, e.g. "Iron-Nickel Alloy".
 * @returns Kebab-case item id, e.g. "iron-nickel-alloy".
 */
export function compositionNameToItemId(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Resolve a composition entry's `name` to a registered inventory item
 * id, or `null` if no item is defined for that mineral.
 *
 * Useful for filtering an asteroid composition down to the entries
 * that have a matching inventory item before rolling for a mineral
 * grant.
 *
 * @param name - Composition entry name.
 * @returns The canonical item id when registered, `null` otherwise.
 */
export function resolveCompositionItemId(name: string): string | null {
  const id = compositionNameToItemId(name)
  return getItemDefinition(id) ? id : null
}
