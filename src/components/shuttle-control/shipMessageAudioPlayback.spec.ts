import { describe, expect, it, vi } from 'vitest'
import type { AudioPlaybackHandle } from '@/audio/audioTypes'
import { startShipMessagePlayback } from './shipMessageAudioPlayback'

/** Builds a stub playback handle for tests. */
function makeHandle(soundId: string): AudioPlaybackHandle {
  return {
    soundId,
    stop: vi.fn(),
    playing: () => true,
    progress: () => 0,
    duration: () => 0,
    setVolume: vi.fn(),
    setStereo: vi.fn(),
    setRate: vi.fn(),
  }
}

describe('startShipMessagePlayback', () => {
  it('unlocks audio before starting comms playback', () => {
    const voiceHandle = makeHandle('voice.comms')
    const play = vi.fn().mockReturnValueOnce(voiceHandle)
    const audio = {
      unlock: vi.fn(),
      play,
    }

    const handle = startShipMessagePlayback(audio, '/sound/marta-001.mp3', vi.fn())

    expect(audio.unlock).toHaveBeenCalledTimes(1)
    expect(play).toHaveBeenCalledWith('voice.comms', {
      src: '/sound/marta-001.mp3',
      onEnd: expect.any(Function),
    })
    expect(handle).toBe(voiceHandle)
  })

  it('does nothing when the message has no audio asset', () => {
    const audio = {
      unlock: vi.fn(),
      play: vi.fn(),
    }

    const handle = startShipMessagePlayback(audio, undefined, vi.fn())

    expect(audio.unlock).not.toHaveBeenCalled()
    expect(audio.play).not.toHaveBeenCalled()
    expect(handle).toBeNull()
  })
})
