<template>
  <div class="shuttle-control-screen">
    <h2 class="shuttle-control-screen__title">Inventory</h2>
    <InventoryTable :items="[]" mode="view" />
  </div>
</template>

<script setup lang="ts">
import InventoryTable from '@/components/shop/InventoryTable.vue'
</script>
