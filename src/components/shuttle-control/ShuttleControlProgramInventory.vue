<script setup lang="ts">
import { computed } from 'vue'
import { getItemDefinition } from '@/lib/inventory/catalog'
import type { Inventory, InventoryStack } from '@/lib/inventory/types'
import InventoryTable from '@/components/shop/InventoryTable.vue'

const props = defineProps<{
  inventory?: Inventory | null
  inventoryStacks?: InventoryStack[]
}>()

const emit = defineEmits<{
  'use-item': [itemId: string]
}>()

type CargoBandId = 'rocks' | 'special' | 'vendor' | 'fuel' | 'other'

interface CargoBand {
  id: CargoBandId
  label: string
  weightKg: number
  percent: number
}

function classifyStack(stack: InventoryStack): CargoBandId {
  const item = getItemDefinition(stack.itemId)
  if (!item) return 'other'
  if (stack.itemId === 'grid-coupling-module') return 'special'
  if (item.id === 'fuel-cell' || item.id === 'shuttle-fuel-cell') return 'fuel'
  if (item.category === 'mineral') return 'rocks'
  if (item.category === 'mission-material') return 'special'
  if (item.category === 'trade-good') return 'vendor'
  return 'other'
}

const resolvedInventory = computed<Inventory>(() =>
  props.inventory ?? {
    stacks: props.inventoryStacks ?? [],
    maxSlots: Math.max((props.inventoryStacks ?? []).length, 0),
    maxWeightKg: 0,
  })

const totalWeightKg = computed(() =>
  resolvedInventory.value.stacks.reduce((sum, stack) => sum + stack.totalWeightKg, 0))

const slotUsage = computed(() => ({
  used: resolvedInventory.value.stacks.length,
  max: resolvedInventory.value.maxSlots,
}))

const weightUsagePercent = computed(() => {
  if (resolvedInventory.value.maxWeightKg <= 0) return 0
  return Math.min(100, (totalWeightKg.value / resolvedInventory.value.maxWeightKg) * 100)
})

const cargoBands = computed<CargoBand[]>(() => {
  const weights: Record<CargoBandId, number> = {
    rocks: 0,
    special: 0,
    vendor: 0,
    fuel: 0,
    other: 0,
  }

  for (const stack of resolvedInventory.value.stacks) {
    weights[classifyStack(stack)] += stack.totalWeightKg
  }

  return [
    { id: 'rocks' as CargoBandId, label: 'Rocks', weightKg: weights.rocks, percent: 0 },
    { id: 'special' as CargoBandId, label: 'Special', weightKg: weights.special, percent: 0 },
    { id: 'vendor' as CargoBandId, label: 'Vendor Items', weightKg: weights.vendor, percent: 0 },
    { id: 'fuel' as CargoBandId, label: 'Fuel', weightKg: weights.fuel, percent: 0 },
    { id: 'other' as CargoBandId, label: 'Other', weightKg: weights.other, percent: 0 },
  ].map((band) => ({
    ...band,
    percent:
      resolvedInventory.value.maxWeightKg > 0
        ? (band.weightKg / resolvedInventory.value.maxWeightKg) * 100
        : 0,
  }))
})
</script>

<template>
  <div class="shuttle-control-screen">
    <h2 class="shuttle-control-screen__title">Inventory</h2>
    <section class="cargo-capacity-panel">
      <div class="cargo-capacity-panel__header">
        <div>
          <p class="cargo-capacity-panel__eyebrow">Cargo Capacity</p>
          <p class="cargo-capacity-panel__reading">
            {{ totalWeightKg.toFixed(0) }} / {{ resolvedInventory.maxWeightKg.toFixed(0) }} kg
          </p>
        </div>
        <div class="cargo-capacity-panel__slot-readout">
          {{ slotUsage.used }} / {{ slotUsage.max }} slots
        </div>
      </div>
      <div class="cargo-capacity-bar">
        <span
          v-for="band in cargoBands.filter((entry) => entry.weightKg > 0)"
          :key="band.id"
          class="cargo-capacity-bar__segment"
          :class="`cargo-capacity-bar__segment--${band.id}`"
          :style="{ width: `${band.percent}%` }"
        />
        <span
          v-if="weightUsagePercent < 100"
          class="cargo-capacity-bar__remaining"
          :style="{ width: `${100 - weightUsagePercent}%` }"
        />
      </div>
      <div class="cargo-capacity-legend">
        <div
          v-for="band in cargoBands"
          :key="band.id"
          class="cargo-capacity-legend__item"
          :class="{ 'cargo-capacity-legend__item--empty': band.weightKg <= 0 }"
        >
          <span class="cargo-capacity-legend__swatch" :class="`cargo-capacity-legend__swatch--${band.id}`" />
          <span class="cargo-capacity-legend__label">{{ band.label }}</span>
          <span class="cargo-capacity-legend__value">{{ band.weightKg.toFixed(0) }} kg</span>
        </div>
      </div>
    </section>
    <InventoryTable
      :items="resolvedInventory.stacks"
      mode="view"
      @use="(itemId) => emit('use-item', itemId)"
    />
  </div>
</template>
