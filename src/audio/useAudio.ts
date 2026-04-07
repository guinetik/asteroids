/**
 * Vue composable exposing the shared {@link AudioManager} singleton.
 *
 * @author guinetik
 * @date 2026-04-06
 */

import { AudioManager } from './AudioManager'

let sharedAudioManager: AudioManager | null = null

/**
 * Returns the shared {@link AudioManager} instance (singleton for the app lifetime).
 *
 * Use {@link AudioManager.play} for manifest sounds; the returned handle exposes `progress()` and
 * `duration()` for progress UI.
 */
export function useAudio(): AudioManager {
  if (!sharedAudioManager) {
    sharedAudioManager = new AudioManager()
  }
  return sharedAudioManager
}

/**
 * Clears the shared manager reference (for unit tests only).
 */
export function resetAudioForTests(): void {
  sharedAudioManager = null
}
