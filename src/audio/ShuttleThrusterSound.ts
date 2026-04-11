import { Howler } from 'howler'

export interface ShuttleThrusterAudioFrame {
  rcsLeft: number
  rcsRight: number
  angularSpeed: number
  sfxVolume: number
}

/**
 * Stateful procedural shuttle RCS sound.
 * Main thrust and braking stay sample-based; this voice only shades left/right yaw jets.
 */
export class ShuttleThrusterSound {
  private outputGain: GainNode | null = null
  private rcsNoiseGain: GainNode | null = null
  private airNoiseGain: GainNode | null = null
  private toneOsc: OscillatorNode | null = null
  private toneGain: GainNode | null = null
  private stereoPanner: StereoPannerNode | null = null
  private rcsNoiseSource: AudioBufferSourceNode | null = null
  private airNoiseSource: AudioBufferSourceNode | null = null

  private rcsLevel = 0
  private toneLevel = 0
  private pan = 0
  private alive = false

  update(frame: ShuttleThrusterAudioFrame, dt: number): void {
    const totalActivity = Math.max(frame.rcsLeft, frame.rcsRight)
    if (totalActivity <= 0.0001 && !this.alive) return
    if (!this.ensureGraph()) return

    const outputGain = this.outputGain!
    const rcsNoiseGain = this.rcsNoiseGain!
    const airNoiseGain = this.airNoiseGain!
    const toneOsc = this.toneOsc!
    const toneGain = this.toneGain!
    const stereoPanner = this.stereoPanner
    const ctx = outputGain.context
    const now = ctx.currentTime

    const angularNorm = clamp01(Math.abs(frame.angularSpeed) / 1.5)
    const rcsTotal = clamp01(Math.max(frame.rcsLeft, frame.rcsRight))
    const rcsBias = clamp(frame.rcsRight - frame.rcsLeft, -1, 1)

    const rcsTarget = clamp01(rcsTotal * (0.6 + angularNorm * 0.35))
    const airTarget = clamp01(rcsTotal * (0.2 + angularNorm * 0.18))
    const toneTarget = clamp01(rcsTarget * 0.55)
    const panTarget = rcsBias * 0.7

    const response = Math.max(0, dt) * 12
    this.rcsLevel = damp(this.rcsLevel, rcsTarget, response * 1.35)
    const airLevel = damp(this.airNoiseGain?.gain.value ?? 0, airTarget, response)
    this.toneLevel = damp(this.toneLevel, toneTarget, response * 0.9)
    this.pan = damp(this.pan, panTarget, response * 1.2)

    automateParam(outputGain.gain, frame.sfxVolume, now, 0.04, 0.0001, 1)
    automateParam(rcsNoiseGain.gain, 0.03 + this.rcsLevel * (0.13 + angularNorm * 0.07), now, 0.03, 0.0001, 1)
    automateParam(airNoiseGain.gain, 0.0001 + airLevel * 0.08, now, 0.035, 0.0001, 1)

    automateParam(toneOsc.frequency, 420 + rcsTarget * 240 + angularNorm * 180, now, 0.045, 120, 1600)
    automateParam(toneGain.gain, 0.0001 + this.toneLevel * 0.035, now, 0.04, 0.0001, 1)

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
    this.rcsLevel = 0
    this.toneLevel = 0
    this.pan = 0
    this.alive = false
  }

  dispose(): void {
    this.stop()
    this.disconnectNode(this.rcsNoiseSource)
    this.disconnectNode(this.airNoiseSource)
    this.disconnectNode(this.toneOsc)
    this.disconnectNode(this.rcsNoiseGain)
    this.disconnectNode(this.airNoiseGain)
    this.disconnectNode(this.toneGain)
    this.disconnectNode(this.stereoPanner)
    this.disconnectNode(this.outputGain)

    this.rcsNoiseSource = null
    this.airNoiseSource = null
    this.toneOsc = null
    this.rcsNoiseGain = null
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

    const rcsNoiseSource = createLoopingNoiseSource(ctx, 'pink')
    const rcsNoiseGain = ctx.createGain()
    rcsNoiseGain.gain.value = 0.0001
    rcsNoiseSource.connect(rcsNoiseGain)
    rcsNoiseGain.connect(outputGain)
    rcsNoiseSource.start()

    const airNoiseSource = createLoopingNoiseSource(ctx, 'white')
    const airNoiseGain = ctx.createGain()
    airNoiseGain.gain.value = 0.0001
    airNoiseSource.connect(airNoiseGain)
    airNoiseGain.connect(outputGain)
    airNoiseSource.start()

    const toneOsc = ctx.createOscillator()
    toneOsc.type = 'sawtooth'
    const toneGain = ctx.createGain()
    toneGain.gain.value = 0.0001
    toneOsc.connect(toneGain)
    toneGain.connect(outputGain)
    toneOsc.start()

    this.outputGain = outputGain
    this.stereoPanner = stereoPanner
    this.rcsNoiseSource = rcsNoiseSource
    this.rcsNoiseGain = rcsNoiseGain
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
      const sample = ((last + 0.02 * white) / 1.02) * 2.4
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
