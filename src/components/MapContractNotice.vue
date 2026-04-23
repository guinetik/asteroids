<script setup lang="ts">
/**
 * Cyan tactical-map notification pill for contract-origin ship messages.
 *
 * Sibling of the blue `map-message-notice` rendered in {@link MapView.vue}.
 * Consumers compute the label through {@link contractNoticeLabel} and handle
 * the `click` event by deep-linking `ShuttleControlOverlay` into the contract
 * folder + target message.
 *
 * @author guinetik
 * @date 2026-04-23
 * @spec docs/superpowers/specs/2026-04-23-contract-notification-channel-design.md
 */
import { uiAudio } from '@/audio/UiAudioDirector'

defineProps<{
  /** Pre-computed pill text (e.g. `"CONTRACT UPDATED: Gravity Surfer"`). */
  label: string
}>()

const emit = defineEmits<{
  click: []
}>()

function onClick(): void {
  uiAudio.notifyConfirm()
  emit('click')
}
</script>

<template>
  <div class="map-contract-notice">
    <button type="button" class="map-contract-notice__button" @click="onClick">
      {{ label }}
    </button>
  </div>
</template>

<style scoped>
.map-contract-notice {
  pointer-events: auto;
}

.map-contract-notice__button {
  appearance: none;
  background: rgba(106, 232, 196, 0.12);
  border: 1px solid rgba(106, 232, 196, 0.5);
  color: #6ae8c4;
  padding: 10px 18px;
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  cursor: pointer;
  border-radius: 2px;
  box-shadow: inset 3px 0 0 #6ae8c4, 0 0 18px rgba(106, 232, 196, 0.25);
  transition: background 120ms ease, box-shadow 120ms ease;
}

.map-contract-notice__button:hover {
  background: rgba(106, 232, 196, 0.22);
  box-shadow: inset 3px 0 0 #6ae8c4, 0 0 24px rgba(106, 232, 196, 0.4);
}
</style>
