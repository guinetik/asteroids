import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PhotometryScanSound } from '@/audio/PhotometryScanSound'

class MockAudioParam {
  value: number

  constructor(value = 0) {
    this.value = value
  }

  setValueAtTime(value: number): void {
    this.value = value
  }

  linearRampToValueAtTime(value: number): void {
    this.value = value
  }

  cancelScheduledValues(): void {
    // Test double only needs the final scheduled value.
  }
}

interface MockNode {
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}

interface MockGainNode extends MockNode {
  gain: MockAudioParam
}

interface MockOscillatorNode extends MockNode {
  type: OscillatorType
  frequency: MockAudioParam
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
}

interface MockBufferSourceNode extends MockNode {
  buffer: unknown
  loop: boolean
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
}

const mockGains: MockGainNode[] = []
const mockOscillators: MockOscillatorNode[] = []
const mockSources: MockBufferSourceNode[] = []

function node(): MockNode {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
  }
}

function gainNode(initial = 0): MockGainNode {
  const gain = { ...node(), gain: new MockAudioParam(initial) }
  mockGains.push(gain)
  return gain
}

function oscillatorNode(): MockOscillatorNode {
  const oscillator = {
    ...node(),
    type: 'sine' as OscillatorType,
    frequency: new MockAudioParam(440),
    start: vi.fn(),
    stop: vi.fn(),
  }
  mockOscillators.push(oscillator)
  return oscillator
}

function bufferSourceNode(): MockBufferSourceNode {
  const source = {
    ...node(),
    buffer: null,
    loop: false,
    start: vi.fn(),
    stop: vi.fn(),
  }
  mockSources.push(source)
  return source
}

vi.mock('howler', () => ({
  Howler: {
    noAudio: false,
    masterGain: node(),
    ctx: {
      currentTime: 0,
      sampleRate: 48_000,
      createGain: () => gainNode(),
      createOscillator: () => oscillatorNode(),
      createBufferSource: () => bufferSourceNode(),
      createBuffer: (_channels: number, length: number) => ({
        getChannelData: () => new Float32Array(length),
      }),
      createBiquadFilter: () => ({
        ...node(),
        type: 'lowpass' as BiquadFilterType,
        frequency: new MockAudioParam(1_000),
        Q: new MockAudioParam(1),
      }),
      createStereoPanner: () => ({ ...node(), pan: new MockAudioParam(0) }),
    },
  },
}))

describe('PhotometryScanSound', () => {
  beforeEach(() => {
    mockGains.length = 0
    mockOscillators.length = 0
    mockSources.length = 0
  })

  it('keeps the beam layer audible while visible even when scan lock is missing', () => {
    const sound = new PhotometryScanSound()

    sound.update({ visible: true, locked: false, progress: 0, sfxVolume: 1 }, 0.1)

    expect(mockOscillators.length).toBeGreaterThanOrEqual(3)
    expect(mockGains.some((gain) => gain.gain.value > 0.02)).toBe(true)

    sound.dispose()
  })

  it('adds a louder melody layer when locked and fades it when lock is lost', () => {
    const sound = new PhotometryScanSound()

    sound.update({ visible: true, locked: false, progress: 0.25, sfxVolume: 1 }, 0.1)
    const unlockedPeak = Math.max(...mockGains.slice(1).map((gain) => gain.gain.value))
    sound.update({ visible: true, locked: true, progress: 0.75, sfxVolume: 1 }, 0.1)
    const lockedPeak = Math.max(...mockGains.slice(1).map((gain) => gain.gain.value))
    sound.update({ visible: true, locked: false, progress: 0.75, sfxVolume: 1 }, 0.1)
    const relockedPeak = Math.max(...mockGains.slice(1).map((gain) => gain.gain.value))

    expect(lockedPeak).toBeGreaterThan(unlockedPeak)
    expect(relockedPeak).toBeLessThanOrEqual(lockedPeak)

    sound.dispose()
  })
})
