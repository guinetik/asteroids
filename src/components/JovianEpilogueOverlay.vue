<!--
  JovianEpilogueOverlay.vue — One-time epilogue cutscene for the Jovian
  Society Prospection contract's transmit outcome. Plays a full-screen video
  with a Society-voiced subtitle line over a corporate-banal asset processing
  shot. Continue button dismisses; flag prevents replay.

  @author guinetik
  @date 2026-04-30
  @spec docs/superpowers/specs/2026-04-29-jovian-outcome-side-effects-design.md
-->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const props = defineProps<{
  /** Continue handler — fired exactly once when the player dismisses. */
  onContinue: () => void
}>()

const videoEl = ref<HTMLVideoElement | null>(null)
const dismissed = ref(false)

/** Subtitle copy from the spec (open question 2 — implementer's call). */
const SUBTITLE =
  'Asset 2306-J · processing cycle initiated · estimated yield 2.8B CR · 14-month demolition schedule · Cohort: Q4 / 2306'

/** Video source path — bound dynamically so Vite does not process it as a static asset import. */
const VIDEO_SRC = '/jovian-ending.mp4'

/** Poster image path — bound dynamically so Vite does not process it as a static asset import. */
const VIDEO_POSTER = '/jovian-ending.webp'

/** Fire onContinue exactly once. Idempotent against repeat clicks/keys. */
function handleContinue(): void {
  if (dismissed.value) return
  dismissed.value = true
  props.onContinue()
}

/** Capture-phase keyboard dismiss: Enter, Space, Escape. */
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
    e.preventDefault()
    handleContinue()
  }
}

onMounted(() => {
  videoEl.value?.play().catch(() => {
    // Autoplay blocked — user gesture (Continue click) will still dismiss.
  })
  window.addEventListener('keydown', onKeydown, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown, true)
})
</script>

<template>
  <div class="jovian-epilogue-overlay" data-test="jovian-epilogue">
    <video
      ref="videoEl"
      class="jovian-epilogue-overlay__video"
      :src="VIDEO_SRC"
      :poster="VIDEO_POSTER"
      muted
      playsinline
      preload="auto"
    />
    <div class="jovian-epilogue-overlay__subtitle">
      {{ SUBTITLE }}
    </div>
    <button
      type="button"
      class="jovian-epilogue-overlay__continue"
      :disabled="dismissed"
      @click="handleContinue"
    >
      Continue
    </button>
  </div>
</template>
