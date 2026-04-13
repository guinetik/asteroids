import { Howler } from 'howler'

export interface InertialDampenerAudioFrame {
  currentVelocity: number
  initialVelocity: number
  dampenerActive: boolean
  sfxVolume: number
}

/**
 * Stateful inertial dampener sound that sweeps down as velocity drains away.
 */
export class InertialDampenerSound {
  private outputGain: GainNode | null = null
  private energyOsc: OscillatorNode | null = null
  private energyGain: GainNode | null = null
  private bodyOsc: OscillatorNode | null = null
  private bodyFilter: BiquadFilterNode | null = null
  private bodyGain: GainNode | null = null
  private gritSource: AudioBufferSourceNode | null = null
  private gritPreGain: GainNode | null = null
  private gritShaper: WaveShaperNode | null = null
  private gritGain: GainNode | null = null

  private lastVelocity = 0
  private settling = false
  private settleUntil = 0
  private active = false
  private pulsePhase = 0

  update(frame: InertialDampenerAudioFrame, dt: number): void {
    if (!frame.dampenerActive && !this.active && !this.settling) return
    if (!this.ensureGraph()) return

    const outputGain = this.outputGain!
    const energyOsc = this.energyOsc!
    const energyGain = this.energyGain!
    const bodyOsc = this.bodyOsc!
    const bodyFilter = this.bodyFilter!
    const bodyGain = this.bodyGain!
    const gritPreGain = this.gritPreGain!
    const gritGain = this.gritGain!
    const now = outputGain.context.currentTime

    const initialVelocity = Math.max(frame.initialVelocity, 0.001)
    const currentVelocity = Math.max(frame.currentVelocity, 0)
    const ratio = clamp01(currentVelocity / initialVelocity)
    const decelRate = dt > 0 ? Math.max(0, (this.lastVelocity - currentVelocity) / dt) : 0
    const decelNorm = clamp01(decelRate / Math.max(initialVelocity * 2.5, 1))
    const pulseRate = lerp(5.5, 9.5, decelNorm * 0.8 + ratio * 0.2)
    this.pulsePhase += Math.max(0, dt) * pulseRate * Math.PI * 2
    const pulse = Math.max(0, Math.sin(this.pulsePhase))
    const gate = 0.34 + pulse * 0.66

    if (frame.dampenerActive) {
      if (!this.active) {
        this.settling = false
        this.settleUntil = 0
        this.pulsePhase = 0
      }
      this.active = true

      automateParam(outputGain.gain, frame.sfxVolume, now, 0.04, 0.0001, 1)
      automateParam(energyOsc.frequency, lerp(34, 420, ratio), now, 0.035, 34, 420)
      automateParam(energyGain.gain, 0.0001 + (0.018 + ratio * 0.042) * gate, now, 0.02, 0.0001, 1)

      automateParam(bodyOsc.frequency, 54, now, 0.04, 40, 120)
      automateParam(bodyFilter.frequency, lerp(78, 280, ratio), now, 0.04, 60, 1000)
      automateParam(bodyGain.gain, 0.0001 + (0.04 + ratio * 0.065) * (0.5 + pulse * 0.5), now, 0.025, 0.0001, 1)

      automateParam(gritPreGain.gain, 0.04 + decelNorm * 0.16, now, 0.02, 0.0001, 1)
      automateParam(gritGain.gain, 0.0001 + decelNorm * 0.035 * gate, now, 0.02, 0.0001, 1)

      if (currentVelocity <= 0.35 || ratio <= 0.03) {
        this.active = false
        this.settling = true
        this.settleUntil = now + 0.18
      }
    } else if (this.settling) {
      const remaining = Math.max(0, this.settleUntil - now)
      const pulse = clamp01(remaining / 0.18)
      automateParam(outputGain.gain, frame.sfxVolume, now, 0.03, 0.0001, 1)
      automateParam(energyOsc.frequency, 38, now, 0.03, 34, 420)
      automateParam(energyGain.gain, 0.0001 + pulse * 0.028, now, 0.025, 0.0001, 1)
      automateParam(bodyFilter.frequency, 82, now, 0.03, 60, 1000)
      automateParam(bodyGain.gain, 0.0001 + pulse * 0.05, now, 0.025, 0.0001, 1)
      automateParam(gritPreGain.gain, 0.0001, now, 0.04, 0.0001, 1)
      automateParam(gritGain.gain, 0.0001, now, 0.04, 0.0001, 1)

      if (remaining <= 0.0001) {
        this.settling = false
        this.fadeOut(now, 0.2)
      }
    } else {
      this.active = false
      this.fadeOut(now, 0.1)
    }

    this.lastVelocity = currentVelocity
  }

  stop(): void {
    if (!this.outputGain) return
    this.active = false
    this.settling = false
    this.settleUntil = 0
    this.fadeOut(this.outputGain.context.currentTime, 0.1)
  }

  dispose(): void {
    this.stop()
    this.disconnectNode(this.energyOsc)
    this.disconnectNode(this.bodyOsc)
    this.disconnectNode(this.gritSource)
    this.disconnectNode(this.energyGain)
    this.disconnectNode(this.bodyFilter)
    this.disconnectNode(this.bodyGain)
    this.disconnectNode(this.gritPreGain)
    this.disconnectNode(this.gritShaper)
    this.disconnectNode(this.gritGain)
    this.disconnectNode(this.outputGain)

    this.energyOsc = null
    this.bodyOsc = null
    this.gritSource = null
    this.energyGain = null
    this.bodyFilter = null
    this.bodyGain = null
    this.gritPreGain = null
    this.gritShaper = null
    this.gritGain = null
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
    outputGain.connect(masterGain)

    const energyOsc = ctx.createOscillator()
    energyOsc.type = 'sine'
    const energyGain = ctx.createGain()
    energyGain.gain.value = 0.0001
    energyOsc.connect(energyGain)
    energyGain.connect(outputGain)
    energyOsc.start()

    const bodyOsc = ctx.createOscillator()
    bodyOsc.type = 'triangle'
    const bodyFilter = ctx.createBiquadFilter()
    bodyFilter.type = 'lowpass'
    bodyFilter.frequency.value = 160
    bodyFilter.Q.value = 1.2
    const bodyGain = ctx.createGain()
    bodyGain.gain.value = 0.0001
    bodyOsc.connect(bodyFilter)
    bodyFilter.connect(bodyGain)
    bodyGain.connect(outputGain)
    bodyOsc.start()

    const gritSource = createLoopingNoiseSource(ctx)
    const gritPreGain = ctx.createGain()
    gritPreGain.gain.value = 0.0001
    const gritShaper = ctx.createWaveShaper()
    gritShaper.curve = makeBitcrushCurve() as Float32Array<ArrayBuffer>
    gritShaper.oversample = 'none'
    const gritGain = ctx.createGain()
    gritGain.gain.value = 0.0001
    gritSource.connect(gritPreGain)
    gritPreGain.connect(gritShaper)
    gritShaper.connect(gritGain)
    gritGain.connect(outputGain)
    gritSource.start()

    this.outputGain = outputGain
    this.energyOsc = energyOsc
    this.energyGain = energyGain
    this.bodyOsc = bodyOsc
    this.bodyFilter = bodyFilter
    this.bodyGain = bodyGain
    this.gritSource = gritSource
    this.gritPreGain = gritPreGain
    this.gritShaper = gritShaper
    this.gritGain = gritGain
    return true
  }

  private fadeOut(now: number, seconds: number): void {
    automateParam(this.energyGain?.gain ?? null, 0.0001, now, seconds, 0.0001, 1)
    automateParam(this.bodyGain?.gain ?? null, 0.0001, now, seconds, 0.0001, 1)
    automateParam(this.gritPreGain?.gain ?? null, 0.0001, now, seconds, 0.0001, 1)
    automateParam(this.gritGain?.gain ?? null, 0.0001, now, seconds, 0.0001, 1)
    automateParam(this.outputGain?.gain ?? null, 0.0001, now, seconds, 0.0001, 1)
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

function createLoopingNoiseSource(ctx: AudioContext): AudioBufferSourceNode {
  const duration = 2
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration))
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

function makeBitcrushCurve(): Float32Array {
  const samples = 256
  const curve = new Float32Array(samples)
  for (let i = 0; i < samples; i += 1) {
    const x = (i / (samples - 1)) * 2 - 1
    curve[i] = Math.round(x * 12) / 12
  }
  return curve
}

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

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * clamp01(t)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function clamp01(value: number): number {
  return clamp(value, 0, 1)
}
