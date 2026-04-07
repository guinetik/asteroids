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
 */
export interface AudioEffectConfig {
  id: AudioEffectPreset
  lowpassHz?: number
  highpassHz?: number
  /** WaveShaper curve intensity (0 = effectively linear). */
  distortion?: number
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
    lowpassHz: 3400,
    highpassHz: 280,
    distortion: 0.08,
  },
  'helmet-comms': {
    id: 'helmet-comms',
    lowpassHz: 4200,
    highpassHz: 180,
    distortion: 0.04,
  },
  'terminal-beep': {
    id: 'terminal-beep',
    lowpassHz: 12000,
    highpassHz: 600,
    distortion: 0.02,
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

/**
 * Builds a high-pass → low-pass → WaveShaper chain for the given preset, or `null` for `none`.
 *
 * @param ctx - Shared {@link AudioContext} (Howler's context).
 * @param effectId - Preset to instantiate.
 */
export function createEffectChain(
  ctx: AudioContext,
  effectId: AudioEffectPreset,
): AudioEffectChain | null {
  if (effectId === 'none') return null
  const config = getAudioEffectConfig(effectId)
  if (config.id === 'none') return null

  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = config.highpassHz ?? 200

  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = config.lowpassHz ?? 8000

  const ws = ctx.createWaveShaper()
  ws.curve = makeDistortionCurve(config.distortion ?? 0) as Float32Array<ArrayBuffer>
  ws.oversample = '4x'

  hp.connect(lp)
  lp.connect(ws)

  return {
    input: hp,
    output: ws,
    dispose: () => {
      try {
        hp.disconnect()
        lp.disconnect()
        ws.disconnect()
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
