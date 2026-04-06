/**
 * Mission material catalog registration.
 *
 * Imports mission-materials.json and registers each item into
 * the global ITEM_CATALOG so the inventory system can work with them.
 * Same pattern as trade goods registration in tradeGoods.ts.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-shuttle-missions-design.md
 */
import type { ItemDefinition } from '@/lib/inventory/types'
import { ITEM_CATALOG } from '@/lib/inventory/catalog'

import rawMaterials from '@/data/missions/mission-materials.json'

const materials = rawMaterials as unknown as ItemDefinition[]

// Validate and register into item catalog
for (const mat of materials) {
  if (!mat.id || !mat.label || !mat.description || !mat.icon) {
    throw new Error(`Mission material "${mat.id}" missing required string fields`)
  }
  if (mat.category !== 'mission-material') {
    throw new Error(`Mission material "${mat.id}" has wrong category "${mat.category}"`)
  }
  if (mat.weightPerUnit <= 0) {
    throw new Error(`Mission material "${mat.id}" has non-positive weightPerUnit`)
  }
  ITEM_CATALOG[mat.id] = mat
}
