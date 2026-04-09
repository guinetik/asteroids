import { computed, ref } from 'vue'
import type { AudioPlaybackHandle } from '@/audio/audioTypes'
import { useAudio } from '@/audio/useAudio'
import { startShipMessagePlayback } from './shipMessageAudioPlayback'

const audio = useAudio()

const activeMessageId = ref<string | null>(null)
const sessionPlaying = ref(false)
const sessionProgress = ref(0)

let currentHandle: AudioPlaybackHandle | null = null
let progressInterval: ReturnType<typeof setInterval> | null = null

function clearProgressInterval(): void {
  if (!progressInterval) return
  clearInterval(progressInterval)
  progressInterval = null
}

function resetSessionState(): void {
  sessionPlaying.value = false
  sessionProgress.value = 0
  clearProgressInterval()
}

function handlePlaybackEnded(): void {
  currentHandle = null
  activeMessageId.value = null
  resetSessionState()
}

function updateProgress(): void {
  if (!currentHandle) return
  if (!currentHandle.playing()) return
  sessionProgress.value = currentHandle.progress()
}

function playMessageAudio(messageId: string, audioUrl: string): void {
  stopMessageAudio()
  const handle = startShipMessagePlayback(audio, audioUrl, handlePlaybackEnded)
  if (!handle) return
  currentHandle = handle
  activeMessageId.value = messageId
  sessionPlaying.value = true
  sessionProgress.value = 0
  progressInterval = setInterval(updateProgress, 100)
}

export function stopMessageAudio(): void {
  if (currentHandle) {
    const handle = currentHandle
    currentHandle = null
    handle.stop()
  }
  activeMessageId.value = null
  resetSessionState()
}

export function useShipMessageAudioSession(messageId: string) {
  const isActiveMessage = computed(() => activeMessageId.value === messageId)

  return {
    isPlaying: computed(() => isActiveMessage.value && sessionPlaying.value),
    progressPercent: computed(() =>
      isActiveMessage.value ? `${Math.max(0, Math.min(100, sessionProgress.value * 100))}%` : '0%',
    ),
    togglePlayback(audioUrl: string): void {
      if (isActiveMessage.value && sessionPlaying.value) {
        stopMessageAudio()
        return
      }
      playMessageAudio(messageId, audioUrl)
    },
    autoplay(audioUrl: string): void {
      playMessageAudio(messageId, audioUrl)
    },
  }
}

export function useShipMessageAudioGlobalState() {
  return {
    isPlaying: computed(() => sessionPlaying.value),
  }
}

export function resetShipMessageAudioSessionForTests(): void {
  stopMessageAudio()
}
