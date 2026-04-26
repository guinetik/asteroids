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
    <div
      class="ship-message-audio-player__progress"
      :aria-label="`Playback progress for ${messageId}`"
    >
      <div class="ship-message-audio-player__progress-fill" :style="{ width: progressPercent }" />
    </div>
  </div>
</template>

<style scoped>
.ship-message-audio-player {
  margin-top: 16px;
  padding: 12px 16px;
  background: rgba(106, 232, 196, 0.03);
  border: 1px solid rgba(106, 232, 196, 0.15);
  border-radius: 4px;
  position: relative;
}

.ship-message-audio-player::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: rgba(106, 232, 196, 0.4);
}

.ship-message-audio-player__button {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 0;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: rgba(177, 228, 214, 0.8);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color 120ms ease;
}

.ship-message-audio-player__button:hover {
  color: #6ae8c4;
}

.ship-message-audio-player__button--playing {
  color: #6ae8c4;
}

.ship-message-audio-player__icon {
  width: 1.2em;
  text-align: center;
  font-size: 14px;
}

.ship-message-audio-player__progress {
  margin-top: 12px;
  height: 2px;
  background: rgba(106, 232, 196, 0.15);
  position: relative;
}

.ship-message-audio-player__progress-fill {
  height: 100%;
  background: #6ae8c4;
  transition: width 0.1s linear;
  box-shadow: 0 0 8px rgba(106, 232, 196, 0.6);
}
</style>
