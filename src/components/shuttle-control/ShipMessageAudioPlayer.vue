<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useShipMessageAudioSession } from './shipMessageAudioSession'

const props = defineProps<{
  messageId: string
  audioUrl: string
  autoplayToken: number
}>()

const session = useShipMessageAudioSession(props.messageId)
const isPlaying = session.isPlaying
const progressPercent = session.progressPercent
const buttonLabel = computed(() => (isPlaying.value ? 'Stop Audio Message' : 'Play Audio Message'))

function togglePlayback(): void {
  session.togglePlayback(props.audioUrl)
}

watch(
  () => props.autoplayToken,
  () => {
    session.autoplay(props.audioUrl)
  },
)

onMounted(() => {
  if (props.autoplayToken > 0) {
    session.autoplay(props.audioUrl)
  }
})
</script>

<template>
  <div class="ship-message-audio-player">
    <button
      type="button"
      class="ship-message-audio-player__button"
      :class="{ 'ship-message-audio-player__button--playing': isPlaying }"
      @click="togglePlayback"
    >
      <span class="ship-message-audio-player__icon">{{ isPlaying ? '■' : '▶' }}</span>
      <span>{{ buttonLabel }}</span>
    </button>
    <div class="ship-message-audio-player__progress" :aria-label="`Playback progress for ${messageId}`">
      <div class="ship-message-audio-player__progress-fill" :style="{ width: progressPercent }" />
    </div>
  </div>
</template>

<style scoped>
.ship-message-audio-player {
  margin-top: 16px;
  padding: 12px 14px;
  background: rgba(120, 255, 223, 0.04);
  border: 1px solid rgba(120, 255, 223, 0.14);
  border-radius: 8px;
}

.ship-message-audio-player__button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  font: inherit;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(196, 240, 228, 0.82);
  background: transparent;
  border: none;
  cursor: pointer;
}

.ship-message-audio-player__button:hover {
  color: rgba(236, 255, 248, 0.98);
}

.ship-message-audio-player__button--playing {
  color: rgba(120, 255, 223, 0.96);
}

.ship-message-audio-player__icon {
  width: 1em;
  text-align: center;
}

.ship-message-audio-player__progress {
  margin-top: 10px;
  height: 3px;
  background: rgba(196, 240, 228, 0.14);
  border-radius: 999px;
  overflow: hidden;
}

.ship-message-audio-player__progress-fill {
  height: 100%;
  background: linear-gradient(90deg, rgba(120, 255, 223, 0.56), rgba(120, 255, 223, 0.95));
  transition: width 0.12s linear;
}
</style>
