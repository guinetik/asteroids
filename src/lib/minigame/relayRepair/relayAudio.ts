/**
 * Live procedural "radio tuner" audio bed for the relay repair minigame.
 *
 * Unlike the one-shot presets in `src/audio/proceduralAudio.ts`, this graph
 * lives for the duration of the overlay and is continuously modulated by the
 * current puzzle quality. At quality 0 the player hears a detuned sine
 * buried in bandpassed white noise (out-of-tune radio). At quality 1 the
 * noise is silent and the carrier rings as a clean tone — mirroring the
 * oscilloscope visual on top of the overlay.
 *
 * @author guinetik
 * @date 2026-04-22
 * @spec docs/superpowers/specs/2026-04-20-relay-repair-design.md
 */

import { Howler } from 'howler'

/** Fixed audible carrier pitch in Hz. A4 — sits clearly over UI chatter without being shrill. */
const CARRIER_HZ = 440
/** Maximum wobble LFO rate in Hz when fully detuned (quality = 0). */
const WOBBLE_HZ_MAX = 6.5
/** Minimum wobble LFO rate when fully tuned — small non-zero keeps it alive. */
const WOBBLE_HZ_MIN = 0.8
/** Maximum detune depth in cents applied by the wobble LFO at quality 0. */
const MAX_DETUNE_CENTS = 780
/** White noise buffer length in seconds — loops seamlessly at this size. */
const NOISE_BUFFER_SEC = 1.8
/** Smoothing ramp for quality-driven parameter changes, in seconds. */
const PARAM_RAMP_SEC = 0.08
/** Master fade-in duration when the graph comes online. */
const FADE_IN_SEC = 0.4
/** Master fade-out duration on dispose. */
const FADE_OUT_SEC = 0.18
/** Peak master gain after fade-in. Kept conservative so it sits under voice/SFX. */
const MASTER_PEAK = 0.22
/** Noise bed gain at worst quality. */
const NOISE_PEAK = 0.55
/** Carrier gain floor so you always hear a faint sine through the noise. */
const TONE_FLOOR = 0.08
/** Additional carrier gain awarded by a perfect solve (quadratic on quality). */
const TONE_LIFT = 0.6

/**
 * Persistent procedural radio-tuner audio bed. Construct when the overlay
 * mounts, call {@link setQuality} whenever the puzzle quality changes, and
 * call {@link dispose} on unmount.
 *
 * @author guinetik
 * @date 2026-04-22
 */
export class RelayAudio {
  private ctx: AudioContext | null = null
  private output: GainNode | null = null
  private carrier: OscillatorNode | null = null
  private toneGain: GainNode | null = null
  private wobbleLfo: OscillatorNode | null = null
  private wobbleDepth: GainNode | null = null
  private noise: AudioBufferSourceNode | null = null
  private noiseFilter: BiquadFilterNode | null = null
  private noiseGain: GainNode | null = null
  private disposed = false

  /**
   * Build and start the persistent graph. Silently no-ops when the browser
   * has no audio (SSR, muted autoplay, Howler lock) — callers do not need
   * to guard.
   */
  constructor() {
    if (Howler.noAudio) return
    const ctx = Howler.ctx
    const master = (Howler as unknown as { masterGain?: AudioNode }).masterGain
    if (!ctx || !master) return

    this.ctx = ctx
    const now = ctx.currentTime

    this.output = ctx.createGain()
    this.output.gain.setValueAtTime(0, now)
    this.output.connect(master)

    this.carrier = ctx.createOscillator()
    this.carrier.type = 'sine'
    this.carrier.frequency.setValueAtTime(CARRIER_HZ, now)

    this.toneGain = ctx.createGain()
    this.toneGain.gain.setValueAtTime(TONE_FLOOR, now)
    this.carrier.connect(this.toneGain)
    this.toneGain.connect(this.output)

    this.wobbleLfo = ctx.createOscillator()
    this.wobbleLfo.type = 'sine'
    this.wobbleLfo.frequency.setValueAtTime(WOBBLE_HZ_MAX, now)

    this.wobbleDepth = ctx.createGain()
    this.wobbleDepth.gain.setValueAtTime(MAX_DETUNE_CENTS, now)
    this.wobbleLfo.connect(this.wobbleDepth)
    this.wobbleDepth.connect(this.carrier.detune)

    const noiseBuf = ctx.createBuffer(
      1,
      Math.max(1, Math.floor(ctx.sampleRate * NOISE_BUFFER_SEC)),
      ctx.sampleRate,
    )
    const data = noiseBuf.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1

    this.noise = ctx.createBufferSource()
    this.noise.buffer = noiseBuf
    this.noise.loop = true

    this.noiseFilter = ctx.createBiquadFilter()
    this.noiseFilter.type = 'bandpass'
    this.noiseFilter.frequency.setValueAtTime(3000, now)
    this.noiseFilter.Q.setValueAtTime(0.6, now)

    this.noiseGain = ctx.createGain()
    this.noiseGain.gain.setValueAtTime(NOISE_PEAK, now)
    this.noise.connect(this.noiseFilter)
    this.noiseFilter.connect(this.noiseGain)
    this.noiseGain.connect(this.output)

    const start = now + 0.01
    this.carrier.start(start)
    this.wobbleLfo.start(start)
    this.noise.start(start)

    this.output.gain.linearRampToValueAtTime(MASTER_PEAK, start + FADE_IN_SEC)
  }

  /**
   * Live-update every node in the graph to reflect the current puzzle quality.
   * Uses short linear ramps so rotations don't produce audible zipper noise.
   *
   * @param quality - Current quality in [0, 1]. Values outside this range are clamped.
   */
  setQuality(quality: number): void {
    if (this.disposed || !this.ctx) return
    const q = Math.max(0, Math.min(1, quality))
    const invQ = 1 - q
    const now = this.ctx.currentTime
    const end = now + PARAM_RAMP_SEC

    if (this.toneGain) {
      // Quadratic lift so the clean tone feels earned in the last 20% of the solve.
      const toneVol = TONE_FLOOR + q * q * TONE_LIFT
      this.toneGain.gain.cancelScheduledValues(now)
      this.toneGain.gain.setValueAtTime(this.toneGain.gain.value, now)
      this.toneGain.gain.linearRampToValueAtTime(toneVol, end)
    }

    if (this.noiseGain) {
      const noiseVol = invQ * NOISE_PEAK
      this.noiseGain.gain.cancelScheduledValues(now)
      this.noiseGain.gain.setValueAtTime(this.noiseGain.gain.value, now)
      this.noiseGain.gain.linearRampToValueAtTime(noiseVol, end)
    }

    if (this.wobbleDepth) {
      const depth = invQ * MAX_DETUNE_CENTS
      this.wobbleDepth.gain.cancelScheduledValues(now)
      this.wobbleDepth.gain.setValueAtTime(this.wobbleDepth.gain.value, now)
      this.wobbleDepth.gain.linearRampToValueAtTime(depth, end)
    }

    if (this.wobbleLfo) {
      const rate = WOBBLE_HZ_MIN + invQ * (WOBBLE_HZ_MAX - WOBBLE_HZ_MIN)
      this.wobbleLfo.frequency.cancelScheduledValues(now)
      this.wobbleLfo.frequency.setValueAtTime(this.wobbleLfo.frequency.value, now)
      this.wobbleLfo.frequency.linearRampToValueAtTime(rate, end)
    }

    if (this.noiseFilter) {
      // Noise narrows and dips lower as the signal resolves — bright hiss → distant hum.
      const freq = 800 + invQ * 2400
      const qVal = 0.5 + q * 3.5
      this.noiseFilter.frequency.cancelScheduledValues(now)
      this.noiseFilter.frequency.setValueAtTime(this.noiseFilter.frequency.value, now)
      this.noiseFilter.frequency.linearRampToValueAtTime(freq, end)
      this.noiseFilter.Q.cancelScheduledValues(now)
      this.noiseFilter.Q.setValueAtTime(this.noiseFilter.Q.value, now)
      this.noiseFilter.Q.linearRampToValueAtTime(qVal, end)
    }
  }

  /**
   * Fade out and tear down the entire graph. Idempotent — safe to call from
   * `onUnmounted` without guards.
   */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (!this.ctx || !this.output) return

    const now = this.ctx.currentTime
    try {
      this.output.gain.cancelScheduledValues(now)
      this.output.gain.setValueAtTime(this.output.gain.value, now)
      this.output.gain.linearRampToValueAtTime(0, now + FADE_OUT_SEC)
    } catch {
      /* context may already be closed */
    }

    const stopAt = now + FADE_OUT_SEC + 0.02
    const sources: Array<AudioScheduledSourceNode | null> = [
      this.carrier,
      this.wobbleLfo,
      this.noise,
    ]
    for (const src of sources) {
      if (!src) continue
      try {
        src.stop(stopAt)
      } catch {
        /* already stopped */
      }
    }

    globalThis.setTimeout(
      () => {
        const nodes: Array<AudioNode | null> = [
          this.toneGain,
          this.wobbleDepth,
          this.noiseFilter,
          this.noiseGain,
          this.output,
        ]
        for (const n of nodes) {
          if (!n) continue
          try {
            n.disconnect()
          } catch {
            /* ignore disconnect races */
          }
        }
      },
      (FADE_OUT_SEC + 0.1) * 1000,
    )
  }
}
