<!-- src/components/MissionTipMarquee.vue -->
<script setup lang="ts">
import { onMounted } from 'vue'
import { uiAudio } from '@/audio/UiAudioDirector'
import type { MissionTipTransmission } from '@/lib/level/missionTips'
import ScrambleText from '@/components/shuttle-control/ScrambleText.vue'

defineProps<{
  transmission: MissionTipTransmission
}>()

onMounted(() => {
  uiAudio.notifyTrackerMessage()
})
</script>

<template>
  <aside
    class="mission-tip"
    :class="`mission-tip--${transmission.tone}`"
    aria-live="polite"
    role="status"
  >
    <div class="mission-tip__rail" aria-hidden="true">
      <span class="mission-tip__pulse" />
      <span class="mission-tip__line" />
    </div>
    <div class="mission-tip__content">
      <div class="mission-tip__header">
        <span class="mission-tip__channel">{{ transmission.channel }}</span>
        <span class="mission-tip__signal">TRACKER</span>
        <span class="mission-tip__dismiss">TAB TO DISMISS</span>
      </div>
      <p class="mission-tip__message">
        <span class="mission-tip__speaker">{{ transmission.speaker }}:</span>
        <ScrambleText :text="transmission.message" :speed="24" :scramble-frames="7" :stagger="1" />
      </p>
    </div>
  </aside>
</template>
