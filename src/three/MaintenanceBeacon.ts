import * as THREE from 'three'

export type MaintenanceBeaconState = 'needs-maintenance' | 'repaired'

export interface MaintenanceBeaconOptions {
  offset: THREE.Vector3
  radius?: number
  needsColor?: number
  repairedColor?: number
  baseIntensity?: number
  peakIntensity?: number
  distance?: number
  decay?: number
  blinkHz?: number
  emissiveBase?: number
  emissivePeak?: number
  initialState?: MaintenanceBeaconState
}

const DEFAULT_RADIUS = 0.025
const DEFAULT_NEEDS_COLOR = 0xffc64a
const DEFAULT_REPAIRED_COLOR = 0x5cff95
const DEFAULT_BASE_INTENSITY = 0.4
const DEFAULT_PEAK_INTENSITY = 3.2
const DEFAULT_DISTANCE = 6
const DEFAULT_DECAY = 1.6
const DEFAULT_BLINK_HZ = 0.7
const DEFAULT_EMISSIVE_BASE = 0.5
const DEFAULT_EMISSIVE_PEAK = 3.5
const REPAIRED_INTENSITY = 1.15
const REPAIRED_EMISSIVE = 1.6

export class MaintenanceBeacon {
  readonly bulb: THREE.Mesh
  readonly light: THREE.PointLight

  private readonly material: THREE.MeshStandardMaterial
  private readonly needsColor: number
  private readonly repairedColor: number
  private readonly baseIntensity: number
  private readonly peakIntensity: number
  private readonly blinkHz: number
  private readonly emissiveBase: number
  private readonly emissivePeak: number
  private state: MaintenanceBeaconState
  private elapsed = 0

  constructor(parent: THREE.Object3D, options: MaintenanceBeaconOptions) {
    this.needsColor = options.needsColor ?? DEFAULT_NEEDS_COLOR
    this.repairedColor = options.repairedColor ?? DEFAULT_REPAIRED_COLOR
    this.baseIntensity = options.baseIntensity ?? DEFAULT_BASE_INTENSITY
    this.peakIntensity = options.peakIntensity ?? DEFAULT_PEAK_INTENSITY
    this.blinkHz = options.blinkHz ?? DEFAULT_BLINK_HZ
    this.emissiveBase = options.emissiveBase ?? DEFAULT_EMISSIVE_BASE
    this.emissivePeak = options.emissivePeak ?? DEFAULT_EMISSIVE_PEAK
    this.state = options.initialState ?? 'needs-maintenance'

    this.material = new THREE.MeshStandardMaterial({
      color: this.needsColor,
      emissive: this.needsColor,
      emissiveIntensity: this.emissiveBase,
    })
    this.bulb = new THREE.Mesh(
      new THREE.SphereGeometry(options.radius ?? DEFAULT_RADIUS, 12, 8),
      this.material,
    )
    this.bulb.position.copy(options.offset)
    this.light = new THREE.PointLight(
      this.needsColor,
      this.baseIntensity,
      options.distance ?? DEFAULT_DISTANCE,
      options.decay ?? DEFAULT_DECAY,
    )
    this.light.position.copy(options.offset)
    parent.add(this.bulb, this.light)
    this.applyStateVisuals(true)
  }

  setState(state: MaintenanceBeaconState): void {
    if (this.state === state) return
    this.state = state
    this.applyStateVisuals(true)
  }

  tick(dt: number): void {
    this.elapsed += dt
    this.applyStateVisuals(false)
  }

  dispose(): void {
    this.bulb.removeFromParent()
    this.light.removeFromParent()
    this.bulb.geometry.dispose()
    this.material.dispose()
    this.light.dispose()
  }

  private applyStateVisuals(force: boolean): void {
    if (this.state === 'repaired') {
      if (force) {
        this.material.color.setHex(this.repairedColor)
        this.material.emissive.setHex(this.repairedColor)
        this.light.color.setHex(this.repairedColor)
      }
      this.light.intensity = REPAIRED_INTENSITY
      this.material.emissiveIntensity = REPAIRED_EMISSIVE
      return
    }

    if (force) {
      this.material.color.setHex(this.needsColor)
      this.material.emissive.setHex(this.needsColor)
      this.light.color.setHex(this.needsColor)
    }
    const blink = 0.5 + 0.5 * Math.sin(this.elapsed * this.blinkHz * Math.PI * 2)
    const pulse = blink * blink
    this.light.intensity =
      this.baseIntensity + (this.peakIntensity - this.baseIntensity) * pulse
    this.material.emissiveIntensity =
      this.emissiveBase + (this.emissivePeak - this.emissiveBase) * pulse
  }
}
