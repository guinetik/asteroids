import { computed, ref } from 'vue'
import type { AudioSoundId } from './audioManifest'
import type { AudioPlaybackHandle } from './audioTypes'
import { useAudio } from './useAudio'

export type BackgroundMusicScene = 'map' | 'level'

const MUSIC_STORAGE_KEY = 'asteroids.music.enabled'
const TRACK_BY_SCENE: Record<BackgroundMusicScene, AudioSoundId> = {
  map: 'music.menu',
  level: 'music.level',
}

const audio = useAudio()
const musicEnabled = ref(readStoredMusicEnabled())

let activeScene: BackgroundMusicScene | null = null
let currentHandle: AudioPlaybackHandle | null = null
let unlockListenersInstalled = false

audio.applyCategoryState('music', { muted: !musicEnabled.value })

function readStoredMusicEnabled(): boolean {
  if (typeof window === 'undefined') return true
  const stored = window.localStorage.getItem(MUSIC_STORAGE_KEY)
  return stored !== 'false'
}

function persistMusicEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(MUSIC_STORAGE_KEY, enabled ? 'true' : 'false')
}

function replayCurrentSceneTrack(): void {
  if (!activeScene) return
  const soundId = TRACK_BY_SCENE[activeScene]
  currentHandle = audio.play(soundId, { loop: true })
}

function ensureUnlockListeners(): void {
  if (unlockListenersInstalled || typeof window === 'undefined') return
  unlockListenersInstalled = true

  const unlockAndReplay = (): void => {
    audio.unlock()
    if (!currentHandle || !currentHandle.playing()) {
      replayCurrentSceneTrack()
    }
  }

  window.addEventListener('pointerdown', unlockAndReplay, { once: true })
  window.addEventListener('keydown', unlockAndReplay, { once: true })
  window.addEventListener('touchstart', unlockAndReplay, { once: true })
}

export function playBackgroundMusic(scene: BackgroundMusicScene): void {
  ensureUnlockListeners()
  audio.unlock()

  if (activeScene === scene && currentHandle?.playing()) {
    return
  }

  currentHandle?.stop()
  activeScene = scene
  replayCurrentSceneTrack()
}

export function stopBackgroundMusic(scene?: BackgroundMusicScene): void {
  if (scene && activeScene !== scene) return
  currentHandle?.stop()
  currentHandle = null
  activeScene = null
}

export function setBackgroundMusicEnabled(enabled: boolean): void {
  musicEnabled.value = enabled
  persistMusicEnabled(enabled)
  audio.applyCategoryState('music', { muted: !enabled })

  if (enabled && activeScene && (!currentHandle || !currentHandle.playing())) {
    playBackgroundMusic(activeScene)
  }
}

export function toggleBackgroundMusic(): void {
  setBackgroundMusicEnabled(!musicEnabled.value)
}

export function useBackgroundMusicGlobalState() {
  return {
    isEnabled: computed(() => musicEnabled.value),
  }
}

export function resetBackgroundMusicForTests(): void {
  stopBackgroundMusic()
  setBackgroundMusicEnabled(true)
  unlockListenersInstalled = false
}
