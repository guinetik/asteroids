<script setup lang="ts">
/**
 * Tiny overlay shown at the bottom-center of the solar map while the
 * camera is parked on a mission focus target. Pressing Esc anywhere on
 * MapView (or clicking this prompt) returns the camera to the shuttle.
 *
 * @author guinetik
 * @date 2026-05-04
 * @spec docs/superpowers/specs/2026-05-04-active-missions-tracker-design.md
 */

const emit = defineEmits<{
  /** User clicked the prompt; parent should clear the focus state. */
  dismiss: []
}>()

/**
 * Click handler — emits the dismiss event so the parent can run the
 * same code path the Esc key uses.
 */
function onClick(): void {
  emit('dismiss')
}
</script>

<template>
  <button
    type="button"
    class="mission-focus-prompt"
    aria-label="Return camera to ship"
    @click="onClick"
  >
    <span class="mission-focus-prompt__key">ESC</span>
    <span class="mission-focus-prompt__label">Return to ship</span>
  </button>
</template>

<style>
.mission-focus-prompt {
  position: fixed;
  bottom: 4rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 70;
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.45rem 0.9rem;
  background: rgba(0, 10, 15, 0.55);
  border: 1px solid rgba(0, 255, 204, 0.25);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  cursor: pointer;
  transition: border-color 0.2s ease;
}

.mission-focus-prompt:hover {
  border-color: rgba(0, 255, 204, 0.6);
}

.mission-focus-prompt__key {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.65rem;
  letter-spacing: 0.2em;
  color: rgba(0, 255, 204, 0.9);
  border: 1px solid rgba(0, 255, 204, 0.4);
  padding: 0.1rem 0.35rem;
}

.mission-focus-prompt__label {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.7rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.85);
}
</style>
