import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LevelAudioDirector } from '../LevelAudioDirector'

const {
  mockPlay,
  mockUnlock,
  mockStop,
  mockSetStereo,
  timerAfter,
  timerCancel,
} = vi.hoisted(() => ({
  mockPlay: vi.fn(() => ({
    stop: vi.fn(),
    playing: vi.fn(() => false),
    setStereo: vi.fn(),
  })),
  mockUnlock: vi.fn(),
  mockStop: vi.fn(),
  mockSetStereo: vi.fn(),
  timerAfter: vi.fn(() => ({ id: 1 })),
  timerCancel: vi.fn(),
}))

vi.mock('../useAudio', () => ({
  useAudio: vi.fn(() => ({
    play: mockPlay,
    unlock: mockUnlock,
  })),
}))

vi.mock('../audioManifest', () => ({
  getAudioDefinition: vi.fn(() => ({ volume: 0.8 })),
}))

vi.mock('@/lib/audio/worldHearing', () => ({
  worldPointToHearing: vi.fn(() => ({ volumeScale: 0.5, pan: -0.25 })),
}))

vi.mock('@/lib/Timer', () => ({
  Timer: {
    after: timerAfter,
    cancel: timerCancel,
  },
}))

describe('LevelAudioDirector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('plays EVA death stingers', () => {
    const director = new LevelAudioDirector()
    director.notifyEvaDeath()

    expect(mockPlay).toHaveBeenCalledWith('sfx.heartbeat')
    expect(mockPlay).toHaveBeenCalledWith('sfx.flatline')
  })

  it('keeps the mining sizzle loop alive', () => {
    const loopHandle = {
      stop: mockStop,
      playing: vi.fn(() => false),
      setStereo: mockSetStereo,
    }
    mockPlay.mockReturnValueOnce(loopHandle)
    const director = new LevelAudioDirector()

    director.keepMiningSizzleAlive(10)

    expect(mockUnlock).toHaveBeenCalled()
    expect(mockPlay).toHaveBeenCalledWith('sfx.sizzle', { loop: true })
  })

  it('plays a spatialized short surface sizzle', () => {
    const handle = {
      stop: mockStop,
      playing: vi.fn(() => false),
      setStereo: mockSetStereo,
    }
    mockPlay.mockReturnValueOnce(handle)
    const director = new LevelAudioDirector()

    director.playShortSurfaceSizzle({} as never, {} as never)

    expect(mockPlay).toHaveBeenCalledWith('sfx.sizzle.impact', {
      loop: false,
      volume: 0.4,
    })
    expect(mockSetStereo).toHaveBeenCalledWith(-0.25)
    expect(timerAfter).toHaveBeenCalled()
  })
})
