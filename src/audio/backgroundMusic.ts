/**
 * Map / level background music orchestration and user mute persistence.
 *
 * @author guinetik
 * @date 2026-04-19
 * @spec docs/asteroid-lander-gdd.md
 */
import { computed, ref } from 'vue'
import type { AudioSoundId } from './audioManifest'
import type { AudioPlaybackHandle } from './audioTypes'
import { useAudio } from './useAudio'

/** Which high-level game context is driving the looping music track. */
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

/** Reads the music mute flag from `localStorage`, defaulting to enabled. */
function readStoredMusicEnabled(): boolean {
  if (typeof window === 'undefined') return true
  const stored = window.localStorage.getItem(MUSIC_STORAGE_KEY)
  return stored !== 'false'
}

/** Persists the music mute flag to `localStorage`. */
function persistMusicEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(MUSIC_STORAGE_KEY, enabled ? 'true' : 'false')
}

/** Restarts the loop for whatever scene is currently active (if any). */
function replayCurrentSceneTrack(): void {
  if (!activeScene) return
  const soundId = TRACK_BY_SCENE[activeScene]
  currentHandle = audio.play(soundId, { loop: true })
}

/** One-time pointer / keyboard / touch listeners to satisfy browser autoplay policies. */
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

/** Starts (or continues) looping music for `scene`, respecting mute state. */
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

/** Stops the current loop; optionally only when `scene` matches the active one. */
export function stopBackgroundMusic(scene?: BackgroundMusicScene): void {
  if (scene && activeScene !== scene) return
  currentHandle?.stop()
  currentHandle = null
  activeScene = null
}

/** Updates global music mute, persists it, and restarts playback when re-enabled. */
export function setBackgroundMusicEnabled(enabled: boolean): void {
  musicEnabled.value = enabled
  persistMusicEnabled(enabled)
  audio.applyCategoryState('music', { muted: !enabled })

  if (enabled && activeScene && (!currentHandle || !currentHandle.playing())) {
    playBackgroundMusic(activeScene)
  }
}

/** Flips the persisted music enabled flag. */
export function toggleBackgroundMusic(): void {
  setBackgroundMusicEnabled(!musicEnabled.value)
}

/** Read-only reactive flag for whether background music is enabled. */
export function useBackgroundMusicGlobalState() {
  return {
    isEnabled: computed(() => musicEnabled.value),
  }
}

/** Resets module singleton state between Vitest cases. */
export function resetBackgroundMusicForTests(): void {
  stopBackgroundMusic()
  setBackgroundMusicEnabled(true)
  unlockListenersInstalled = false
}
