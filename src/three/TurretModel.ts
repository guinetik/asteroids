/**
 * GLB-backed ceiling turret with phase-driven animation playback.
 *
 * Wraps `/models/turret.glb` (one skinned mesh, one 6 s clip named
 * `Armature|ExampleAnim`). The clip is split conceptually into three
 * phases authored end-to-end on a single timeline:
 *
 * - `0 s → 2 s` — deploy (turret drops out of the ceiling).
 * - `2 s → 5 s` — fire pose loop (mid-segment held / replayed while
 *   the controller actually spawns projectiles).
 * - `5 s → 6 s` — retract (turret folds back to the ceiling).
 *
 * This model only drives the *animation* clock; the {@link TurretController}
 * owns the FSM (stowed → deploying → armed → firing → retracting →
 * stowed) and decides which phase the model should run next.
 *
 * @author guinetik
 * @date 2026-05-15
 * @spec docs/space-station-update-gdd.md
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { loadGLB } from '@/three/loadGLB'

/** Asset URL for the optimized turret GLB. */
const TURRET_MODEL_URL = '/models/turret.glb'

/** Clip name authored in Blender. */
const TURRET_CLIP_NAME = 'Armature|ExampleAnim'

/**
 * Debug: lock the turret to a single authored frame of the animation,
 * skip every phase transition, and disable the bone-aim override. Used
 * while we figure out the cannon-bone aim math without the deploy /
 * fire / retract motion getting in the way. Set to `null` to restore
 * the full FSM.
 *
 * The value is *time along the clip*, in seconds. The clip is 6 s and
 * was authored at 24 fps in Blender, so `19 / 24 ≈ 0.792` parks the
 * mixer on Blender frame 19.
 */
const TURRET_STATIC_FRAME_SECONDS: number | null = 19 / 24

/** End of the deploy phase, in seconds along the master clip. */
export const TURRET_DEPLOY_END_SECONDS = 2
/** End of the fire phase, in seconds along the master clip. */
export const TURRET_FIRE_END_SECONDS = 5
/** End of the retract phase (clip duration). */
export const TURRET_RETRACT_END_SECONDS = 6

/**
 * Uniform scale applied to the GLB. Native bbox spans ~6 m vertically;
 * 0.4 makes the deployed turret read at ~2.5 m — large enough to be
 * spotted at distance without forcing the player into trigger range
 * just to confirm what they're looking at.
 */
const TURRET_SCALE = 0.4

/**
 * Multiplier applied to every {@link THREE.MeshStandardMaterial} on the
 * loaded GLB so the turret reads against the dark station interior.
 * `MeshStandardMaterial.color` gets scaled and a faint emissive is
 * added so the silhouette is visible even when the directional light
 * misses the corner.
 */
const TURRET_BASE_BRIGHTNESS = 1.6
/** Emissive grey added on top of the base colour for self-lit pop. */
const TURRET_EMISSIVE_LIGHTNESS = 0.18

/** Asset URL for the authored muzzle-flash GLB. */
const MUZZLE_FLASH_MODEL_URL = '/models/muzzle_flash.glb'
/**
 * Uniform scale applied to the muzzle-flash GLB inside the cannon
 * bone's local frame. The GLB ships at ±72 native units (≈ 144 wide);
 * `0.0085 × 144 × TURRET_SCALE` lands the flash at roughly the cannon
 * muzzle diameter on screen.
 */
const MUZZLE_FLASH_SCALE = 0.0085
/**
 * Offset of the muzzle flash along the cannon-pivot bone's local +Y
 * axis (Blender bone head→tail), in *bone-local* metres. The flash
 * should sit *at* the barrel tip — too large and it reads as a
 * projectile mid-flight instead of a muzzle bloom.
 */
const MUZZLE_FLASH_BONE_OFFSET = 1.3
/** Seconds the muzzle flash stays visible per shot. */
const MUZZLE_FLASH_DURATION = 0.08

/**
 * Clip time (seconds) where the death animation starts playing. The
 * authored timeline puts the retract-into-ceiling motion in the last
 * stretch of the clip; frame 127 at the GLB's 24 fps maps to ≈ 5.29 s,
 * skipping the deploy + fire pose so the death reads as "the turret
 * folds straight back up" rather than re-deploying first.
 */
const DEATH_START_FRAME_SECONDS = 127 / 24

/** Magenta emissive boost when the player lands a bolt on the turret. */
const HIT_FLASH_COLOR = new THREE.Color(0xff00ff)
/** Peak emissive intensity at the moment of impact. */
const HIT_FLASH_INTENSITY = 8
/** Seconds for the magenta flash to decay back to base. */
const HIT_FLASH_DURATION = 0.3

/**
 * White-hot orange the body flares to on the killing-shot frame. Combined
 * with a strong emissive boost in {@link tickDestructionFlash} so the
 * whole turret reads as glowing-from-within, not just tinted.
 */
const DESTRUCTION_FLASH_COLOR = new THREE.Color(0xffd060)
/** Peak emissive intensity at the moment of destruction. */
const DESTRUCTION_FLASH_INTENSITY = 14
/**
 * Seconds the body keeps glowing after the killing shot. Sized to
 * match the controller's 0.2 s pre-fold beat plus a little tail so the
 * glow is still decaying as the model starts folding back.
 */
const DESTRUCTION_FLASH_DURATION = 0.35
/**
 * Peak jitter amplitude (GLB native units, pre-scale) applied to the
 * inner mesh during the destruction beat. The mesh shakes around its
 * baseline position; amplitude decays linearly to zero across
 * {@link DESTRUCTION_SHAKE_DURATION}.
 */
const DESTRUCTION_SHAKE_AMPLITUDE = 0.18
/** Seconds the position jitter runs for. */
const DESTRUCTION_SHAKE_DURATION = 0.2
/**
 * Y offset (in *native* GLB units, pre-scale) used to align the model
 * relative to its wrapper origin. The GLB is authored with its
 * mount-block already near native Y=0 in the stowed frame (the inspect
 * `bboxMax.y` reading we used initially samples the full animation, not
 * the stowed pose). Zero leaves the mount-block flush with the wrapper
 * Y=0 plane; small negative values push the visible turret further
 * below the ceiling.
 */
const TURRET_GLB_TOP_TO_ORIGIN = -0.8

/**
 * Animation phase the model is currently running. The mixer is always
 * playing but with `timeScale = 0` we can "park" on a specific timeline
 * frame; the controller uses this to hold the armed pose at `t = 2 s`
 * between bursts without authoring an extra idle loop.
 */
export type TurretAnimPhase = 'stowed' | 'deploying' | 'fire' | 'retracting'

/**
 * GLB-driven turret visual. Phase transitions are imperative
 * ({@link playDeploy}, {@link playFireLoop}, {@link playRetract},
 * {@link snapStowed}); the controller calls them in response to FSM
 * transitions.
 */
export class TurretModel {
  /** Public scene-graph node — host scene parents this into the corridor. */
  readonly group: THREE.Group

  private inner: THREE.Group | null = null
  private mixer: THREE.AnimationMixer | null = null
  private action: THREE.AnimationAction | null = null
  private loadStarted = false
  private loaded = false
  /** Current phase; defaults to `'stowed'` (paused at clip frame 0). */
  private phase: TurretAnimPhase = 'stowed'
  /** Callback fired exactly once when the most recent non-loop phase ends. */
  private phaseDoneCallback: (() => void) | null = null
  /** Cached `action.time` so we can detect phase completion in {@link tick}. */
  private lastTime = 0
  /**
   * Cannon-pivot bone (`cannonpivot_02` in the rig). Holding a direct
   * reference lets us override its local Y rotation each frame *after*
   * the mixer runs, so the cannon swings to track the player on top of
   * its animated motion. `null` when the GLB hasn't loaded yet or the
   * named bone is missing.
   */
  private cannonBone: THREE.Object3D | null = null
  /** Latest aim target world X. `null` = no override. */
  private aimTargetX: number | null = null
  /** Latest aim target world Z. */
  private aimTargetZ: number | null = null
  /** Reused scratch — world position of the cannon-pivot bone. */
  private readonly _bonePosScratch = new THREE.Vector3()
  /** Reused scratch — world-space lookAt target. */
  private readonly _lookTargetScratch = new THREE.Vector3()
  /** Authored muzzle-flash GLB instance parented to the cannon bone. */
  private muzzleFlash: THREE.Object3D | null = null
  /** Cached references to the flash materials so we can fade opacity. */
  private muzzleFlashMaterials: THREE.MeshBasicMaterial[] = []
  /**
   * Body materials with their author-time snapshots. Captures the
   * post-brighten base colour so the hit-flash can temporarily tint
   * the *diffuse* output toward magenta — an emissive-only flash
   * reads as black on most of the body because the GLB's authored
   * emissive map is black there, so the magenta tint gets multiplied
   * away to nothing.
   */
  private bodyMaterials: Array<{
    material: THREE.MeshStandardMaterial
    baseColor: THREE.Color
    baseEmissive: THREE.Color
    baseEmissiveIntensity: number
  }> = []
  /** Seconds left on the current hit flash. Zero = fully decayed. */
  private hitFlashRemaining = 0
  /** Seconds left on the destruction body-glow. Zero = fully decayed. */
  private destructionFlashRemaining = 0
  /** Seconds left on the destruction position-jitter. Zero = no shake. */
  private destructionShakeRemaining = 0
  /** Baseline `inner.position.y` so the jitter can offset from it cleanly. */
  private innerBaseY = 0
  /** True once the turret entered its death-fall animation. */
  private dying = false
  /** Fired once when the death animation reaches the end of the clip. */
  private deathDoneCallback: (() => void) | null = null
  /** Seconds left on the current muzzle flash. Zero = hidden. */
  private muzzleFlashRemaining = 0

  /**
   * Build an empty wrapper. {@link load} is kicked off automatically.
   */
  constructor() {
    this.group = new THREE.Group()
    this.group.name = 'stationTurret'
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
   * Stream the GLB, build the mixer + action, and park the turret in its
   * stowed pose (clip frame 0). Idempotent.
   */
  async load(): Promise<void> {
    if (this.loadStarted) return
    this.loadStarted = true

    const gltf = await loadAnimatedGLB(TURRET_MODEL_URL)
    const inner = gltf.scene
    // Offset the inner so the top of the bbox sits at the wrapper origin.
    inner.position.set(0, TURRET_GLB_TOP_TO_ORIGIN, 0)
    inner.scale.setScalar(1)
    this.innerBaseY = TURRET_GLB_TOP_TO_ORIGIN
    this.inner = inner
    this.group.add(inner)
    this.group.scale.setScalar(TURRET_SCALE)

    // Brighten the GLB's PBR materials so the turret silhouette reads
    // against the dark station interior. Without this they merge into
    // the ceiling and the player can't spot one until it's already
    // firing on them. We also capture each material's post-brighten
    // emissive snapshot so the hit-flash has a baseline to decay back
    // to without re-traversing the scene every shot.
    inner.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      for (const mat of mats) {
        if (!(mat instanceof THREE.MeshStandardMaterial)) continue
        mat.color.multiplyScalar(TURRET_BASE_BRIGHTNESS)
        mat.emissive.setScalar(TURRET_EMISSIVE_LIGHTNESS)
        mat.emissiveIntensity = 1
        mat.needsUpdate = true
        this.bodyMaterials.push({
          material: mat,
          baseColor: mat.color.clone(),
          baseEmissive: mat.emissive.clone(),
          baseEmissiveIntensity: mat.emissiveIntensity,
        })
      }
    })

    // Locate the cannon-pivot bone so the controller can swing the
    // cannon at runtime on top of the animation. The exporter usually
    // preserves the Blender vertex-group name verbatim; if a future
    // re-export sanitizes punctuation we still match on the prefix.
    inner.traverse((child) => {
      if (this.cannonBone) return
      const name = child.name ?? ''
      if (name === 'cannonpivot_02' || name.startsWith('cannonpivot')) {
        this.cannonBone = child
      }
    })

    // Load + parent the authored muzzle-flash GLB to the cannon bone
    // so the flash follows the barrel's swing automatically. We swap
    // every mesh material for additive `MeshBasicMaterial` so the
    // flash reads bright + glowy regardless of scene lighting, and we
    // rotate the GLB so its authored XY plane is perpendicular to the
    // cannon (the bone's +Y axis), making the texture face the player
    // when looking down the barrel.
    if (this.cannonBone) {
      await this.attachMuzzleFlash(this.cannonBone)
    }

    const clip = gltf.animations.find((c) => c.name === TURRET_CLIP_NAME)
    if (!clip) {
      this.loaded = true
      return
    }
    this.mixer = new THREE.AnimationMixer(inner)
    this.action = this.mixer.clipAction(clip)
    this.action.clampWhenFinished = true
    this.action.setLoop(THREE.LoopRepeat, Infinity)
    this.action.play()
    this.action.paused = true
    this.action.time = TURRET_STATIC_FRAME_SECONDS ?? 0
    this.mixer.update(0)
    this.loaded = true
  }

  /**
   * Place the turret root at a world position + yaw. The GLB's mount
   * point (top of bbox) sits at this position; the deployed turret body
   * hangs below.
   *
   * @param x - World X.
   * @param y - World Y of the ceiling mount.
   * @param z - World Z.
   * @param yaw - World Y rotation (radians).
   */
  placeAt(x: number, y: number, z: number, yaw: number): void {
    this.group.position.set(x, y, z)
    this.group.rotation.set(0, yaw, 0)
  }

  /**
   * Update the turret's yaw so its forward axis points at a world target.
   * Called per frame by the controller so the barrel tracks the player.
   *
   * @param x - Target world X.
   * @param z - Target world Z.
   */
  faceWorldXZ(x: number, z: number): void {
    this.aimTargetX = x
    this.aimTargetZ = z
  }

  /** Clear any active aim override so the bone falls back to its animated pose. */
  clearAim(): void {
    this.aimTargetX = null
    this.aimTargetZ = null
  }

  /**
   * Pop the muzzle-flash quad for a single shot. Independent of the
   * mixer / FSM — the controller calls this every time it spawns a
   * dart so the player sees a visible cue even when the projectile
   * leaves the screen instantly.
   */
  flashMuzzle(): void {
    this.muzzleFlashRemaining = MUZZLE_FLASH_DURATION
    if (this.muzzleFlash) this.muzzleFlash.visible = true
  }

  /**
   * Pulse the body materials toward magenta for {@link HIT_FLASH_DURATION}
   * seconds. Called by the controller every time the player's bolt
   * connects, so the player sees a consistent magenta hit confirmation
   * matching the LSR weapon mode's bolt colour.
   */
  flashHitTaken(): void {
    this.hitFlashRemaining = HIT_FLASH_DURATION
  }

  /**
   * Kick off the destruction-beat visuals: body flares white-hot orange
   * and the inner mesh jitters violently around its baseline position.
   * The controller calls this on the killing-shot frame, in parallel
   * with the brief pre-fold delay, so the model itself reads as
   * "popping" before it starts folding back into the ceiling.
   */
  flashDestruction(): void {
    this.destructionFlashRemaining = DESTRUCTION_FLASH_DURATION
    this.destructionShakeRemaining = DESTRUCTION_SHAKE_DURATION
    // Cancel any in-flight hit flash so the magenta tint doesn't fight
    // the destruction glow; the destruction colour wins this frame.
    this.hitFlashRemaining = 0
  }

  /**
   * Start the death "fall back into the ceiling" sequence. Unparks the
   * mixer from its static debug frame and lets the action run forward
   * to the end of the clip. The supplied callback fires exactly once
   * when the clip reaches its retract-end so the director can spawn
   * VFX + dispose the turret.
   *
   * @param onDone - Callback fired when the death animation finishes.
   */
  playDeathSequence(onDone: () => void): void {
    this.dying = true
    this.deathDoneCallback = onDone
    this.clearAim()
    if (!this.action || !this.mixer) {
      onDone()
      return
    }
    // Switch from the default LoopRepeat (which wraps action.time back
    // to 0 before our tick can clamp on it) to a single playthrough,
    // and listen for the mixer's `finished` event so we fire `onDone`
    // exactly once regardless of frame timing.
    this.action.setLoop(THREE.LoopOnce, 1)
    this.action.clampWhenFinished = true
    this.action.paused = false
    // 2.5× playback so the ceiling-fold reads as a punchy "the turret
    // got popped" beat rather than a slow gracious bow. Tune by feel.
    this.action.timeScale = 1.5
    // Seek straight to the retract motion at the tail of the clip —
    // playing from the static debug frame walks back through the
    // deploy pose first, which reads as a wind-up rather than a
    // death. Frame 127 (≈ 5.29 s) skips deploy + fire pose.
    this.action.time = Math.min(DEATH_START_FRAME_SECONDS, TURRET_RETRACT_END_SECONDS - 0.01)
    const mixer = this.mixer
    const listener = (event: { action: THREE.AnimationAction }): void => {
      if (event.action !== this.action) return
      mixer.removeEventListener('finished', listener)
      const cb = this.deathDoneCallback
      this.deathDoneCallback = null
      cb?.()
    }
    mixer.addEventListener('finished', listener)
  }

  /**
   * Snap the clip to frame 0 (stowed against the ceiling) and freeze.
   */
  snapStowed(): void {
    this.phase = 'stowed'
    this.phaseDoneCallback = null
    this.clearAim()
    if (!this.action) return
    if (TURRET_STATIC_FRAME_SECONDS !== null) {
      this.action.time = TURRET_STATIC_FRAME_SECONDS
      this.action.paused = true
      this.lastTime = TURRET_STATIC_FRAME_SECONDS
      this.mixer?.update(0)
      return
    }
    this.action.time = 0
    this.action.paused = true
    this.lastTime = 0
    this.mixer?.update(0)
    if (this.cannonBone) this.cannonBone.rotation.y = 0
  }

  /**
   * Start playing the deploy segment (clip frames 0 → 2 s). When the
   * segment finishes, {@link tick} fires `onDone` exactly once.
   *
   * @param onDone - Optional callback fired once deploy reaches 2 s.
   */
  playDeploy(onDone?: () => void): void {
    this.phase = 'deploying'
    this.phaseDoneCallback = onDone ?? null
    if (!this.action) return
    if (TURRET_STATIC_FRAME_SECONDS !== null) {
      this.parkStatic()
      // Fire the callback on the next frame so the controller still
      // transitions to its post-deploy state (armed → firing).
      queueMicrotask(() => this.firePhaseDone())
      return
    }
    this.action.time = 0
    this.action.paused = false
    this.action.timeScale = 1
    this.lastTime = 0
  }

  /**
   * Hold on the armed pose at the start of the fire segment. The
   * controller calls this between bursts so the visual doesn't replay
   * the deploy each shot. Implementation: park at `t = 2 s` with the
   * action paused.
   */
  holdArmed(): void {
    this.phase = 'fire'
    this.phaseDoneCallback = null
    if (!this.action) return
    if (TURRET_STATIC_FRAME_SECONDS !== null) {
      this.parkStatic()
      return
    }
    this.action.time = TURRET_DEPLOY_END_SECONDS
    this.action.paused = true
    this.lastTime = TURRET_DEPLOY_END_SECONDS
    this.mixer?.update(0)
  }

  /**
   * Loop the fire segment (clip frames 2 → 5 s) while the controller is
   * actively firing. The model itself doesn't spawn projectiles — it just
   * runs the visual loop. Loops by wrapping in {@link tick}.
   */
  playFireLoop(): void {
    this.phase = 'fire'
    this.phaseDoneCallback = null
    if (!this.action) return
    if (TURRET_STATIC_FRAME_SECONDS !== null) {
      this.parkStatic()
      return
    }
    if (this.action.time < TURRET_DEPLOY_END_SECONDS) {
      this.action.time = TURRET_DEPLOY_END_SECONDS
    }
    this.action.paused = false
    this.action.timeScale = 1
    this.lastTime = this.action.time
  }

  /**
   * Start playing the retract segment (clip frames 5 → 6 s). When the
   * segment finishes, {@link tick} snaps back to stowed and fires
   * `onDone` exactly once.
   *
   * @param onDone - Optional callback fired once retract finishes.
   */
  playRetract(onDone?: () => void): void {
    this.phase = 'retracting'
    this.phaseDoneCallback = onDone ?? null
    if (!this.action) return
    if (TURRET_STATIC_FRAME_SECONDS !== null) {
      this.parkStatic()
      queueMicrotask(() => this.firePhaseDone())
      return
    }
    this.action.time = TURRET_FIRE_END_SECONDS
    this.action.paused = false
    this.action.timeScale = 1
    this.lastTime = TURRET_FIRE_END_SECONDS
  }

  /**
   * Per-frame update. Advances the mixer, enforces phase boundaries
   * (clamp at end of deploy/retract, wrap during fire loop), and fires
   * the one-shot phase-done callback.
   *
   * @param dt - Frame delta in seconds.
   */
  tick(dt: number): void {
    this.tickMuzzleFlash(dt)
    this.tickHitFlash(dt)
    this.tickDestructionFlash(dt)
    this.tickDestructionShake(dt)
    if (!this.mixer || !this.action) return
    if (this.dying) {
      // Death sequence: let the mixer advance naturally to the end of
      // the clip. No aim override (cannon falls limp). No static park.
      // Completion is fired by the mixer's `finished` event registered
      // in {@link playDeathSequence}; nothing to clamp here.
      this.action.paused = false
      this.mixer.update(dt)
      return
    }
    if (TURRET_STATIC_FRAME_SECONDS !== null) {
      // Static debug: park the mixer on the chosen frame each tick so
      // the deployed pose never drifts, then layer the cannon-bone aim
      // on top so the cannon still tracks the player.
      this.action.paused = true
      this.action.time = TURRET_STATIC_FRAME_SECONDS
      this.mixer.update(0)
      this.applyCannonAim()
      return
    }
    if (this.action.paused) return
    this.mixer.update(dt)
    const t = this.action.time
    switch (this.phase) {
      case 'deploying':
        if (t >= TURRET_DEPLOY_END_SECONDS) {
          this.action.time = TURRET_DEPLOY_END_SECONDS
          this.action.paused = true
          this.firePhaseDone()
        }
        break
      case 'fire':
        if (t >= TURRET_FIRE_END_SECONDS) {
          this.action.time = TURRET_DEPLOY_END_SECONDS + (t - TURRET_FIRE_END_SECONDS)
        }
        break
      case 'retracting':
        if (t >= TURRET_RETRACT_END_SECONDS) {
          this.action.time = 0
          this.action.paused = true
          this.phase = 'stowed'
          this.firePhaseDone()
        }
        break
      case 'stowed':
        break
    }
    this.lastTime = this.action.time
    this.applyCannonAim()
  }

  /**
   * Overwrite the cannon-pivot bone's local rotation so the cannon
   * points at the latched aim target. Runs after `mixer.update` so the
   * animation channel sets the value first and we layer the player
   * tracking on top. No-op when no aim target is set, the bone is
   * missing, or the turret is fully stowed (so the stowed pose isn't
   * twisted into the ceiling).
   */
  private applyCannonAim(): void {
    if (!this.cannonBone) return
    if (this.aimTargetX === null || this.aimTargetZ === null) return
    if (this.phase === 'stowed') return
    // `lookAt` orients the bone so its local -Z faces the target, but
    // Blender exports bones with their local +Y along the bone (cannon
    // length). Without the rotateX fix below, lookAt forces the
    // cannon's +Y axis vertical (cannon pointing at the ceiling).
    // Rotating an extra -π/2 around the bone's local X realigns the
    // bone so +Y ends up where -Z was — i.e. the cannon barrel points
    // at the target. If the barrel ends up 180° wrong, flip the sign.
    this.cannonBone.getWorldPosition(this._bonePosScratch)
    this._lookTargetScratch.set(this.aimTargetX, this._bonePosScratch.y, this.aimTargetZ)
    this.cannonBone.lookAt(this._lookTargetScratch)
    this.cannonBone.rotateX(Math.PI / 2)
  }

  /** Current animation phase. */
  getPhase(): TurretAnimPhase {
    return this.phase
  }

  /** Release GPU resources owned by the GLB subtree. */
  dispose(): void {
    if (this.mixer) {
      this.mixer.stopAllAction()
      this.mixer.uncacheRoot(this.inner!)
    }
    if (this.inner) {
      this.inner.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose()
          const mats = Array.isArray(child.material) ? child.material : [child.material]
          for (const m of mats) if (m instanceof THREE.Material) m.dispose()
        }
      })
    }
  }

  /**
   * Stream the authored muzzle-flash GLB, swap every mesh material for
   * an additive `MeshBasicMaterial`, scale and orient the result so it
   * reads as a barrel-tip flash, and parent it under the cannon bone
   * so it follows the cannon's swing for free.
   *
   * @param bone - The cannon pivot bone to parent the flash under.
   */
  private async attachMuzzleFlash(bone: THREE.Object3D): Promise<void> {
    const flash = await loadGLB(MUZZLE_FLASH_MODEL_URL)
    const materials: THREE.MeshBasicMaterial[] = []
    flash.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const sourceMats = Array.isArray(child.material) ? child.material : [child.material]
      const replaced: THREE.MeshBasicMaterial[] = []
      for (const original of sourceMats) {
        const map =
          original instanceof THREE.MeshStandardMaterial ||
          original instanceof THREE.MeshBasicMaterial
            ? original.map
            : null
        const mat = new THREE.MeshBasicMaterial({
          map,
          color: 0xffd07a,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          depthTest: false,
          side: THREE.DoubleSide,
        })
        replaced.push(mat)
        materials.push(mat)
      }
      child.material = replaced.length === 1 ? replaced[0]! : replaced
    })
    flash.scale.setScalar(MUZZLE_FLASH_SCALE)
    flash.position.set(0, MUZZLE_FLASH_BONE_OFFSET, 0)
    // GLB is authored in the XY plane (normal +Z). Rotate so its plane
    // is perpendicular to the cannon (the bone's +Y), facing forward.
    flash.rotation.set(Math.PI / 2, 0, 0)
    flash.visible = false
    bone.add(flash)
    this.muzzleFlash = flash
    this.muzzleFlashMaterials = materials
  }

  /**
   * Park the mixer on the static debug frame. Used by every phase API
   * when {@link TURRET_STATIC_FRAME_SECONDS} is set so the turret holds
   * a single authored pose regardless of FSM transitions.
   */
  private parkStatic(): void {
    if (!this.action) return
    const t = TURRET_STATIC_FRAME_SECONDS ?? 0
    this.action.time = t
    this.action.paused = true
    this.lastTime = t
    this.mixer?.update(0)
  }

  /**
   * Per-frame muzzle-flash fade. The flash uses additive blending so
   * a linear ramp on `opacity` reads as a sharp pop followed by a
   * quick decay back to invisible. Always runs, even in static mode,
   * so the muzzle cue plays regardless of FSM state.
   */
  /**
   * Per-frame hit-flash decay. Lerps every body material's *diffuse*
   * colour from magenta back to its captured baseline, AND boosts
   * emissive on top so the body reads as magenta even in shadow.
   * Flashing only emissive is invisible on the turret body because
   * the GLB ships with a black emissive map — `mat.emissive` is
   * multiplied by that map and vanishes everywhere except the screen
   * panels. Tinting the diffuse `color` instead piggybacks on the
   * (bright) base-colour texture and reads on every surface.
   */
  private tickHitFlash(dt: number): void {
    if (this.hitFlashRemaining <= 0 || this.bodyMaterials.length === 0) return
    this.hitFlashRemaining = Math.max(0, this.hitFlashRemaining - dt)
    const t = this.hitFlashRemaining / HIT_FLASH_DURATION
    for (const entry of this.bodyMaterials) {
      const mat = entry.material
      mat.color.copy(entry.baseColor).lerp(HIT_FLASH_COLOR, t)
      mat.emissive.copy(entry.baseEmissive).lerp(HIT_FLASH_COLOR, t)
      mat.emissiveIntensity = entry.baseEmissiveIntensity + HIT_FLASH_INTENSITY * t
    }
  }

  /**
   * Per-frame body white-hot glow during the destruction beat. Mirrors
   * the hit-flash decay but uses a hotter colour + bigger emissive
   * boost, and ignores hit-flash state — destruction wins.
   */
  private tickDestructionFlash(dt: number): void {
    if (this.destructionFlashRemaining <= 0 || this.bodyMaterials.length === 0) return
    this.destructionFlashRemaining = Math.max(0, this.destructionFlashRemaining - dt)
    const t = this.destructionFlashRemaining / DESTRUCTION_FLASH_DURATION
    for (const entry of this.bodyMaterials) {
      const mat = entry.material
      mat.color.copy(entry.baseColor).lerp(DESTRUCTION_FLASH_COLOR, t)
      mat.emissive.copy(entry.baseEmissive).lerp(DESTRUCTION_FLASH_COLOR, t)
      mat.emissiveIntensity = entry.baseEmissiveIntensity + DESTRUCTION_FLASH_INTENSITY * t
    }
  }

  /**
   * Per-frame jitter applied to the inner mesh's local position during
   * the destruction beat. Amplitude decays linearly to zero. When the
   * timer finishes, the position snaps back to its baseline so the
   * fold-back animation starts from a clean pose.
   */
  private tickDestructionShake(dt: number): void {
    if (!this.inner || this.destructionShakeRemaining <= 0) return
    this.destructionShakeRemaining = Math.max(0, this.destructionShakeRemaining - dt)
    const t = this.destructionShakeRemaining / DESTRUCTION_SHAKE_DURATION
    const amp = DESTRUCTION_SHAKE_AMPLITUDE * t
    if (amp <= 0) {
      this.inner.position.set(0, this.innerBaseY, 0)
      return
    }
    this.inner.position.set(
      (Math.random() - 0.5) * 2 * amp,
      this.innerBaseY + (Math.random() - 0.5) * 2 * amp,
      (Math.random() - 0.5) * 2 * amp,
    )
  }

  private tickMuzzleFlash(dt: number): void {
    if (!this.muzzleFlash || this.muzzleFlashRemaining <= 0) return
    this.muzzleFlashRemaining = Math.max(0, this.muzzleFlashRemaining - dt)
    const opacity = this.muzzleFlashRemaining / MUZZLE_FLASH_DURATION
    for (const mat of this.muzzleFlashMaterials) mat.opacity = opacity
    if (this.muzzleFlashRemaining <= 0) this.muzzleFlash.visible = false
  }

  private firePhaseDone(): void {
    const cb = this.phaseDoneCallback
    this.phaseDoneCallback = null
    cb?.()
  }
}

/**
 * Minimal GLTF loader that returns both the scene and the animation
 * clips. {@link loadGLB} discards `gltf.animations`, so we re-implement
 * the slice we need rather than fork that helper.
 *
 * @param url - Public URL of the GLB.
 * @returns `{ scene, animations }` pair.
 */
function loadAnimatedGLB(
  url: string,
): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
    loader.load(
      url,
      (gltf) => {
        resolve({ scene: gltf.scene, animations: gltf.animations })
      },
      undefined,
      reject,
    )
  })
}
