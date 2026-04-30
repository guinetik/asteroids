/**
 * Synthesized audio for the prospectus overlay. Three cues:
 * a corporate-hum ambient loop, a clean transmit chord, and a
 * data-corruption tamper glitch. SSR-safe — `AudioContext` is created
 * lazily on first play, never at construction time.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-29-jovian-prospectus-minigame-design.md
 */

/** Master peak gain shared across transmit and tamper cues. */
const MASTER_PEAK = 0.18

/** Ambient hum fundamental frequency in Hz. */
const AMBIENT_FUNDAMENTAL_HZ = 110
/** Ambient hum harmonic frequency in Hz (one octave up). */
const AMBIENT_HARMONIC_HZ = 220
/** Relative gain of the harmonic oscillator versus the fundamental. */
const AMBIENT_HARMONIC_GAIN = 0.5
/** Steady-state master gain for the ambient loop — very low to sit under the UI. */
const AMBIENT_GAIN = 0.06
/** LFO rate for the ambient breathing effect in Hz. */
const AMBIENT_LFO_HZ = 0.2
/** Peak-to-peak depth of the ambient LFO gain modulation. */
const AMBIENT_LFO_DEPTH = 0.005
/** Fade-out ramp duration when stopping the ambient loop, in seconds. */
const AMBIENT_STOP_RAMP_S = 0.05

/** Root pitch of the transmit confirm chord (G4) in Hz. */
const TRANSMIT_ROOT_HZ = 392
/** Perfect-fifth above root (D5) in Hz. */
const TRANSMIT_FIFTH_HZ = 587
/** Low-pass filter cutoff for the transmit chord, in Hz. */
const TRANSMIT_FILTER_HZ = 2000
/** Low-pass filter Q for the transmit chord — gentle warmth. */
const TRANSMIT_FILTER_Q = 0.7
/** Attack time for the transmit envelope, in seconds. */
const TRANSMIT_ATTACK_S = 0.01
/** Exponential decay duration for the transmit envelope, in seconds. */
const TRANSMIT_DECAY_S = 0.5
/** Peak gain of the transmit chord envelope. */
const TRANSMIT_PEAK_GAIN = MASTER_PEAK

/** Number of staccato square-wave bursts in the tamper glitch. */
const TAMPER_BURST_COUNT = 3
/** Duration of each square-wave burst in the tamper glitch, in seconds. */
const TAMPER_BURST_DURATION_S = 0.08
/** Minimum random pitch for tamper bursts, in Hz. */
const TAMPER_BURST_FREQ_MIN_HZ = 200
/** Maximum random pitch for tamper bursts, in Hz. */
const TAMPER_BURST_FREQ_MAX_HZ = 600
/** Low-pass filter cutoff applied to tamper square-wave bursts, in Hz. */
const TAMPER_FILTER_HZ = 1200
/** Duration of the initial white-noise burst in the tamper cue, in seconds. */
const TAMPER_NOISE_DURATION_S = 0.05
/** Gain of the white-noise burst — kept low relative to the square bursts. */
const TAMPER_NOISE_GAIN = 0.08
/** Peak gain for each tamper burst envelope. */
const TAMPER_PEAK_GAIN = MASTER_PEAK

/**
 * Synthesized audio engine for the Jovian Prospectus overlay.
 *
 * Exposes four public methods: {@link playAmbient}, {@link stopAmbient},
 * {@link playTransmit}, and {@link playTamper}, plus {@link dispose}.
 * `AudioContext` is constructed lazily on first play — safe in SSR and
 * JSDOM environments where `AudioContext` is undefined.
 *
 * @author guinetik
 * @date 2026-04-30
 */
export class ProspectusAudio {
  /** Lazily-created Web Audio context. */
  private ctx: AudioContext | null = null
  /** Master gain node wired to `ctx.destination`. */
  private master: GainNode | null = null
  /** Nodes kept alive for the looping ambient hum. */
  private ambientNodes: {
    osc1: OscillatorNode
    osc2: OscillatorNode
    lfo: OscillatorNode
    lfoGain: GainNode
    gain: GainNode
  } | null = null

  /**
   * Lazy-initialise the audio graph on first play.
   * Returns `false` if `AudioContext` is unavailable (SSR / JSDOM),
   * `true` once the context and master gain are ready.
   */
  private ensureGraph(): boolean {
    if (this.ctx) return true
    if (typeof AudioContext === 'undefined') return false
    this.ctx = new AudioContext()
    this.master = this.ctx.createGain()
    this.master.gain.value = 1
    this.master.connect(this.ctx.destination)
    return true
  }

  /**
   * Start the ambient corporate-hum loop.
   * Idempotent — calling while the loop is already running is a no-op.
   */
  playAmbient(): void {
    if (!this.ensureGraph()) return
    if (this.ambientNodes) return

    const ctx = this.ctx!
    const master = this.master!
    const now = ctx.currentTime

    // Main gain for the ambient loop
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(AMBIENT_GAIN, now)
    gain.connect(master)

    // Fundamental 110 Hz sine
    const osc1 = ctx.createOscillator()
    osc1.type = 'sine'
    osc1.frequency.value = AMBIENT_FUNDAMENTAL_HZ

    // Harmonic 220 Hz sine at half amplitude
    const osc2 = ctx.createOscillator()
    osc2.type = 'sine'
    osc2.frequency.value = AMBIENT_HARMONIC_HZ

    const harmGain = ctx.createGain()
    harmGain.gain.value = AMBIENT_HARMONIC_GAIN
    osc2.connect(harmGain)
    harmGain.connect(gain)
    osc1.connect(gain)

    // Slow LFO for subtle gain breathing
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = AMBIENT_LFO_HZ

    const lfoGain = ctx.createGain()
    lfoGain.gain.value = AMBIENT_LFO_DEPTH
    lfo.connect(lfoGain)
    lfoGain.connect(gain.gain)

    osc1.start(now)
    osc2.start(now)
    lfo.start(now)

    this.ambientNodes = { osc1, osc2, lfo, lfoGain, gain }
  }

  /**
   * Stop the ambient hum loop with a short fade-out.
   * Idempotent — safe to call before any `playAmbient()`.
   */
  stopAmbient(): void {
    if (!this.ambientNodes || !this.ctx) return
    const { osc1, osc2, lfo, gain } = this.ambientNodes
    const now = this.ctx.currentTime

    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(gain.gain.value, now)
    gain.gain.linearRampToValueAtTime(0, now + AMBIENT_STOP_RAMP_S)

    const stopAt = now + AMBIENT_STOP_RAMP_S + 0.01
    for (const src of [osc1, osc2, lfo] as OscillatorNode[]) {
      try {
        src.stop(stopAt)
      } catch {
        /* already stopped */
      }
    }

    this.ambientNodes = null
  }

  /**
   * Fire the transmit confirm chord (one-shot, ~0.5 s).
   * Two sine oscillators (G4 + D5) through a warm low-pass,
   * with a quick linear attack and exponential decay to silence.
   * Overlapping fires are independent and tonally fine.
   */
  playTransmit(): void {
    if (!this.ensureGraph()) return

    const ctx = this.ctx!
    const master = this.master!
    const now = ctx.currentTime

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = TRANSMIT_FILTER_HZ
    filter.Q.value = TRANSMIT_FILTER_Q
    filter.connect(master)

    const env = ctx.createGain()
    env.gain.setValueAtTime(0, now)
    env.gain.linearRampToValueAtTime(TRANSMIT_PEAK_GAIN, now + TRANSMIT_ATTACK_S)
    env.gain.exponentialRampToValueAtTime(0.0001, now + TRANSMIT_ATTACK_S + TRANSMIT_DECAY_S)
    env.connect(filter)

    for (const freq of [TRANSMIT_ROOT_HZ, TRANSMIT_FIFTH_HZ]) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq
      osc.connect(env)
      osc.start(now)
      osc.stop(now + TRANSMIT_ATTACK_S + TRANSMIT_DECAY_S + 0.01)
    }
  }

  /**
   * Fire the tamper data-corruption glitch (one-shot, ~0.4 s).
   * Starts with a brief white-noise burst, then fires three staccato
   * square-wave bursts at random pitches through a low-pass filter.
   */
  playTamper(): void {
    if (!this.ensureGraph()) return

    const ctx = this.ctx!
    const master = this.master!
    const now = ctx.currentTime

    // White-noise burst at the very start
    const noiseSamples = Math.max(1, Math.floor(ctx.sampleRate * TAMPER_NOISE_DURATION_S))
    const noiseBuf = ctx.createBuffer(1, noiseSamples, ctx.sampleRate)
    const data = noiseBuf.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1

    const noiseSrc = ctx.createBufferSource()
    noiseSrc.buffer = noiseBuf
    const noiseGain = ctx.createGain()
    noiseGain.gain.value = TAMPER_NOISE_GAIN
    noiseSrc.connect(noiseGain)
    noiseGain.connect(master)
    noiseSrc.start(now)
    noiseSrc.stop(now + TAMPER_NOISE_DURATION_S)

    // Three staccato square-wave bursts after the noise
    for (let i = 0; i < TAMPER_BURST_COUNT; i += 1) {
      const burstStart = now + TAMPER_NOISE_DURATION_S + i * TAMPER_BURST_DURATION_S
      const freq =
        Math.random() * (TAMPER_BURST_FREQ_MAX_HZ - TAMPER_BURST_FREQ_MIN_HZ) +
        TAMPER_BURST_FREQ_MIN_HZ

      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = TAMPER_FILTER_HZ
      filter.connect(master)

      const env = ctx.createGain()
      env.gain.setValueAtTime(TAMPER_PEAK_GAIN, burstStart)
      env.gain.exponentialRampToValueAtTime(0.0001, burstStart + TAMPER_BURST_DURATION_S)
      env.connect(filter)

      const osc = ctx.createOscillator()
      osc.type = 'square'
      osc.frequency.value = freq
      osc.connect(env)
      osc.start(burstStart)
      osc.stop(burstStart + TAMPER_BURST_DURATION_S + 0.01)
    }
  }

  /**
   * Tear down all nodes and close the `AudioContext`. Idempotent —
   * safe to call from `onUnmounted` without guards.
   */
  dispose(): void {
    this.stopAmbient()
    if (this.ctx) {
      try {
        void this.ctx.close()
      } catch {
        /* context may already be closed */
      }
    }
    this.ctx = null
    this.master = null
  }
}
