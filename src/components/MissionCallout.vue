<script setup lang="ts">
defineProps<{
  bodyName: string
  stepSubject?: string | null
}>()
</script>

<template>
  <aside class="mission-callout" :aria-label="`Mission callout for ${bodyName}`">
    <slot />
  </aside>
</template>
