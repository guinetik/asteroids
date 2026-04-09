<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { AudioPlaybackHandle } from '@/audio/audioTypes'
import { useAudio } from '@/audio/useAudio'
import { startShipMessagePlayback } from './shipMessageAudioPlayback'

const props = defineProps<{
  messageId: string
  audioUrl: string
  autoplayToken: number
}>()

const audio = useAudio()

let currentHandle: AudioPlaybackHandle | null = null
let progressInterval: ReturnType<typeof setInterval> | null = null

const isPlaying = ref(false)
const progress = ref(0)

const progressPercent = computed(() => `${Math.max(0, Math.min(100, progress.value * 100))}%`)
const buttonLabel = computed(() => (isPlaying.value ? 'Stop Audio Message' : 'Play Audio Message'))

function clearProgressInterval(): void {
  if (!progressInterval) return
  clearInterval(progressInterval)
  progressInterval = null
}

function resetPlaybackState(): void {
  isPlaying.value = false
  progress.value = 0
  clearProgressInterval()
}

function stopPlayback(): void {
  if (currentHandle) {
    currentHandle.stop()
    currentHandle = null
  }
  resetPlaybackState()
}

function updateProgress(): void {
  if (!currentHandle) return
  if (!currentHandle.playing()) return
  progress.value = currentHandle.progress()
}

function beginPlayback(): void {
  stopPlayback()
  const handle = startShipMessagePlayback(audio, props.audioUrl, stopPlayback)
  if (!handle) return
  currentHandle = handle
  isPlaying.value = true
  progress.value = 0
  progressInterval = setInterval(updateProgress, 100)
}

function togglePlayback(): void {
  if (isPlaying.value) {
    stopPlayback()
    return
  }
  beginPlayback()
}

watch(
  () => props.autoplayToken,
  () => {
    beginPlayback()
  },
)

onMounted(() => {
  if (props.autoplayToken > 0) {
    beginPlayback()
  }
})

onUnmounted(stopPlayback)
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
