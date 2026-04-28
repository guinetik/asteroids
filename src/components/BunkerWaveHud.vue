<script setup lang="ts">
/**
 * Top-center bunker HUD: wave counter + sub-state context line.
 *
 * Mounted by `LevelView.vue` only while the bunker sub-FSM is in one of the
 * four combat/exit phases.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-bunker-mission-design.md
 */
import type { BunkerSubState } from '@/lib/bunker/bunkerSceneState'

defineProps<{
  /** Zero-based current wave index. */
  waveIndex: number
  /** Total waves the player must clear. */
  totalWaves: number
  /** Live alive-enemy count. */
  hostiles: number
  /** Sub-state label for the bottom row — one of the FSM's combat/exit phases. */
  phase: Extract<BunkerSubState, 'wave-active' | 'wave-breather' | 'final-clear' | 'exit-prompt'>
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
