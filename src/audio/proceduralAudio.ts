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

/**
 * Pentatonic major scale frequencies (C5 root, two octaves) for the survey melody.
 * Each collected probe advances one step up the scale; the final probe plays a chord.
 */
const SURVEY_SCALE_HZ = [
  523.25, // C5
  587.33, // D5
  659.26, // E5
  784.0, // G5
  880.0, // A5
  1046.5, // C6
  1174.66, // D6
  1318.51, // E6
] as const

/** Volume for the melodic note layer (layered on top of the generic collect cue). */
const SURVEY_NOTE_VOLUME = 0.65

/**
 * Power-cell activation scale, in Hz. Shares the same ascending-feedback
 * role as the survey melody but sits lower and more industrial.
 */
const POWER_CELL_SCALE_HZ = [
  220.0, // A3
  261.63, // C4
  293.66, // D4
  329.63, // E4
  392.0, // G4
  440.0, // A4
  523.25, // C5
  587.33, // D5
] as const

/** Main gain for one power-cell activation note. */
const POWER_CELL_NOTE_VOLUME = 0.42
/** Duration of a non-final power-cell activation note, in seconds. */
const POWER_CELL_NOTE_DURATION = 0.7
/** Duration of the final resolved power-cell power-up drone, in seconds. */
const POWER_CELL_FINAL_DURATION = 2.4
/** Detuned support oscillator offset, in cents (fat unison detune). */
const POWER_CELL_DETUNE_CENTS = -9
/** Resonant Q on the lowpass while the saws sweep — modest bite, not whistle. */
const POWER_CELL_FILTER_Q = 4
/** Filter cutoff at the start of a per-cell sweep (Hz). */
const POWER_CELL_FILTER_START_HZ = 280
/** Filter cutoff at the peak of a per-cell sweep (Hz). */
const POWER_CELL_FILTER_END_HZ = 2400
/** Filter cutoff at the start of the final-cell power-up drone (Hz). */
const POWER_CELL_FINAL_FILTER_START_HZ = 180
/** Filter cutoff at the peak of the final-cell power-up drone (Hz). */
const POWER_CELL_FINAL_FILTER_END_HZ = 3600
/** Pitch bend (semitones up) applied across the final-cell drone for a "spool-up" feel. */
const POWER_CELL_FINAL_PITCH_BEND_SEMITONES = 7
/** Extra scheduled tail after oscillator envelope reaches silence, in seconds. */
const POWER_CELL_SOURCE_TAIL_S = 0.05
/** Milliseconds after nominal melodic cue duration before disconnect cleanup. */
const MELODY_CLEANUP_DELAY_MS = 100
/** Sub oscillator pitch ratio for power-cell activation tones. */
const POWER_CELL_SUPPORT_RATIO = 0.5
/** Relative duration of the detuned support tone. */
const POWER_CELL_SUPPORT_DURATION_RATIO = 0.95
/** Relative gain of the detuned support tone. */
const POWER_CELL_SUPPORT_GAIN_RATIO = 0.42

/**
 * Play a melodic note for a gravitometric survey probe collection event.
 *
 * Non-final probes play a single ascending bell tone through a pentatonic major scale.
 * The final probe plays a brief three-note resolution chord.
 *
 * Called directly rather than via {@link playProceduralSound} because the pitch
 * varies per invocation and cannot be represented as a static preset.
 *
 * @param collected - Probes collected so far (1-based, after this collection).
 * @param total - Total probes in this survey.
 */
export function playSurveyProbeNote(collected: number, total: number): void {
  if (Howler.noAudio) return
  const ctx = Howler.ctx
  const masterGain = (Howler as unknown as { masterGain?: AudioNode }).masterGain
  if (!ctx || !masterGain) return

  const output = ctx.createGain()
  output.connect(masterGain)
  output.gain.setValueAtTime(1, ctx.currentTime)

  const now = ctx.currentTime
  const sources: StoppableNode[] = []
  let duration: number

  if (collected >= total) {
    // Final probe — resolution chord: root, major third, fifth of C major
    const chordHz = [
      SURVEY_SCALE_HZ[0], // C5
      SURVEY_SCALE_HZ[2], // E5
      SURVEY_SCALE_HZ[4], // A5
    ] as const
    duration = 0.75

    for (const freq of chordHz) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now)
      applyPluckEnvelope(gain.gain, now, duration, SURVEY_NOTE_VOLUME * 0.32)
      osc.connect(gain)
      gain.connect(output)
      scheduleSource(osc, now, duration + 0.02, sources)
    }

    // Sparkle shimmer an octave above the root
    const shimmer = ctx.createOscillator()
    const shimmerGain = ctx.createGain()
    shimmer.type = 'triangle'
    shimmer.frequency.setValueAtTime(SURVEY_SCALE_HZ[5], now) // C6
    applyPluckEnvelope(shimmerGain.gain, now, duration * 0.8, SURVEY_NOTE_VOLUME * 0.15)
    shimmer.connect(shimmerGain)
    shimmerGain.connect(output)
    scheduleSource(shimmer, now, duration * 0.8 + 0.02, sources)
  } else {
    // Ascending single note through the scale; noteIndex is always in bounds — clamped above
    const noteIndex = Math.min(collected - 1, SURVEY_SCALE_HZ.length - 1)
    const freq = SURVEY_SCALE_HZ[noteIndex]!
    duration = 0.22

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, now)
    applyPluckEnvelope(gain.gain, now, duration, SURVEY_NOTE_VOLUME)
    osc.connect(gain)
    gain.connect(output)
    scheduleSource(osc, now, duration + 0.02, sources)

    // Subtle bell overtone at double frequency
    const overtone = ctx.createOscillator()
    const overtoneGain = ctx.createGain()
    overtone.type = 'triangle'
    overtone.frequency.setValueAtTime(freq * 2, now)
    applyPluckEnvelope(overtoneGain.gain, now, duration * 0.55, SURVEY_NOTE_VOLUME * 0.12)
    overtone.connect(overtoneGain)
    overtoneGain.connect(output)
    scheduleSource(overtone, now, duration * 0.55 + 0.02, sources)
  }

  globalThis.setTimeout(
    () => {
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
    },
    duration * 1000 + MELODY_CLEANUP_DELAY_MS,
  )
}

/**
 * Play an ascending melodic cue when a station power-generator fuel cell
 * activates. Non-final cells advance through a low pentatonic sequence;
 * the final cell resolves with a brief arpeggiated power-online chord.
 *
 * @param activated - Cells activated so far, 1-based after this activation.
 * @param total - Total cells needed for the reboot.
 */
export function playPowerCellActivationNote(activated: number, total: number): void {
  if (Howler.noAudio) return
  const ctx = Howler.ctx
  const masterGain = (Howler as unknown as { masterGain?: AudioNode }).masterGain
  if (!ctx || !masterGain) return

  const output = ctx.createGain()
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.setValueAtTime(POWER_CELL_FILTER_Q, ctx.currentTime)
  output.connect(filter)
  filter.connect(masterGain)
  output.gain.setValueAtTime(1, ctx.currentTime)

  const now = ctx.currentTime
  const sources: StoppableNode[] = []
  let duration: number

  if (activated >= total) {
    duration = POWER_CELL_FINAL_DURATION
    // Final cell — a sustained "power booting" saw drone. Root + fifth +
    // octave-up layered saws sweep a resonant lowpass from a low rumble
    // up to a bright sheen, with a gentle pitch-bend so it reads as the
    // station spooling back to life rather than a polite chord stab.
    filter.frequency.setValueAtTime(POWER_CELL_FINAL_FILTER_START_HZ, now)
    filter.frequency.exponentialRampToValueAtTime(
      POWER_CELL_FINAL_FILTER_END_HZ,
      now + duration * 0.7,
    )
    filter.frequency.exponentialRampToValueAtTime(
      POWER_CELL_FINAL_FILTER_END_HZ * 0.5,
      now + duration,
    )
    const root = POWER_CELL_SCALE_HZ[1]! // C4 — sits below the per-cell range
    const fifth = POWER_CELL_SCALE_HZ[4]! // G4
    const octave = POWER_CELL_SCALE_HZ[6]! // C5
    schedulePowerUpDrone(ctx, output, now, root, duration, POWER_CELL_NOTE_VOLUME * 1.1, sources)
    schedulePowerUpDrone(ctx, output, now, fifth, duration, POWER_CELL_NOTE_VOLUME * 0.7, sources)
    schedulePowerUpDrone(ctx, output, now, octave, duration, POWER_CELL_NOTE_VOLUME * 0.5, sources)
  } else {
    duration = POWER_CELL_NOTE_DURATION
    // Per-cell sweep: each cell snaps the filter back down and lets it
    // climb again so every note feels like another generator coming
    // online, not a melody.
    filter.frequency.setValueAtTime(POWER_CELL_FILTER_START_HZ, now)
    filter.frequency.exponentialRampToValueAtTime(
      POWER_CELL_FILTER_END_HZ,
      now + duration * 0.55,
    )
    filter.frequency.exponentialRampToValueAtTime(
      POWER_CELL_FILTER_END_HZ * 0.4,
      now + duration,
    )
    const noteIndex = Math.min(Math.max(0, activated - 1), POWER_CELL_SCALE_HZ.length - 1)
    schedulePowerCellTone(
      ctx,
      output,
      now,
      POWER_CELL_SCALE_HZ[noteIndex]!,
      duration,
      POWER_CELL_NOTE_VOLUME,
      sources,
    )
  }

  globalThis.setTimeout(
    () => {
      for (const source of sources) {
        try {
          source.disconnect()
        } catch {
          /* ignore disconnect races */
        }
      }
      try {
        output.disconnect()
        filter.disconnect()
      } catch {
        /* ignore disconnect races */
      }
    },
    duration * 1000 + MELODY_CLEANUP_DELAY_MS,
  )
}

/**
 * Schedule one per-cell saw tone: a unison pair of detuned sawtooths
 * (the source of the "saw drone" buzz) plus a sub-sine for body. The
 * shared filter on the bus does the sweep — this function only owns
 * the oscillators + envelopes.
 */
function schedulePowerCellTone(
  ctx: AudioContext,
  output: GainNode,
  startTime: number,
  frequencyHz: number,
  duration: number,
  volume: number,
  sources: StoppableNode[],
): void {
  // Two detuned saws in unison — the classic "fat synth swell" texture.
  for (const detune of [+POWER_CELL_DETUNE_CENTS, -POWER_CELL_DETUNE_CENTS]) {
    const saw = ctx.createOscillator()
    const sawGain = ctx.createGain()
    saw.type = 'sawtooth'
    saw.frequency.setValueAtTime(frequencyHz, startTime)
    saw.detune.setValueAtTime(detune, startTime)
    applyHeldEnvelope(sawGain.gain, startTime, duration, volume * 0.55)
    saw.connect(sawGain)
    sawGain.connect(output)
    scheduleSource(saw, startTime, duration + POWER_CELL_SOURCE_TAIL_S, sources)
  }

  // Sub-octave sine for body — keeps the buzz from feeling thin.
  const sub = ctx.createOscillator()
  const subGain = ctx.createGain()
  sub.type = 'sine'
  sub.frequency.setValueAtTime(frequencyHz * POWER_CELL_SUPPORT_RATIO, startTime)
  applyHeldEnvelope(
    subGain.gain,
    startTime,
    duration * POWER_CELL_SUPPORT_DURATION_RATIO,
    volume * POWER_CELL_SUPPORT_GAIN_RATIO,
  )
  sub.connect(subGain)
  subGain.connect(output)
  scheduleSource(
    sub,
    startTime,
    duration * POWER_CELL_SUPPORT_DURATION_RATIO + POWER_CELL_SOURCE_TAIL_S,
    sources,
  )
}

/**
 * Schedule one sustained saw drone layer used by the final-cell
 * "station booting" cue. Wider unison (3 detuned saws) than the
 * per-cell tone and a slow upward pitch bend across the duration so
 * the layer reads as spooling up. The shared bus filter does the
 * cutoff sweep; this function only owns the oscillators.
 */
function schedulePowerUpDrone(
  ctx: AudioContext,
  output: GainNode,
  startTime: number,
  frequencyHz: number,
  duration: number,
  volume: number,
  sources: StoppableNode[],
): void {
  const targetHz = frequencyHz * Math.pow(2, POWER_CELL_FINAL_PITCH_BEND_SEMITONES / 12)
  for (const detune of [-POWER_CELL_DETUNE_CENTS * 1.6, 0, +POWER_CELL_DETUNE_CENTS * 1.6]) {
    const saw = ctx.createOscillator()
    const sawGain = ctx.createGain()
    saw.type = 'sawtooth'
    saw.frequency.setValueAtTime(frequencyHz, startTime)
    saw.frequency.exponentialRampToValueAtTime(targetHz, startTime + duration * 0.6)
    saw.detune.setValueAtTime(detune, startTime)
    applyHeldEnvelope(sawGain.gain, startTime, duration, volume * 0.42)
    saw.connect(sawGain)
    sawGain.connect(output)
    scheduleSource(saw, startTime, duration + POWER_CELL_SOURCE_TAIL_S, sources)
  }
  // Sub octave sine — gives the drone weight under the saws.
  const sub = ctx.createOscillator()
  const subGain = ctx.createGain()
  sub.type = 'sine'
  sub.frequency.setValueAtTime(frequencyHz * 0.5, startTime)
  applyHeldEnvelope(subGain.gain, startTime, duration, volume * 0.55)
  sub.connect(subGain)
  subGain.connect(output)
  scheduleSource(sub, startTime, duration + POWER_CELL_SOURCE_TAIL_S, sources)
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
