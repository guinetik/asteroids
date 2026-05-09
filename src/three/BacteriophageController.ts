/**
 * Procedural bacteriophage enemy — 8-legged spider walker.
 *
 * Builds geometry procedurally (no GLTF). Animates legs with
 * alternating tetrapod gait when moving, subtle twitch when idle.
 * Ported from docs/inspo/bacteriophage-demo.html.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-enemy-system-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { Enemy } from '@/lib/fps/enemy'
import {
  createTronHologramMaterial,
  disposeTronHologramMaterials,
  syncTronHologramTimeSeconds,
  TRON_HOLOGRAM_ENEMY_ALPHA_GAIN,
  TRON_HOLOGRAM_ENEMY_COLOR_GAIN,
  TRON_HOLOGRAM_ENEMY_MATERIAL_OPACITY,
} from '@/three/tronHologramMaterial'
import { MutableTubeGeometry } from '@/three/geometry/MutableTubeGeometry'
import {
  enemyVisualPaletteForTier,
  type EnemyVisualControllerOptions,
  type EnemyVisualPalette,
} from '@/three/enemyVisualPalette'
import type { EnemyLightPool } from '@/three/EnemyLightPool'

// ── Visual constants ────────────────────────────────────────────
const PHAGE_SCALE = 2.0
const LEG_COUNT = 8
const LEG_TUBE_RADIUS = 0.025
/** Axial segments per leg tube — lower = cheaper {@link THREE.TubeGeometry} rebuilds. */
const LEG_TUBE_AXIAL_SEGMENTS = 8
/**
 * Seconds between leg curve rebakes — lower frequency cuts alloc/GPU upload cost
 * (was ~15 Hz; ~4 Hz is enough for leg motion during rescue packs).
 */
const LEG_GEOMETRY_UPDATE_INTERVAL = 1 / 4

const HIT_FLASH_DURATION = 0.08
const HIT_RECOIL_DURATION = 0.25
const HIT_RECOIL_INTENSITY = 0.15
const DEATH_ANIM_DURATION = 1.2
/** World Y where retired controllers park so their meshes frustum-cull. */
const RETIRE_PARK_Y = -10_000

/**
 * Y offset from group origin to body center (in world units).
 * Used by the VC to position the hit-detection sphere at the torso,
 * not at ground level. Value = bodyGroup.y (0.8) * PHAGE_SCALE.
 */
export const PHAGE_HIT_CENTER_Y = 0.8 * PHAGE_SCALE

/** TRON inner torus core. */
const PHAGE_TRON_CORE = 0x39ff14

const flashMat = new THREE.MeshBasicMaterial({ color: 0xff00ff })

// ── Shared geometries ───────────────────────────────────────────
const baseGeo = new THREE.CylinderGeometry(0.3, 0.35, 0.08, 8)
const headGeo = new THREE.IcosahedronGeometry(0.4, 0)
const coreGeo = new THREE.TorusKnotGeometry(0.12, 0.02, 32, 4)
const ringGeo = new THREE.TorusGeometry(0.32, 0.02, 4, 8)

/** Per-leg state for animation — mesh, radial angle, gait phase offset, and tube buffer. */
interface LegData {
  mesh: THREE.Mesh
  /** In-place mutable tube geometry — same instance is rewritten every refresh. */
  tube: MutableTubeGeometry
  angle: number
  phase: number
}

/**
 * Procedural bacteriophage enemy controller.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-enemy-system-design.md
 */
export class BacteriophageController implements Tickable {
  readonly group = new THREE.Group()
  /**
   * Domain enemy entity this controller visualizes. Mutable so the
   * controller can be retired into a pool and recycled with a freshly
   * spawned enemy without re-running the full constructor.
   */
  enemy: Enemy

  private readonly bodyGroup = new THREE.Group()
  private readonly legsGroup = new THREE.Group()
  private readonly legs: LegData[] = []
  private head!: THREE.Mesh
  private core!: THREE.Mesh
  private light!: THREE.PointLight
  /** Pool the {@link light} was borrowed from; `null` when the controller owns it. */
  private readonly lightPool: EnemyLightPool | null
  /** True when the inner light should contribute this frame; gated in tick(). */
  private lightsEnabled = true
  /** Capsid material restored after hit flash. */
  private headTronMat!: THREE.ShaderMaterial
  private readonly tronMaterials: THREE.ShaderMaterial[] = []
  private readonly visualPalette: EnemyVisualPalette

  private elapsed = 0
  private readonly timeOffset: number
  private flashTimer = 0
  private recoilTimer = 0
  private legGeometryTimer = 0
  private dead = false
  private deathTimer = 0
  private disposed = false

  /** Current visual state — set by VC from director output. */
  isMoving = false
  /** Current agitation state — set by VC from director output. */
  isAgitated = false
  /**
   * When `true`, per-frame leg geometry rebakes are skipped — used by the
   * minigame VC to LOD-out distant enemies whose tube wiggle is invisible.
   * Set every tick by the caller; the controller never toggles it itself.
   */
  lodSkipGeometry = false
  /** True once the death animation has fully completed. */
  get deathComplete(): boolean {
    return this.dead && this.deathTimer >= DEATH_ANIM_DURATION
  }

  constructor(enemy: Enemy, options: EnemyVisualControllerOptions = {}) {
    this.enemy = enemy
    this.visualPalette = enemyVisualPaletteForTier(options.visualTier)
    this.lightPool = options.lightPool ?? null
    this.timeOffset = Math.random() * 10

    this.group.add(this.bodyGroup)
    this.group.add(this.legsGroup)
    this.group.scale.setScalar(PHAGE_SCALE)

    this.buildBody()
    this.buildLegs()
    this.refreshLegGeometry(0, false)

    // Set initial body height (legs extend from here)
    this.bodyGroup.position.y = 0.8

    // Wire death
    this.enemy.onDeath = () => this.die()
  }

  /**
   * Allocate a TRON hologram material tracked for time sync and disposal.
   *
   * @param color - Primary tint
   * @returns Shader material instance
   */
  private makeTron(color: number): THREE.ShaderMaterial {
    const m = createTronHologramMaterial({
      color,
      colorGain: TRON_HOLOGRAM_ENEMY_COLOR_GAIN,
      alphaGain: TRON_HOLOGRAM_ENEMY_ALPHA_GAIN,
      opacity: TRON_HOLOGRAM_ENEMY_MATERIAL_OPACITY,
    })
    this.tronMaterials.push(m)
    return m
  }

  // ═══════════════════════════════════════════════════════════════
  // Build geometry
  // ═══════════════════════════════════════════════════════════════

  private buildBody(): void {
    const hullTron = this.makeTron(this.visualPalette.silhouette)
    const neckTron = this.makeTron(this.visualPalette.silhouetteDark)
    this.headTronMat = this.makeTron(this.visualPalette.feature)
    const coreTron = this.makeTron(PHAGE_TRON_CORE)

    // Baseplate
    const base = new THREE.Mesh(baseGeo, hullTron)
    base.position.y = -0.05
    this.bodyGroup.add(base)

    // Ring around baseplate
    const ring = new THREE.Mesh(ringGeo, hullTron)
    ring.rotation.x = Math.PI / 2
    ring.position.y = -0.05
    this.bodyGroup.add(ring)

    // Trunk connector
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 0.35, 8)
    const trunk = new THREE.Mesh(trunkGeo, hullTron)
    trunk.position.y = 0.15
    this.bodyGroup.add(trunk)

    // Segmented collar (accordion neck)
    const COLLAR_SEGMENTS = 6
    const COLLAR_START_Y = 0.38
    const COLLAR_SPACING = 0.045
    for (let i = 0; i < COLLAR_SEGMENTS; i++) {
      const r = 0.15 + (i % 2 === 0 ? 0.05 : -0.03)
      const segGeo = new THREE.CylinderGeometry(r, r, 0.04, 8)
      const seg = new THREE.Mesh(segGeo, neckTron)
      seg.position.y = COLLAR_START_Y + i * COLLAR_SPACING
      this.bodyGroup.add(seg)
    }

    // Collar cap ring
    const capRingGeo = new THREE.TorusGeometry(0.14, 0.015, 4, 8)
    const capRing = new THREE.Mesh(capRingGeo, neckTron)
    capRing.rotation.x = Math.PI / 2
    capRing.position.y = 0.36
    this.bodyGroup.add(capRing)

    // Capsid head
    this.head = new THREE.Mesh(headGeo, this.headTronMat)
    this.head.position.y = 0.75
    this.bodyGroup.add(this.head)

    // DNA core (inside head)
    this.core = new THREE.Mesh(coreGeo, coreTron)
    this.core.position.y = 0.75
    this.bodyGroup.add(this.core)

    // Inner point light — borrow a pool slot when available so the scene's
    // total `NUM_POINT_LIGHTS` does not change at spawn time. Falls back to
    // a fresh light for legacy callers that have not threaded a pool through.
    const pooled = this.lightPool?.acquire() ?? null
    if (pooled) {
      pooled.color.setHex(0x00ffcc)
      pooled.distance = 3
      pooled.intensity = 0.8
      this.light = pooled
    } else {
      this.light = new THREE.PointLight(0x00ffcc, 0.8, 3)
    }
    this.light.position.y = 0.75
    this.bodyGroup.add(this.light)
  }

  private buildLegs(): void {
    const legTron = this.makeTron(this.visualPalette.featureBright)
    for (let i = 0; i < LEG_COUNT; i++) {
      const angle = (i / LEG_COUNT) * Math.PI * 2
      const phase = i % 2 === 0 ? 0 : Math.PI

      const tube = new MutableTubeGeometry(LEG_TUBE_AXIAL_SEGMENTS, 4, LEG_TUBE_RADIUS, false)
      const curve = this.makeLegCurve(angle, phase, 0, false)
      tube.update(curve)
      const mesh = new THREE.Mesh(tube, legTron)
      this.legsGroup.add(mesh)
      this.legs.push({ mesh, tube, angle, phase })
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Leg curve generation
  // ═══════════════════════════════════════════════════════════════

  private makeLegCurve(
    angle: number,
    phase: number,
    time: number,
    isMoving: boolean,
  ): THREE.QuadraticBezierCurve3 {
    const cx = Math.cos(angle)
    const cz = Math.sin(angle)
    const tx = -cz
    const tz = cx

    const hip = new THREE.Vector3(cx * 0.3, 0.8, cz * 0.3)

    if (!isMoving) {
      // Idle: planted legs with subtle knee twitch
      const foot = new THREE.Vector3(cx * 1.2, 0, cz * 1.2)
      const knee = new THREE.Vector3(cx * 0.7, 0.85 + Math.sin(time * 0.8 + phase) * 0.04, cz * 0.7)
      return new THREE.QuadraticBezierCurve3(hip, knee, foot)
    }

    // Walking: alternating tetrapod gait
    const GAIT_SPEED = 8
    const STRIDE = 0.25
    const cycle = ((time * GAIT_SPEED + phase) % (Math.PI * 2)) / (Math.PI * 2)
    const isSwing = cycle > 0.5
    const swingT = isSwing ? (cycle - 0.5) * 2 : 0
    const stanceT = !isSwing ? cycle * 2 : 0

    const restX = cx * 1.2
    const restZ = cz * 1.2

    let footX: number, footZ: number, footY: number
    if (isSwing) {
      footX = restX + tx * STRIDE * (swingT * 2 - 1)
      footZ = restZ + tz * STRIDE * (swingT * 2 - 1)
      footY = Math.sin(swingT * Math.PI) * 0.35
    } else {
      footX = restX + tx * STRIDE * (1 - stanceT * 2)
      footZ = restZ + tz * STRIDE * (1 - stanceT * 2)
      footY = 0
    }

    const foot = new THREE.Vector3(footX, footY, footZ)

    const kneeRadial = isSwing ? 0.65 : 0.75
    const kneeHeight = isSwing
      ? 1.1 + Math.sin(swingT * Math.PI) * 0.3
      : 0.85 + Math.sin(stanceT * Math.PI * 0.5) * 0.05
    const kneeOff = isSwing ? STRIDE * (swingT - 0.5) : STRIDE * (0.5 - stanceT)

    const knee = new THREE.Vector3(
      cx * kneeRadial + tx * kneeOff * 0.5,
      kneeHeight,
      cz * kneeRadial + tz * kneeOff * 0.5,
    )

    return new THREE.QuadraticBezierCurve3(hip, knee, foot)
  }

  // ═══════════════════════════════════════════════════════════════
  // Per-frame tick
  // ═══════════════════════════════════════════════════════════════

  /** @inheritdoc */
  tick(dt: number): void {
    if (this.disposed) return
    syncTronHologramTimeSeconds(this.tronMaterials, this.elapsed + this.timeOffset)
    this.elapsed += dt
    const t = this.elapsed + this.timeOffset

    // --- Death animation (overrides normal animation) ---
    if (this.dead) {
      this.tickDeath(dt, t)
      return
    }

    // --- Body animation ---
    if (this.isMoving) {
      this.bodyGroup.position.y = 0.8 + Math.sin(t * 8) * 0.03
      this.bodyGroup.rotation.z = Math.sin(t * 8) * 0.06
      this.bodyGroup.rotation.x = Math.sin(t * 4) * 0.03
    } else {
      this.bodyGroup.position.y = 0.8 + Math.sin(t * 1.2) * 0.015
      this.bodyGroup.rotation.z = Math.sin(t * 0.7) * 0.02
      this.bodyGroup.rotation.x = Math.sin(t * 0.5) * 0.01
    }

    // --- Hit recoil — jolt body on impact ---
    if (this.recoilTimer > 0) {
      this.recoilTimer -= dt
      const intensity = (this.recoilTimer / HIT_RECOIL_DURATION) * HIT_RECOIL_INTENSITY
      this.bodyGroup.position.y += Math.sin(t * 40) * intensity
      this.bodyGroup.rotation.z += Math.sin(t * 35) * intensity * 2
      this.bodyGroup.rotation.x += Math.cos(t * 30) * intensity * 1.5
    }

    // --- DNA core spin + pulse ---
    this.core.rotation.y += 0.02
    const coreScale = 1 + Math.sin(t * 2) * 0.1
    this.core.scale.setScalar(coreScale)

    // --- Light pulse ---
    // Toggling `.visible` to LOD-out the light would change `NUM_POINT_LIGHTS`
    // and recompile every lit material in the scene. Gate via intensity so
    // the program cache key stays stable.
    this.light.intensity = this.lightsEnabled ? 0.6 + Math.sin(t * 2) * 0.3 : 0

    // --- Legs ---
    // Skip the rebake entirely when LODed out — caller (minigame VC) sets
    // `lodSkipGeometry` for enemies that are too far for tube wiggle to be
    // visible. The static last-pose stays on screen, no GPU upload happens.
    this.legGeometryTimer += dt
    if (!this.lodSkipGeometry && this.legGeometryTimer >= LEG_GEOMETRY_UPDATE_INTERVAL) {
      this.refreshLegGeometry(t, this.isMoving)
      this.legGeometryTimer %= LEG_GEOMETRY_UPDATE_INTERVAL
    }

    // --- Hit flash ---
    if (this.flashTimer > 0) {
      this.flashTimer -= dt
      if (this.flashTimer <= 0) {
        this.head.material = this.headTronMat
      }
    }
  }

  /**
   * Animated death — legs curl inward progressively, body sinks and tilts,
   * core flickers, whole thing shrinks and fades out.
   */
  private tickDeath(dt: number, t: number): void {
    this.deathTimer += dt
    const progress = Math.min(1, this.deathTimer / DEATH_ANIM_DURATION)

    // Ease-in curve for organic collapse
    const ease = progress * progress

    // --- Body sinks + tilts over ---
    this.bodyGroup.position.y = 0.8 * (1 - ease)
    this.bodyGroup.rotation.x = ease * 1.2 + Math.sin(t * 15) * 0.1 * (1 - ease)
    this.bodyGroup.rotation.z = ease * 0.4 + Math.sin(t * 12) * 0.08 * (1 - ease)

    // --- Legs curl inward progressively ---
    // Death animation is a one-shot, ~1.2s — keep mutating in place even
    // when LOD-skipped during normal play, so the corpse pose still settles.
    this.legGeometryTimer += dt
    if (this.legGeometryTimer >= LEG_GEOMETRY_UPDATE_INTERVAL) {
      for (const leg of this.legs) {
        const cx = Math.cos(leg.angle)
        const cz = Math.sin(leg.angle)

        const legSpread = 1.2 * (1 - ease)
        const legHeight = 0.8 * (1 - ease)
        const footDrop = -0.3 * ease

        const hip = new THREE.Vector3(cx * 0.3, legHeight, cz * 0.3)
        const knee = new THREE.Vector3(
          cx * (0.3 + legSpread * 0.4),
          legHeight * 0.5 + Math.sin(t * 8 + leg.phase) * 0.03 * (1 - ease),
          cz * (0.3 + legSpread * 0.4),
        )
        const foot = new THREE.Vector3(cx * legSpread, footDrop, cz * legSpread)

        const curve = new THREE.QuadraticBezierCurve3(hip, knee, foot)
        leg.tube.update(curve)
      }
      this.legGeometryTimer %= LEG_GEOMETRY_UPDATE_INTERVAL
    }

    // --- Reset head flash during death ---
    if (this.flashTimer > 0) {
      this.flashTimer -= dt
      if (this.flashTimer <= 0) {
        this.head.material = this.headTronMat
      }
    }

    // --- Core flickers and dies ---
    const flicker = Math.random() > progress ? 1 : 0
    this.core.scale.setScalar((1 - ease) * flicker)
    this.light.intensity = this.lightsEnabled ? (1 - ease) * 2 * flicker : 0

    // --- Whole group shrinks in the final third ---
    if (progress > 0.6) {
      const shrinkProgress = (progress - 0.6) / 0.4
      const scale = PHAGE_SCALE * (1 - shrinkProgress * 0.6)
      this.group.scale.setScalar(scale)
    }

    // --- Remove from scene when animation completes ---
    if (progress >= 1) {
      this.group.removeFromParent()
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Hit / death
  // ═══════════════════════════════════════════════════════════════

  /** Flash head magenta + body recoil on hit — called by VC when projectile connects. */
  flash(): void {
    this.flashTimer = HIT_FLASH_DURATION
    this.recoilTimer = HIT_RECOIL_DURATION
    this.head.material = flashMat
  }

  /** Trigger death — animation is driven by tickDeath(). */
  private die(): void {
    this.dead = true
    this.deathTimer = 0
    this.legGeometryTimer = LEG_GEOMETRY_UPDATE_INTERVAL
    this.flashTimer = HIT_FLASH_DURATION
    this.head.material = flashMat
  }

  private refreshLegGeometry(time: number, isMoving: boolean): void {
    for (const leg of this.legs) {
      const curve = this.makeLegCurve(leg.angle, leg.phase, time, isMoving)
      leg.tube.update(curve)
    }
  }

  /**
   * Retire this controller into a pool slot. Hides the visual group, clears
   * the death callback on the bound enemy, and resets transient animation
   * state so a future {@link recycle} call can rebind a fresh enemy without
   * re-running the constructor (which would allocate fresh materials,
   * geometries, and VAOs — the source of disturbance spawn hitches).
   */
  retire(): void {
    this.enemy.onDeath = null
    this.dead = false
    this.deathTimer = 0
    this.flashTimer = 0
    this.recoilTimer = 0
    this.legGeometryTimer = 0
    this.elapsed = 0
    this.isMoving = false
    this.isAgitated = false
    this.lodSkipGeometry = false
    this.head.material = this.headTronMat
    this.bodyGroup.position.set(0, 0.8, 0)
    this.bodyGroup.rotation.set(0, 0, 0)
    this.core.scale.setScalar(1)
    this.group.scale.setScalar(PHAGE_SCALE)
    this.group.rotation.set(0, 0, 0)
    // Toggling `group.visible` would mutate `NUM_POINT_LIGHTS` (the pooled
    // body light becomes uncounted), forcing a scene-wide lit-material
    // recompile on the next spawn. Park the group far below ground instead
    // so frustum culling drops draw calls while the light stays pinned.
    this.group.position.set(0, RETIRE_PARK_Y, 0)
  }

  /**
   * Bind a freshly spawned enemy to this pooled controller and re-arm it
   * for the scene. Caller still re-positions {@link group} and re-adds it
   * to the scene; this method only restores controller-internal state.
   *
   * @param enemy - New domain enemy to drive this controller.
   */
  recycle(enemy: Enemy): void {
    this.enemy = enemy
    this.enemy.onDeath = () => this.die()
  }

  /**
   * Toggle the inner point light on/off. The minigame VC calls this every
   * tick on a "keep N nearest, hide the rest" basis to cap the number of
   * dynamic lights affecting PBR materials when many enemies are visible.
   *
   * @param enabled Whether the body light should contribute this frame.
   */
  setLightsEnabled(enabled: boolean): void {
    this.lightsEnabled = enabled
  }

  /** Clean up all geometry and materials. */
  dispose(): void {
    this.disposed = true
    disposeTronHologramMaterials(this.tronMaterials)
    this.tronMaterials.length = 0
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
      }
    })
    if (this.lightPool) {
      this.lightPool.release(this.light)
    }
  }
}
