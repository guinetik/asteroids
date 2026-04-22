<script setup lang="ts">
/**
 * Confirmation dialog shown when the player clicks an unlocked planet on the
 * tactical map. Confirming triggers the fade-to-black + ship reposition.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-contracts-design.md
 */
import { computed } from 'vue'

const props = defineProps<{
  /** Whether the dialog is visible. */
  visible: boolean
  /** Friendly name of the destination planet (e.g. `"Mars"`). */
  planetLabel: string
  /** Current fuel level (0..1 of capacity). Used to gate the jump. */
  fuelRatio: number
  /** Minimum fuel ratio required to authorize the jump (0..1). */
  requiredFuelRatio: number
  /** Fraction of the *current* fuel that the burn will consume (0..1). */
  fuelCostRatio: number
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const fuelPct = computed(() => Math.round(Math.max(0, Math.min(1, props.fuelRatio)) * 100))
const requiredPct = computed(() => Math.round(props.requiredFuelRatio * 100))
const costPct = computed(() => Math.round(props.fuelCostRatio * 100))
const fuelOk = computed(() => props.fuelRatio + 1e-6 >= props.requiredFuelRatio)
</script>

<template>
  <Transition name="fast-travel">
    <div
      v-if="props.visible"
      class="fast-travel-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm fast travel"
      @click.self="emit('cancel')"
    >
      <div class="fast-travel-card">
        <header class="fast-travel-card__chrome">
          <span class="fast-travel-card__chrome-tag">Sol Sector · Lane Authorization</span>
        </header>
        <div class="fast-travel-card__body">
          <h1 class="fast-travel-card__title">Fast Travel</h1>
          <p class="fast-travel-card__prompt">
            Do you wish to fast travel to <strong>{{ props.planetLabel }}</strong>?
          </p>
          <p class="fast-travel-card__hint">
            Your shuttle will jump to a stable orbit. Active mission timers continue.
          </p>
          <div class="fast-travel-card__fuel" :class="{ 'fast-travel-card__fuel--low': !fuelOk }">
            <div class="fast-travel-card__fuel-row">
              <span class="fast-travel-card__fuel-label">Reactor charge</span>
              <span class="fast-travel-card__fuel-value">{{ fuelPct }}% / {{ requiredPct }}% req</span>
            </div>
            <div class="fast-travel-card__fuel-bar">
              <div
                class="fast-travel-card__fuel-bar-fill"
                :style="{ width: fuelPct + '%' }"
              />
              <div
                class="fast-travel-card__fuel-bar-threshold"
                :style="{ left: requiredPct + '%' }"
                :title="`Minimum ${requiredPct}% required`"
              />
            </div>
            <p class="fast-travel-card__fuel-cost">
              Burn cost: <strong>{{ costPct }}%</strong> of current fuel.
            </p>
            <p v-if="!fuelOk" class="fast-travel-card__fuel-warn">
              Insufficient charge — top up to at least {{ requiredPct }}% before jumping.
            </p>
          </div>
          <div class="fast-travel-card__actions">
            <button
              type="button"
              class="fast-travel-card__btn fast-travel-card__btn--primary"
              :disabled="!fuelOk"
              @click="emit('confirm')"
            >
              Confirm Jump
            </button>
            <button
              type="button"
              class="fast-travel-card__btn fast-travel-card__btn--secondary"
              @click="emit('cancel')"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.fast-travel-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 12, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 70;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  backdrop-filter: blur(2px);
}

.fast-travel-card {
  width: min(440px, 90vw);
  background: rgba(7, 19, 24, 0.94);
  border: 1px solid rgba(106, 232, 196, 0.45);
  border-radius: 8px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
  overflow: hidden;
  color: #c9efe4;
}

.fast-travel-card__chrome {
  padding: 10px 16px;
  background: rgba(106, 232, 196, 0.12);
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(177, 228, 214, 0.85);
}

.fast-travel-card__body {
  padding: 24px 24px 28px;
  display: grid;
  gap: 16px;
}

.fast-travel-card__title {
  margin: 0;
  font-size: 22px;
  letter-spacing: 0.06em;
  color: #6ae8c4;
}

.fast-travel-card__prompt {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
}

.fast-travel-card__prompt strong {
  color: #6ae8c4;
  text-transform: capitalize;
}

.fast-travel-card__hint {
  margin: 0;
  font-size: 12px;
  color: rgba(177, 228, 214, 0.7);
}

.fast-travel-card__actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.fast-travel-card__btn {
  flex: 1;
  padding: 10px 16px;
  appearance: none;
  border-radius: 4px;
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}

.fast-travel-card__btn--primary {
  background: rgba(106, 232, 196, 0.22);
  color: #6ae8c4;
  border: 1px solid rgba(106, 232, 196, 0.65);
}

.fast-travel-card__btn--primary:hover {
  background: rgba(106, 232, 196, 0.36);
}

.fast-travel-card__btn--primary:disabled {
  background: rgba(106, 232, 196, 0.06);
  color: rgba(177, 228, 214, 0.35);
  border-color: rgba(106, 232, 196, 0.18);
  cursor: not-allowed;
}

.fast-travel-card__fuel {
  display: grid;
  gap: 6px;
  padding: 10px 12px;
  background: rgba(106, 232, 196, 0.06);
  border: 1px solid rgba(106, 232, 196, 0.22);
  border-radius: 4px;
}

.fast-travel-card__fuel--low {
  background: rgba(232, 106, 106, 0.08);
  border-color: rgba(232, 106, 106, 0.4);
}

.fast-travel-card__fuel-row {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(177, 228, 214, 0.78);
}

.fast-travel-card__fuel--low .fast-travel-card__fuel-row {
  color: rgba(244, 174, 174, 0.85);
}

.fast-travel-card__fuel-bar {
  position: relative;
  height: 6px;
  border-radius: 3px;
  background: rgba(8, 18, 22, 0.85);
  overflow: hidden;
}

.fast-travel-card__fuel-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, rgba(106, 232, 196, 0.4), rgba(106, 232, 196, 0.85));
  transition: width 160ms ease;
}

.fast-travel-card__fuel--low .fast-travel-card__fuel-bar-fill {
  background: linear-gradient(90deg, rgba(232, 106, 106, 0.45), rgba(244, 174, 174, 0.9));
}

.fast-travel-card__fuel-bar-threshold {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 2px;
  background: rgba(255, 255, 255, 0.65);
  transform: translateX(-1px);
  pointer-events: none;
}

.fast-travel-card__fuel-cost {
  margin: 0;
  font-size: 12px;
  color: rgba(177, 228, 214, 0.75);
}

.fast-travel-card__fuel-cost strong {
  color: #6ae8c4;
}

.fast-travel-card__fuel-warn {
  margin: 0;
  font-size: 12px;
  color: #f4aeae;
}

.fast-travel-card__btn--secondary {
  background: transparent;
  color: rgba(177, 228, 214, 0.78);
  border: 1px solid rgba(177, 228, 214, 0.42);
}

.fast-travel-card__btn--secondary:hover {
  background: rgba(177, 228, 214, 0.12);
}

.fast-travel-enter-active,
.fast-travel-leave-active {
  transition: opacity 160ms ease;
}

.fast-travel-enter-from,
.fast-travel-leave-to {
  opacity: 0;
}
</style>
