import type { AudioPlaybackHandle, AudioPlayOptions } from '@/audio/audioTypes'
import type { AudioSoundId } from '@/audio/audioManifest'

export interface ShipMessageAudioController {
  unlock(): void
  play(soundId: AudioSoundId, options?: AudioPlayOptions): AudioPlaybackHandle
}

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
