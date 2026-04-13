import { Howler } from 'howler'
import type { AudioPlaybackHandle, AudioProceduralPreset } from './audioTypes'

interface ProceduralPlayArgs {
  soundId: string
  preset: AudioProceduralPreset
  volume: number
  onEnd?: () => void
}

interface GainAutomationLike {
  value: number
  setValueAtTime(value: number, startTime: number): void
  linearRampToValueAtTime(value: number, endTime: number): void
  exponentialRampToValueAtTime(value: number, endTime: number): void
}

type StoppableNode = Pick<AudioScheduledSourceNode, 'start' | 'stop' | 'connect' | 'disconnect'>

export function playProceduralSound(args: ProceduralPlayArgs): AudioPlaybackHandle | null {
  if (Howler.noAudio) return null

  const ctx = Howler.ctx
  const masterGain = (Howler as unknown as { masterGain?: AudioNode }).masterGain
  if (!ctx || !masterGain) return null

  const output = ctx.createGain()
  const panner =
    typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : undefined

  if (panner) {
    output.connect(panner)
    panner.connect(masterGain)
  } else {
    output.connect(masterGain)
  }

  const now = ctx.currentTime
  const sources: StoppableNode[] = []
  const duration = buildProceduralRecipe(ctx, output, now, args.preset, args.volume, sources)
  output.gain.setValueAtTime(args.volume, now)

  const timer = globalThis.setTimeout(() => {
    cleanup(false)
  }, Math.max(0, duration * 1000 + 50))

  let stopped = false
  let ended = false
  let currentVolume = args.volume

  function cleanup(manualStop: boolean): void {
    if (ended) return
    ended = true
    globalThis.clearTimeout(timer)
    for (const source of sources) {
      try {
        source.disconnect()
      } catch {
        /* ignore disconnect races */
      }
    }
    try {
      output.disconnect()
    } catch {
      /* ignore disconnect races */
    }
    if (panner) {
      try {
        panner.disconnect()
      } catch {
        /* ignore disconnect races */
      }
    }
    if (!manualStop) {
      args.onEnd?.()
    }
  }

  function stopAllSources(): void {
    if (stopped) return
    stopped = true
    const stopAt = ctx.currentTime + 0.01
    for (const source of sources) {
      try {
        source.stop(stopAt)
      } catch {
        /* ignore already stopped nodes */
      }
    }
    cleanup(true)
  }

  return {
    soundId: args.soundId,
    stop: () => {
      stopAllSources()
    },
    playing: () => !ended && !stopped && ctx.currentTime < now + duration,
    progress: () => {
      if (duration <= 0) return 0
      return Math.max(0, Math.min(1, (ctx.currentTime - now) / duration))
    },
    duration: () => duration,
    setVolume: (volume: number) => {
      currentVolume = Math.max(0, volume)
      output.gain.setValueAtTime(currentVolume, ctx.currentTime)
    },
    setStereo: (pan: number) => {
      if (!panner) return
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), ctx.currentTime)
    },
    setRate: () => {},
  }
}

function buildProceduralRecipe(
  ctx: AudioContext,
  output: GainNode,
  startTime: number,
  preset: AudioProceduralPreset,
  volume: number,
  sources: StoppableNode[],
): number {
  switch (preset) {
    case 'laser-fire':
      return buildLaserFire(ctx, output, startTime, volume, sources)
    case 'projectile-hit':
      return buildProjectileHit(ctx, output, startTime, volume, sources)
    case 'shield-hit':
      return buildShieldHit(ctx, output, startTime, volume, sources)
    case 'pickup':
      return buildPickup(ctx, output, startTime, volume, sources)
  }
}

function buildLaserFire(
  ctx: AudioContext,
  output: GainNode,
  startTime: number,
  volume: number,
  sources: StoppableNode[],
): number {
  const duration = 0.14
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(1400, startTime)
  osc.frequency.exponentialRampToValueAtTime(180, startTime + duration)
  applyPercussiveEnvelope(gain.gain, startTime, duration, volume)
  osc.connect(gain)
  gain.connect(output)
  scheduleSource(osc, startTime, duration + 0.02, sources)
  return duration
}

function buildProjectileHit(
  ctx: AudioContext,
  output: GainNode,
  startTime: number,
  volume: number,
  sources: StoppableNode[],
): number {
  const duration = 0.18
  const tone = ctx.createOscillator()
  const toneGain = ctx.createGain()
  tone.type = 'triangle'
  tone.frequency.setValueAtTime(320, startTime)
  tone.frequency.exponentialRampToValueAtTime(90, startTime + duration)
  applyPercussiveEnvelope(toneGain.gain, startTime, duration, volume * 0.7)
  tone.connect(toneGain)
  toneGain.connect(output)
  scheduleSource(tone, startTime, duration + 0.02, sources)

  const noise = createNoiseSource(ctx, duration, 'white')
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(1200, startTime)
  filter.Q.value = 1.2
  const noiseGain = ctx.createGain()
  applyNoiseEnvelope(noiseGain.gain, startTime, duration * 0.6, volume * 0.45)
  noise.connect(filter)
  filter.connect(noiseGain)
  noiseGain.connect(output)
  scheduleSource(noise, startTime, duration * 0.6 + 0.02, sources)
  return duration
}

function buildShieldHit(
  ctx: AudioContext,
  output: GainNode,
  startTime: number,
  volume: number,
  sources: StoppableNode[],
): number {
  const duration = 0.24
  const main = ctx.createOscillator()
  const mainGain = ctx.createGain()
  main.type = 'sine'
  main.frequency.setValueAtTime(720, startTime)
  main.frequency.exponentialRampToValueAtTime(260, startTime + duration)
  applyPercussiveEnvelope(mainGain.gain, startTime, duration, volume * 0.55)
  main.connect(mainGain)
  mainGain.connect(output)
  scheduleSource(main, startTime, duration + 0.03, sources)

  const shimmer = ctx.createOscillator()
  const shimmerGain = ctx.createGain()
  shimmer.type = 'triangle'
  shimmer.frequency.setValueAtTime(1440, startTime)
  shimmer.frequency.exponentialRampToValueAtTime(620, startTime + duration * 0.7)
  applyNoiseEnvelope(shimmerGain.gain, startTime, duration * 0.7, volume * 0.22)
  shimmer.connect(shimmerGain)
  shimmerGain.connect(output)
  scheduleSource(shimmer, startTime, duration * 0.7 + 0.03, sources)
  return duration
}

function buildPickup(
  ctx: AudioContext,
  output: GainNode,
  startTime: number,
  volume: number,
  sources: StoppableNode[],
): number {
  const firstDuration = 0.08
  const secondDuration = 0.12
  const secondStart = startTime + 0.075

  const first = ctx.createOscillator()
  const firstGain = ctx.createGain()
  first.type = 'square'
  first.frequency.setValueAtTime(988, startTime)
  applyPluckEnvelope(firstGain.gain, startTime, firstDuration, volume * 0.9)
  first.connect(firstGain)
  firstGain.connect(output)
  scheduleSource(first, startTime, firstDuration + 0.02, sources)

  const second = ctx.createOscillator()
  const secondGain = ctx.createGain()
  second.type = 'square'
  second.frequency.setValueAtTime(1480, secondStart)
  applyPluckEnvelope(secondGain.gain, secondStart, secondDuration, volume * 0.8)
  second.connect(secondGain)
  secondGain.connect(output)
  scheduleSource(second, secondStart, secondDuration + 0.02, sources)

  return secondStart - startTime + secondDuration
}

function scheduleSource(
  source: StoppableNode,
  startTime: number,
  totalDuration: number,
  sources: StoppableNode[],
): void {
  sources.push(source)
  source.start(startTime)
  source.stop(startTime + totalDuration)
}

function applyPercussiveEnvelope(
  gain: GainAutomationLike,
  startTime: number,
  duration: number,
  peak: number,
): void {
  gain.setValueAtTime(0.0001, startTime)
  gain.linearRampToValueAtTime(Math.max(0.0001, peak), startTime + 0.003)
  gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
}

function applyNoiseEnvelope(
  gain: GainAutomationLike,
  startTime: number,
  duration: number,
  peak: number,
): void {
  gain.setValueAtTime(Math.max(0.0001, peak), startTime)
  gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
}

function applyPluckEnvelope(
  gain: GainAutomationLike,
  startTime: number,
  duration: number,
  peak: number,
): void {
  gain.setValueAtTime(0.0001, startTime)
  gain.linearRampToValueAtTime(Math.max(0.0001, peak), startTime + 0.004)
  gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.25), startTime + duration * 0.45)
  gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
}

function createNoiseSource(
  ctx: AudioContext,
  duration: number,
  color: 'white' | 'brown',
): AudioBufferSourceNode {
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration))
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)

  if (color === 'brown') {
    let last = 0
    for (let i = 0; i < bufferSize; i += 1) {
      const white = Math.random() * 2 - 1
      const sample = ((last + 0.02 * white) / 1.02) * 3.5
      data[i] = sample
      last = sample
    }
  } else {
    for (let i = 0; i < bufferSize; i += 1) {
      data[i] = Math.random() * 2 - 1
    }
  }

  const source = ctx.createBufferSource()
  source.buffer = buffer
  return source
}
