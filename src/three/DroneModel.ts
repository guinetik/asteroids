/**
 * GLB-backed visual for the station patrol drone.
 *
 * Wraps `/models/drone.glb`, a single merged mesh with one `lambert1`
 * material (cyan/red baked into the emissive texture). Unlike
 * {@link TurretModel} there are no bones, skinning, or animation clips —
 * the death tumble is procedural and the head-tracking yaw is applied to
 * the wrapper group directly.
 *
 * The model registers an outer wrapper {@link THREE.Group} (parented by
 * the director) plus an inner group containing the loaded GLB. The inner
 * group is bobbed vertically every frame to sell the hover; horizontal
 * movement is applied to the outer wrapper by the controller. The
 * forward axis of the model is captured via {@link DRONE_FACE_FORWARD}
 * so the muzzle flash spawns at the correct world point and the yaw
 * tracking matches the visible "face" of the drone.
 *
 * @author guinetik
 * @date 2026-05-16
 * @spec docs/superpowers/specs/2026-05-16-station-drone-enemy-design.md
 */
import * as THREE from 'three'
import { loadGLB } from '@/three/loadGLB'

/** Asset URL for the optimized drone GLB. */
const DRONE_MODEL_URL = '/models/drone.glb'

/**
 * Diameter (world metres) the deployed drone visual should read at on
 * screen. The GLB ships at huge native units; the loader samples the
 * scene's bounding box and picks a uniform scale that lands the longest
 * axis on this target. ~0.6 m fits comfortably inside a single 1×1 tile
 * cell with room left over for a hover bob.
 */
const DRONE_TARGET_DIAMETER_METERS = 0.6

/**
 * Smoothing rate for yaw tracking, expressed as the `lambda` argument
 * to {@link THREE.MathUtils.damp}. Higher = snappier head turns. 6 reads
 * as "alive" without the snap-to-target feel of an aim assist.
 */
const DRONE_YAW_DAMP_RATE = 6

/**
 * Smoothing rate for the alert-color ramp scalar (0 = patrol baseline,
 * 1 = full alert tint). Same units as {@link DRONE_YAW_DAMP_RATE}.
 */
const DRONE_ALERT_RAMP_RATE = 5

/**
 * Warm-red emissive colour the drone fades toward when alerted. The
 * baseline emissive texture (cyan rings + red eye lenses) is preserved
 * for everything *except* the tint slot; this colour is what the
 * material's `emissive` channel lerps toward as the alertness scalar
 * approaches 1.
 */
const DRONE_ALERT_EMISSIVE_COLOR = new THREE.Color(0xff3a18)

/**
 * Additive boost applied to the material's `emissiveIntensity` on top
 * of its captured baseline when fully alerted. Scaled by the alertness
 * scalar so the ramp is smooth.
 */
const DRONE_ALERT_EMISSIVE_BOOST = 0.8

/**
 * Local-space forward axis of the drone's face (3-red-eye panel) inside
 * the inner GLB scene. The model is authored with the face pointing
 * along local -Z after the standard Sketchfab orientation. If the drone
 * visually fires from the back of its head, flip this to
 * `new THREE.Vector3(0, 0, 1)` and the muzzle/orientation logic will
 * follow automatically.
 */
const DRONE_FACE_FORWARD = new THREE.Vector3(0, 0, -1)

/**
 * Offset (world metres) from the wrapper origin along
 * {@link DRONE_FACE_FORWARD} where the muzzle flash quad is parented.
 * Sized to sit at the face plane rather than inside the body so the
 * additive flash doesn't read as glowing from the back.
 */
const DRONE_MUZZLE_OFFSET = 0.32

/** Edge length (world metres) of the additive muzzle-flash quad. */
const DRONE_MUZZLE_FLASH_SIZE = 0.55

/** Seconds the muzzle flash stays visible per shot. */
const DRONE_MUZZLE_FLASH_DURATION = 0.08

/**
 * Magenta tint the drone body flashes to when the player lands a bolt
 * hit. Mirrors the turret's hit-confirmation pattern so the player sees
 * the same colour code on every kind of enemy.
 */
const DRONE_HIT_FLASH_COLOR = new THREE.Color(0xff00ff)

/** Peak emissive intensity at the moment of player-bolt impact. */
const DRONE_HIT_FLASH_INTENSITY = 6

/** Seconds for the magenta flash to decay back to baseline. */
const DRONE_HIT_FLASH_DURATION = 0.25

/** White-hot orange the body flares to on the killing-shot frame. */
const DRONE_DESTRUCTION_FLASH_COLOR = new THREE.Color(0xffd060)

/** Peak emissive intensity at the moment of destruction. */
const DRONE_DESTRUCTION_FLASH_INTENSITY = 12

/** Seconds the body keeps glowing after the killing shot. */
const DRONE_DESTRUCTION_FLASH_DURATION = 0.3

/** Seconds the procedural death tumble runs before `onDone` fires. */
const DRONE_DEATH_SECONDS = 0.4

/** Spin speed (radians/second) applied during the death tumble. */
const DRONE_DEATH_SPIN_SPEED = 12

/**
 * Vertical drop (world metres) over the death tumble. The drone sags
 * out of its hover and then is disposed by the director.
 */
const DRONE_DEATH_DROP_DISTANCE = 0.45

/** Captured material baseline so flash decays restore the original tint. */
interface DroneBodyMaterialEntry {
  /** Live reference to the GLB material we're tinting. */
  material: THREE.MeshStandardMaterial
  /** Snapshot of the diffuse colour at load time. */
  baseColor: THREE.Color
  /** Snapshot of the emissive colour at load time. */
  baseEmissive: THREE.Color
  /** Snapshot of `emissiveIntensity` at load time. */
  baseEmissiveIntensity: number
}

/**
 * GLB-driven drone visual. The director places the wrapper group with
 * {@link placeAt}; per frame the controller calls {@link faceWorldXZ},
 * {@link setAlertColor}, {@link setHoverBobOffset}, and {@link tick}.
 */
export class DroneModel {
  /** Public scene-graph node — host scene parents this into the room. */
  readonly group: THREE.Group

  /** Inner group holding the loaded GLB scene; bobbed vertically. */
  private inner: THREE.Group | null = null

  /** Captured `MeshStandardMaterial` baselines for tint lerps. */
  private bodyMaterials: DroneBodyMaterialEntry[] = []

  /** True once the GLB has finished loading. */
  private loaded = false

  /** True once load() has been kicked off so it never double-fires. */
  private loadStarted = false

  /** Latest yaw-track target world X. `null` = no override. */
  private aimTargetX: number | null = null

  /** Latest yaw-track target world Z. */
  private aimTargetZ: number | null = null

  /** Current group yaw in radians — smoothed toward the aim target. */
  private currentYaw = 0

  /** Desired alert scalar `[0, 1]`. Driven by {@link setAlertColor}. */
  private alertTarget = 0

  /** Current alert scalar — damps toward {@link alertTarget} each tick. */
  private alertScalar = 0

  /** Mesh used for the additive muzzle-flash quad. */
  private muzzleFlash: THREE.Mesh | null = null

  /** Material reference so we can fade opacity per frame. */
  private muzzleFlashMaterial: THREE.MeshBasicMaterial | null = null

  /** Seconds left on the current muzzle flash. Zero = hidden. */
  private muzzleFlashRemaining = 0

  /** Seconds left on the current hit flash. Zero = fully decayed. */
  private hitFlashRemaining = 0

  /** Seconds left on the destruction body-glow. Zero = fully decayed. */
  private destructionFlashRemaining = 0

  /** Hover bob offset (world metres) applied each tick to inner Y. */
  private hoverBobOffsetY = 0

  /** True once the death tumble started. */
  private dying = false

  /** Seconds remaining on the death tumble. */
  private deathRemaining = 0

  /** Per-instance random axis used by the tumble spin. */
  private readonly deathAxis = new THREE.Vector3(1, 0, 0)

  /** Callback fired once when the death tumble completes. */
  private deathDoneCallback: (() => void) | null = null

  /** Outer wrapper Y at the moment the death tumble started. */
  private deathStartY = 0

  /**
   * Build an empty wrapper group. {@link load} is kicked off automatically;
   * subsequent ticks no-op until the GLB resolves.
   */
  constructor() {
    this.group = new THREE.Group()
    this.group.name = 'stationDrone'
    void this.load()
  }

  /** World-space position helper. */
  get position(): THREE.Vector3 {
    return this.group.position
  }

  /** True once the GLB has finished loading. */
  isLoaded(): boolean {
    return this.loaded
  }

  /**
   * Stream the GLB, capture materials, attach the muzzle flash, and
   * normalize the visible diameter to {@link DRONE_TARGET_DIAMETER_METERS}.
   * Idempotent — subsequent calls return immediately.
   */
  async load(): Promise<void> {
    if (this.loadStarted) return
    this.loadStarted = true

    const scene = await loadGLB(DRONE_MODEL_URL)
    const inner = scene
    this.inner = inner
    this.group.add(inner)

    // Auto-scale the inner so the visible diameter lands on the target.
    // Reading the bbox after parenting picks up any meshopt quantization
    // offsets that would skew a hand-tuned scale constant.
    inner.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(inner)
    if (!box.isEmpty()) {
      const size = new THREE.Vector3()
      box.getSize(size)
      const longest = Math.max(size.x, size.y, size.z)
      if (longest > 0) {
        const scale = DRONE_TARGET_DIAMETER_METERS / longest
        inner.scale.setScalar(scale)
      }
    }

    // Capture every standard material so the hit/alert/destruction
    // flashes have a baseline to lerp against without re-traversing
    // the scene per shot.
    inner.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      for (const mat of mats) {
        if (!(mat instanceof THREE.MeshStandardMaterial)) continue
        this.bodyMaterials.push({
          material: mat,
          baseColor: mat.color.clone(),
          baseEmissive: mat.emissive.clone(),
          baseEmissiveIntensity: mat.emissiveIntensity,
        })
      }
    })

    // Attach the muzzle flash quad in the inner group's local frame so
    // it inherits the auto-scale and bobs with the body.
    this.attachMuzzleFlash(inner)

    this.loaded = true
  }

  /**
   * Place the wrapper at a world position + yaw. The drone's hover
   * baseline sits at `y`; bob is added on top.
   *
   * @param x - World X.
   * @param y - World Y of the hover baseline.
   * @param z - World Z.
   * @param yaw - Initial Y rotation (radians).
   */
  placeAt(x: number, y: number, z: number, yaw: number): void {
    this.group.position.set(x, y, z)
    this.group.rotation.set(0, yaw, 0)
    this.currentYaw = yaw
  }

  /**
   * Latch a world XZ position the drone should yaw toward. Smoothed
   * via {@link THREE.MathUtils.damp} each tick so the head turn reads
   * organic instead of snapping.
   *
   * @param x - Target world X.
   * @param z - Target world Z.
   */
  faceWorldXZ(x: number, z: number): void {
    this.aimTargetX = x
    this.aimTargetZ = z
  }

  /** Clear the active aim target so the drone holds its current yaw. */
  clearAim(): void {
    this.aimTargetX = null
    this.aimTargetZ = null
  }

  /**
   * Drive the alert-color ramp toward the patrol baseline (`false`) or
   * the warm-red alert tint (`true`). The transition is smoothed via a
   * 0..1 alertness scalar in {@link tick}, never snapped.
   *
   * @param active - Whether the drone is currently alerted.
   */
  setAlertColor(active: boolean): void {
    this.alertTarget = active ? 1 : 0
  }

  /**
   * Set the vertical hover bob offset for the next frame. The controller
   * pulls this value from `DroneWanderState.bobPhase` so drones in the
   * same room don't bob in unison.
   *
   * @param yOffset - World-metres offset added to the inner group's Y.
   */
  setHoverBobOffset(yOffset: number): void {
    this.hoverBobOffsetY = yOffset
  }

  /**
   * Pop the muzzle-flash quad for a single shot. Independent of the
   * FSM — the controller calls this every time it spawns a dart.
   */
  flashMuzzle(): void {
    this.muzzleFlashRemaining = DRONE_MUZZLE_FLASH_DURATION
    if (this.muzzleFlash) this.muzzleFlash.visible = true
  }

  /**
   * Pulse the body materials toward magenta for
   * {@link DRONE_HIT_FLASH_DURATION} seconds. Mirrors the turret's
   * hit-confirmation flash.
   */
  flashHitTaken(): void {
    this.hitFlashRemaining = DRONE_HIT_FLASH_DURATION
  }

  /**
   * Kick off the destruction glow on the killing-shot frame. The
   * controller pairs this with a brief delay before the procedural
   * death tumble so the visual punch lands on the kill.
   */
  flashDestruction(): void {
    this.destructionFlashRemaining = DRONE_DESTRUCTION_FLASH_DURATION
    this.hitFlashRemaining = 0
  }

  /**
   * Start the procedural death tumble. The wrapper spins around a
   * random axis and drops vertically over {@link DRONE_DEATH_SECONDS};
   * `onDone` fires exactly once when the tumble completes.
   *
   * @param onDone - Callback fired when the tumble finishes.
   */
  playDeathSequence(onDone: () => void): void {
    this.dying = true
    this.deathRemaining = DRONE_DEATH_SECONDS
    this.deathDoneCallback = onDone
    this.clearAim()
    this.deathStartY = this.group.position.y
    // Pick a random unit axis for the tumble spin. Y bias slightly so
    // the drone reads as cartwheeling rather than purely flipping.
    this.deathAxis
      .set(Math.random() - 0.5, Math.random() * 0.3 - 0.15, Math.random() - 0.5)
      .normalize()
  }

  /**
   * Per-frame update. Advances flash decays, alert-color ramp, yaw
   * smoothing, hover bob, and the death tumble.
   *
   * @param dt - Frame delta in seconds.
   */
  tick(dt: number): void {
    this.tickMuzzleFlash(dt)
    this.tickHitFlash(dt)
    this.tickDestructionFlash(dt)
    this.tickAlertScalar(dt)
    if (this.dying) {
      this.tickDeath(dt)
      return
    }
    this.tickYaw(dt)
    this.tickHoverBob()
  }

  /** Release GPU resources owned by the GLB subtree. */
  dispose(): void {
    if (this.inner) {
      this.inner.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose()
          const mats = Array.isArray(child.material) ? child.material : [child.material]
          for (const m of mats) if (m instanceof THREE.Material) m.dispose()
        }
      })
    }
    if (this.muzzleFlash) {
      this.muzzleFlash.geometry.dispose()
      if (this.muzzleFlashMaterial) this.muzzleFlashMaterial.dispose()
    }
  }

  /**
   * Build the additive muzzle-flash quad and parent it under the inner
   * group at {@link DRONE_FACE_FORWARD} × {@link DRONE_MUZZLE_OFFSET}.
   * Hidden by default; {@link flashMuzzle} pops it visible per shot.
   *
   * @param inner - Inner group of the loaded GLB.
   */
  private attachMuzzleFlash(inner: THREE.Group): void {
    const geometry = new THREE.PlaneGeometry(DRONE_MUZZLE_FLASH_SIZE, DRONE_MUZZLE_FLASH_SIZE)
    const material = new THREE.MeshBasicMaterial({
      color: 0xffd07a,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(geometry, material)
    // Position the quad in the inner-group local frame. We divide by the
    // inner's scale so the offset stays at the requested world metres —
    // the inner group itself is uniformly down-scaled to hit
    // DRONE_TARGET_DIAMETER_METERS.
    const innerScale = inner.scale.x || 1
    mesh.position.set(
      (DRONE_FACE_FORWARD.x * DRONE_MUZZLE_OFFSET) / innerScale,
      (DRONE_FACE_FORWARD.y * DRONE_MUZZLE_OFFSET) / innerScale,
      (DRONE_FACE_FORWARD.z * DRONE_MUZZLE_OFFSET) / innerScale,
    )
    mesh.visible = false
    inner.add(mesh)
    this.muzzleFlash = mesh
    this.muzzleFlashMaterial = material
  }

  /**
   * Smoothly damp the wrapper yaw toward the latched aim target. No-op
   * when no target is set.
   *
   * @param dt - Frame delta in seconds.
   */
  private tickYaw(dt: number): void {
    if (this.aimTargetX === null || this.aimTargetZ === null) return
    const dx = this.aimTargetX - this.group.position.x
    const dz = this.aimTargetZ - this.group.position.z
    if (dx === 0 && dz === 0) return
    // The model's authored forward axis is DRONE_FACE_FORWARD. atan2
    // on (-x, -z) is the standard "yaw a local -Z forward to face a
    // world target" computation; flip the sign when the face-forward
    // constant is flipped to local +Z.
    const targetYaw =
      DRONE_FACE_FORWARD.z >= 0
        ? Math.atan2(dx, dz)
        : Math.atan2(-dx, -dz)
    // Damp on a continuous angle; unwrap to avoid the ±π discontinuity.
    let diff = targetYaw - this.currentYaw
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    const wrappedTarget = this.currentYaw + diff
    this.currentYaw = THREE.MathUtils.damp(
      this.currentYaw,
      wrappedTarget,
      DRONE_YAW_DAMP_RATE,
      dt,
    )
    this.group.rotation.y = this.currentYaw
  }

  /**
   * Apply the hover bob offset to the inner group. Outer wrapper Y is
   * owned by the controller (room-baseline placement).
   */
  private tickHoverBob(): void {
    if (!this.inner) return
    this.inner.position.y = this.hoverBobOffsetY
  }

  /**
   * Damp the alert scalar toward {@link alertTarget} and re-tint every
   * captured body material accordingly. When the scalar is zero the
   * material restores its captured baseline exactly.
   *
   * @param dt - Frame delta in seconds.
   */
  private tickAlertScalar(dt: number): void {
    this.alertScalar = THREE.MathUtils.damp(
      this.alertScalar,
      this.alertTarget,
      DRONE_ALERT_RAMP_RATE,
      dt,
    )
    if (this.bodyMaterials.length === 0) return
    // Hit + destruction flashes own the body tint while they're
    // running — let them paint without the alert ramp fighting them.
    if (this.hitFlashRemaining > 0 || this.destructionFlashRemaining > 0) return
    const t = this.alertScalar
    for (const entry of this.bodyMaterials) {
      const mat = entry.material
      mat.emissive.copy(entry.baseEmissive).lerp(DRONE_ALERT_EMISSIVE_COLOR, t)
      mat.emissiveIntensity = entry.baseEmissiveIntensity + DRONE_ALERT_EMISSIVE_BOOST * t
    }
  }

  /**
   * Per-frame muzzle-flash fade. Additive blending means a linear ramp
   * on `opacity` reads as a sharp pop and quick decay.
   *
   * @param dt - Frame delta in seconds.
   */
  private tickMuzzleFlash(dt: number): void {
    if (!this.muzzleFlash || this.muzzleFlashRemaining <= 0) return
    this.muzzleFlashRemaining = Math.max(0, this.muzzleFlashRemaining - dt)
    const opacity = this.muzzleFlashRemaining / DRONE_MUZZLE_FLASH_DURATION
    if (this.muzzleFlashMaterial) this.muzzleFlashMaterial.opacity = opacity
    if (this.muzzleFlashRemaining <= 0) this.muzzleFlash.visible = false
  }

  /**
   * Per-frame hit-flash decay. Lerps every captured body material back
   * from magenta to its baseline, mirroring the turret's pattern so the
   * player sees the same magenta confirmation across enemy types.
   *
   * @param dt - Frame delta in seconds.
   */
  private tickHitFlash(dt: number): void {
    if (this.hitFlashRemaining <= 0 || this.bodyMaterials.length === 0) return
    this.hitFlashRemaining = Math.max(0, this.hitFlashRemaining - dt)
    const t = this.hitFlashRemaining / DRONE_HIT_FLASH_DURATION
    for (const entry of this.bodyMaterials) {
      const mat = entry.material
      mat.color.copy(entry.baseColor).lerp(DRONE_HIT_FLASH_COLOR, t)
      mat.emissive.copy(entry.baseEmissive).lerp(DRONE_HIT_FLASH_COLOR, t)
      mat.emissiveIntensity = entry.baseEmissiveIntensity + DRONE_HIT_FLASH_INTENSITY * t
    }
  }

  /**
   * Per-frame destruction-flash decay. Hotter than the hit flash; reads
   * as the drone glowing from within while the death tumble runs.
   *
   * @param dt - Frame delta in seconds.
   */
  private tickDestructionFlash(dt: number): void {
    if (this.destructionFlashRemaining <= 0 || this.bodyMaterials.length === 0) return
    this.destructionFlashRemaining = Math.max(0, this.destructionFlashRemaining - dt)
    const t = this.destructionFlashRemaining / DRONE_DESTRUCTION_FLASH_DURATION
    for (const entry of this.bodyMaterials) {
      const mat = entry.material
      mat.color.copy(entry.baseColor).lerp(DRONE_DESTRUCTION_FLASH_COLOR, t)
      mat.emissive.copy(entry.baseEmissive).lerp(DRONE_DESTRUCTION_FLASH_COLOR, t)
      mat.emissiveIntensity =
        entry.baseEmissiveIntensity + DRONE_DESTRUCTION_FLASH_INTENSITY * t
    }
  }

  /**
   * Advance the procedural death tumble — spin the wrapper around the
   * per-instance axis and drop Y linearly toward the floor. Fires
   * {@link deathDoneCallback} exactly once when the timer expires.
   *
   * @param dt - Frame delta in seconds.
   */
  private tickDeath(dt: number): void {
    this.deathRemaining = Math.max(0, this.deathRemaining - dt)
    const elapsed = DRONE_DEATH_SECONDS - this.deathRemaining
    // Spin via quaternion so the tumble axis isn't decomposed into
    // Euler ordering quirks.
    const angle = DRONE_DEATH_SPIN_SPEED * dt
    const q = new THREE.Quaternion().setFromAxisAngle(this.deathAxis, angle)
    this.group.quaternion.multiplyQuaternions(q, this.group.quaternion)
    // Linear vertical drop.
    const t = elapsed / DRONE_DEATH_SECONDS
    this.group.position.y = this.deathStartY - DRONE_DEATH_DROP_DISTANCE * t
    if (this.deathRemaining <= 0 && this.deathDoneCallback) {
      const cb = this.deathDoneCallback
      this.deathDoneCallback = null
      cb()
    }
  }
}
