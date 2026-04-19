import { Howler } from 'howler'

export interface EvaRcsAudioFrame {
  forward: number
  back: number
  left: number
  right: number
  up: number
  down: number
  sfxVolume: number
}

/**
 * Reduced first-person procedural RCS bed for EVA maneuvering.
 * Tuned softer and airier than the shuttle/lander so it reads like nearby suit jets.
 */
export class EvaRcsSound {
  private outputGain: GainNode | null = null
  private bodyNoiseGain: GainNode | null = null
  private airNoiseGain: GainNode | null = null
  private toneOsc: OscillatorNode | null = null
  private toneGain: GainNode | null = null
  private stereoPanner: StereoPannerNode | null = null
  private bodyNoiseSource: AudioBufferSourceNode | null = null
  private airNoiseSource: AudioBufferSourceNode | null = null

  private bodyLevel = 0
  private airLevel = 0
  private toneLevel = 0
  private pan = 0
  private alive = false

  update(frame: EvaRcsAudioFrame, dt: number): void {
    const lateral = clamp01(Math.max(frame.left, frame.right))
    const longitudinal = clamp01(Math.max(frame.forward, frame.back))
    const vertical = clamp01(Math.max(frame.up, frame.down))
    const totalActivity = clamp01(Math.max(lateral, longitudinal, vertical))
    if (totalActivity <= 0.0001 && !this.alive) return
    if (!this.ensureGraph()) return

    const outputGain = this.outputGain!
    const bodyNoiseGain = this.bodyNoiseGain!
    const airNoiseGain = this.airNoiseGain!
    const toneOsc = this.toneOsc!
    const toneGain = this.toneGain!
    const stereoPanner = this.stereoPanner
    const now = outputGain.context.currentTime

    const leftRightBias = clamp(frame.right - frame.left, -1, 1)
    const foreAftBias = clamp(frame.back - frame.forward, -1, 1)
    const bodyTarget = clamp01(lateral * 0.42 + longitudinal * 0.35 + vertical * 0.5)
    const airTarget = clamp01(lateral * 0.12 + longitudinal * 0.1 + vertical * 0.18)
    const toneTarget = clamp01(vertical * 0.22 + longitudinal * 0.14 + lateral * 0.1)
    const panTarget = clamp(leftRightBias * 0.55 + foreAftBias * 0.12, -1, 1)
    const frequencyTarget = 240 + vertical * 120 + longitudinal * 80 + lateral * 65

    const response = Math.max(0, dt) * 12
    this.bodyLevel = damp(this.bodyLevel, bodyTarget, response * 1.25)
    this.airLevel = damp(this.airLevel, airTarget, response)
    this.toneLevel = damp(this.toneLevel, toneTarget, response * 0.9)
    this.pan = damp(this.pan, panTarget, response * 1.1)

    automateParam(outputGain.gain, frame.sfxVolume, now, 0.04, 0.0001, 1)
    automateParam(bodyNoiseGain.gain, 0.0001 + this.bodyLevel * 0.085, now, 0.03, 0.0001, 1)
    automateParam(airNoiseGain.gain, 0.0001 + this.airLevel * 0.022, now, 0.04, 0.0001, 1)
    automateParam(toneOsc.frequency, frequencyTarget, now, 0.05, 120, 900)
    automateParam(toneGain.gain, 0.0001 + this.toneLevel * 0.012, now, 0.045, 0.0001, 1)

    if (stereoPanner) {
      automateParam(stereoPanner.pan, this.pan, now, 0.03, -1, 1)
    }

    this.alive = totalActivity > 0.0001
    if (!this.alive) {
      this.stop()
    }
  }

  stop(): void {
    const ctx = this.outputGain?.context
    if (ctx && this.outputGain) {
      automateParam(this.outputGain.gain, 0.0001, ctx.currentTime, 0.06, 0.0001, 1)
    }
    this.bodyLevel = 0
    this.airLevel = 0
    this.toneLevel = 0
    this.pan = 0
    this.alive = false
  }

  dispose(): void {
    this.stop()
    this.disconnectNode(this.bodyNoiseSource)
    this.disconnectNode(this.airNoiseSource)
    this.disconnectNode(this.toneOsc)
    this.disconnectNode(this.bodyNoiseGain)
    this.disconnectNode(this.airNoiseGain)
    this.disconnectNode(this.toneGain)
    this.disconnectNode(this.stereoPanner)
    this.disconnectNode(this.outputGain)

    this.bodyNoiseSource = null
    this.airNoiseSource = null
    this.toneOsc = null
    this.bodyNoiseGain = null
    this.airNoiseGain = null
    this.toneGain = null
    this.stereoPanner = null
    this.outputGain = null
  }

  private ensureGraph(): boolean {
    if (this.outputGain) return true
    if (Howler.noAudio) return false

    const ctx = Howler.ctx
    const masterGain = (Howler as unknown as { masterGain?: AudioNode }).masterGain
    if (!ctx || !masterGain) return false

    const outputGain = ctx.createGain()
    outputGain.gain.value = 0.0001

    const stereoPanner =
      typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null
    if (stereoPanner) {
      outputGain.connect(stereoPanner)
      stereoPanner.connect(masterGain)
    } else {
      outputGain.connect(masterGain)
    }

    const bodyNoiseSource = createLoopingNoiseSource(ctx, 'pink')
    const bodyNoiseGain = ctx.createGain()
    bodyNoiseGain.gain.value = 0.0001
    bodyNoiseSource.connect(bodyNoiseGain)
    bodyNoiseGain.connect(outputGain)
    bodyNoiseSource.start()

    const airNoiseSource = createLoopingNoiseSource(ctx, 'white')
    const airNoiseGain = ctx.createGain()
    airNoiseGain.gain.value = 0.0001
    airNoiseSource.connect(airNoiseGain)
    airNoiseGain.connect(outputGain)
    airNoiseSource.start()

    const toneOsc = ctx.createOscillator()
    toneOsc.type = 'triangle'
    const toneGain = ctx.createGain()
    toneGain.gain.value = 0.0001
    toneOsc.connect(toneGain)
    toneGain.connect(outputGain)
    toneOsc.start()

    this.outputGain = outputGain
    this.stereoPanner = stereoPanner
    this.bodyNoiseSource = bodyNoiseSource
    this.bodyNoiseGain = bodyNoiseGain
    this.airNoiseSource = airNoiseSource
    this.airNoiseGain = airNoiseGain
    this.toneOsc = toneOsc
    this.toneGain = toneGain
    return true
  }

  private disconnectNode(node: AudioNode | null): void {
    if (!node) return
    try {
      node.disconnect()
    } catch {
      /* ignore disconnect races */
    }
  }
}

function createLoopingNoiseSource(
  ctx: AudioContext,
  color: 'white' | 'pink' | 'brown',
): AudioBufferSourceNode {
  const duration = 2
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
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.08
      b6 = white * 0.115926
    }
  } else {
    for (let i = 0; i < bufferSize; i += 1) {
      data[i] = Math.random() * 2 - 1
    }
  }

  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.loop = true
  return source
}

function damp(current: number, target: number, amount: number): number {
  const t = clamp01(amount)
  return current + (target - current) * t
}

function automateParam(
  param: AudioParam,
  value: number,
  now: number,
  rampSeconds: number,
  min: number,
  max: number,
): void {
  const safeValue = clamp(Number.isFinite(value) ? value : min, min, max)
  const safeRamp = Math.max(0.01, Number.isFinite(rampSeconds) ? rampSeconds : 0.03)
  param.cancelScheduledValues(now)
  param.setValueAtTime(param.value, now)
  param.linearRampToValueAtTime(safeValue, now + safeRamp)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function clamp01(value: number): number {
  return clamp(value, 0, 1)
}
