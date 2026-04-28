<script setup lang="ts">
defineProps<{
  /** Zero-based current wave index. */
  waveIndex: number
  /** Total waves the player must clear. */
  totalWaves: number
  /** Live alive-enemy count. */
  hostiles: number
  /** Sub-state label for the bottom row. */
  phase: 'wave-active' | 'wave-breather' | 'final-clear' | 'exit-prompt'
}>()
</script>

<template>
  <div class="bunker-wave-hud">
    <template v-if="phase === 'exit-prompt'">
      <div class="bunker-wave-hud__title">BUNKER SECURE — EXTRACT</div>
    </template>
    <template v-else>
      <div class="bunker-wave-hud__title">WAVE {{ waveIndex + 1 }} OF {{ totalWaves }}</div>
      <div v-if="phase === 'wave-breather'" class="bunker-wave-hud__sub">
        WAVE {{ waveIndex + 2 }} INCOMING
      </div>
      <div v-else-if="phase === 'wave-active'" class="bunker-wave-hud__sub">
        {{ hostiles }} HOSTILE{{ hostiles === 1 ? '' : 'S' }}
      </div>
    </template>
  </div>
</template>
