<script setup lang="ts">
defineProps<{
  credits: number
}>()
</script>

<template>
  <div class="credits-badge">
    <span class="credits-badge__icon">CR</span>
    <span class="credits-badge__value">{{ credits.toLocaleString() }}</span>
  </div>
</template>
