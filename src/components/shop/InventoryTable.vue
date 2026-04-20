<script setup lang="ts">
import { computed } from 'vue'
import type { InventoryStack } from '@/lib/inventory/types'
import { getItemDefinition } from '@/lib/inventory/catalog'
import { getDesirabilityPips, computeSellPrice } from '@/lib/shop/planetDemand'

const props = defineProps<{
  items: InventoryStack[]
  mode: 'view' | 'sell'
  planetId?: string
}>()

const emit = defineEmits<{
  sell: [itemId: string, quantity: number]
  use: [itemId: string]
}>()

interface DisplayRow {
  itemId: string
  label: string
  icon: string
  quantity: number
  weightKg: number
  pips: number
  sellPrice: number
  canUse: boolean
  useLabel: string
}

const rows = computed<DisplayRow[]>(() => {
  const result: DisplayRow[] = props.items.map((stack) => {
    const def = getItemDefinition(stack.itemId)
    const pips =
      props.mode === 'sell' && props.planetId
        ? getDesirabilityPips(props.planetId, stack.itemId)
        : 0
    const sellPrice =
      props.mode === 'sell' && props.planetId
        ? computeSellPrice(props.planetId, stack.itemId)
        : 0
    return {
      itemId: stack.itemId,
      label: def?.label ?? stack.itemId,
      icon: def?.icon ?? '',
      quantity: stack.quantity,
      weightKg: stack.totalWeightKg,
      pips,
      sellPrice,
      canUse: stack.itemId === 'grid-coupling-module',
      useLabel: stack.itemId === 'grid-coupling-module' ? 'Install' : 'Use',
    }
  })

  if (props.mode === 'sell') {
    result.sort((a, b) => b.pips - a.pips)
  }

  return result
})

/**
 * Sell one unit from this stack at the station's demand price.
 *
 * @param itemId - Inventory item id.
 */
function handleSellOne(itemId: string): void {
  emit('sell', itemId, 1)
}

/**
 * Sell the entire stack at the station's demand price per unit.
 *
 * @param itemId - Inventory item id.
 * @param quantity - Units in this stack.
 */
function handleSellAll(itemId: string, quantity: number): void {
  emit('sell', itemId, quantity)
}

function handleUse(itemId: string) {
  emit('use', itemId)
}
</script>

<template>
  <div class="inventory-table">
    <div v-if="rows.length === 0" class="inventory-table__empty">
      Cargo hold is empty.
    </div>
    <div v-else class="inventory-table__grid">
      <div
        v-for="row in rows"
        :key="row.itemId"
        class="inventory-table__row"
      >
        <div class="inventory-table__icon-cell">
          <div class="inventory-table__icon-placeholder">{{ row.label.charAt(0) }}</div>
        </div>
        <div class="inventory-table__info">
          <span class="inventory-table__name">{{ row.label }}</span>
          <span class="inventory-table__meta">{{ row.quantity }} units &middot; {{ row.weightKg.toFixed(0) }} kg</span>
        </div>
        <div v-if="mode === 'sell'" class="inventory-table__demand">
          <span
            v-for="p in 5"
            :key="p"
            class="inventory-table__pip"
            :class="p <= row.pips ? 'inventory-table__pip--active' : 'inventory-table__pip--inactive'"
          />
        </div>
        <span v-if="mode === 'sell'" class="inventory-table__price">{{ row.sellPrice }} CR</span>
        <button
          v-if="mode === 'view' && row.canUse"
          type="button"
          class="inventory-table__action-btn"
          @click="handleUse(row.itemId)"
        >
          {{ row.useLabel }}
        </button>
        <div v-if="mode === 'sell'" class="inventory-table__sell-actions">
          <button
            type="button"
            class="inventory-table__action-btn"
            @click="handleSellOne(row.itemId)"
          >
            Sell 1
          </button>
          <button
            v-if="row.quantity > 1"
            type="button"
            class="inventory-table__action-btn inventory-table__action-btn--sell-all"
            @click="handleSellAll(row.itemId, row.quantity)"
          >
            Sell all
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
