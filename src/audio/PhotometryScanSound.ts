/**
 * Stateful procedural audio for the photometry scan beam and lock melody.
 *
 * @author guinetik
 * @date 2026-04-26
 * @spec docs/superpowers/specs/2026-04-26-photometry-minigame-design.md
 */
import { Howler } from 'howler'

/** Master gain floor used to keep exponential-ish ramps safe. */
const SILENCE_GAIN = 0.0001

/** Base X-ray beam hum volume while the scan beam is visible. */
const BEAM_CORE_GAIN = 0.055

/** Electrical shimmer volume layered over the beam hum. */
const BEAM_SHIMMER_GAIN = 0.018

/** Maximum lock melody volume at full scan clarity. */
const MELODY_GAIN_MAX = 0.105

/** Detuned shadow voice volume at low scan clarity. */
const MELODY_DETUNE_GAIN_MAX = 0.038

/** Faint noise/air amount at low scan clarity. */
const MELODY_NOISE_GAIN_MAX = 0.022

/** Main beam frequency in Hz. */
const BEAM_CORE_FREQUENCY = 620

/** Beam shimmer frequency in Hz. */
const BEAM_SHIMMER_FREQUENCY = 1240

/** Lowest lock melody frequency in Hz. */
const MELODY_MIN_FREQUENCY = 660

/** Melody scale in Hz, rising in discrete steps as scan progress fills. */
const MELODY_FREQUENCIES = [660, 742, 831, 990, 1111, 1320] as const

/** Highest lock melody frequency in Hz. */
const MELODY_MAX_FREQUENCY = MELODY_FREQUENCIES[MELODY_FREQUENCIES.length - 1] ?? 1320

/** Detune width in Hz when scan progress is unclear. */
const MELODY_DETUNE_WIDTH = 24

/** Output gain ramp time in seconds. */
const OUTPUT_RAMP_SECONDS = 0.05

/** Beam layer ramp time in seconds. */
const BEAM_RAMP_SECONDS = 0.06

/** Melody layer ramp time in seconds. */
const MELODY_RAMP_SECONDS = 0.08

/** Noise buffer duration in seconds. */
const NOISE_BUFFER_SECONDS = 2

/**
 * Per-frame photometry scan audio state.
 *
 * @author guinetik
 * @date 2026-04-26
 */
export interface PhotometryScanAudioFrame {
  /** True while the scan beam is visible in world space. */
  visible: boolean
  /** True while the scan beam is aligned and progress is increasing. */
  locked: boolean
  /** Scan completion fraction in `[0, 1]`, for example `0.75`. */
  progress: number
  /** Master SFX volume scalar in `[0, 1]`, for example `0.8`. */
  sfxVolume: number
}

/**
 * Continuous two-layer photometry scan synth.
 *
 * The base X-ray hum follows beam visibility. The lock melody is independent
 * and fades in only while the minigame reports a valid scan lock.
 *
 * @author guinetik
 * @date 2026-04-26
 */
export class PhotometryScanSound {
  private audioContext: AudioContext | null = null
  private outputGain: GainNode | null = null
  private beamCoreOsc: OscillatorNode | null = null
  private beamCoreGain: GainNode | null = null
  private beamShimmerOsc: OscillatorNode | null = null
  private beamShimmerGain: GainNode | null = null
  private melodyOsc: OscillatorNode | null = null
  private melodyGain: GainNode | null = null
  private melodyDetuneOsc: OscillatorNode | null = null
  private melodyDetuneGain: GainNode | null = null
  private noiseSource: AudioBufferSourceNode | null = null
  private noiseFilter: BiquadFilterNode | null = null
  private noiseGain: GainNode | null = null
  private stereoPanner: StereoPannerNode | null = null
  private alive = false

  /**
   * Update the continuous scan audio layers.
   *
   * @param frame - Beam visibility, lock, progress, and volume state.
   * @param _dt - Seconds since previous update; kept for caller symmetry.
   */
  update(frame: PhotometryScanAudioFrame, _dt: number): void {
    const visible = frame.visible
    const locked = visible && frame.locked
    if (!visible && !this.alive) return
    if (!this.ensureGraph()) return

    const progress = clamp01(frame.progress)
    const clarity = locked ? progress : 0
    const now = this.audioContext!.currentTime
    const melodyFrequency = pickMelodyFrequency(progress)
    const detuneOffset = (1 - clarity) * MELODY_DETUNE_WIDTH

    automateParam(this.outputGain!.gain, clamp01(frame.sfxVolume), now, OUTPUT_RAMP_SECONDS, 0, 1)
    automateParam(
      this.beamCoreGain!.gain,
      visible ? BEAM_CORE_GAIN : SILENCE_GAIN,
      now,
      BEAM_RAMP_SECONDS,
      SILENCE_GAIN,
      1,
    )
    automateParam(
      this.beamShimmerGain!.gain,
      visible ? BEAM_SHIMMER_GAIN : SILENCE_GAIN,
      now,
      BEAM_RAMP_SECONDS,
      SILENCE_GAIN,
      1,
    )
    automateParam(
      this.melodyOsc!.frequency,
      locked ? melodyFrequency : MELODY_MIN_FREQUENCY,
      now,
      MELODY_RAMP_SECONDS,
      MELODY_MIN_FREQUENCY,
      MELODY_MAX_FREQUENCY,
    )
    automateParam(
      this.melodyDetuneOsc!.frequency,
      locked ? melodyFrequency + detuneOffset : MELODY_MIN_FREQUENCY + MELODY_DETUNE_WIDTH,
      now,
      MELODY_RAMP_SECONDS,
      MELODY_MIN_FREQUENCY,
      MELODY_MAX_FREQUENCY + MELODY_DETUNE_WIDTH,
    )
    automateParam(
      this.melodyGain!.gain,
      locked ? MELODY_GAIN_MAX * (0.55 + clarity * 0.45) : SILENCE_GAIN,
      now,
      MELODY_RAMP_SECONDS,
      SILENCE_GAIN,
      1,
    )
    automateParam(
      this.melodyDetuneGain!.gain,
      locked ? MELODY_DETUNE_GAIN_MAX * (1 - clarity) : SILENCE_GAIN,
      now,
      MELODY_RAMP_SECONDS,
      SILENCE_GAIN,
      1,
    )
    automateParam(
      this.noiseGain!.gain,
      locked ? MELODY_NOISE_GAIN_MAX * (1 - clarity) : SILENCE_GAIN,
      now,
      MELODY_RAMP_SECONDS,
      SILENCE_GAIN,
      1,
    )

    this.alive = visible
  }

  /** Fade both layers to silence without disposing the graph. */
  stop(): void {
    const ctx = this.audioContext
    if (ctx) {
      const now = ctx.currentTime
      automateParam(
        this.beamCoreGain?.gain ?? null,
        SILENCE_GAIN,
        now,
        BEAM_RAMP_SECONDS,
        SILENCE_GAIN,
        1,
      )
      automateParam(
        this.beamShimmerGain?.gain ?? null,
        SILENCE_GAIN,
        now,
        BEAM_RAMP_SECONDS,
        SILENCE_GAIN,
        1,
      )
      automateParam(
        this.melodyGain?.gain ?? null,
        SILENCE_GAIN,
        now,
        MELODY_RAMP_SECONDS,
        SILENCE_GAIN,
        1,
      )
      automateParam(
        this.melodyDetuneGain?.gain ?? null,
        SILENCE_GAIN,
        now,
        MELODY_RAMP_SECONDS,
        SILENCE_GAIN,
        1,
      )
      automateParam(
        this.noiseGain?.gain ?? null,
        SILENCE_GAIN,
        now,
        MELODY_RAMP_SECONDS,
        SILENCE_GAIN,
        1,
      )
    }
    this.alive = false
  }

  /** Dispose all WebAudio nodes owned by the scan synth. */
  dispose(): void {
    this.stop()
    this.disconnectNode(this.beamCoreOsc)
    this.disconnectNode(this.beamCoreGain)
    this.disconnectNode(this.beamShimmerOsc)
    this.disconnectNode(this.beamShimmerGain)
    this.disconnectNode(this.melodyOsc)
    this.disconnectNode(this.melodyGain)
    this.disconnectNode(this.melodyDetuneOsc)
    this.disconnectNode(this.melodyDetuneGain)
    this.disconnectNode(this.noiseSource)
    this.disconnectNode(this.noiseFilter)
    this.disconnectNode(this.noiseGain)
    this.disconnectNode(this.stereoPanner)
    this.disconnectNode(this.outputGain)

    this.outputGain = null
    this.beamCoreOsc = null
    this.beamCoreGain = null
    this.beamShimmerOsc = null
    this.beamShimmerGain = null
    this.melodyOsc = null
    this.melodyGain = null
    this.melodyDetuneOsc = null
    this.melodyDetuneGain = null
    this.noiseSource = null
    this.noiseFilter = null
    this.noiseGain = null
    this.stereoPanner = null
    this.audioContext = null
  }

  /** Create the WebAudio graph on first use. */
  private ensureGraph(): boolean {
    if (this.outputGain) return true
    if (Howler.noAudio) return false

    const ctx = Howler.ctx
    const masterGain = (Howler as unknown as { masterGain?: AudioNode }).masterGain
    if (!ctx || !masterGain) return false

    const outputGain = ctx.createGain()
    outputGain.gain.value = SILENCE_GAIN

    const stereoPanner =
      typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null
    if (stereoPanner) {
      outputGain.connect(stereoPanner)
      stereoPanner.connect(masterGain)
    } else {
      outputGain.connect(masterGain)
    }

    const beamCoreOsc = ctx.createOscillator()
    beamCoreOsc.type = 'triangle'
    beamCoreOsc.frequency.value = BEAM_CORE_FREQUENCY
    const beamCoreGain = ctx.createGain()
    beamCoreGain.gain.value = SILENCE_GAIN
    beamCoreOsc.connect(beamCoreGain)
    beamCoreGain.connect(outputGain)
    beamCoreOsc.start()

    const beamShimmerOsc = ctx.createOscillator()
    beamShimmerOsc.type = 'sine'
    beamShimmerOsc.frequency.value = BEAM_SHIMMER_FREQUENCY
    const beamShimmerGain = ctx.createGain()
    beamShimmerGain.gain.value = SILENCE_GAIN
    beamShimmerOsc.connect(beamShimmerGain)
    beamShimmerGain.connect(outputGain)
    beamShimmerOsc.start()

    const melodyOsc = ctx.createOscillator()
    melodyOsc.type = 'sine'
    melodyOsc.frequency.value = MELODY_MIN_FREQUENCY
    const melodyGain = ctx.createGain()
    melodyGain.gain.value = SILENCE_GAIN
    melodyOsc.connect(melodyGain)
    melodyGain.connect(outputGain)
    melodyOsc.start()

    const melodyDetuneOsc = ctx.createOscillator()
    melodyDetuneOsc.type = 'sine'
    melodyDetuneOsc.frequency.value = MELODY_MIN_FREQUENCY + MELODY_DETUNE_WIDTH
    const melodyDetuneGain = ctx.createGain()
    melodyDetuneGain.gain.value = SILENCE_GAIN
    melodyDetuneOsc.connect(melodyDetuneGain)
    melodyDetuneGain.connect(outputGain)
    melodyDetuneOsc.start()

    const noiseSource = createLoopingNoiseSource(ctx)
    const noiseFilter = ctx.createBiquadFilter()
    noiseFilter.type = 'bandpass'
    noiseFilter.frequency.value = BEAM_SHIMMER_FREQUENCY
    noiseFilter.Q.value = 1.8
    const noiseGain = ctx.createGain()
    noiseGain.gain.value = SILENCE_GAIN
    noiseSource.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(outputGain)
    noiseSource.start()

    this.outputGain = outputGain
    this.audioContext = ctx
    this.stereoPanner = stereoPanner
    this.beamCoreOsc = beamCoreOsc
    this.beamCoreGain = beamCoreGain
    this.beamShimmerOsc = beamShimmerOsc
    this.beamShimmerGain = beamShimmerGain
    this.melodyOsc = melodyOsc
    this.melodyGain = melodyGain
    this.melodyDetuneOsc = melodyDetuneOsc
    this.melodyDetuneGain = melodyDetuneGain
    this.noiseSource = noiseSource
    this.noiseFilter = noiseFilter
    this.noiseGain = noiseGain
    return true
  }

  /** Disconnect one WebAudio node, ignoring already-disconnected nodes. */
  private disconnectNode(node: AudioNode | null): void {
    if (!node) return
    try {
      node.disconnect()
    } catch {
      /* ignore disconnect races */
    }
  }
}

/** Pick a discrete melody note for the current scan progress. */
function pickMelodyFrequency(progress: number): number {
  const clamped = clamp01(progress)
  const index = Math.min(
    MELODY_FREQUENCIES.length - 1,
    Math.floor(clamped * MELODY_FREQUENCIES.length),
  )
  return MELODY_FREQUENCIES[index] ?? MELODY_MIN_FREQUENCY
}

/** Creates a looping white-noise source for the resolving melody haze. */
function createLoopingNoiseSource(ctx: AudioContext): AudioBufferSourceNode {
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * NOISE_BUFFER_SECONDS))
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)

  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = Math.random() * 2 - 1
  }

  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.loop = true
  return source
}

/** Ramps an audio parameter to a clamped value. */
function automateParam(
  param: AudioParam | null,
  value: number,
  now: number,
  rampSeconds: number,
  min: number,
  max: number,
): void {
  if (!param) return
  const safeValue = clamp(Number.isFinite(value) ? value : min, min, max)
  const safeRamp = Math.max(0.01, Number.isFinite(rampSeconds) ? rampSeconds : 0.03)
  param.cancelScheduledValues(now)
  param.setValueAtTime(param.value, now)
  param.linearRampToValueAtTime(safeValue, now + safeRamp)
}

/** Clamps `value` to `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Clamps `value` to `[0, 1]`. */
function clamp01(value: number): number {
  return clamp(value, 0, 1)
}
