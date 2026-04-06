<script setup lang="ts">
import type { InventoryStack } from '@/lib/inventory/types'
import InventoryTable from '@/components/shop/InventoryTable.vue'

defineProps<{
  inventoryStacks?: InventoryStack[]
}>()
</script>

<template>
  <div class="shuttle-control-screen">
    <h2 class="shuttle-control-screen__title">Inventory</h2>
    <InventoryTable :items="inventoryStacks ?? []" mode="view" />
  </div>
</template>
