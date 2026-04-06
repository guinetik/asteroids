/**
 * Procedural coronavirus enemy — floating spiky sphere (Spire).
 *
 * Builds geometry procedurally (no GLTF). Translucent membrane shell
 * with 42 Fibonacci-distributed spikes, inner core, and RNA strand.
 * Floats and bobs when idle, spikes extend when agitated.
 * Ported from docs/inspo/coronavirus-spire-demo.html.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-enemy-system-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { Enemy } from '@/lib/fps/enemy'

// ── Visual constants ────────────────────────────────────────────
const SPIRE_SCALE = 2.0
const SPIKE_COUNT = 42
const BASE_RADIUS = 0.6

const HIT_FLASH_DURATION = 0.08
const HIT_RECOIL_DURATION = 0.25
const HIT_RECOIL_INTENSITY = 0.15
const DEATH_ANIM_DURATION = 1.2
const FIRE_FLASH_DURATION = 0.1
const SPIKE_GRAVITY = 0.003

// ── Floaty drift constants ──────────────────────────────────────
/** How fast the spire lerps toward its target position (lower = floatier). */
const DRIFT_SMOOTHING = 1.5
/** Horizontal sway amplitude (world units). */
const DRIFT_SWAY_X = 1.5
const DRIFT_SWAY_Z = 1.2
/** Vertical float amplitude (world units, on top of bob). */
const DRIFT_FLOAT_Y = 0.8
/** Sway frequency multiplier. */
const DRIFT_SWAY_FREQ = 0.5

/**
 * Y offset from group origin to body center (in world units).
 * Body is centered at group origin since the Spire floats.
 */
export const SPIRE_HIT_CENTER_Y = 0

// ── Shared materials (reused across all Spire instances) ────────
const membraneMat = new THREE.MeshPhysicalMaterial({
  color: 0xcc4466,
  transparent: true,
  opacity: 0.35,
  roughness: 0.3,
  metalness: 0.1,
  side: THREE.DoubleSide,
})

const coreMat = new THREE.MeshStandardMaterial({
  color: 0x881111,
  emissive: 0x440000,
  emissiveIntensity: 0.4,
  roughness: 0.6,
  metalness: 0.2,
})

const stalkMat = new THREE.MeshStandardMaterial({
  color: 0xddaa44,
  emissive: 0x553300,
  emissiveIntensity: 0.3,
  metalness: 0.6,
  roughness: 0.4,
})

const bulbMat = new THREE.MeshStandardMaterial({
  color: 0xffcc44,
  emissive: 0xff8800,
  emissiveIntensity: 0.5,
  metalness: 0.3,
  roughness: 0.5,
})

const rnaMat = new THREE.MeshBasicMaterial({ color: 0xff3355 })

const flashMat = new THREE.MeshBasicMaterial({ color: 0xff00ff })

const fireFlashMat = new THREE.MeshBasicMaterial({ color: 0xffffff })

// ── Shared geometries ───────────────────────────────────────────
const membraneGeo = new THREE.SphereGeometry(BASE_RADIUS, 16, 12)
const coreGeo = new THREE.SphereGeometry(BASE_RADIUS * 0.7, 12, 8)
const rnaGeo = new THREE.TorusKnotGeometry(0.2, 0.04, 48, 4, 3, 2)
const stalkGeo = new THREE.CylinderGeometry(0.02, 0.03, 0.4, 4)
const bulbGeo = new THREE.SphereGeometry(0.08, 6, 4)

// ── Fibonacci sphere distribution ──────────────────────────────
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

/**
 * Generate evenly-distributed points on a unit sphere using the
 * Fibonacci spiral method.
 *
 * @param count - Number of points to generate
 * @returns Array of unit-sphere surface positions
 */
function fibonacciSphere(count: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = []
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2
    const radius = Math.sqrt(1 - y * y)
    const angle = GOLDEN_ANGLE * i
    points.push(new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius))
  }
  return points
}

/** Per-spike state for animation and fire-flash targeting. */
interface SpikeData {
  /** Sub-group containing stalk + bulb meshes. */
  group: THREE.Group
  /** Outward direction from sphere center (unit vector). */
  dir: THREE.Vector3
  /** Rest position on the membrane surface. */
  basePos: THREE.Vector3
  /** Random phase offset for animation variety. */
  phase: number
  /** Bulb mesh — flashed white when firing. */
  bulb: THREE.Mesh
  // Death animation fields (assigned on die())
  /** Outward velocity for detached spike during death. */
  velocity?: THREE.Vector3
  /** Random rotational speed for tumbling during death. */
  rotSpeed?: THREE.Vector3
}

/**
 * Procedural coronavirus Spire enemy controller.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-enemy-system-design.md
 */
export class SpireController implements Tickable {
  /** Root group — add to scene. Scaled by {@link SPIRE_SCALE}. */
  readonly group = new THREE.Group()
  /** Domain enemy entity this controller visualizes. */
  readonly enemy: Enemy

  private readonly bodyGroup = new THREE.Group()
  private readonly spikesGroup = new THREE.Group()
  private readonly spikeData: SpikeData[] = []
  private membrane!: THREE.Mesh
  private core!: THREE.Mesh
  private rna!: THREE.Mesh
  private light!: THREE.PointLight

  private elapsed = 0
  private readonly timeOffset: number
  private flashTimer = 0
  private recoilTimer = 0
  private fireFlashSpike: SpikeData | null = null
  private fireFlashTimer = 0
  private dead = false
  private deathTimer = 0
  private disposed = false

  /** Target position the spire drifts toward — set by VC each frame. */
  readonly targetPosition = new THREE.Vector3()

  /** Current visual state — set by VC from director output. */
  isMoving = false
  /** Current agitation state — set by VC from director output. */
  isAgitated = false

  /** True once the death animation has fully completed. */
  get deathComplete(): boolean {
    return this.dead && this.deathTimer >= DEATH_ANIM_DURATION
  }

  constructor(enemy: Enemy) {
    this.enemy = enemy
    this.timeOffset = Math.random() * 10

    this.group.add(this.bodyGroup)
    this.group.add(this.spikesGroup)
    this.group.scale.setScalar(SPIRE_SCALE)

    this.buildBody()
    this.buildSpikes()

    // Wire death
    this.enemy.onDeath = () => this.die()
  }

  // ═══════════════════════════════════════════════════════════════
  // Build geometry
  // ═══════════════════════════════════════════════════════════════

  private buildBody(): void {
    // Outer membrane — translucent sphere
    this.membrane = new THREE.Mesh(membraneGeo, membraneMat)
    this.bodyGroup.add(this.membrane)

    // Inner core — opaque, slightly smaller
    this.core = new THREE.Mesh(coreGeo, coreMat)
    this.bodyGroup.add(this.core)

    // RNA strand inside
    this.rna = new THREE.Mesh(rnaGeo, rnaMat)
    this.bodyGroup.add(this.rna)

    // Inner point light (orange/red glow)
    this.light = new THREE.PointLight(0xff4400, 0.6, 4)
    this.bodyGroup.add(this.light)
  }

  private buildSpikes(): void {
    const points = fibonacciSphere(SPIKE_COUNT)

    for (let i = 0; i < points.length; i++) {
      const dir = points[i]!.clone().normalize()
      const spikeGroup = new THREE.Group()

      // Stalk
      const stalk = new THREE.Mesh(stalkGeo, stalkMat)
      stalk.position.set(0, 0.2, 0)
      spikeGroup.add(stalk)

      // Bulb (receptor binding domain)
      const bulb = new THREE.Mesh(bulbGeo, bulbMat)
      bulb.position.set(0, 0.44, 0)
      spikeGroup.add(bulb)

      // Position spike on sphere surface, pointing outward
      const surfacePos = dir.clone().multiplyScalar(BASE_RADIUS)
      spikeGroup.position.copy(surfacePos)

      // Orient spike to point outward from sphere center
      spikeGroup.lookAt(dir.clone().multiplyScalar(BASE_RADIUS + 1))
      spikeGroup.rotateX(Math.PI / 2)

      this.spikesGroup.add(spikeGroup)
      this.spikeData.push({
        group: spikeGroup,
        dir: dir.clone(),
        basePos: surfacePos.clone(),
        phase: Math.random() * Math.PI * 2,
        bulb,
      })
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Per-frame tick
  // ═══════════════════════════════════════════════════════════════

  /** @inheritdoc */
  tick(dt: number): void {
    if (this.disposed) return
    this.elapsed += dt
    const t = this.elapsed + this.timeOffset

    // --- Death animation (overrides normal animation) ---
    if (this.dead) {
      this.tickDeath(dt, t)
      return
    }

    // --- Floaty drift — lerp toward target + oscillating offset ---
    const lerpFactor = 1 - Math.exp(-DRIFT_SMOOTHING * dt)
    // Oscillating offsets — sine waves at different frequencies for organic float
    const swayX = Math.sin(t * DRIFT_SWAY_FREQ) * DRIFT_SWAY_X
    const swayZ = Math.cos(t * DRIFT_SWAY_FREQ * 0.7 + 1.5) * DRIFT_SWAY_Z
    const floatY = Math.sin(t * DRIFT_SWAY_FREQ * 0.4 + 0.8) * DRIFT_FLOAT_Y

    this.group.position.x += (this.targetPosition.x + swayX - this.group.position.x) * lerpFactor
    this.group.position.z += (this.targetPosition.z + swayZ - this.group.position.z) * lerpFactor
    this.group.position.y += (this.targetPosition.y + floatY - this.group.position.y) * lerpFactor

    // --- Body rotation ---
    this.group.rotation.y += this.isAgitated ? 0.015 : 0.004
    this.group.rotation.x = Math.sin(t * 0.3) * 0.1

    // --- Floating bob ---
    const bobSpeed = this.isAgitated ? 2.5 : 0.8
    this.bodyGroup.position.y = Math.sin(t * bobSpeed) * 0.15

    // --- Hit recoil — jolt body on impact ---
    if (this.recoilTimer > 0) {
      this.recoilTimer -= dt
      const intensity = (this.recoilTimer / HIT_RECOIL_DURATION) * HIT_RECOIL_INTENSITY
      this.bodyGroup.position.y += Math.sin(t * 40) * intensity
      this.bodyGroup.rotation.z = Math.sin(t * 35) * intensity * 2
      this.bodyGroup.rotation.x = Math.cos(t * 30) * intensity * 1.5
    }

    // --- Membrane breathing ---
    const breathe = this.isAgitated
      ? 1 + Math.sin(t * 4) * 0.08
      : 1 + Math.sin(t * 1.5) * 0.03
    this.membrane.scale.setScalar(breathe)

    // --- Core pulse ---
    const corePulse = this.isAgitated
      ? 0.7 + Math.sin(t * 6) * 0.05
      : 0.7 + Math.sin(t * 1.2) * 0.02
    this.core.scale.setScalar(corePulse)

    // --- RNA spin ---
    this.rna.rotation.y += this.isAgitated ? 0.04 : 0.01
    this.rna.rotation.z += 0.005

    // --- Light pulse ---
    this.light.intensity = this.isAgitated
      ? 0.8 + Math.sin(t * 5) * 0.5
      : 0.4 + Math.sin(t * 1.5) * 0.2

    // --- Spike animation ---
    for (const spike of this.spikeData) {
      if (this.isAgitated) {
        // Agitated: spikes extend outward and wobble faster
        const extend = 1 + Math.sin(t * 6 + spike.phase) * 0.15
        spike.group.position.copy(spike.basePos.clone().multiplyScalar(extend))
        spike.bulb.position.x = Math.sin(t * 8 + spike.phase) * 0.03
        spike.bulb.position.z = Math.cos(t * 8 + spike.phase * 1.3) * 0.03
      } else {
        // Idle: gentle sway
        const sway = 1 + Math.sin(t * 0.8 + spike.phase) * 0.03
        spike.group.position.copy(spike.basePos.clone().multiplyScalar(sway))
        spike.bulb.position.x = Math.sin(t * 1.2 + spike.phase) * 0.01
        spike.bulb.position.z = 0
      }
    }

    // --- Hit flash (membrane) ---
    if (this.flashTimer > 0) {
      this.flashTimer -= dt
      if (this.flashTimer <= 0) {
        this.membrane.material = membraneMat
      }
    }

    // --- Fire flash (spike bulb) ---
    if (this.fireFlashTimer > 0) {
      this.fireFlashTimer -= dt
      if (this.fireFlashTimer <= 0 && this.fireFlashSpike) {
        this.fireFlashSpike.bulb.material = bulbMat
        this.fireFlashSpike = null
      }
    }
  }

  /**
   * Animated death — spikes detach and fly outward, membrane and core
   * shrink, core flickers, light fades, group removed when complete.
   */
  private tickDeath(dt: number, _t: number): void {
    this.deathTimer += dt
    const progress = Math.min(1, this.deathTimer / DEATH_ANIM_DURATION)

    // Ease-in curve for organic collapse
    const ease = progress * progress

    // --- Membrane + core shrink ---
    const shrink = Math.max(0, 1 - ease)
    this.membrane.scale.setScalar(shrink)
    this.core.scale.setScalar(shrink * 0.7)
    this.rna.scale.setScalar(shrink)

    // --- Spikes detach and fly outward ---
    for (const spike of this.spikeData) {
      if (spike.velocity && spike.rotSpeed) {
        spike.group.position.add(spike.velocity)
        spike.group.rotation.x += spike.rotSpeed.x
        spike.group.rotation.y += spike.rotSpeed.y
        spike.group.rotation.z += spike.rotSpeed.z
        spike.velocity.y -= SPIKE_GRAVITY
      }
    }

    // --- Reset membrane flash during death ---
    if (this.flashTimer > 0) {
      this.flashTimer -= dt
      if (this.flashTimer <= 0) {
        this.membrane.material = membraneMat
      }
    }

    // --- Core flickers and dies ---
    const flicker = Math.random() > progress ? 1 : 0
    this.core.scale.setScalar(shrink * 0.7 * flicker)
    this.light.intensity = (1 - ease) * 3 * flicker

    // --- Whole group shrinks in the final third ---
    if (progress > 0.6) {
      const shrinkProgress = (progress - 0.6) / 0.4
      const scale = SPIRE_SCALE * (1 - shrinkProgress * 0.6)
      this.group.scale.setScalar(scale)
    }

    // --- Remove from scene when animation completes ---
    if (progress >= 1) {
      this.group.removeFromParent()
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Hit / fire / death
  // ═══════════════════════════════════════════════════════════════

  /** Flash membrane magenta + body recoil on hit — called by VC when projectile connects. */
  flash(): void {
    this.flashTimer = HIT_FLASH_DURATION
    this.recoilTimer = HIT_RECOIL_DURATION
    this.membrane.material = flashMat
  }

  /**
   * Flash the nearest spike bulb white to indicate firing.
   * Finds the spike whose outward direction best faces the player.
   *
   * @param playerX - Player world X position
   * @param playerZ - Player world Z position
   */
  fireFlash(playerX: number, playerZ: number): void {
    // Direction from spire to player in local XZ
    const dx = playerX - this.group.position.x
    const dz = playerZ - this.group.position.z
    const len = Math.sqrt(dx * dx + dz * dz)
    if (len === 0) return

    const dirX = dx / len
    const dirZ = dz / len

    // Find spike with highest dot product toward player
    let bestSpike: SpikeData | null = null
    let bestDot = -Infinity
    for (const spike of this.spikeData) {
      const dot = spike.dir.x * dirX + spike.dir.z * dirZ
      if (dot > bestDot) {
        bestDot = dot
        bestSpike = spike
      }
    }

    if (bestSpike) {
      // Restore previous fire-flash spike if still active
      if (this.fireFlashSpike && this.fireFlashSpike !== bestSpike) {
        this.fireFlashSpike.bulb.material = bulbMat
      }
      bestSpike.bulb.material = fireFlashMat
      this.fireFlashSpike = bestSpike
      this.fireFlashTimer = FIRE_FLASH_DURATION
    }
  }

  /** Trigger death — animation is driven by tickDeath(). */
  private die(): void {
    this.dead = true
    this.deathTimer = 0
    this.flashTimer = HIT_FLASH_DURATION
    this.membrane.material = flashMat

    // Assign detach velocities and tumble speeds to each spike
    for (const spike of this.spikeData) {
      spike.velocity = spike.dir
        .clone()
        .multiplyScalar(0.1 + Math.random() * 0.1)
      spike.rotSpeed = new THREE.Vector3(
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.3,
      )
    }

    // Flash RNA white and boost light for initial death burst
    this.rna.material = fireFlashMat
    this.light.intensity = 3
  }

  /** Clean up all geometry and instance-owned materials. */
  dispose(): void {
    this.disposed = true
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        // Only dispose instance-owned materials (not shared statics)
        if (
          child.material !== membraneMat &&
          child.material !== coreMat &&
          child.material !== stalkMat &&
          child.material !== bulbMat &&
          child.material !== rnaMat &&
          child.material !== flashMat &&
          child.material !== fireFlashMat
        ) {
          ;(child.material as THREE.Material).dispose()
        }
      }
    })
  }
}
