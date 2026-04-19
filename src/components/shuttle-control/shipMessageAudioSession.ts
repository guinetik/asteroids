/**
 * Global ship voice message playback session (single active comms line at a time).
 *
 * @author guinetik
 * @date 2026-04-19
 * @spec docs/asteroid-lander-gdd.md
 */
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

/** Clears the UI progress polling interval when playback stops. */
function clearProgressInterval(): void {
  if (!progressInterval) return
  clearInterval(progressInterval)
  progressInterval = null
}

/** Resets reactive flags after a message ends or is cancelled. */
function resetSessionState(): void {
  sessionPlaying.value = false
  sessionProgress.value = 0
  clearProgressInterval()
}

/** Clears handles when a voice line finishes naturally. */
function handlePlaybackEnded(): void {
  currentHandle = null
  activeMessageId.value = null
  resetSessionState()
}

/** Polls Howler-backed progress for the shuttle comms UI bar. */
function updateProgress(): void {
  if (!currentHandle) return
  if (!currentHandle.playing()) return
  sessionProgress.value = currentHandle.progress()
}

/** Starts playback for a logical `messageId` and optional asset URL. */
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

/** Stops the active comms line and clears session state. */
export function stopMessageAudio(): void {
  if (currentHandle) {
    const handle = currentHandle
    currentHandle = null
    handle.stop()
  }
  activeMessageId.value = null
  resetSessionState()
}

/** Per-message composable: play / toggle / autoplay wired to the global session. */
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

/** Global reactive “any message playing” flag for HUD chrome. */
export function useShipMessageAudioGlobalState() {
  return {
    isPlaying: computed(() => sessionPlaying.value),
  }
}

/** Resets singleton state between Vitest cases. */
export function resetShipMessageAudioSessionForTests(): void {
  stopMessageAudio()
}
