<script setup lang="ts">
/**
 * Cyan tactical-map notification pill for contract-origin ship messages.
 *
 * Sibling of the blue `map-message-notice` rendered in {@link MapView.vue}.
 * Consumers compute the label through {@link contractNoticeLabel} and handle
 * the `click` event by deep-linking `ShuttleControlOverlay` into the contract
 * folder + target message. Styling lives in `src/assets/css/main.css` under
 * the `.map-contract-notice` / `__button` classes so it stays in lockstep
 * with the sibling inbox pill (`.map-message-notice`).
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
