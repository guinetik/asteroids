<script setup lang="ts">
/**
 * Top-center mission timer banner — shown when a level-scope mission has an
 * active countdown (currently Bunker Protect's suspension-lapse timer; Bunker
 * Extract's delivery countdown later).
 *
 * @author guinetik
 * @date 2026-05-11
 * @spec docs/superpowers/specs/2026-05-11-yamada-mission-pool-design.md
 */

defineProps<{
  /** Label above the countdown — e.g. `'SUSPENSION CYCLE'`. */
  title: string
  /** Seconds remaining, clamped >= 0. Renders as `m:ss`. */
  remainingSeconds: number
}>()

/**
 * Format seconds as `m:ss`. Floors to int; negative or NaN clamps to 0.
 *
 * @param totalSeconds - Seconds remaining.
 */
function formatMmSs(totalSeconds: number): string {
  const t = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0
  const m = Math.floor(t / 60)
  const s = t % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
</script>

<template>
  <div class="mission-timer-hud">
    <div class="mission-timer-hud__title">{{ title }}</div>
    <div class="mission-timer-hud__time">{{ formatMmSs(remainingSeconds) }}</div>
  </div>
</template>

<style>
.mission-timer-hud {
  pointer-events: none;
  position: fixed;
  top: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 0.4rem 0.9rem;
  background: rgba(0, 10, 15, 0.55);
  border: 1px solid rgba(34, 211, 238, 0.28);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  font-family: 'Datatype', ui-monospace, monospace;
  color: rgba(255, 255, 255, 0.92);
}

.mission-timer-hud__title {
  font-size: 0.6rem;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: rgba(165, 243, 252, 0.85);
}

.mission-timer-hud__time {
  font-size: 1.1rem;
  letter-spacing: 0.14em;
  color: rgba(207, 250, 254, 0.97);
}
</style>
