<script setup lang='ts'>
const props = defineProps<{
  intensity: number
}>()
</script>

<template>
  <svg
    v-if="props.intensity > 0"
    class="damage-vignette"
    viewBox="0 0 100 100"
    preserveAspectRatio="xMidYMid slice"
  >
    <defs>
      <radialGradient id="dmg-vignette-grad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="red" stop-opacity="0" />
        <stop offset="55%" stop-color="red" stop-opacity="0" />
        <stop offset="100%" stop-color="red" :stop-opacity="props.intensity * 0.7" />
      </radialGradient>
    </defs>
    <rect x="-10" y="-10" width="120" height="120" :fill="'url(#dmg-vignette-grad)'" />
  </svg>
</template>
