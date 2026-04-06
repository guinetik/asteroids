<script setup lang="ts">
defineProps<{
  planetName: string
}>()

defineEmits<{
  open: []
}>()
</script>

<template>
  <div class="shop-button-container">
    <button
      type="button"
      class="shop-button"
      @click="$emit('open')"
    >
      <span class="shop-button__label">Shop</span>
      <span class="shop-button__planet">{{ planetName }}</span>
    </button>
    <span class="shop-button__hint">B</span>
  </div>
</template>
