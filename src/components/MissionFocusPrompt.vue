<script setup lang="ts">
/**
 * Tiny overlay shown at the bottom-center of the solar map while the
 * camera is parked on a mission focus target. Pressing Esc anywhere on
 * MapView (or clicking this prompt) returns the camera to the shuttle.
 *
 * Implemented as a thin wrapper over the standardized {@link KeyPrompt}
 * so the visual treatment stays consistent with every other key prompt
 * in the game (split keycap variant, green tone for mission/data
 * interactions).
 *
 * @author guinetik
 * @date 2026-05-04
 * @spec docs/superpowers/specs/2026-05-04-active-missions-tracker-design.md
 */
import KeyPrompt from './KeyPrompt.vue'

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
  <KeyPrompt
    key-label="ESC"
    action="Return to ship"
    tone="green"
    variant="split"
    position="bottom-low"
    clickable
    @click="onClick"
  />
</template>
