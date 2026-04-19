import * as THREE from 'three'

/** Visual tuning for the warning mast + lens + lights. */
export interface WarningBeaconOptions {
  housingColor?: number
  lensColor?: number
  lightColor?: number
  lightIntensity?: number
  lightDistance?: number
  lightDecay?: number
  glowIntensity?: number
  glowDistance?: number
  glowDecay?: number
  baseRadius?: number
  baseHeight?: number
  mastRadius?: number
  mastHeight?: number
  lensRadius?: number
}

const DEFAULT_OPTIONS: Required<WarningBeaconOptions> = {
  housingColor: 0x5d626a,
  lensColor: 0xff8a1f,
  lightColor: 0xff8a1f,
  lightIntensity: 14,
  lightDistance: 90,
  lightDecay: 1.5,
  glowIntensity: 5,
  glowDistance: 180,
  glowDecay: 1.2,
  baseRadius: 3.4,
  baseHeight: 1.4,
  mastRadius: 0.55,
  mastHeight: 2.6,
  lensRadius: 1.35,
}

/**
 * Reusable mounted warning beacon prop with a small housing and centered light.
 */
export class WarningBeacon {
  readonly group = new THREE.Group()
  readonly light: THREE.PointLight
  readonly glowLight: THREE.PointLight
  readonly meshes: THREE.Mesh[]
  private currentColor: THREE.Color

  private readonly baseGeometry: THREE.CylinderGeometry
  private readonly mastGeometry: THREE.CylinderGeometry
  private readonly lensGeometry: THREE.SphereGeometry
  private readonly housingMaterial: THREE.MeshStandardMaterial
  private readonly lensMaterial: THREE.MeshStandardMaterial

  constructor(options: WarningBeaconOptions = {}) {
    const config = { ...DEFAULT_OPTIONS, ...options }
    this.currentColor = new THREE.Color(config.lightColor)

    this.baseGeometry = new THREE.CylinderGeometry(
      config.baseRadius,
      config.baseRadius,
      config.baseHeight,
      20,
    )
    this.mastGeometry = new THREE.CylinderGeometry(
      config.mastRadius,
      config.mastRadius,
      config.mastHeight,
      16,
    )
    this.lensGeometry = new THREE.SphereGeometry(config.lensRadius, 18, 12)

    this.housingMaterial = new THREE.MeshStandardMaterial({
      color: config.housingColor,
      metalness: 0.75,
      roughness: 0.35,
    })
    this.lensMaterial = new THREE.MeshStandardMaterial({
      color: config.lensColor,
      emissive: config.lensColor,
      emissiveIntensity: 2.1,
      transparent: true,
      opacity: 0.9,
      metalness: 0.05,
      roughness: 0.2,
    })

    const base = new THREE.Mesh(this.baseGeometry, this.housingMaterial)
    const mast = new THREE.Mesh(this.mastGeometry, this.housingMaterial)
    const lens = new THREE.Mesh(this.lensGeometry, this.lensMaterial)

    base.castShadow = true
    base.receiveShadow = true
    mast.castShadow = true
    mast.receiveShadow = true
    lens.castShadow = false
    lens.receiveShadow = false

    base.position.y = config.baseHeight * 0.5
    mast.position.y = config.baseHeight + config.mastHeight * 0.5
    lens.position.y = config.baseHeight + config.mastHeight + config.lensRadius * 0.8

    this.light = new THREE.PointLight(
      config.lightColor,
      config.lightIntensity,
      config.lightDistance,
      config.lightDecay,
    )
    this.light.castShadow = false
    this.light.position.copy(lens.position)

    this.glowLight = new THREE.PointLight(
      config.lightColor,
      config.glowIntensity,
      config.glowDistance,
      config.glowDecay,
    )
    this.glowLight.castShadow = false
    this.glowLight.position.copy(lens.position)

    this.group.add(base)
    this.group.add(mast)
    this.group.add(lens)
    this.group.add(this.light)
    this.group.add(this.glowLight)

    this.meshes = [base, mast, lens]
    this.setColor(config.lightColor)
  }

  setColor(color: THREE.ColorRepresentation): void {
    this.currentColor.set(color)
    this.lensMaterial.color.copy(this.currentColor)
    this.lensMaterial.emissive.copy(this.currentColor)
    this.light.color.copy(this.currentColor)
    this.glowLight.color.copy(this.currentColor)
  }

  getColor(target = new THREE.Color()): THREE.Color {
    return target.copy(this.currentColor)
  }

  dispose(): void {
    this.light.dispose()
    this.glowLight.dispose()
    this.baseGeometry.dispose()
    this.mastGeometry.dispose()
    this.lensGeometry.dispose()
    this.housingMaterial.dispose()
    this.lensMaterial.dispose()
  }
}
