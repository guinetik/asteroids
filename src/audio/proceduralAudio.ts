/**
 * Procedural Web Audio one-shots for tool and combat SFX presets.
 *
 * @author guinetik
 * @date 2026-04-19
 * @spec docs/asteroid-lander-gdd.md
 */
import { Howler } from 'howler'
import type { AudioPlaybackHandle, AudioProceduralPreset } from './audioTypes'

/** Arguments for starting a procedural one-shot tied to a logical sound id. */
interface ProceduralPlayArgs {
  soundId: string
  preset: AudioProceduralPreset
  volume: number
  onEnd?: () => void
}

/** Minimal {@link AudioParam}-like surface used by envelope helpers. */
interface GainAutomationLike {
  value: number
  setValueAtTime(value: number, startTime: number): void
  linearRampToValueAtTime(value: number, endTime: number): void
  exponentialRampToValueAtTime(value: number, endTime: number): void
}

/** Audio source nodes we start/stop and track for cleanup. */
type StoppableNode = Pick<AudioScheduledSourceNode, 'start' | 'stop' | 'connect' | 'disconnect'>

/** Builds and plays a procedural preset; returns a handle or `null` when audio is unavailable. */
export function playProceduralSound(args: ProceduralPlayArgs): AudioPlaybackHandle | null {
  if (Howler.noAudio) return null

  const ctx = Howler.ctx
  const masterGain = (Howler as unknown as { masterGain?: AudioNode }).masterGain
  if (!ctx || !masterGain) return null

  const output = ctx.createGain()
  const panner = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : undefined

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

  const timer = globalThis.setTimeout(
    () => {
      cleanup(false)
    },
    Math.max(0, duration * 1000 + 50),
  )

  let stopped = false
  let ended = false
  let currentVolume = args.volume

  /** Tears down nodes and optionally invokes `onEnd` for natural completion. */
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

  /** Stops all scheduled sources immediately (manual stop / skip `onEnd`). */
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

/** Dispatches to the concrete builder for the requested procedural preset. */
function buildProceduralRecipe(
  ctx: AudioContext,
  output: GainNode,
  startTime: number,
  preset: AudioProceduralPreset,
  volume: number,
  sources: StoppableNode[],
): number {
  switch (preset) {
    case 'tool-drill':
      return buildToolDrill(ctx, output, startTime, volume, sources)
    case 'laser-fire':
      return buildLaserFire(ctx, output, startTime, volume, sources)
    case 'tool-heal':
      return buildToolHeal(ctx, output, startTime, volume, sources)
    case 'projectile-hit':
      return buildProjectileHit(ctx, output, startTime, volume, sources)
    case 'shield-hit':
      return buildShieldHit(ctx, output, startTime, volume, sources)
    case 'pickup':
      return buildPickup(ctx, output, startTime, volume, sources)
  }
}

/** “Tool drill” preset — layered saws and air noise for a handheld drill. */
function buildToolDrill(
  ctx: AudioContext,
  output: GainNode,
  startTime: number,
  volume: number,
  sources: StoppableNode[],
): number {
  const duration = 0.42

  const core = ctx.createOscillator()
  const coreGain = ctx.createGain()
  core.type = 'sine'
  core.frequency.setValueAtTime(728, startTime)
  core.frequency.linearRampToValueAtTime(752, startTime + 0.08)
  core.frequency.linearRampToValueAtTime(736, startTime + 0.22)
  core.frequency.linearRampToValueAtTime(748, startTime + duration)
  applyHeldEnvelope(coreGain.gain, startTime, duration, volume * 0.28)
  core.connect(coreGain)
  coreGain.connect(output)
  scheduleSource(core, startTime, duration + 0.03, sources)

  const detune = ctx.createOscillator()
  const detuneGain = ctx.createGain()
  detune.type = 'sine'
  detune.frequency.setValueAtTime(742, startTime)
  detune.frequency.linearRampToValueAtTime(768, startTime + 0.1)
  detune.frequency.linearRampToValueAtTime(744, startTime + duration)
  applyHeldEnvelope(detuneGain.gain, startTime, duration * 0.95, volume * 0.12)
  detune.connect(detuneGain)
  detuneGain.connect(output)
  scheduleSource(detune, startTime, duration + 0.03, sources)

  const sheen = ctx.createOscillator()
  const sheenGain = ctx.createGain()
  sheen.type = 'sawtooth'
  sheen.frequency.setValueAtTime(1820, startTime)
  sheen.frequency.linearRampToValueAtTime(1960, startTime + 0.06)
  sheen.frequency.linearRampToValueAtTime(1740, startTime + duration)
  applyHeldEnvelope(sheenGain.gain, startTime, duration * 0.8, volume * 0.045)
  sheen.connect(sheenGain)
  sheenGain.connect(output)
  scheduleSource(sheen, startTime, duration * 0.9 + 0.03, sources)

  const airDuration = 0.26
  const air = createNoiseSource(ctx, airDuration, 'white')
  const airFilter = ctx.createBiquadFilter()
  airFilter.type = 'bandpass'
  airFilter.frequency.setValueAtTime(3200, startTime)
  airFilter.frequency.linearRampToValueAtTime(2400, startTime + airDuration)
  airFilter.Q.value = 2.6
  const airGain = ctx.createGain()
  applyNoiseEnvelope(airGain.gain, startTime, airDuration, volume * 0.028)
  air.connect(airFilter)
  airFilter.connect(airGain)
  airGain.connect(output)
  scheduleSource(air, startTime, airDuration + 0.02, sources)

  return duration
}

/** Short laser burst with sizzle and decay echoes. */
function buildLaserFire(
  ctx: AudioContext,
  output: GainNode,
  startTime: number,
  volume: number,
  sources: StoppableNode[],
): number {
  const duration = 0.16

  const body = ctx.createOscillator()
  const bodyGain = ctx.createGain()
  body.type = 'sawtooth'
  body.frequency.setValueAtTime(1680, startTime)
  body.frequency.exponentialRampToValueAtTime(260, startTime + duration)
  applyPercussiveEnvelope(bodyGain.gain, startTime, duration, volume * 0.54)
  body.connect(bodyGain)
  bodyGain.connect(output)
  scheduleSource(body, startTime, duration + 0.025, sources)

  const bite = ctx.createOscillator()
  const biteGain = ctx.createGain()
  bite.type = 'square'
  bite.frequency.setValueAtTime(920, startTime)
  bite.frequency.exponentialRampToValueAtTime(180, startTime + duration * 0.82)
  applyNoiseEnvelope(biteGain.gain, startTime, duration * 0.82, volume * 0.16)
  bite.connect(biteGain)
  biteGain.connect(output)
  scheduleSource(bite, startTime, duration * 0.82 + 0.025, sources)

  const sizzleDuration = 0.055
  const sizzle = createNoiseSource(ctx, sizzleDuration, 'white')
  const sizzleFilter = ctx.createBiquadFilter()
  sizzleFilter.type = 'bandpass'
  sizzleFilter.frequency.setValueAtTime(2600, startTime)
  sizzleFilter.frequency.exponentialRampToValueAtTime(1400, startTime + sizzleDuration)
  sizzleFilter.Q.value = 1.6
  const sizzleGain = ctx.createGain()
  applyNoiseEnvelope(sizzleGain.gain, startTime, sizzleDuration, volume * 0.08)
  sizzle.connect(sizzleFilter)
  sizzleFilter.connect(sizzleGain)
  sizzleGain.connect(output)
  scheduleSource(sizzle, startTime, sizzleDuration + 0.01, sources)

  const echoStart = startTime + 0.07
  const echo = ctx.createOscillator()
  const echoGain = ctx.createGain()
  echo.type = 'triangle'
  echo.frequency.setValueAtTime(720, echoStart)
  echo.frequency.exponentialRampToValueAtTime(210, echoStart + 0.11)
  applyNoiseEnvelope(echoGain.gain, echoStart, 0.11, volume * 0.16)
  echo.connect(echoGain)
  echoGain.connect(output)
  scheduleSource(echo, echoStart, 0.13, sources)

  const echo2Start = startTime + 0.135
  const echo2 = ctx.createOscillator()
  const echo2Gain = ctx.createGain()
  echo2.type = 'triangle'
  echo2.frequency.setValueAtTime(420, echo2Start)
  echo2.frequency.exponentialRampToValueAtTime(150, echo2Start + 0.09)
  applyNoiseEnvelope(echo2Gain.gain, echo2Start, 0.09, volume * 0.09)
  echo2.connect(echo2Gain)
  echo2Gain.connect(output)
  scheduleSource(echo2, echo2Start, 0.11, sources)

  return 0.28
}

/** Impact thud plus filtered noise for projectile hits. */
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

/** Shield impact — tonal body plus shimmering follow-through. */
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

/** Two-pluck “heal” chirp for repair / med tool feedback. */
function buildToolHeal(
  ctx: AudioContext,
  output: GainNode,
  startTime: number,
  volume: number,
  sources: StoppableNode[],
): number {
  const firstDuration = 0.11
  const secondDuration = 0.13
  const secondStart = startTime + 0.05

  const first = ctx.createOscillator()
  const firstGain = ctx.createGain()
  first.type = 'sine'
  first.frequency.setValueAtTime(480, startTime)
  first.frequency.exponentialRampToValueAtTime(760, startTime + firstDuration)
  applyPluckEnvelope(firstGain.gain, startTime, firstDuration, volume * 0.45)
  first.connect(firstGain)
  firstGain.connect(output)
  scheduleSource(first, startTime, firstDuration + 0.02, sources)

  const second = ctx.createOscillator()
  const secondGain = ctx.createGain()
  second.type = 'triangle'
  second.frequency.setValueAtTime(720, secondStart)
  second.frequency.exponentialRampToValueAtTime(1180, secondStart + secondDuration)
  applyPluckEnvelope(secondGain.gain, secondStart, secondDuration, volume * 0.32)
  second.connect(secondGain)
  secondGain.connect(output)
  scheduleSource(second, secondStart, secondDuration + 0.02, sources)

  return secondStart - startTime + secondDuration
}

/** Bright two-stage pickup blip. */
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

/** Starts `source` at `startTime`, stops after `totalDuration`, and registers it for cleanup. */
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

/** Sharp attack, exponential decay — good for impacts and plucks. */
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

/** Noise burst envelope: start at peak, decay out. */
function applyNoiseEnvelope(
  gain: GainAutomationLike,
  startTime: number,
  duration: number,
  peak: number,
): void {
  gain.setValueAtTime(Math.max(0.0001, peak), startTime)
  gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
}

/** Short pluck with mid-body sustain and long tail. */
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

/** Rises into a held plateau then tapers — for sustained tones (drill core). */
function applyHeldEnvelope(
  gain: GainAutomationLike,
  startTime: number,
  duration: number,
  peak: number,
): void {
  gain.setValueAtTime(0.0001, startTime)
  gain.linearRampToValueAtTime(Math.max(0.0001, peak), startTime + 0.02)
  gain.linearRampToValueAtTime(Math.max(0.0001, peak * 0.82), startTime + duration * 0.72)
  gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
}

/** Finite-length white or brown noise buffer for one-shot layers. */
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
