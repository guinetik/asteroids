/**
 * Sushi the cat — a roaming NPC inside the habitat module.
 *
 * Loads the rigged Persian cat GLB (`/models/cat.glb`) with all four embedded
 * animations (Idle, Walk, Sit, Run) and runs a small wander state machine so
 * Sushi paces between random waypoints, occasionally sitting down. Built as a
 * standalone Three.js controller so the {@link HabitatInteriorScene} only has
 * to call `await CatController.create(...)`, add the returned group to its
 * scene, and tick the controller every frame.
 *
 * Dedicated to Sushi (R.I.P., 2026).
 *
 * @author guinetik
 * @date 2026-05-06
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

/** Logical wander states for Sushi's behaviour FSM. */
type CatState =
  | 'idle'
  | 'walk'
  | 'sit'
  | 'goToBowl'
  | 'eat'
  | 'follow'
  | 'idleNearPlayer'

/**
 * Live read-only handle the {@link CatController} uses to query Sushi's needs and signal
 * back to the world (Pinia, save game, achievements). The controller never imports stores
 * directly — the host scene/facade owns Pinia access and wires this bridge in.
 *
 * @author guinetik
 * @date 2026-05-07
 * @spec docs/superpowers/specs/2026-05-07-sushi-care-design.md
 */
export interface CatNeedsBridge {
  /** Current hunger value (0..100). Read every frame. */
  getHunger(): number
  /** Current love value (0..100). Read every frame. */
  getLove(): number
  /** Current bowl serving count (0..10). Read every frame. */
  getBowlServings(): number
  /** Write the player's world-space position into `out` and return it for chaining. */
  getPlayerWorldPosition(out: THREE.Vector3): THREE.Vector3
  /** Write the bowl's world-space position into `out` and return it for chaining. */
  getBowlWorldPosition(out: THREE.Vector3): THREE.Vector3
  /**
   * Cat just consumed one serving from the bowl. Implementer is responsible for
   * decrementing `bowlServings` by 1, restoring 25 hunger, and persisting profile.
   */
  onEatServing(): void
  /**
   * Cat got pet. Implementer is responsible for adding 50 love, bumping the lifetime
   * pet counter, persisting profile, and re-evaluating achievements.
   */
  onPetted(): void
}

/** Hunger threshold at or above which Sushi prioritises eating from the bowl. */
const HUNGER_HUNGRY_THRESHOLD = 70
/** Love threshold at or below which Sushi prioritises following the player. */
const LOVE_NEEDY_THRESHOLD = 30
/** Distance (XZ, world units) that counts as "next to the player" when following. */
const FOLLOW_REACHED_DISTANCE = 1.0
/** Seconds Sushi idles next to the player after catching up before re-evaluating priorities. */
const IDLE_NEAR_PLAYER_DURATION_S = 4
/** Seconds Sushi spends sitting at the bowl per consumed serving. */
const EAT_DURATION_S = 2.5

/** Authored clip names embedded in `cat.glb`. */
const CLIP_IDLE = 'Armature|4_Idle_Armature'
const CLIP_WALK = 'Armature|3_Walk_Armature'
const CLIP_SIT = 'Armature|2_Sit_Armature'

/** Target world height of the model along its tallest axis (metres). */
const TARGET_HEIGHT = 0.55

/** Walk speed in world units per second. */
const WALK_SPEED = 0.55

/** How fast the cat yaws toward its current target (radians per second). */
const TURN_RATE = 4.0

/**
 * Maximum heading error (radians) at which the cat is allowed to walk forward. Above this,
 * it pivots in place — keeps the model from sliding sideways through a turn arc.
 */
const WALK_HEADING_TOLERANCE = 0.18

/** Distance (XZ) at which a waypoint counts as reached. */
const WAYPOINT_REACHED_EPS = 0.15

/** Min / max seconds spent in the idle state before picking a new target. */
const IDLE_MIN_S = 3
const IDLE_MAX_S = 8

/** Min / max seconds spent sitting. */
const SIT_MIN_S = 8
const SIT_MAX_S = 18

/** After an idle tick, probability that the next state is "sit" rather than "walk". */
const SIT_CHANCE = 0.25

/** Crossfade duration between animation clips (seconds). */
const CROSSFADE_S = 0.25

/** Axis-aligned XZ rectangle describing a piece of furniture the cat must walk around. */
export interface CatObstacle {
  /** Minimum X (world units). */
  minX: number
  /** Maximum X (world units). */
  maxX: number
  /** Minimum Z (world units). */
  minZ: number
  /** Maximum Z (world units). */
  maxZ: number
}

/** Bounds describing the rectangle Sushi is allowed to wander within (XZ plane). */
export interface CatWanderBounds {
  /** Minimum X (world units). */
  minX: number
  /** Maximum X (world units). */
  maxX: number
  /** Minimum Z (world units). */
  minZ: number
  /** Maximum Z (world units). */
  maxZ: number
  /** Floor Y the cat's feet rest on (world units). */
  floorY: number
  /** Obstacles (e.g. bed, table) the cat must keep clear of. Optional; defaults to none. */
  obstacles?: CatObstacle[]
}

/** Maximum attempts to pick a clean waypoint before falling back to the rejected one. */
const WAYPOINT_MAX_ATTEMPTS = 24

/** Number of heart sprites spawned per pet. */
const PET_HEART_COUNT = 8
/** Lifetime of each heart sprite (seconds). */
const PET_HEART_LIFE_S = 1.4
/** Initial scale of each heart sprite (world units). */
const PET_HEART_SCALE = 0.18
/** Vertical offset above the cat's bounding-box top where hearts spawn (world units). */
const PET_HEART_SPAWN_Y_OFFSET = 0.08
/** Multiplier on the sit duration when triggered by a pet (longer enjoyment). */
const PET_SIT_DURATION_MULT = 1.5
/** Maximum extra upward pitch (radians) applied to Sushi's head bone while being pet. */
const PET_HEAD_LOOK_UP_MAX = 0.6
/** Seconds the head-look fades from animated pose to locked "look up" pose. */
const PET_HEAD_LOOK_FADE_IN_S = 0.18
/** Seconds the head stays fully locked on the petter at full blend. */
const PET_HEAD_LOOK_HOLD_S = 0.5
/** Seconds the head-look fades back into the regular sit animation. */
const PET_HEAD_LOOK_FADE_OUT_S = 0.25
/** Bone-name fragments (lowercase) considered candidates for the head bone. */
const HEAD_BONE_HINTS = ['head', 'skull', 'neck']

/** Local +X axis used as the head-tilt rotation axis. */
const _X_AXIS = new THREE.Vector3(1, 0, 0)

/**
 * Build a single shared canvas-backed heart texture. Drawn once on first use; all heart
 * sprites share the result. Uses two top arcs and a pointed bottom for a classic
 * cartoon-heart silhouette.
 *
 * @returns A Three.js {@link THREE.Texture} containing a pink heart on transparent.
 */
function createHeartTexture(): THREE.Texture {
  const SIZE = 128
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not acquire 2D context for heart texture')
  ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.fillStyle = '#ff5577'
  ctx.strokeStyle = '#a8284a'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(SIZE / 2, SIZE * 0.85)
  ctx.bezierCurveTo(SIZE * 0.15, SIZE * 0.6, SIZE * 0.05, SIZE * 0.25, SIZE * 0.32, SIZE * 0.2)
  ctx.bezierCurveTo(SIZE * 0.45, SIZE * 0.18, SIZE * 0.5, SIZE * 0.32, SIZE * 0.5, SIZE * 0.4)
  ctx.bezierCurveTo(SIZE * 0.5, SIZE * 0.32, SIZE * 0.55, SIZE * 0.18, SIZE * 0.68, SIZE * 0.2)
  ctx.bezierCurveTo(SIZE * 0.95, SIZE * 0.25, SIZE * 0.85, SIZE * 0.6, SIZE / 2, SIZE * 0.85)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Per-particle state for the pet-heart burst. */
interface HeartParticle {
  /** The sprite mesh; parented under {@link HeartParticles.group}. */
  sprite: THREE.Sprite
  /** World-space velocity (units/sec). */
  vel: THREE.Vector3
  /** Seconds since spawn. */
  age: number
}

/**
 * A tiny pool of upward-floating heart sprites used by {@link CatController.pet}.
 * Lives in world space so once spawned the hearts stay where they were emitted —
 * even if Sushi walks off afterwards.
 */
class HeartParticles {
  /** Add this group to the same parent as the cat. Hearts emit in world space. */
  readonly group = new THREE.Group()
  private static cachedTexture: THREE.Texture | null = null
  private readonly particles: HeartParticle[] = []

  /**
   * Lazily build (or fetch) the shared heart texture so multiple cats / petting
   * sessions don't blow up the texture count.
   *
   * @returns A canvas-backed heart texture.
   */
  private static texture(): THREE.Texture {
    if (!HeartParticles.cachedTexture) {
      HeartParticles.cachedTexture = createHeartTexture()
    }
    return HeartParticles.cachedTexture
  }

  /**
   * Emit a burst of hearts at a world position.
   *
   * @param at - World-space spawn point (centre of the burst).
   * @param count - Number of sprites to spawn this burst.
   */
  spawn(at: THREE.Vector3, count: number): void {
    const tex = HeartParticles.texture()
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
      })
      const sprite = new THREE.Sprite(mat)
      sprite.scale.setScalar(PET_HEART_SCALE)
      sprite.position.set(
        at.x + randRange(-0.08, 0.08),
        at.y + randRange(-0.05, 0.1),
        at.z + randRange(-0.08, 0.08),
      )
      const vel = new THREE.Vector3(
        randRange(-0.25, 0.25),
        randRange(0.45, 0.75),
        randRange(-0.25, 0.25),
      )
      this.group.add(sprite)
      this.particles.push({ sprite, vel, age: 0 })
    }
  }

  /**
   * Advance every live heart, fading and drifting upward. Removes expired sprites.
   *
   * @param dt - Seconds since the last frame.
   */
  tick(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      if (!p) continue
      p.age += dt
      if (p.age >= PET_HEART_LIFE_S) {
        this.group.remove(p.sprite)
        ;(p.sprite.material as THREE.SpriteMaterial).dispose()
        this.particles.splice(i, 1)
        continue
      }
      p.sprite.position.x += p.vel.x * dt
      p.sprite.position.y += p.vel.y * dt
      p.sprite.position.z += p.vel.z * dt
      // Slight gravity-style decel so hearts don't fly off forever.
      p.vel.y -= 0.4 * dt
      const t = p.age / PET_HEART_LIFE_S
      ;(p.sprite.material as THREE.SpriteMaterial).opacity = 1 - t
      const scale = PET_HEART_SCALE * (1 + t * 0.4)
      p.sprite.scale.setScalar(scale)
    }
  }

  /** Release every live sprite + its material. */
  dispose(): void {
    for (const p of this.particles) {
      this.group.remove(p.sprite)
      ;(p.sprite.material as THREE.SpriteMaterial).dispose()
    }
    this.particles.length = 0
  }
}

/**
 * Pick a uniformly random number in [min, max].
 *
 * @param min - Lower bound inclusive.
 * @param max - Upper bound inclusive.
 * @returns Random scalar between {@link min} and {@link max}.
 */
function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/**
 * Roaming cat NPC. Construct via {@link CatController.create} so the GLB and its
 * animations finish loading before the controller is handed to the caller.
 *
 * @author guinetik
 * @date 2026-05-06
 */
export class CatController {
  /** The Three.js node to add to the scene. Owns scaling + ground placement. */
  readonly group: THREE.Group

  private readonly mixer: THREE.AnimationMixer
  private readonly actions: Record<'idle' | 'walk' | 'sit', THREE.AnimationAction>
  private bridge: CatNeedsBridge | null = null
  private readonly _bridgeTmp = new THREE.Vector3()
  private readonly bounds: CatWanderBounds
  private readonly obstacles: readonly CatObstacle[]
  private readonly target = new THREE.Vector3()
  private readonly inner: THREE.Object3D
  private readonly _tmpBox = new THREE.Box3()
  private readonly _tmpWorldPos = new THREE.Vector3()
  private readonly heartParticles = new HeartParticles()
  private state: CatState = 'idle'
  private stateTimer = 0
  private stateDuration = 0
  private readonly faceTarget = new THREE.Vector3()
  private faceTargetActive = false
  private headBone: THREE.Bone | null = null
  private readonly headRestQuat = new THREE.Quaternion()
  private headLookBlend = 0
  private headLookTimer = 0
  private headLookActive = false
  private readonly _tmpQuat = new THREE.Quaternion()
  private readonly _tmpQuatTarget = new THREE.Quaternion()
  private readonly _tmpDir = new THREE.Vector3()

  private constructor(
    root: THREE.Group,
    animations: THREE.AnimationClip[],
    bounds: CatWanderBounds,
  ) {
    this.bounds = bounds
    this.obstacles = bounds.obstacles ?? []
    this.group = new THREE.Group()
    this.group.name = 'Sushi'
    this.group.add(root)
    this.inner = root
    this.heartParticles.group.name = 'sushiHearts'

    // Normalize scale so the model reads as a real cat regardless of source units.
    const box = new THREE.Box3().setFromObject(root)
    const size = box.getSize(new THREE.Vector3())
    const tallest = Math.max(size.x, size.y, size.z)
    if (tallest > 0) {
      const s = TARGET_HEIGHT / tallest
      root.scale.setScalar(s)
    }

    // Drop feet to floor.
    root.updateMatrixWorld(true)
    const grounded = new THREE.Box3().setFromObject(root)
    root.position.y -= grounded.min.y

    // Spawn at a random waypoint in bounds.
    const spawn = this.pickWaypoint()
    this.group.position.set(spawn.x, bounds.floorY, spawn.z)
    this.target.copy(spawn)

    this.mixer = new THREE.AnimationMixer(root)
    const findClip = (name: string): THREE.AnimationClip => {
      const clip = animations.find((c) => c.name === name)
      if (!clip) throw new Error(`Cat clip not found: ${name}`)
      return clip
    }
    this.actions = {
      idle: this.mixer.clipAction(findClip(CLIP_IDLE)),
      walk: this.mixer.clipAction(findClip(CLIP_WALK)),
      sit: this.mixer.clipAction(findClip(CLIP_SIT)),
    }
    this.headBone = findHeadBone(root)
    if (this.headBone) {
      // Snapshot rest pose BEFORE the mixer runs — that's what we slerp toward
      // so the head-look override fully replaces the sit clip's head channel
      // instead of stacking on top of its animated wobble.
      this.headRestQuat.copy(this.headBone.quaternion)
    }
    for (const action of Object.values(this.actions)) {
      action.enabled = true
      action.setEffectiveWeight(0)
      action.play()
    }
    this.enterState('idle')
  }

  /**
   * Asynchronously load `cat.glb`, set up the wander FSM, and return a ready controller.
   *
   * @param url - URL of the cat GLB asset (typically `/models/cat.glb`).
   * @param bounds - World-space rectangle the cat may roam within.
   * @returns A loaded {@link CatController}.
   */
  static create(url: string, bounds: CatWanderBounds): Promise<CatController> {
    const loader = new GLTFLoader()
    return new Promise((resolve, reject) => {
      loader.load(
        url,
        (gltf) => {
          const root = gltf.scene
          root.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = false
              child.receiveShadow = false
            }
          })
          resolve(new CatController(root, gltf.animations, bounds))
        },
        undefined,
        reject,
      )
    })
  }

  /**
   * Advance the animation mixer and wander FSM by one frame.
   *
   * @param dt - Delta time in seconds since the last frame.
   */
  tick(dt: number): void {
    this.mixer.update(dt)
    this.heartParticles.tick(dt)
    this.stateTimer += dt

    if (this.state === 'walk') {
      this.tickWalk(dt)
    } else if (this.state === 'goToBowl') {
      this.tickGoToBowl(dt)
    } else if (this.state === 'follow') {
      this.tickFollow(dt)
    } else if (this.state === 'eat') {
      if (this.stateTimer >= this.stateDuration) {
        this.bridge?.onEatServing()
        // Decide what to do next based on fresh needs.
        this.evaluateNeedsAndPickNextState()
      }
    } else if (this.state === 'idleNearPlayer') {
      if (this.stateTimer >= this.stateDuration) {
        this.evaluateNeedsAndPickNextState()
      }
    } else if (this.stateTimer >= this.stateDuration) {
      // Free state (idle expired, or sit expired naturally) — re-check needs first.
      if (!this.evaluateNeedsAndPickNextState()) {
        this.pickNextRestingState()
      }
    }
    // Note: while sitting we deliberately do NOT yaw the body toward the petter —
    // Sushi stays planted exactly where he sat down; only the head bone tilts up
    // (see tickHeadLook). Rotating the body looked like he was scooting around.

    // Re-anchor to floor every frame. Some clips animate the armature's local Y, which
    // can push the visible feet below the bind-pose offset we set on load. Measuring the
    // inner mesh's current world bbox and pulling its lowest point back to floorY keeps
    // Sushi planted no matter which clip is playing.
    this.inner.updateMatrixWorld(true)
    this._tmpBox.setFromObject(this.inner)
    const minY = this._tmpBox.min.y
    if (Number.isFinite(minY)) {
      this.group.position.y += this.bounds.floorY - minY
    }

    this.tickHeadLook(dt)
  }

  /**
   * Layer a small additive pitch on the head bone so Sushi tilts his face up at
   * the petter while sitting. Runs **after** {@link THREE.AnimationMixer.update}
   * (the mixer overwrites bone rotations every frame) so the override sticks.
   * Blends out smoothly when sitting ends, and is a no-op if the rig has no
   * recognisable head bone.
   *
   * @param dt - Delta time in seconds.
   */
  private tickHeadLook(dt: number): void {
    if (!this.headBone) return

    // Drive a one-shot envelope: fade in → hold → fade out → done. Once the
    // envelope expires, the sit clip's own head channel takes over again so we
    // don't pin the head forever — that's why a pet looks like a brief glance up
    // rather than a horror-movie stare.
    if (this.headLookActive) {
      this.headLookTimer += dt
      const fIn = PET_HEAD_LOOK_FADE_IN_S
      const hold = PET_HEAD_LOOK_HOLD_S
      const fOut = PET_HEAD_LOOK_FADE_OUT_S
      if (this.headLookTimer < fIn) {
        this.headLookBlend = this.headLookTimer / fIn
      } else if (this.headLookTimer < fIn + hold) {
        this.headLookBlend = 1
      } else if (this.headLookTimer < fIn + hold + fOut) {
        this.headLookBlend = 1 - (this.headLookTimer - fIn - hold) / fOut
      } else {
        this.headLookBlend = 0
        this.headLookActive = false
      }
    } else {
      this.headLookBlend = 0
    }
    if (this.headLookBlend <= 0.001) return

    // World-space pitch from head bone to face target.
    this.headBone.getWorldPosition(this._tmpDir)
    const dx = this.faceTarget.x - this._tmpDir.x
    const dy = this.faceTarget.y - this._tmpDir.y
    const dz = this.faceTarget.z - this._tmpDir.z
    const horiz = Math.hypot(dx, dz)
    if (horiz < 1e-3) return
    const desiredPitch = Math.min(Math.atan2(dy, horiz), PET_HEAD_LOOK_UP_MAX)

    // Build the locked target pose: rest quaternion + a fixed upward tilt on the
    // bone's local X. Then SLERP from the mixer-set pose toward that target —
    // overriding (not stacking on) the sit clip's head channel, which is what was
    // causing the up/down jitter.
    this._tmpQuat.setFromAxisAngle(_X_AXIS, -desiredPitch)
    this._tmpQuatTarget.copy(this.headRestQuat).multiply(this._tmpQuat)
    this.headBone.quaternion.slerp(this._tmpQuatTarget, this.headLookBlend)
  }

  /**
   * The sibling group that owns the heart particles. Add it to the same parent as
   * {@link group} (typically the scene root) so hearts are emitted in world space and
   * stay where spawned even if Sushi walks away mid-burst.
   */
  get hearts(): THREE.Group {
    return this.heartParticles.group
  }

  /**
   * Write the cat's current world-space head/look-at point into {@link out}. Uses the
   * inner mesh's bounding box so the result tracks the visible body regardless of
   * which animation is playing or where the group origin happens to sit.
   *
   * @param out - Vector to populate.
   * @returns The same {@link out} vector for chaining.
   */
  getLookAtPoint(out: THREE.Vector3): THREE.Vector3 {
    this.inner.updateMatrixWorld(true)
    this._tmpBox.setFromObject(this.inner)
    this._tmpBox.getCenter(out)
    out.y = this._tmpBox.max.y * 0.85 + this._tmpBox.min.y * 0.15
    return out
  }

  /**
   * Trigger the "pet me" reaction: snap to the sit animation, lengthen the sit, and
   * spray a small burst of heart sprites just above Sushi's head. Safe to call any
   * number of times — each call adds a fresh burst on top of whatever is still in
   * flight.
   */
  pet(): void {
    this.bridge?.onPetted()
    this.enterState('sit')
    // Override the default sit duration so a pet keeps Sushi sitting a beat longer.
    this.stateDuration = randRange(SIT_MIN_S * PET_SIT_DURATION_MULT, SIT_MAX_S * PET_SIT_DURATION_MULT)
    this.headLookActive = true
    this.headLookTimer = 0

    // Spawn hearts at the cat's actual visible head, not the group origin — the group
    // sits on the floor so adding a fixed offset misses by ~0.5m on a sitting cat.
    this.inner.updateMatrixWorld(true)
    this._tmpBox.setFromObject(this.inner)
    this._tmpBox.getCenter(this._tmpWorldPos)
    this._tmpWorldPos.y = this._tmpBox.max.y + PET_HEART_SPAWN_Y_OFFSET
    this.heartParticles.spawn(this._tmpWorldPos, PET_HEART_COUNT)
  }

  /**
   * Make Sushi turn his body toward a world-space point while he's sitting.
   * The override is automatically released the moment he leaves the sit state
   * (i.e. when the pet timer expires and he stands up to walk again), so a
   * petter just calls this once after {@link pet} and lets the FSM handle the
   * rest.
   *
   * @param point - World-space point to face (typically the player's head/body).
   */
  lookAt(point: THREE.Vector3): void {
    this.faceTarget.copy(point)
    this.faceTargetActive = true
  }

/**
   * If Sushi is currently sitting, immediately end the sit and pick a new walk
   * waypoint — same path the FSM takes naturally when the sit timer expires.
   * No-op when he's already idling or walking. Used by the habitat to wake him
   * up when the petter wanders too far away.
   */
  endSit(): void {
    if (this.state !== 'sit') return
    this.faceTargetActive = false
    this.headLookActive = false
    this.headLookBlend = 0
    this.pickNextRestingState()
  }

  /** Whether Sushi is currently in the sit state (used by external "leave him alone" checks). */
  get isSitting(): boolean {
    return this.state === 'sit'
  }

  /** Release GPU + animation resources. */
  dispose(): void {
    this.mixer.stopAllAction()
    this.heartParticles.dispose()
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        for (const m of mats) m.dispose()
      }
    })
  }

  // --------------------------------------------------------------------------
  // FSM helpers
  // --------------------------------------------------------------------------

  /**
   * Step the cat toward {@link target}, yawing smoothly. Flips back to "idle" once arrived.
   *
   * @param dt - Delta time in seconds.
   */
  private tickWalk(dt: number): void {
    const dx = this.target.x - this.group.position.x
    const dz = this.target.z - this.group.position.z
    const dist = Math.hypot(dx, dz)

    if (dist < WAYPOINT_REACHED_EPS) {
      this.enterState('idle')
      return
    }

    // Smoothly turn toward target.
    const desiredYaw = Math.atan2(dx, dz)
    const currentYaw = this.group.rotation.y
    const delta = wrapAngle(desiredYaw - currentYaw)
    const turnStep = Math.sign(delta) * Math.min(Math.abs(delta), TURN_RATE * dt)
    this.group.rotation.y = currentYaw + turnStep

    // Only march forward once we're roughly facing the target — otherwise the cat slides
    // along an arc when changing direction. While the heading error is large the body
    // pivots in place; once aligned, it walks straight.
    if (Math.abs(delta) > WALK_HEADING_TOLERANCE) return

    const step = Math.min(WALK_SPEED * dt, dist)
    const yaw = this.group.rotation.y
    this.group.position.x += Math.sin(yaw) * step
    this.group.position.z += Math.cos(yaw) * step
  }

  /**
   * Step the cat toward the bowl, reusing the same pivot-then-walk locomotion. On
   * arrival within {@link WAYPOINT_REACHED_EPS}, drop into the {@link 'eat'} state.
   *
   * @param dt - Delta time in seconds.
   */
  private tickGoToBowl(dt: number): void {
    if (!this.bridge) {
      this.pickNextRestingState()
      return
    }
    this.bridge.getBowlWorldPosition(this._bridgeTmp)
    this.target.set(this._bridgeTmp.x, this.bounds.floorY, this._bridgeTmp.z)
    if (this.stepTowardTarget(dt)) {
      this.enterState('eat')
    }
  }

  /**
   * Step the cat toward the player, reusing pivot-then-walk locomotion. Once within
   * {@link FOLLOW_REACHED_DISTANCE}, drop into {@link 'idleNearPlayer'} for a short stay.
   *
   * @param dt - Delta time in seconds.
   */
  private tickFollow(dt: number): void {
    if (!this.bridge) {
      this.pickNextRestingState()
      return
    }
    this.bridge.getPlayerWorldPosition(this._bridgeTmp)
    this.target.set(this._bridgeTmp.x, this.bounds.floorY, this._bridgeTmp.z)
    const dx = this.target.x - this.group.position.x
    const dz = this.target.z - this.group.position.z
    if (Math.hypot(dx, dz) < FOLLOW_REACHED_DISTANCE) {
      this.enterState('idleNearPlayer')
      return
    }
    this.stepTowardTarget(dt)
  }

  /**
   * Shared pivot-then-walk locomotion used by `walk`, `goToBowl`, and `follow`. Yaws
   * toward {@link target} and only marches forward once heading error is within
   * {@link WALK_HEADING_TOLERANCE}.
   *
   * @param dt - Delta time in seconds.
   * @returns True when the cat has arrived within {@link WAYPOINT_REACHED_EPS}.
   */
  private stepTowardTarget(dt: number): boolean {
    const dx = this.target.x - this.group.position.x
    const dz = this.target.z - this.group.position.z
    const dist = Math.hypot(dx, dz)
    if (dist < WAYPOINT_REACHED_EPS) return true

    const desiredYaw = Math.atan2(dx, dz)
    const currentYaw = this.group.rotation.y
    const delta = wrapAngle(desiredYaw - currentYaw)
    const turnStep = Math.sign(delta) * Math.min(Math.abs(delta), TURN_RATE * dt)
    this.group.rotation.y = currentYaw + turnStep

    if (Math.abs(delta) > WALK_HEADING_TOLERANCE) return false

    const step = Math.min(WALK_SPEED * dt, dist)
    const yaw = this.group.rotation.y
    this.group.position.x += Math.sin(yaw) * step
    this.group.position.z += Math.cos(yaw) * step
    return false
  }

  /**
   * Highest-priority needs check. Returns true if a needs-driven state was entered.
   * Order: hungry+food → goToBowl, needy → follow, otherwise nothing (caller falls
   * back to wander). Never interrupts a sit triggered by {@link pet} — `pet()` calls
   * `enterState('sit')` itself and the FSM clears it via the timer; this method is
   * only invoked from "free" branches in {@link tick}.
   *
   * @returns Whether the cat is now in a needs-driven state.
   */
  private evaluateNeedsAndPickNextState(): boolean {
    const bridge = this.bridge
    if (!bridge) return false
    const hunger = bridge.getHunger()
    const bowl = bridge.getBowlServings()
    if (hunger >= HUNGER_HUNGRY_THRESHOLD && bowl > 0) {
      this.enterState('goToBowl')
      return true
    }
    if (bridge.getLove() <= LOVE_NEEDY_THRESHOLD) {
      this.enterState('follow')
      return true
    }
    return false
  }

  /** Whether the cat is currently busy with a needs-driven errand (suppresses pet prompt). */
  get isBusyWithNeeds(): boolean {
    return (
      this.state === 'goToBowl' ||
      this.state === 'eat' ||
      this.state === 'follow' ||
      this.state === 'idleNearPlayer'
    )
  }

  /** After idling/sitting expires, decide whether to sit longer or set a new walk target. */
  private pickNextRestingState(): void {
    if (this.state === 'idle' && Math.random() < SIT_CHANCE) {
      this.enterState('sit')
      return
    }
    // Pick a fresh waypoint whose straight-line path doesn't cut through any obstacle.
    const fromX = this.group.position.x
    const fromZ = this.group.position.z
    let wp = this.pickWaypoint()
    for (let i = 0; i < WAYPOINT_MAX_ATTEMPTS; i++) {
      if (!this.segmentHitsObstacle(fromX, fromZ, wp.x, wp.z)) break
      wp = this.pickWaypoint()
    }
    this.target.copy(wp)
    this.enterState('walk')
  }

  /**
   * Switch to a new state, crossfading the animation and resetting the timer.
   *
   * @param next - State to enter.
   */
  private enterState(next: CatState): void {
    if (this.state !== next) {
      const fromClip = this.clipForState(this.state)
      const toClip = this.clipForState(next)
      if (fromClip !== toClip) {
        const from = this.actions[fromClip]
        const to = this.actions[toClip]
        to.reset()
        to.setEffectiveWeight(1)
        to.fadeIn(CROSSFADE_S)
        from.fadeOut(CROSSFADE_S)
      }
      this.state = next
      // Leaving sit drops the petter-facing override so the next walk uses its
      // normal heading toward the chosen waypoint.
      if (next !== 'sit') this.faceTargetActive = false
    }
    this.stateTimer = 0
    if (next === 'idle') {
      this.stateDuration = randRange(IDLE_MIN_S, IDLE_MAX_S)
    } else if (next === 'sit') {
      this.stateDuration = randRange(SIT_MIN_S, SIT_MAX_S)
    } else if (next === 'idleNearPlayer') {
      this.stateDuration = IDLE_NEAR_PLAYER_DURATION_S
    } else if (next === 'eat') {
      this.stateDuration = EAT_DURATION_S
    } else {
      // walk / goToBowl / follow run until the waypoint is reached.
      this.stateDuration = Number.POSITIVE_INFINITY
    }
  }

  /**
   * Map every logical state — including the four needs-driven layers — onto the three
   * animation clips embedded in `cat.glb`. New states reuse the existing clips:
   * `goToBowl` and `follow` both walk; `eat` and `idleNearPlayer` both idle.
   *
   * @param state - Logical FSM state.
   * @returns The clip key whose action should play in {@link state}.
   */
  private clipForState(state: CatState): 'idle' | 'walk' | 'sit' {
    switch (state) {
      case 'idle':
      case 'idleNearPlayer':
      case 'eat':
        return 'idle'
      case 'walk':
      case 'goToBowl':
      case 'follow':
        return 'walk'
      case 'sit':
        return 'sit'
    }
  }

  /**
   * Install (or replace) the live needs bridge. Pass `null` to detach — the controller
   * falls back to its baseline wander behaviour when there is no bridge, which keeps
   * unit tests and degraded loads simple.
   *
   * @param bridge - Bridge implementation, or `null` to detach.
   */
  setBridge(bridge: CatNeedsBridge | null): void {
    this.bridge = bridge
  }

  /**
   * Sample a random point inside {@link bounds} that doesn't fall inside an obstacle.
   * Rejection sampling — falls back to the last sample after {@link WAYPOINT_MAX_ATTEMPTS}
   * tries so we always return *something* even in pathological layouts.
   *
   * @returns A vector with X/Z inside bounds and Y at the floor level.
   */
  private pickWaypoint(): THREE.Vector3 {
    let x = 0
    let z = 0
    for (let i = 0; i < WAYPOINT_MAX_ATTEMPTS; i++) {
      x = randRange(this.bounds.minX, this.bounds.maxX)
      z = randRange(this.bounds.minZ, this.bounds.maxZ)
      if (!this.pointInsideObstacle(x, z)) break
    }
    return new THREE.Vector3(x, this.bounds.floorY, z)
  }

  /**
   * Whether the XZ point lies inside any registered obstacle rectangle.
   *
   * @param x - World X.
   * @param z - World Z.
   * @returns True if (x, z) is inside any obstacle.
   */
  private pointInsideObstacle(x: number, z: number): boolean {
    for (const ob of this.obstacles) {
      if (x >= ob.minX && x <= ob.maxX && z >= ob.minZ && z <= ob.maxZ) return true
    }
    return false
  }

  /**
   * Whether the segment (fromX, fromZ) → (toX, toZ) intersects any obstacle rectangle.
   * Uses a slab-clip in 2D — cheap and exact for axis-aligned boxes.
   *
   * @param fromX - Segment start X.
   * @param fromZ - Segment start Z.
   * @param toX - Segment end X.
   * @param toZ - Segment end Z.
   * @returns True if the segment crosses (or touches) any obstacle.
   */
  private segmentHitsObstacle(fromX: number, fromZ: number, toX: number, toZ: number): boolean {
    const dx = toX - fromX
    const dz = toZ - fromZ
    for (const ob of this.obstacles) {
      let tMin = 0
      let tMax = 1
      // X slab
      if (dx === 0) {
        if (fromX < ob.minX || fromX > ob.maxX) continue
      } else {
        const t1 = (ob.minX - fromX) / dx
        const t2 = (ob.maxX - fromX) / dx
        const tEnter = Math.min(t1, t2)
        const tExit = Math.max(t1, t2)
        tMin = Math.max(tMin, tEnter)
        tMax = Math.min(tMax, tExit)
        if (tMin > tMax) continue
      }
      // Z slab
      if (dz === 0) {
        if (fromZ < ob.minZ || fromZ > ob.maxZ) continue
      } else {
        const t1 = (ob.minZ - fromZ) / dz
        const t2 = (ob.maxZ - fromZ) / dz
        const tEnter = Math.min(t1, t2)
        const tExit = Math.max(t1, t2)
        tMin = Math.max(tMin, tEnter)
        tMax = Math.min(tMax, tExit)
        if (tMin > tMax) continue
      }
      return true
    }
    return false
  }
}

/**
 * Walk the rig graph looking for a bone whose lowercase name contains one of the
 * {@link HEAD_BONE_HINTS} fragments. Picks the deepest match so "Head" wins over
 * "Neck" when both exist (the deeper bone is closer to the eyes). Returns null if
 * the rig has no obvious head/neck/skull bone — in that case Sushi just won't tilt.
 *
 * @param root - Skeleton root (the loaded GLTF scene group).
 * @returns The best matching bone, or null.
 */
function findHeadBone(root: THREE.Object3D): THREE.Bone | null {
  let best: THREE.Bone | null = null
  let bestPriority = -1
  let bestDepth = -1
  root.traverse((child) => {
    if (!(child instanceof THREE.Bone)) return
    const lower = child.name.toLowerCase()
    const priority = HEAD_BONE_HINTS.findIndex((hint) => lower.includes(hint))
    if (priority < 0) return
    let depth = 0
    let p: THREE.Object3D | null = child.parent
    while (p) {
      depth++
      p = p.parent
    }
    // Lower priority index = stronger match ("head" before "neck"); break ties by depth.
    if (
      best === null ||
      priority < bestPriority ||
      (priority === bestPriority && depth > bestDepth)
    ) {
      best = child
      bestPriority = priority
      bestDepth = depth
    }
  })
  return best
}

/**
 * Wrap an angle into the range [-π, π].
 *
 * @param a - Input angle in radians.
 * @returns Equivalent angle inside [-π, π].
 */
function wrapAngle(a: number): number {
  let x = a
  while (x > Math.PI) x -= Math.PI * 2
  while (x < -Math.PI) x += Math.PI * 2
  return x
}
