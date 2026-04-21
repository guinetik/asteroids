<script setup lang="ts">
/**
 * Confirmation dialog shown when the player clicks an unlocked planet on the
 * tactical map. Confirming triggers the fade-to-black + ship reposition.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-contracts-design.md
 */
const props = defineProps<{
  /** Whether the dialog is visible. */
  visible: boolean
  /** Friendly name of the destination planet (e.g. `"Mars"`). */
  planetLabel: string
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
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
          <div class="fast-travel-card__actions">
            <button
              type="button"
              class="fast-travel-card__btn fast-travel-card__btn--primary"
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
