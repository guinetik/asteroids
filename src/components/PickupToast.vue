<!-- src/components/PickupToast.vue -->
<script setup lang="ts">
/**
 * Stacking pickup notification HUD.
 *
 * Renders a column of recently picked-up resources. Each entry is a
 * small toast showing the gained quantity and the item label
 * (e.g. `+5 Olivine`). Toasts are aggregated by item id within
 * `pickup.expiresAt` so rapid bursts (drilling a single rock yields
 * several extractions per second) collapse into one toast that pulses
 * each time it grows.
 *
 * The component is purely presentational. Lifetime, aggregation and
 * removal are owned by the parent so the same data can be reused for
 * other UI surfaces (audio feedback, achievements, etc.).
 *
 * @author guinetik
 * @date 2026-04-18
 */
import { computed } from 'vue'

/** A single pickup entry shown in the toast stack. */
export interface PickupEntry {
  /** Stable key — typically the catalog item id. */
  id: string
  /** Catalog item id (e.g. `"olivine"`). */
  itemId: string
  /** Display label (e.g. `"Olivine"`). */
  label: string
  /** Aggregated quantity since this entry started. */
  quantity: number
  /**
   * Monotonically incremented every time `quantity` grows. Used as the
   * `:key` for the inner number element so Vue replays the bump
   * animation on each new addition.
   */
  pulse: number
}

const props = defineProps<{
  /** Active pickups, oldest first. */
  pickups: readonly PickupEntry[]
  /** Optional max number of toasts to render simultaneously. */
  maxVisible?: number
}>()

const visiblePickups = computed(() => {
  const max = props.maxVisible ?? 5
  if (props.pickups.length <= max) return props.pickups
  return props.pickups.slice(props.pickups.length - max)
})
</script>

<template>
  <div class="pickup-toast" aria-live="polite">
    <transition-group name="pickup-toast" tag="div" class="pickup-toast__stack">
      <div v-for="entry in visiblePickups" :key="entry.id" class="pickup-toast__entry">
        <span class="pickup-toast__plus">+</span>
        <span :key="entry.pulse" class="pickup-toast__qty">{{ entry.quantity }}</span>
        <span class="pickup-toast__label">{{ entry.label }}</span>
      </div>
    </transition-group>
  </div>
</template>

<style>
.pickup-toast {
  position: fixed;
  bottom: 22%;
  right: 1.2rem;
  z-index: 28;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.pickup-toast__stack {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  align-items: flex-end;
}
.pickup-toast__entry {
  display: inline-flex;
  align-items: baseline;
  gap: 0.45rem;
  padding: 0.35rem 0.75rem;
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.85rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(102, 255, 238, 0.95);
  background: rgba(0, 12, 18, 0.6);
  border: 1px solid rgba(102, 255, 238, 0.35);
  box-shadow:
    0 0 12px rgba(102, 255, 238, 0.15),
    inset 0 0 8px rgba(102, 255, 238, 0.05);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}
.pickup-toast__plus {
  color: rgba(102, 255, 238, 0.7);
  font-size: 0.75rem;
}
.pickup-toast__qty {
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.95);
  font-weight: 500;
  display: inline-block;
  animation: pickup-toast-bump 0.32s ease-out;
}
.pickup-toast__label {
  color: rgba(102, 255, 238, 0.85);
}

@keyframes pickup-toast-bump {
  0% {
    transform: translateY(-3px) scale(1.18);
    color: rgba(255, 255, 255, 1);
  }
  100% {
    transform: translateY(0) scale(1);
    color: rgba(255, 255, 255, 0.95);
  }
}

.pickup-toast-enter-active,
.pickup-toast-leave-active {
  transition:
    opacity 0.4s ease,
    transform 0.4s ease;
}
.pickup-toast-enter-from {
  opacity: 0;
  transform: translateX(20px);
}
.pickup-toast-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
.pickup-toast-leave-active {
  position: absolute;
  right: 0;
}
</style>
