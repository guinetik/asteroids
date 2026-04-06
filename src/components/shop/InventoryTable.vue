<script setup lang="ts">
import { computed } from 'vue'
import type { InventoryStack } from '@/lib/inventory/types'
import { getItemDefinition } from '@/lib/inventory/catalog'
import { getDesirabilityPips } from '@/lib/shop/planetDemand'

const props = defineProps<{
  items: InventoryStack[]
  mode: 'view' | 'sell'
  planetId?: string
}>()

const emit = defineEmits<{
  sell: [itemId: string, quantity: number]
}>()

interface DisplayRow {
  itemId: string
  label: string
  icon: string
  quantity: number
  weightKg: number
  pips: number
}

const rows = computed<DisplayRow[]>(() => {
  const result: DisplayRow[] = props.items.map((stack) => {
    const def = getItemDefinition(stack.itemId)
    const pips =
      props.mode === 'sell' && props.planetId
        ? getDesirabilityPips(props.planetId, stack.itemId)
        : 0
    return {
      itemId: stack.itemId,
      label: def?.label ?? stack.itemId,
      icon: def?.icon ?? '',
      quantity: stack.quantity,
      weightKg: stack.totalWeightKg,
      pips,
    }
  })

  if (props.mode === 'sell') {
    result.sort((a, b) => b.pips - a.pips)
  }

  return result
})

function handleSell(itemId: string) {
  emit('sell', itemId, 1)
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
        <button
          v-if="mode === 'sell'"
          type="button"
          class="inventory-table__sell-btn"
          @click="handleSell(row.itemId)"
        >
          Sell
        </button>
      </div>
    </div>
  </div>
</template>
