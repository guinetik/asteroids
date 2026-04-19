import type { AudioPlaybackHandle, AudioPlayOptions } from '@/audio/audioTypes'
import type { AudioSoundId } from '@/audio/audioManifest'

/** Minimal audio facade used to unlock and play ship voice lines. */
export interface ShipMessageAudioController {
  unlock(): void
  play(soundId: AudioSoundId, options?: AudioPlayOptions): AudioPlaybackHandle
}

/**
 * Starts comms playback for a ship message URL, or returns `null` when no URL is set.
 */
export function startShipMessagePlayback(
  audio: ShipMessageAudioController,
  audioUrl: string | undefined,
  onEnd: () => void,
): AudioPlaybackHandle | null {
  if (!audioUrl) return null
  audio.unlock()
  return audio.play('voice.comms', {
    src: audioUrl,
    onEnd,
  })
}
