<script setup lang="ts">
/**
 * Cyan contract-update pill rendered inside `.map-screen-nav__actions`, to the
 * left of the navbar icon buttons. Distinct from the blue `ShipMessageDialog`
 * channel — this pill deep-links into `ShuttleControlOverlay`'s mail program
 * with the contract folder + target message pre-selected on click.
 *
 * Styling lives in `src/assets/css/main.css` under `.map-contract-notice__button`.
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
  uiAudio.notifyConfirm();
  emit('click')
}
</script>

<template>
  <button type="button" class="map-contract-notice__button" @click="onClick">
    {{ label }}
  </button>
</template>
