import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'

const STREAK_COUNT = 48
const FAR_AWAY = 99999
const LOCAL_FORWARD = new THREE.Vector3(-1, 0, 0)

/** One motion streak in the gravity-surf line ribbon. */
interface SurfStreak {
  head: THREE.Vector3
  velocity: THREE.Vector3
  length: number
}

/** GPU line ribbon that streaks along the shuttle path while gravity surfing. */
export class GravitySurfEffectController implements Tickable {
  readonly lines: THREE.LineSegments

  private readonly streaks: SurfStreak[]
  private readonly positions: Float32Array
  private active = false
  private intensity = 0

  constructor() {
    this.streaks = Array.from({ length: STREAK_COUNT }, () => ({
      head: new THREE.Vector3(FAR_AWAY, FAR_AWAY, FAR_AWAY),
      velocity: new THREE.Vector3(),
      length: 0,
    }))

    this.positions = new Float32Array(STREAK_COUNT * 2 * 3)
    for (let i = 0; i < this.positions.length; i++) {
      this.positions[i] = FAR_AWAY
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))

    const indices = new Uint16Array(STREAK_COUNT * 2)
    for (let i = 0; i < STREAK_COUNT; i++) {
      indices[i * 2] = i * 2
      indices[i * 2 + 1] = i * 2 + 1
    }
    geometry.setIndex(new THREE.BufferAttribute(indices, 1))

    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color(0x7fe8ff),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.9,
    })

    this.lines = new THREE.LineSegments(geometry, material)
    this.lines.frustumCulled = false
    this.lines.visible = false
  }

  setActive(active: boolean, intensity: number): void {
    this.active = active
    this.intensity = THREE.MathUtils.clamp(intensity, 0, 1)
    this.lines.visible = active && this.intensity > 0.001
    if (!this.lines.visible) {
      this.clearPositions()
    } else {
      for (let i = 0; i < this.streaks.length; i++) {
        if (this.streaks[i]!.head.x === FAR_AWAY) {
          this.resetStreak(i, true)
        }
      }
      this.writePositions()
    }
  }

  tick(dt: number): void {
    if (!this.active || this.intensity <= 0.001) {
      this.lines.visible = false
      this.clearPositions()
      return
    }

    this.lines.visible = true
    for (let i = 0; i < this.streaks.length; i++) {
      const streak = this.streaks[i]!
      streak.head.addScaledVector(streak.velocity, dt)
      if (streak.head.x > 7 || Math.abs(streak.head.y) > 3.2 || Math.abs(streak.head.z) > 7.5) {
        this.resetStreak(i, false)
      }
    }
    this.writePositions()
  }

  dispose(): void {
    this.lines.geometry.dispose()
    ;(this.lines.material as THREE.LineBasicMaterial).dispose()
  }

  private resetStreak(index: number, scatter: boolean): void {
    const streak = this.streaks[index]!
    const intensitySpeed = THREE.MathUtils.lerp(20, 54, this.intensity)
    const spawnX = scatter
      ? THREE.MathUtils.randFloat(-7, 5)
      : THREE.MathUtils.randFloat(-9.5, -6.5)
    const spawnY = THREE.MathUtils.randFloatSpread(2.4)
    const spawnZ = THREE.MathUtils.randFloatSpread(7.2)
    streak.head.set(spawnX, spawnY, spawnZ)

    const lateral = THREE.MathUtils.randFloatSpread(1.8)
    const vertical = THREE.MathUtils.randFloatSpread(0.7)
    streak.velocity
      .copy(LOCAL_FORWARD)
      .multiplyScalar(-intensitySpeed)
      .add(new THREE.Vector3(0, vertical, lateral))
    streak.length = THREE.MathUtils.lerp(1.8, 4.8, this.intensity) + Math.random() * 1.6
  }

  private writePositions(): void {
    const posAttr = this.lines.geometry.getAttribute('position') as THREE.BufferAttribute
    const positions = posAttr.array as Float32Array
    for (let i = 0; i < this.streaks.length; i++) {
      const streak = this.streaks[i]!
      const base = i * 6
      const tail = streak.head
        .clone()
        .addScaledVector(streak.velocity, -streak.length / streak.velocity.length())
      positions[base] = streak.head.x
      positions[base + 1] = streak.head.y
      positions[base + 2] = streak.head.z
      positions[base + 3] = tail.x
      positions[base + 4] = tail.y
      positions[base + 5] = tail.z
    }
    posAttr.needsUpdate = true
  }

  private clearPositions(): void {
    const posAttr = this.lines.geometry.getAttribute('position') as THREE.BufferAttribute
    const positions = posAttr.array as Float32Array
    for (let i = 0; i < positions.length; i++) {
      positions[i] = FAR_AWAY
    }
    posAttr.needsUpdate = true
  }
}
