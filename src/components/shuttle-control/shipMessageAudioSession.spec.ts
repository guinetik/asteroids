import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AudioPlaybackHandle } from '@/audio/audioTypes'

const { mockHandle, playMock, unlockMock } = vi.hoisted(() => {
  const handle: AudioPlaybackHandle = {
    soundId: 'voice.comms',
    stop: vi.fn(),
    playing: () => true,
    progress: () => 0.42,
    duration: () => 10,
    setVolume: vi.fn(),
    setStereo: vi.fn(),
  }

  return {
    mockHandle: handle,
    playMock: vi.fn(() => handle),
    unlockMock: vi.fn(),
  }
})

vi.mock('@/audio/useAudio', () => ({
  useAudio: () => ({
    unlock: unlockMock,
    play: playMock,
  }),
}))

import {
  resetShipMessageAudioSessionForTests,
  stopMessageAudio,
  useShipMessageAudioSession,
} from './shipMessageAudioSession'

describe('shipMessageAudioSession', () => {
  beforeEach(() => {
    resetShipMessageAudioSessionForTests()
    vi.clearAllMocks()
  })

  it('keeps playback state available across multiple consumers', () => {
    const first = useShipMessageAudioSession('seller-welcome-earth-orbit')
    const second = useShipMessageAudioSession('seller-welcome-earth-orbit')

    first.autoplay('/sound/marta-001.mp3')

    expect(unlockMock).toHaveBeenCalledTimes(1)
    expect(playMock).toHaveBeenCalledTimes(1)
    expect(first.isPlaying.value).toBe(true)
    expect(second.isPlaying.value).toBe(true)
    expect(second.progressPercent.value).toBe('0%')
  })

  it('stops playback globally when the active message is toggled off', () => {
    const session = useShipMessageAudioSession('seller-welcome-earth-orbit')

    session.autoplay('/sound/marta-001.mp3')
    session.togglePlayback('/sound/marta-001.mp3')

    expect(mockHandle.stop).toHaveBeenCalledTimes(1)
    expect(session.isPlaying.value).toBe(false)
  })

  it('switches to a new message when another message starts playback', () => {
    const first = useShipMessageAudioSession('seller-welcome-earth-orbit')
    const second = useShipMessageAudioSession('jay-so-you-actually-did-it')

    first.autoplay('/sound/marta-001.mp3')
    second.autoplay('/sound/jay.mp3')

    expect(mockHandle.stop).toHaveBeenCalledTimes(1)
    expect(first.isPlaying.value).toBe(false)
    expect(second.isPlaying.value).toBe(true)
  })

  it('allows explicit global stop cleanup', () => {
    const session = useShipMessageAudioSession('seller-welcome-earth-orbit')

    session.autoplay('/sound/marta-001.mp3')
    stopMessageAudio()

    expect(mockHandle.stop).toHaveBeenCalledTimes(1)
    expect(session.isPlaying.value).toBe(false)
  })
})
