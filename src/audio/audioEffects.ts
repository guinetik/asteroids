/**
 * DSP effect presets and Web Audio chain builders for the audio system.
 *
 * @author guinetik
 * @date 2026-04-06
 */

import type { AudioEffectPreset } from './audioTypes'

/**
 * Multiplier applied to `ui` and `sfx` mixer levels while any `voice` playback is active (layers on
 * top of user category volume; does not mutate stored state).
 */
export const VOICE_DUCK_UI_SFX_MULTIPLIER = 0.55

/**
 * Fade duration (ms) when voice playback starts and `ui` / `sfx` duck down toward the ducked level.
 */
export const VOICE_DUCK_FADE_ATTACK_MS = 140

/**
 * Fade duration (ms) when the last voice playback ends and `ui` / `sfx` restore toward full mix level.
 */
export const VOICE_DUCK_FADE_RELEASE_MS = 220

/**
 * Serializable parameters for a DSP preset (band limits, distortion amount, etc.).
 *
 * The optional `delaySeconds` / `feedback` / `wetMix` fields enable a parallel
 * delay-feedback bus stitched in alongside the main band-limited path. When
 * `delaySeconds` is omitted or zero the effect runs as a pure linear chain
 * (HP → LP → WaveShaper), preserving the original behaviour.
 */
export interface AudioEffectConfig {
  id: AudioEffectPreset
  lowpassHz?: number
  highpassHz?: number
  /** WaveShaper curve intensity (0 = effectively linear). */
  distortion?: number
  /**
   * Delay-line length in seconds. When > 0 a parallel feedback-delay bus is
   * mixed in after the band-limit stage to produce slap-back / short-room
   * echo character (e.g. inside-the-helmet ringing).
   */
  delaySeconds?: number
  /**
   * Per-tap feedback gain for the delay loop (`0`–`<1`). Higher values give
   * longer-lived echoes; clamp below `0.95` to stay stable.
   */
  feedback?: number
  /**
   * Wet-bus level mixed back into the dry output (`0`–`1`). The dry signal
   * is always summed at unity gain alongside the wet tap.
   */
  wetMix?: number
}

/**
 * Web Audio nodes inserted between a Howl per-sound gain and Howler's `masterGain`.
 */
export interface AudioEffectChain {
  /** First node in the chain (connect the Howl gain here). */
  input: AudioNode
  /** Last node before the master bus. */
  output: AudioNode
  /** Disconnects internal nodes; callers must restore Howl routing separately if needed. */
  dispose(): void
}

const PRESETS: Record<AudioEffectPreset, AudioEffectConfig> = {
  none: { id: 'none' },
  radio: {
    id: 'radio',
    lowpassHz: 2600,
    highpassHz: 420,
    distortion: 0.18,
  },
  'helmet-comms': {
    id: 'helmet-comms',
    lowpassHz: 4200,
    highpassHz: 180,
    distortion: 0.04,
  },
  /**
   * "Inside the helmet" — band-limited like {@link helmet-comms} but with a
   * short slap-back delay + feedback to suggest a tiny enclosed cavity. Used
   * for low-priority diagnostic cues (e.g. suit damage alarm) so they read
   * as the suit's own audio rather than the world's.
   *
   * Tuning: ~80 ms initial tap with 35 % feedback gives a couple of audible
   * repeats before falling under the noise floor; wet mix sits around half
   * the dry so the sound is still clearly identifiable.
   */
  'helmet-echo': {
    id: 'helmet-echo',
    lowpassHz: 3200,
    highpassHz: 220,
    distortion: 0.05,
    delaySeconds: 0.08,
    feedback: 0.35,
    wetMix: 0.45,
  },
  'terminal-beep': {
    id: 'terminal-beep',
    lowpassHz: 12000,
    highpassHz: 600,
    distortion: 0.02,
  },
  'hull-exterior': {
    // Simulates a mechanical sound heard through a spacecraft hull from the inside.
    // The hull absorbs high frequencies strongly; low-mid structure-borne vibration
    // comes through with a slight resonant character.
    id: 'hull-exterior',
    lowpassHz: 900,
    highpassHz: 80,
    distortion: 0.1,
  },
  /** Specialized band-pass+LFO sweep; handled in createEffectChain, not HP/LP ladder. */
  'mining-beam': {
    id: 'mining-beam',
  },
}

/**
 * Returns the DSP configuration for a built-in effect preset id.
 *
 * @param id - Preset key from the audio manifest (`none`, `radio`, …).
 */
export function getAudioEffectConfig(id: AudioEffectPreset): AudioEffectConfig {
  return PRESETS[id]
}

/** LFO speed for "wah" motion on sustained mining beam playback (cycles per second). */
const MINING_BEAM_WAH_RATE_HZ = 1.75
/** Idle center frequency for the swept band-pass (Hz). */
const MINING_BEAM_FILTER_CENTER_HZ = 840
/** LFO modulation depth summed into band-pass cutoff (Hz). */
const MINING_BEAM_WAH_DEPTH_HZ = 480
/** Peaking resonance of the vowel-shaped filter sweep. */
const MINING_BEAM_FILTER_Q = 7.25

/**
 * Wah-style band-pass: sine LFO modulates band-pass cutoff for the drill beam loop bed.
 *
 * @param ctx - Shared Howler/Web Audio context.
 */
function createMiningBeamWahChain(ctx: AudioContext): AudioEffectChain {
  const input = ctx.createGain()
  const output = ctx.createGain()
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = MINING_BEAM_FILTER_Q
  filter.frequency.value = MINING_BEAM_FILTER_CENTER_HZ

  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = MINING_BEAM_WAH_RATE_HZ
  const depth = ctx.createGain()
  depth.gain.value = MINING_BEAM_WAH_DEPTH_HZ
  lfo.connect(depth)
  depth.connect(filter.frequency)

  input.connect(filter)
  filter.connect(output)
  lfo.start()

  return {
    input,
    output,
    dispose: () => {
      try {
        lfo.stop()
      } catch {
        /* already stopped */
      }
      try {
        lfo.disconnect()
        depth.disconnect()
      } catch {
        /* ignore */
      }
      try {
        filter.disconnect()
      } catch {
        /* ignore */
      }
      try {
        input.disconnect()
        output.disconnect()
      } catch {
        /* ignore */
      }
    },
  }
}

/**
 * Builds the DSP chain for the given preset, or `null` for `none`.
 *
 * Topology (except `mining-beam` — band-pass+LFO only):
 *
 * ```
 * input → hp → lp → ws ─┬─────────────────────→ output (dry path)
 *                       └─→ delay → wet ──────→ output (optional, when delaySeconds > 0)
 *                              ↑      ↓
 *                              └─ feedback ─┘
 * ```
 *
 * `input` and `output` are wrapping {@link GainNode}s so callers can connect a single source/sink
 * pair regardless of whether the wet bus is active.
 *
 * @param ctx - Shared {@link AudioContext} (Howler's context).
 * @param effectId - Preset to instantiate.
 */
export function createEffectChain(
  ctx: AudioContext,
  effectId: AudioEffectPreset,
): AudioEffectChain | null {
  if (effectId === 'mining-beam') {
    return createMiningBeamWahChain(ctx)
  }
  if (effectId === 'none') return null
  const config = getAudioEffectConfig(effectId)
  if (config.id === 'none') return null

  const input = ctx.createGain()
  const output = ctx.createGain()

  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = config.highpassHz ?? 200

  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = config.lowpassHz ?? 8000

  const ws = ctx.createWaveShaper()
  ws.curve = makeDistortionCurve(config.distortion ?? 0) as Float32Array<ArrayBuffer>
  ws.oversample = '4x'

  input.connect(hp)
  hp.connect(lp)
  lp.connect(ws)
  ws.connect(output)

  let delay: DelayNode | null = null
  let feedbackGain: GainNode | null = null
  let wetGain: GainNode | null = null

  const delaySeconds = config.delaySeconds ?? 0
  if (delaySeconds > 0) {
    delay = ctx.createDelay(Math.max(2.0, delaySeconds * 4))
    delay.delayTime.value = delaySeconds

    feedbackGain = ctx.createGain()
    // Clamp feedback to keep the loop stable; values >= 1 self-oscillate.
    feedbackGain.gain.value = Math.min(0.95, Math.max(0, config.feedback ?? 0))

    wetGain = ctx.createGain()
    wetGain.gain.value = Math.max(0, config.wetMix ?? 0.4)

    ws.connect(delay)
    delay.connect(feedbackGain)
    feedbackGain.connect(delay)
    delay.connect(wetGain)
    wetGain.connect(output)
  }

  return {
    input,
    output,
    dispose: () => {
      try {
        input.disconnect()
        hp.disconnect()
        lp.disconnect()
        ws.disconnect()
        delay?.disconnect()
        feedbackGain?.disconnect()
        wetGain?.disconnect()
        output.disconnect()
      } catch {
        /* ignore */
      }
    },
  }
}

/**
 * Builds a WaveShaper curve from a small distortion amount (Howler-style soft clipping).
 *
 * @param amount - Distortion intensity; 0 yields an identity-like curve.
 */
function makeDistortionCurve(amount: number): Float32Array {
  if (amount <= 0) {
    const linear = new Float32Array(2)
    linear[0] = -1
    linear[1] = 1
    return linear
  }
  const n = 44100
  const curve = new Float32Array(n)
  const deg = Math.PI / 180
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x))
  }
  return curve
}
