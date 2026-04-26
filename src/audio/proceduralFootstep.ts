/**
 * Procedural footstep synthesis (Web Audio).
 *
 * One-shot synthesis triggered per step, allowing per-step stereo panning
 * (left/right foot) and pitch / amplitude jitter so a long walk never sounds
 * mechanical or out-of-sync — both shortcomings of the previous looping pair
 * of recorded `sfx.step.{surface}.{1|2}` samples.
 *
 * Two voices are layered per surface:
 * - **Click / crunch** — high frequency transient that gives the foot its
 *   "attack". For habitat this is a sharp filtered noise click; for asteroid
 *   this is a softer band-passed crunch (regolith).
 * - **Thud** — low frequency body that gives the foot its weight. Same recipe
 *   for both surfaces, just with slightly different cutoffs.
 *
 * The asteroid surface also adds a tiny low rumble tail to suggest grit
 * sliding under the boot. The habitat surface adds a brief metallic ring.
 *
 * @author guinetik
 * @date 2026-04-18
 * @spec docs/superpowers/specs/2026-04-18-procedural-footsteps-design.md
 */
import { Howler } from 'howler'

/** Surfaces with a procedural footstep recipe. */
export type FootstepSurface = 'habitat' | 'asteroid'

/** Arguments accepted by {@link playProceduralFootstep}. */
export interface ProceduralFootstepArgs {
  /** Which surface recipe to use. */
  surface: FootstepSurface
  /** Stereo pan in [-1, 1]. Negative = left foot, positive = right foot. */
  stereo?: number
  /** Pitch jitter as a unitless multiplier around 1.0 (e.g. 0.95 - 1.05). */
  pitchScale?: number
  /** Step "force" in [0, 1]. Heavier steps (sprint) sound louder + brighter. */
  intensity?: number
  /** Master sfx category gain in [0, 1]. Multiplied into the output level. */
  volume: number
}

/** Default stereo bias when no explicit value is provided. */
const DEFAULT_STEREO = 0
/** Default pitch jitter multiplier (no jitter). */
const DEFAULT_PITCH_SCALE = 1
/** Default footstep intensity (medium effort walk). */
const DEFAULT_INTENSITY = 0.6
/** Hard ceiling for stereo pan magnitude. */
const PAN_CLAMP = 0.85
/**
 * Maximum number of in-flight footstep voices at any moment. Each voice is
 * a sub-150 ms transient, so under normal play we'd expect ≤ 1 voice live at
 * a time. The cap is a defense against any caller (or future caller) that
 * might fire more often than the cadence allows — extra voices are dropped
 * silently rather than stacked, which is what was making the audio feel like
 * a drum machine when triggered rapidly.
 */
const MAX_CONCURRENT_VOICES = 2

/** Currently in-flight voice count, shared across all callers. */
let activeVoices = 0

/**
 * Synthesize and play a single footstep through the shared Howler context.
 *
 * Returns immediately; the audio nodes self-clean once the envelope decays.
 * No-ops (and returns `false`) when the audio context is unavailable
 * (e.g. SSR / muted device) or when the global voice cap is already saturated.
 *
 * @param args - See {@link ProceduralFootstepArgs}.
 * @returns `true` if a voice was actually scheduled, `false` if the call was
 *   dropped (no audio context, or concurrency cap hit). Callers can use this
 *   to keep their own foot-alternation index in sync.
 */
export function playProceduralFootstep(args: ProceduralFootstepArgs): boolean {
  if (Howler.noAudio) return false
  if (activeVoices >= MAX_CONCURRENT_VOICES) return false

  const ctx = Howler.ctx
  const masterGain = (Howler as unknown as { masterGain?: AudioNode }).masterGain
  if (!ctx || !masterGain) return false

  const stereo = clamp(args.stereo ?? DEFAULT_STEREO, -PAN_CLAMP, PAN_CLAMP)
  const pitchScale = Math.max(0.1, args.pitchScale ?? DEFAULT_PITCH_SCALE)
  const intensity = clamp01(args.intensity ?? DEFAULT_INTENSITY)
  const volume = clamp01(args.volume)

  const output = ctx.createGain()
  output.gain.value = volume

  const panner = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null
  if (panner) {
    panner.pan.value = stereo
    output.connect(panner)
    panner.connect(masterGain)
  } else {
    output.connect(masterGain)
  }

  const now = ctx.currentTime
  const duration =
    args.surface === 'habitat'
      ? buildHabitatStep(ctx, output, now, intensity, pitchScale)
      : buildAsteroidStep(ctx, output, now, intensity, pitchScale)

  activeVoices += 1
  // Schedule disconnect (and voice-counter decrement) after the longest tail.
  const cleanupDelayMs = Math.max(0, duration * 1000 + 60)
  globalThis.setTimeout(() => {
    safeDisconnect(output)
    if (panner) safeDisconnect(panner)
    activeVoices = Math.max(0, activeVoices - 1)
  }, cleanupDelayMs)

  return true
}

/**
 * Test-only hook to reset the global voice counter. Not used at runtime.
 *
 * @internal
 */
export function _resetProceduralFootstepVoicesForTests(): void {
  activeVoices = 0
}

/**
 * Habitat step recipe: boot on a hard composite / alloy plate.
 *
 * Mirrors the asteroid recipe (pitch-dropping body + band-passed noise sweep)
 * but shifted to read as more metallic and less dusty:
 * - Body kick is slightly higher (180 → 70 Hz vs asteroid's 140 → 55 Hz),
 *   giving a "knock" more than a "thud".
 * - Noise sweep sits in the high-mid range (3 kHz → 1.4 kHz) to suggest
 *   metal contact instead of regolith grit.
 * - No grit tail — there's no settling dust on a hard floor.
 *
 * The bandpass uses a low Q (0.9) on purpose: a higher Q on noise rings
 * as a sustained tone, which is what made the previous "narrow bandpass"
 * version of this recipe scream a high pitch under rapid retriggering.
 *
 * @returns Total tail duration in seconds (used to schedule node cleanup).
 */
function buildHabitatStep(
  ctx: AudioContext,
  output: GainNode,
  startTime: number,
  intensity: number,
  pitchScale: number,
): number {
  // ── Body kick ──────────────────────────────────────────────────
  const bodyDuration = 0.085
  const body = ctx.createOscillator()
  body.type = 'sine'
  body.frequency.setValueAtTime(180 * pitchScale, startTime)
  body.frequency.exponentialRampToValueAtTime(70 * pitchScale, startTime + 0.045)
  const bodyGain = ctx.createGain()
  applyKickEnvelope(bodyGain.gain, startTime, bodyDuration, 0.7 * (0.6 + intensity * 0.4))
  body.connect(bodyGain)
  bodyGain.connect(output)
  body.start(startTime)
  body.stop(startTime + bodyDuration + 0.02)

  // ── Metallic tap (band-passed pink noise sweep, low Q) ─────────
  const tapDuration = 0.06
  const tap = createNoiseSource(ctx, tapDuration, 'pink')
  const tapFilter = ctx.createBiquadFilter()
  tapFilter.type = 'bandpass'
  tapFilter.frequency.setValueAtTime(3000 * pitchScale, startTime)
  tapFilter.frequency.exponentialRampToValueAtTime(1400 * pitchScale, startTime + tapDuration)
  tapFilter.Q.value = 0.9
  const tapGain = ctx.createGain()
  applyKickEnvelope(tapGain.gain, startTime, tapDuration, 0.5 * (0.55 + intensity * 0.45))
  tap.connect(tapFilter)
  tapFilter.connect(tapGain)
  tapGain.connect(output)
  tap.start(startTime)
  tap.stop(startTime + tapDuration + 0.01)

  return bodyDuration
}

/**
 * Asteroid step recipe: boot on loose regolith.
 *
 * Three layers giving a softer, "scrunchy" impact:
 * 1. **Body kick** — same pitch-drop sine trick as habitat, lower (140 → 55 Hz)
 *    and quieter for "muffled by dust" feel.
 * 2. **Crunch** — band-passed pink noise with a downward cutoff sweep
 *    (2.2 kHz → 900 Hz) over the body's lifetime. This gives the granular
 *    "scrunch" of grit compressing under the boot.
 * 3. **Grit tail** — quiet low-passed pink noise that fades in just after
 *    the impact and decays away, suggesting dust settling.
 *
 * @returns Total tail duration in seconds (used to schedule node cleanup).
 */
function buildAsteroidStep(
  ctx: AudioContext,
  output: GainNode,
  startTime: number,
  intensity: number,
  pitchScale: number,
): number {
  // ── Body kick ──────────────────────────────────────────────────
  const bodyDuration = 0.1
  const body = ctx.createOscillator()
  body.type = 'sine'
  body.frequency.setValueAtTime(140 * pitchScale, startTime)
  body.frequency.exponentialRampToValueAtTime(55 * pitchScale, startTime + 0.05)
  const bodyGain = ctx.createGain()
  applyKickEnvelope(bodyGain.gain, startTime, bodyDuration, 0.65 * (0.55 + intensity * 0.45))
  body.connect(bodyGain)
  bodyGain.connect(output)
  body.start(startTime)
  body.stop(startTime + bodyDuration + 0.02)

  // ── Crunch (band-passed pink noise with cutoff sweep) ──────────
  const crunchDuration = 0.07
  const crunch = createNoiseSource(ctx, crunchDuration, 'pink')
  const crunchFilter = ctx.createBiquadFilter()
  crunchFilter.type = 'bandpass'
  crunchFilter.frequency.setValueAtTime(2200 * pitchScale, startTime)
  crunchFilter.frequency.exponentialRampToValueAtTime(900 * pitchScale, startTime + crunchDuration)
  crunchFilter.Q.value = 1.2
  const crunchGain = ctx.createGain()
  applyKickEnvelope(crunchGain.gain, startTime, crunchDuration, 0.55 * (0.5 + intensity * 0.5))
  crunch.connect(crunchFilter)
  crunchFilter.connect(crunchGain)
  crunchGain.connect(output)
  crunch.start(startTime)
  crunch.stop(startTime + crunchDuration + 0.01)

  // ── Grit tail (settling dust) ──────────────────────────────────
  const tailStart = startTime + 0.02
  const tailDuration = 0.08
  const tail = createNoiseSource(ctx, tailDuration, 'pink')
  const tailFilter = ctx.createBiquadFilter()
  tailFilter.type = 'lowpass'
  tailFilter.frequency.value = 1200 * pitchScale
  tailFilter.Q.value = 0.5
  const tailGain = ctx.createGain()
  applyTailEnvelope(tailGain.gain, tailStart, tailDuration, 0.1 * intensity)
  tail.connect(tailFilter)
  tailFilter.connect(tailGain)
  tailGain.connect(output)
  tail.start(tailStart)
  tail.stop(tailStart + tailDuration + 0.02)

  return tailStart - startTime + tailDuration
}

/**
 * Kick-style envelope: ~1 ms attack (effectively instant) and exponential
 * release. The fast attack is what makes the layer read as an *impact*
 * rather than a fade-in noise burst — critical for footsteps to sound real.
 */
function applyKickEnvelope(
  gain: AudioParam,
  startTime: number,
  duration: number,
  peak: number,
): void {
  const safePeak = Math.max(0.0001, peak)
  gain.setValueAtTime(0.0001, startTime)
  gain.linearRampToValueAtTime(safePeak, startTime + 0.001)
  gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
}

/**
 * Soft tail envelope: gentler attack, longer exp release. Used for the
 * lingering grit of the asteroid surface.
 */
function applyTailEnvelope(
  gain: AudioParam,
  startTime: number,
  duration: number,
  peak: number,
): void {
  const safePeak = Math.max(0.0001, peak)
  gain.setValueAtTime(0.0001, startTime)
  gain.linearRampToValueAtTime(safePeak, startTime + 0.012)
  gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
}

/**
 * Creates an `AudioBufferSourceNode` filled with a random noise buffer of
 * the requested color. Buffer is one-shot (not looping) and sized exactly
 * to the requested duration.
 */
function createNoiseSource(
  ctx: AudioContext,
  duration: number,
  color: 'white' | 'pink' | 'brown',
): AudioBufferSourceNode {
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration))
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)

  if (color === 'brown') {
    let last = 0
    for (let i = 0; i < bufferSize; i += 1) {
      const white = Math.random() * 2 - 1
      const sample = ((last + 0.02 * white) / 1.02) * 1.5
      data[i] = sample
      last = sample
    }
  } else if (color === 'pink') {
    // Paul Kellet pink noise approximation.
    let b0 = 0
    let b1 = 0
    let b2 = 0
    let b3 = 0
    let b4 = 0
    let b5 = 0
    let b6 = 0
    for (let i = 0; i < bufferSize; i += 1) {
      const white = Math.random() * 2 - 1
      b0 = 0.99886 * b0 + white * 0.0555179
      b1 = 0.99332 * b1 + white * 0.0750759
      b2 = 0.969 * b2 + white * 0.153852
      b3 = 0.8665 * b3 + white * 0.3104856
      b4 = 0.55 * b4 + white * 0.5329522
      b5 = -0.7616 * b5 - white * 0.016898
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11
      b6 = white * 0.115926
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

/** Disconnects a node, swallowing the typical race-condition errors. */
function safeDisconnect(node: AudioNode | null): void {
  if (!node) return
  try {
    node.disconnect()
  } catch {
    /* ignore disconnect races */
  }
}

/** Clamp helper. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Clamp helper restricted to [0, 1]. */
function clamp01(value: number): number {
  return clamp(value, 0, 1)
}
