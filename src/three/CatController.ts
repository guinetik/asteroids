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
import { clone as cloneSkinnedScene } from 'three/addons/utils/SkeletonUtils.js'

/** Logical wander states for Sushi's behaviour FSM. */
export type CatState =
  | 'idle'
  | 'walk'
  | 'sit'
  | 'goToBowl'
  | 'eat'
  | 'follow'
  | 'idleNearPlayer'
  | 'chase'
  | 'chaseRest'
  | 'goToLitter'
  | 'useLitter'
  | 'goToHouse'
  | 'sleeping'
  | 'goToBedSide'
  | 'jumpOnBed'
  | 'sitOnBed'
  | 'jumpOffBed'
  | 'goToSideboard'
  | 'jumpOnSideboard'
  | 'walkSideboardTop'
  | 'sitOnSideboard'
  | 'jumpOffSideboard'
  | 'goToLocker'
  | 'jumpOnLocker'
  | 'sitOnLocker'
  | 'jumpOffLocker'
  | 'goToTable'
  | 'jumpOnTable'
  | 'sitOnTable'
  | 'jumpOffTable'
  | 'goToTower'
  | 'jumpOnTower'
  | 'sitOnTower'
  | 'jumpOffTower'

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
  /** Current bladder value (0..100). Read every frame. */
  getBladder(): number
  /** Current litterbox waste-chunk count (0..LITTER_POLLUTION_MAX). When at the cap,
   * Sushi refuses to use the box and begs the player to clean it. */
  getLitterPollution(): number
  /** Current tiredness value (0..100). Read every frame. */
  getTired(): number
  /** Apply a tiredness delta (positive while chasing, ignored when result clamps). */
  addTired(delta: number): void
  /** Apply a hunger delta (positive while chasing the laser to burn calories). */
  addHunger(delta: number): void
  /** Write the player's world-space position into `out` and return it for chaining. */
  getPlayerWorldPosition(out: THREE.Vector3): THREE.Vector3
  /** Write the bowl's world-space position into `out` and return it for chaining. */
  getBowlWorldPosition(out: THREE.Vector3): THREE.Vector3
  /** Write the litterbox's world-space position into `out` and return it for chaining. */
  getLitterWorldPosition(out: THREE.Vector3): THREE.Vector3
  /** Write the cat house's world-space position into `out` and return it for chaining. */
  getHouseWorldPosition(out: THREE.Vector3): THREE.Vector3
  /**
   * Write the world-space "approach" point directly in front of the cat house entry
   * into `out` and return it. Used by {@link tickGoToHouse} as a two-phase waypoint
   * so Sushi lines up perpendicular to the entry instead of cutting in diagonally.
   */
  getHouseApproachWorldPosition(out: THREE.Vector3): THREE.Vector3
  /**
   * Cat just consumed one serving from the bowl. Implementer is responsible for
   * decrementing `bowlServings` by 1, restoring 25 hunger, and persisting profile.
   */
  onEatServing(): void
  /**
   * Cat got pet. Implementer is responsible for adding the per-pet love bump, bumping
   * the lifetime pet counter, persisting profile, and re-evaluating achievements.
   */
  onPetted(): void
  /**
   * Cat just pounced on the laser dot (transitioned into `chaseRest`). Implementer adds
   * a small love bump per catch and persists. Fires once per pounce, not per frame.
   */
  onCaughtLaser?(): void
  /**
   * Cat finished using the litterbox. Implementer should reset `sushiBladder` to 0
   * and persist the profile.
   */
  onUsedLitter(): void
  /** Cat just woke up from a nap — implementer resets `sushiTired` to 0 and saves. */
  onWoke(): void
  /**
   * Number of distinct approach waypoints around the bed (e.g. foot, long side, head).
   * Zero or omitted disables bed-jumping behaviour.
   */
  getBedSideCount?(): number
  /**
   * Write the world-space approach point for a given bed side index into `out` and
   * return it. The cat walks here before leaping onto the mattress.
   */
  getBedApproachWorldPosition?(sideIndex: number, out: THREE.Vector3): THREE.Vector3
  /**
   * Write the world-space mattress-top centre into `out` and return it. The cat
   * lerps onto this point during {@link 'jumpOnBed'} and sits here.
   */
  getBedTopWorldPosition?(out: THREE.Vector3): THREE.Vector3
  /** Number of sideboard approach points available for the "jump beside lamp" perch beat. */
  getSideboardSideCount?(): number
  /**
   * Write the world-space approach point for the sideboard perch into `out`.
   * Sushi walks here before hopping onto the sideboard top.
   */
  getSideboardApproachWorldPosition?(sideIndex: number, out: THREE.Vector3): THREE.Vector3
  /**
   * Write the world-space sideboard-top perch point beside the moon lamp into `out`.
   * Sushi lerps here during {@link 'jumpOnSideboard'}, then pads farther along the
   * top before sitting.
   */
  getSideboardTopWorldPosition?(out: THREE.Vector3): THREE.Vector3
  /**
   * Write the sideboard-top final sitting point into `out`. Sushi pads here after
   * hopping up, so he ends on the opposite side of the moon lamp before sitting.
   */
  getSideboardSitWorldPosition?(out: THREE.Vector3): THREE.Vector3
  /** Number of locker approach points available for the compact locker perch beat. */
  getLockerSideCount?(): number
  /**
   * Write the world-space approach point in front of the locker into `out`.
   * Sushi walks here before hopping onto the locker top.
   */
  getLockerApproachWorldPosition?(sideIndex: number, out: THREE.Vector3): THREE.Vector3
  /**
   * Write the world-space locker-top sit point into `out`. Sushi jumps straight
   * here, rotates toward the cabin, and sits without a top-walk phase.
   */
  getLockerTopWorldPosition?(out: THREE.Vector3): THREE.Vector3
  /** Number of shuttle-control table approach points available for the table-top perch. */
  getTableSideCount?(): number
  /**
   * Write the world-space approach point in front of the shuttle-control table into `out`.
   * Sushi walks here before hopping onto the table top.
   */
  getTableApproachWorldPosition?(sideIndex: number, out: THREE.Vector3): THREE.Vector3
  /**
   * Write the world-space table-top sit point into `out`. Sushi jumps here,
   * rotates back toward the cabin, and sits above the shuttle controls.
   */
  getTableTopWorldPosition?(out: THREE.Vector3): THREE.Vector3
  /**
   * Number of cat-tower approach points available for the dedicated climbing-tower perch.
   * Zero or omitted disables the tower beat (e.g. when the appliance isn't purchased).
   */
  getTowerSideCount?(): number
  /**
   * Write the world-space approach point in front of the cat tower into `out`.
   * Sushi walks here before hopping onto the top platform.
   */
  getTowerApproachWorldPosition?(sideIndex: number, out: THREE.Vector3): THREE.Vector3
  /**
   * Write the world-space top-platform sit point on the cat tower into `out`. Sushi
   * leaps here, faces back into the cabin, and hangs out longer than other perches.
   */
  getTowerTopWorldPosition?(out: THREE.Vector3): THREE.Vector3
  /**
   * Cat finished a tower hangout. Implementer should add a small love bump (the tower
   * is the dedicated cat appliance and is the only perch that rewards the player).
   * Fires once per visit, not per frame.
   */
  onUsedTower?(): void
  /**
   * Cat just entered the sleeping state. Implementer should swap the live cat for the
   * baked sleeping clone (hide the live group, show the static curled-up mesh inside
   * the cat house). Called both for organic sleep transitions and for `rollInitialSleep`.
   */
  onSleepEnter?(): void
  /**
   * Cat just left the sleeping state. Implementer reverses the swap — hide the baked
   * sleeping clone and show the live, animated cat at its current world position.
   */
  onSleepExit?(): void
}

/** Hunger threshold at or below which Sushi prioritises eating from the bowl
 * (matches love semantics: 100 = full, 0 = starving). */
const HUNGER_HUNGRY_THRESHOLD = 30
/** Hunger threshold at or above which Sushi stops chaining servings and walks off.
 * While at the bowl with food remaining, he keeps eating until hunger ≥ this. */
const HUNGER_SATISFIED_THRESHOLD = 95
/** Love threshold at or below which Sushi prioritises following the player. */
const LOVE_NEEDY_THRESHOLD = 30
/**
 * Bladder threshold at or above which Sushi prioritises a litterbox visit. Highest
 * priority among needs — overrides hunger and love.
 */
const BLADDER_FULL_THRESHOLD = 70
/**
 * Litter pollution chunk count at or above which Sushi refuses to enter the box and
 * follows the player instead, begging for it to be emptied. Matches
 * `LITTER_POLLUTION_MAX` in the player profile so the box visually appears full.
 */
const LITTER_POLLUTION_REFUSE_THRESHOLD = 6
/**
 * Tiredness threshold at or above which Sushi heads back to the cat house and naps,
 * preempting the laser pointer chase as well as every non-sleep need.
 */
const TIRED_FULL_THRESHOLD = 80
/** Tired units added per second of laser-pointer chase (≈ 25s of sprinting fills the meter). */
const TIRED_RISE_PER_CHASE_SEC = 4
/** Hunger units burned per second of laser-pointer chase — sprinting drops the
 * meter toward zero (semantics: 100 = full, 0 = starving). */
const HUNGER_BURN_PER_CHASE_SEC = 2
/** Seconds between independent wake-up rolls while Sushi is sleeping in the cat house. */
const SLEEP_WAKE_POLL_INTERVAL_S = 2
/**
 * Probability per {@link SLEEP_WAKE_POLL_INTERVAL_S} of waking up. With a 2 s
 * poll and 0.04 chance, the expected nap length is ~50 s — long enough that the
 * player actually catches Sushi sleeping if they walk in mid-nap.
 */
const SLEEP_WAKE_PROBABILITY = 0.04
/** Probability that Sushi starts a fresh habitat session already asleep in the cat house. */
const SLEEP_INITIAL_PROBABILITY = 0.5
/** Mesh-name fragment used to identify the eyeball mesh on the sleeping clone so we
 * can hide it (the surrounding eyelid bones already form a closed-lid silhouette). */
const SLEEPING_EYE_MESH_NAME_FRAGMENT = 'eye'
/** Distance (XZ, world units) that counts as "next to the player" when following. */
const FOLLOW_REACHED_DISTANCE = 1.0
/** Seconds Sushi idles next to the player after catching up before re-evaluating priorities. */
const IDLE_NEAR_PLAYER_DURATION_S = 4
/** Seconds Sushi spends sitting at the bowl per consumed serving. */
const EAT_DURATION_S = 5
/** Seconds Sushi spends sitting in the litterbox per use. */
const LITTER_USE_DURATION_S = 4

/**
 * Probability that {@link pickNextRestingState} picks "jump on the bed" instead of a
 * regular wander walk. Tuned so the player catches Sushi on the bed every few minutes
 * of habitat time without it dominating his roam pattern.
 */
const BED_JUMP_CHANCE = 0.25
/**
 * Probability that {@link pickNextRestingState} picks the sideboard lamp perch.
 * Kept lower than the bed beat because the sideboard is a narrower, more special
 * staging spot and should read as a treat when the player catches it.
 */
const SIDEBOARD_JUMP_CHANCE = 0.16
/**
 * Final sideboard sit yaw (radians). `0` faces +Z, toward the cabin/player side
 * of the hatch-wall furniture run, after Sushi pads past the lamp.
 */
const SIDEBOARD_SIT_YAW = 0
/**
 * Probability that {@link pickNextRestingState} picks the compact locker perch.
 * Lower than the wider bed beat because the locker is a tight, one-pose perch.
 */
const LOCKER_JUMP_CHANCE = 0.14
/**
 * Final locker sit yaw (radians). `-π/2` faces -X, back into the cabin from the
 * locker's +X wall position.
 */
const LOCKER_SIT_YAW = -Math.PI / 2
/**
 * Probability that {@link pickNextRestingState} picks the shuttle-control table perch.
 * Kept as a rare cockpit beat because the shuttle-control table is visually busy.
 */
const TABLE_JUMP_CHANCE = 0.12
/**
 * Final table sit yaw (radians). `π` faces -Z, back into the cabin from the cockpit table.
 */
const TABLE_SIT_YAW = Math.PI
/**
 * Probability that {@link pickNextRestingState} picks the cat tower perch when the
 * appliance is installed. Rolled first and tuned high so the dedicated climbing tower
 * clearly outcompetes the ambient furniture beats — the player paid for it, the cat
 * should reward them with a visible preference for using it.
 */
const TOWER_JUMP_CHANCE = 0.4
/**
 * Final tower sit yaw (radians). `-π/2` faces -X, back into the cabin from the
 * tower's +X wall position next to the locker.
 */
const TOWER_SIT_YAW = -Math.PI / 2
/**
 * Seconds the leap-up and leap-down lerps take. Short enough to read as a hop rather
 * than a glide, long enough that the parabolic arc is visible.
 */
const BED_JUMP_DURATION_S = 0.45
/** Peak height (world units) added on top of the linear Y lerp during a bed jump arc. */
const BED_JUMP_ARC_HEIGHT = 0.18
/**
 * Seconds Sushi sits on top of the bed before hopping back down. Long enough that the
 * player can grab a screenshot and his presence reads as a deliberate hangout.
 */
const SIT_ON_BED_DURATION_S = 14
/** Seconds Sushi sits beside the moon lamp on the sideboard before hopping down. */
const SIT_ON_SIDEBOARD_DURATION_S = 12
/** Seconds Sushi sits on top of the locker before hopping down. */
const SIT_ON_LOCKER_DURATION_S = 11
/** Seconds Sushi sits above the shuttle-control table before hopping down. */
const SIT_ON_TABLE_DURATION_S = 11
/**
 * Seconds Sushi sits on top of the cat tower before hopping down. Longer than the
 * ambient furniture perches because the tower is the dedicated cat appliance — the
 * player paid for a real hangout spot and Sushi treats it like one.
 */
const SIT_ON_TOWER_DURATION_S = 16

/** Authored clip names embedded in `cat.glb`. */
const CLIP_IDLE = 'Armature|4_Idle_Armature'
const CLIP_WALK = 'Armature|3_Walk_Armature'
const CLIP_SIT = 'Armature|2_Sit_Armature'
const CLIP_RUN = 'Armature|1_Run_Armature'

/** Sprint speed (world units per second) Sushi uses while chasing the laser dot. */
const CHASE_SPEED = 1.6
/** Distance (XZ) from the dot below which Sushi settles into idle on top of it. */
const CHASE_REACHED_EPS = 0.06
/**
 * How far the laser dot must move from its position at settle-time before Sushi
 * stands back up and re-engages the sprint. Compared against an anchor captured
 * the moment he switched to `chaseRest`, so a hair of mouse jitter doesn't
 * flicker him back into the run animation.
 */
const CHASE_RESUME_HYSTERESIS = 0.18
/** Seconds Sushi sits in `idle` after the laser dot vanishes before resuming wander. */
const POST_CHASE_IDLE_S = 2.5

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
/**
 * Stop radius (world units) when approaching the food bowl. Larger than
 * {@link WAYPOINT_REACHED_EPS} so Sushi halts beside the bowl with his head
 * over it rather than standing on top of the rim.
 */
const BOWL_APPROACH_STOP_DISTANCE = 0.35

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
  private readonly actions: Record<'idle' | 'walk' | 'sit' | 'run', THREE.AnimationAction>
  private readonly laserTarget = new THREE.Vector3()
  private readonly chaseRestAnchor = new THREE.Vector3()
  private laserActive = false
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
  private wakePollTimer = 0
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
  /** World-space start position of the active bed jump (snapped on enter). */
  private readonly bedJumpStart = new THREE.Vector3()
  /** World-space end position of the active bed jump (snapped on enter). */
  private readonly bedJumpEnd = new THREE.Vector3()
  /** Index of the bed approach side currently in use (0..bedSideCount-1). */
  private bedSideIndex = 0
  /** World-space start position of the active sideboard jump (snapped on enter). */
  private readonly sideboardJumpStart = new THREE.Vector3()
  /** World-space end position of the active sideboard jump (snapped on enter). */
  private readonly sideboardJumpEnd = new THREE.Vector3()
  /** Index of the sideboard approach side currently in use. */
  private sideboardSideIndex = 0
  /** World-space sideboard-top point Sushi walks to after the landing hop. */
  private readonly sideboardTopWalkTarget = new THREE.Vector3()
  /** World-space start position of the active locker jump (snapped on enter). */
  private readonly lockerJumpStart = new THREE.Vector3()
  /** World-space end position of the active locker jump (snapped on enter). */
  private readonly lockerJumpEnd = new THREE.Vector3()
  /** Index of the locker approach side currently in use. */
  private lockerSideIndex = 0
  /** World-space start position of the active table jump (snapped on enter). */
  private readonly tableJumpStart = new THREE.Vector3()
  /** World-space end position of the active table jump (snapped on enter). */
  private readonly tableJumpEnd = new THREE.Vector3()
  /** Index of the table approach side currently in use. */
  private tableSideIndex = 0
  /** World-space start position of the active tower jump (snapped on enter). */
  private readonly towerJumpStart = new THREE.Vector3()
  /** World-space end position of the active tower jump (snapped on enter). */
  private readonly towerJumpEnd = new THREE.Vector3()
  /** Index of the tower approach side currently in use. */
  private towerSideIndex = 0

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

    // Re-pivot the rig so the visible bounding-box centre sits at the group origin
    // on every axis. The source GLB authors the cat off-origin in XZ, so before
    // this step a `group.rotation.y` orbited the cat *around an empty point* —
    // rotation visibly translated the model and the chase target stopped with the
    // body trailing behind the laser dot. Translating the inner mesh inside the
    // group fixes both at once without touching skin/inverse-bind matrices (which
    // is why we don't run `gltf-transform center()` on this rigged asset).
    root.updateMatrixWorld(true)
    const grounded = new THREE.Box3().setFromObject(root)
    const groundedCenter = grounded.getCenter(new THREE.Vector3())
    root.position.x -= groundedCenter.x
    root.position.z -= groundedCenter.z
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
      run: this.mixer.clipAction(findClip(CLIP_RUN)),
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
    this.heartParticles.tick(dt)

    // Sleeping is its own self-contained branch: animation is paused (so the
    // mixer update would just re-render the same frame), tiredness preempts
    // laser, and we don't want the floor anchor to fight with the tipped pose.
    // We exit early after running the wake-up poll.
    if (this.state === 'sleeping') {
      this.tickSleeping(dt)
      return
    }

    this.mixer.update(dt)
    this.stateTimer += dt

    // Tiredness preempts the laser pointer — once Sushi is wiped out he heads
    // for the cat house regardless of where the dot is pointing.
    if (
      this.bridge &&
      this.state !== 'goToHouse' &&
      this.bridge.getTired() >= TIRED_FULL_THRESHOLD
    ) {
      this.enterState('goToHouse')
    }

    if (this.laserActive && this.state !== 'goToHouse') {
      // Laser dot has top priority and preempts every wander/needs branch. The
      // host scene is responsible for *not* pushing a laser target while the
      // pet glide sequence is active, so we don't have to special-case it here.
      if (this.state === 'chaseRest') {
        // Settled on the dot — only resume the sprint if the dot moved
        // meaningfully far from where Sushi sat down. Comparing against the
        // anchor (not against origin distance) lets the body-forward overshoot
        // not immediately re-trigger the chase.
        const dxA = this.laserTarget.x - this.chaseRestAnchor.x
        const dzA = this.laserTarget.z - this.chaseRestAnchor.z
        if (Math.hypot(dxA, dzA) > CHASE_RESUME_HYSTERESIS) {
          this.enterState('chase')
          this.tickChase(dt)
        } else {
          this.faceTowardLaser(dt)
        }
      } else {
        if (this.state !== 'chase') this.enterState('chase')
        this.tickChase(dt)
      }
    } else if (this.state === 'chase' || this.state === 'chaseRest') {
      // Laser just cleared — drop into a short idle, then resume normal roam.
      this.enterState('idle')
      this.stateDuration = POST_CHASE_IDLE_S
    } else if (this.state === 'walk') {
      this.tickWalk(dt)
    } else if (this.state === 'goToBowl') {
      this.tickGoToBowl(dt)
    } else if (this.state === 'goToLitter') {
      this.tickGoToLitter(dt)
    } else if (this.state === 'goToHouse') {
      this.tickGoToHouse(dt)
    } else if (this.state === 'goToBedSide') {
      this.tickGoToBedSide(dt)
    } else if (this.state === 'goToSideboard') {
      this.tickGoToSideboard(dt)
    } else if (this.state === 'goToLocker') {
      this.tickGoToLocker(dt)
    } else if (this.state === 'goToTable') {
      this.tickGoToTable(dt)
    } else if (this.state === 'goToTower') {
      this.tickGoToTower(dt)
    } else if (this.state === 'jumpOnTower' || this.state === 'jumpOffTower') {
      this.tickPerchJumpLerp(this.towerJumpStart, this.towerJumpEnd, 'sitOnTower')
    } else if (this.state === 'jumpOnBed' || this.state === 'jumpOffBed') {
      this.tickPerchJumpLerp(this.bedJumpStart, this.bedJumpEnd, 'sitOnBed')
    } else if (this.state === 'jumpOnSideboard' || this.state === 'jumpOffSideboard') {
      this.tickPerchJumpLerp(
        this.sideboardJumpStart,
        this.sideboardJumpEnd,
        'walkSideboardTop',
      )
    } else if (this.state === 'walkSideboardTop') {
      this.tickWalkSideboardTop(dt)
    } else if (this.state === 'jumpOnLocker' || this.state === 'jumpOffLocker') {
      this.tickPerchJumpLerp(this.lockerJumpStart, this.lockerJumpEnd, 'sitOnLocker')
    } else if (this.state === 'jumpOnTable' || this.state === 'jumpOffTable') {
      this.tickPerchJumpLerp(this.tableJumpStart, this.tableJumpEnd, 'sitOnTable')
    } else if (this.state === 'sitOnBed') {
      if (this.stateTimer >= this.stateDuration) {
        this.enterState('jumpOffBed')
      }
    } else if (this.state === 'sitOnSideboard') {
      if (this.stateTimer >= this.stateDuration) {
        this.enterState('jumpOffSideboard')
      }
    } else if (this.state === 'sitOnLocker') {
      if (this.stateTimer >= this.stateDuration) {
        this.enterState('jumpOffLocker')
      }
    } else if (this.state === 'sitOnTable') {
      if (this.stateTimer >= this.stateDuration) {
        this.enterState('jumpOffTable')
      }
    } else if (this.state === 'sitOnTower') {
      if (this.stateTimer >= this.stateDuration) {
        this.bridge?.onUsedTower?.()
        this.enterState('jumpOffTower')
      }
    } else if (this.state === 'follow') {
      this.tickFollow(dt)
    } else if (this.state === 'eat') {
      if (this.stateTimer >= this.stateDuration) {
        this.bridge?.onEatServing()
        // Chain servings while still hungry and food remains — Sushi tops up to
        // ~full instead of walking off after one bite.
        const bridge = this.bridge
        if (
          bridge &&
          bridge.getBowlServings() > 0 &&
          bridge.getHunger() < HUNGER_SATISFIED_THRESHOLD
        ) {
          this.enterState('eat')
        } else if (!this.evaluateNeedsAndPickNextState()) {
          this.pickNextRestingState()
        }
      }
    } else if (this.state === 'useLitter') {
      if (this.stateTimer >= this.stateDuration) {
        this.bridge?.onUsedLitter()
        if (!this.evaluateNeedsAndPickNextState()) {
          this.pickNextRestingState()
        }
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
    // Sushi planted no matter which clip is playing. Skipped while the cat is mid-leap or
    // sitting on top of the bed — those states own his Y directly.
    if (
      this.state !== 'jumpOnBed' &&
      this.state !== 'sitOnBed' &&
      this.state !== 'jumpOffBed' &&
      this.state !== 'jumpOnSideboard' &&
      this.state !== 'walkSideboardTop' &&
      this.state !== 'sitOnSideboard' &&
      this.state !== 'jumpOffSideboard' &&
      this.state !== 'jumpOnLocker' &&
      this.state !== 'sitOnLocker' &&
      this.state !== 'jumpOffLocker' &&
      this.state !== 'jumpOnTable' &&
      this.state !== 'sitOnTable' &&
      this.state !== 'jumpOffTable' &&
      this.state !== 'jumpOnTower' &&
      this.state !== 'sitOnTower' &&
      this.state !== 'jumpOffTower'
    ) {
      this.inner.updateMatrixWorld(true)
      this._tmpBox.setFromObject(this.inner)
      const minY = this._tmpBox.min.y
      if (Number.isFinite(minY)) {
        this.group.position.y += this.bounds.floorY - minY
      }
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

  /**
   * Read-only view of the current FSM state. Audio + UI hosts use this for edge
   * detection (e.g. "fire a meow once per idle entry") without needing to know
   * the internal state union otherwise.
   */
  get currentState(): CatState {
    return this.state
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
    // Stop short of the bowl so the cat eats next to it rather than standing on
    // top — distance from current position to bowl ≤ BOWL_APPROACH_STOP_DISTANCE.
    const dx = this._bridgeTmp.x - this.group.position.x
    const dz = this._bridgeTmp.z - this.group.position.z
    if (Math.hypot(dx, dz) <= BOWL_APPROACH_STOP_DISTANCE) {
      this.enterState('eat')
      return
    }
    this.stepTowardTarget(dt)
  }

  /**
   * Step the cat toward the litterbox. On arrival, drop into {@link 'useLitter'} —
   * the same `sit` clip used for petting/eating, but timed to {@link LITTER_USE_DURATION_S}.
   *
   * @param dt - Delta time in seconds.
   */
  private tickGoToLitter(dt: number): void {
    if (!this.bridge) {
      this.pickNextRestingState()
      return
    }
    this.bridge.getLitterWorldPosition(this._bridgeTmp)
    this.target.set(this._bridgeTmp.x, this.bounds.floorY, this._bridgeTmp.z)
    if (this.stepTowardTarget(dt)) {
      this.enterState('useLitter')
    }
  }

  /**
   * Step Sushi toward the cat house when tiredness has crossed
   * {@link TIRED_FULL_THRESHOLD}. On arrival within {@link WAYPOINT_REACHED_EPS},
   * drop into {@link 'sleeping'} — the controller pauses the walk clip and tips
   * the inner mesh forward so the pose reads as "flopped napping inside the
   * dark hut". A wake-up roll runs once per second from {@link tickSleeping}.
   *
   * @param dt - Delta time in seconds.
   */
  private tickGoToHouse(dt: number): void {
    if (!this.bridge) {
      this.pickNextRestingState()
      return
    }
    // Walk only as far as the entry-aligned approach waypoint — the obstacle
    // padding around the cat house makes a straight march into the centre
    // unreliable, so as soon as Sushi is right in front of the door we trigger
    // {@link enterState} for `sleeping`, which snaps him to the house centre and
    // pins the napping pose. The visual reads as "he ducks inside the moment he
    // arrives at the threshold".
    this.bridge.getHouseApproachWorldPosition(this._bridgeTmp)
    this.target.set(this._bridgeTmp.x, this.bounds.floorY, this._bridgeTmp.z)
    if (this.stepTowardTarget(dt)) {
      this.enterState('sleeping')
    }
  }

  /**
   * Run the sleeping wake-up poll. Animation is already paused at the first walk
   * frame and the inner mesh is pitched forward inside the cat house, so the
   * visible pose doesn't need per-frame work — we just count seconds and roll a
   * weighted coin once per {@link SLEEP_WAKE_POLL_INTERVAL_S}. On wake we hand
   * control back to {@link onWoke} (which resets tired) and pop into idle.
   *
   * @param dt - Delta time in seconds.
   */
  private tickSleeping(dt: number): void {
    this.wakePollTimer += dt
    if (this.wakePollTimer < SLEEP_WAKE_POLL_INTERVAL_S) return
    this.wakePollTimer = 0
    if (Math.random() >= SLEEP_WAKE_PROBABILITY) return
    this.bridge?.onWoke()
    // Snap the live cat to the cat-house entry waypoint and yaw him away from
    // the door so he reads as stepping out of the house, then walk to a fresh
    // wander target. Without this snap he reappears wherever the live group
    // happened to be when sleep started (e.g. his initial spawn point), which
    // looks like he teleported across the room.
    if (this.bridge) {
      this.bridge.getHouseApproachWorldPosition(this._bridgeTmp)
      this.group.position.x = this._bridgeTmp.x
      this.group.position.z = this._bridgeTmp.z
      this.bridge.getHouseWorldPosition(this._bridgeTmp)
      const awayDx = this.group.position.x - this._bridgeTmp.x
      const awayDz = this.group.position.z - this._bridgeTmp.z
      this.group.rotation.y = Math.atan2(awayDx, awayDz)
    }
    this.pickNextRestingState()
  }

  /**
   * Walk Sushi toward the chosen bed approach point. On arrival, capture the start /
   * end positions for the leap and switch to {@link 'jumpOnBed'} — the lerp tick then
   * arcs him onto the mattress without any per-frame floor anchoring.
   *
   * @param dt - Delta time in seconds.
   */
  private tickGoToBedSide(dt: number): void {
    if (!this.bridge?.getBedApproachWorldPosition) {
      this.pickNextRestingState()
      return
    }
    this.bridge.getBedApproachWorldPosition(this.bedSideIndex, this._bridgeTmp)
    this.target.set(this._bridgeTmp.x, this.bounds.floorY, this._bridgeTmp.z)
    if (this.stepTowardTarget(dt)) {
      this.enterState('jumpOnBed')
    }
  }

  /**
   * Walk Sushi toward the sideboard approach point. On arrival, switch to the
   * sideboard jump so he hops onto the top beside the moon lamp.
   *
   * @param dt - Delta time in seconds.
   */
  private tickGoToSideboard(dt: number): void {
    if (!this.bridge?.getSideboardApproachWorldPosition) {
      this.pickNextRestingState()
      return
    }
    this.bridge.getSideboardApproachWorldPosition(this.sideboardSideIndex, this._bridgeTmp)
    this.target.set(this._bridgeTmp.x, this.bounds.floorY, this._bridgeTmp.z)
    if (this.stepTowardTarget(dt)) {
      this.enterState('jumpOnSideboard')
    }
  }

  /**
   * Walk Sushi toward the locker approach point. On arrival, switch to the
   * locker jump so he hops straight onto the top and rotates into the sit pose.
   *
   * @param dt - Delta time in seconds.
   */
  private tickGoToLocker(dt: number): void {
    if (!this.bridge?.getLockerApproachWorldPosition) {
      this.pickNextRestingState()
      return
    }
    this.bridge.getLockerApproachWorldPosition(this.lockerSideIndex, this._bridgeTmp)
    this.target.set(this._bridgeTmp.x, this.bounds.floorY, this._bridgeTmp.z)
    if (this.stepTowardTarget(dt)) {
      this.enterState('jumpOnLocker')
    }
  }

  /**
   * Walk Sushi toward the shuttle-control table approach point. On arrival,
   * switch to the table jump so he hops onto the top and sits above the console.
   *
   * @param dt - Delta time in seconds.
   */
  private tickGoToTable(dt: number): void {
    if (!this.bridge?.getTableApproachWorldPosition) {
      this.pickNextRestingState()
      return
    }
    this.bridge.getTableApproachWorldPosition(this.tableSideIndex, this._bridgeTmp)
    this.target.set(this._bridgeTmp.x, this.bounds.floorY, this._bridgeTmp.z)
    if (this.stepTowardTarget(dt)) {
      this.enterState('jumpOnTable')
    }
  }

  /**
   * Walk Sushi toward the cat tower approach point. On arrival, switch to the tower
   * jump so he hops up onto the top platform of the climbing tower.
   *
   * @param dt - Delta time in seconds.
   */
  private tickGoToTower(dt: number): void {
    if (!this.bridge?.getTowerApproachWorldPosition) {
      this.pickNextRestingState()
      return
    }
    this.bridge.getTowerApproachWorldPosition(this.towerSideIndex, this._bridgeTmp)
    this.target.set(this._bridgeTmp.x, this.bounds.floorY, this._bridgeTmp.z)
    if (this.stepTowardTarget(dt)) {
      this.enterState('jumpOnTower')
    }
  }

  /**
   * Per-frame lerp used by furniture perch jumps. Linearly
   * interpolates X/Z between the given start/end points, and adds a
   * sin-arc on top of the linear Y lerp so the leap reads as a hop. When the timer
   * exceeds {@link BED_JUMP_DURATION_S}, snaps to the end pose and advances the FSM.
   *
   * @param start - Captured world-space jump start.
   * @param end - Captured world-space jump end.
   * @param afterJumpOnState - State to enter after a jump-on completes.
   */
  private tickPerchJumpLerp(
    start: THREE.Vector3,
    end: THREE.Vector3,
    afterJumpOnState:
      | 'sitOnBed'
      | 'walkSideboardTop'
      | 'sitOnLocker'
      | 'sitOnTable'
      | 'sitOnTower',
  ): void {
    const t = Math.min(1, this.stateTimer / BED_JUMP_DURATION_S)
    this.group.position.x = start.x + (end.x - start.x) * t
    this.group.position.z = start.z + (end.z - start.z) * t
    const baseY = start.y + (end.y - start.y) * t
    this.group.position.y = baseY + Math.sin(Math.PI * t) * BED_JUMP_ARC_HEIGHT
    if (t >= 1) {
      this.group.position.set(end.x, end.y, end.z)
      if (
        this.state === 'jumpOnBed' ||
        this.state === 'jumpOnSideboard' ||
        this.state === 'jumpOnLocker' ||
        this.state === 'jumpOnTable' ||
        this.state === 'jumpOnTower'
      ) {
        this.enterState(afterJumpOnState)
      } else {
        this.pickNextRestingState()
      }
    }
  }

  /**
   * Walk Sushi along the sideboard top from the landing point to the final sit point
   * on the far side of the moon lamp. The normal floor anchoring is disabled for this
   * state, so Y is pinned to the authored tabletop height while the existing
   * pivot-then-walk code handles X/Z motion.
   *
   * @param dt - Delta time in seconds.
   */
  private tickWalkSideboardTop(dt: number): void {
    if (!this.bridge?.getSideboardSitWorldPosition) {
      this.enterState('sitOnSideboard')
      return
    }

    this.bridge.getSideboardSitWorldPosition(this.sideboardTopWalkTarget)
    this.target.set(
      this.sideboardTopWalkTarget.x,
      this.group.position.y,
      this.sideboardTopWalkTarget.z,
    )
    this.group.position.y = this.sideboardTopWalkTarget.y

    if (!this.stepTowardTarget(dt)) return

    this.group.position.set(
      this.sideboardTopWalkTarget.x,
      this.sideboardTopWalkTarget.y,
      this.sideboardTopWalkTarget.z,
    )
    this.group.rotation.y = SIDEBOARD_SIT_YAW
    this.enterState('sitOnSideboard')
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
    if (bridge.getTired() >= TIRED_FULL_THRESHOLD) {
      this.enterState('goToHouse')
      return true
    }
    if (bridge.getBladder() >= BLADDER_FULL_THRESHOLD) {
      // Litter is too full — refuse to use it and pester the player to empty it.
      if (bridge.getLitterPollution() >= LITTER_POLLUTION_REFUSE_THRESHOLD) {
        this.enterState('follow')
        return true
      }
      this.enterState('goToLitter')
      return true
    }
    const hunger = bridge.getHunger()
    const bowl = bridge.getBowlServings()
    if (hunger <= HUNGER_HUNGRY_THRESHOLD) {
      if (bowl > 0) {
        this.enterState('goToBowl')
        return true
      }
      // Hungry but the bowl is empty — fall through to "follow" so Sushi pesters
      // the player for a refill instead of obliviously wandering past empty bowls.
      this.enterState('follow')
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
      this.state === 'goToLitter' ||
      this.state === 'useLitter' ||
      this.state === 'goToHouse' ||
      this.state === 'sleeping' ||
      this.state === 'follow' ||
      this.state === 'idleNearPlayer' ||
      this.state === 'goToBedSide' ||
      this.state === 'jumpOnBed' ||
      this.state === 'sitOnBed' ||
      this.state === 'jumpOffBed' ||
      this.state === 'goToSideboard' ||
      this.state === 'jumpOnSideboard' ||
      this.state === 'walkSideboardTop' ||
      this.state === 'sitOnSideboard' ||
      this.state === 'jumpOffSideboard' ||
      this.state === 'goToLocker' ||
      this.state === 'jumpOnLocker' ||
      this.state === 'sitOnLocker' ||
      this.state === 'jumpOffLocker' ||
      this.state === 'goToTable' ||
      this.state === 'jumpOnTable' ||
      this.state === 'sitOnTable' ||
      this.state === 'jumpOffTable' ||
      this.state === 'goToTower' ||
      this.state === 'jumpOnTower' ||
      this.state === 'sitOnTower' ||
      this.state === 'jumpOffTower'
    )
  }

  /** After idling/sitting expires, decide whether to sit longer or set a new walk target. */
  private pickNextRestingState(): void {
    if (this.state === 'idle' && Math.random() < SIT_CHANCE) {
      this.enterState('sit')
      return
    }
    // The cat tower is the dedicated cat appliance — when it's installed, roll for it
    // first with the buffed {@link TOWER_JUMP_CHANCE}. Falling through means the player
    // hasn't bought it yet and Sushi falls back to the ambient furniture beats below.
    if (this.tryStartTowerJump()) return
    // Occasionally divert to a "jump on the bed and chill" routine instead of a
    // plain wander walk. Only available when the host wired bed metadata onto the
    // bridge — otherwise `getBedSideCount` is undefined and we fall through.
    if (this.tryStartBedJump()) return
    // The sideboard lamp perch is a second rare ambient beat. It is host-gated,
    // because the sideboard loads asynchronously after the main cabin scene.
    if (this.tryStartSideboardJump()) return
    // The locker is a compact one-pose perch: hop up, turn toward the cabin, sit.
    if (this.tryStartLockerJump()) return
    // The shuttle-control table perch is another rare furniture beat in the cockpit.
    if (this.tryStartTableJump()) return
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
   * Roll for the bed-jumping diversion. When the host wired bed approach points and a
   * mattress-top onto the bridge, this picks one side at random, snaps the walk
   * target to its approach waypoint, and enters {@link 'goToBedSide'}. Returns false
   * when no bed is available so the caller can fall back to a wander walk.
   *
   * @returns Whether a bed-jumping run was started.
   */
  private tryStartBedJump(): boolean {
    const bridge = this.bridge
    if (!bridge?.getBedSideCount || !bridge.getBedApproachWorldPosition) return false
    const sideCount = bridge.getBedSideCount()
    if (sideCount <= 0) return false
    if (Math.random() >= BED_JUMP_CHANCE) return false
    this.bedSideIndex = Math.floor(Math.random() * sideCount)
    bridge.getBedApproachWorldPosition(this.bedSideIndex, this._bridgeTmp)
    this.target.set(this._bridgeTmp.x, this.bounds.floorY, this._bridgeTmp.z)
    this.enterState('goToBedSide')
    return true
  }

  /**
   * Roll for the sideboard lamp-perch diversion. When available, this sends Sushi
   * to an approach point below the sideboard and then hops him onto the top beside
   * the moon lamp.
   *
   * @returns Whether a sideboard perch run was started.
   */
  private tryStartSideboardJump(): boolean {
    const bridge = this.bridge
    if (!bridge?.getSideboardSideCount || !bridge.getSideboardApproachWorldPosition) {
      return false
    }
    const sideCount = bridge.getSideboardSideCount()
    if (sideCount <= 0) return false
    if (Math.random() >= SIDEBOARD_JUMP_CHANCE) return false
    this.sideboardSideIndex = Math.floor(Math.random() * sideCount)
    bridge.getSideboardApproachWorldPosition(this.sideboardSideIndex, this._bridgeTmp)
    this.target.set(this._bridgeTmp.x, this.bounds.floorY, this._bridgeTmp.z)
    this.enterState('goToSideboard')
    return true
  }

  /**
   * Roll for the locker perch diversion. When available, this sends Sushi to the
   * floor in front of the bedside locker and then hops him straight onto the top.
   *
   * @returns Whether a locker perch run was started.
   */
  private tryStartLockerJump(): boolean {
    const bridge = this.bridge
    if (!bridge?.getLockerSideCount || !bridge.getLockerApproachWorldPosition) {
      return false
    }
    const sideCount = bridge.getLockerSideCount()
    if (sideCount <= 0) return false
    if (Math.random() >= LOCKER_JUMP_CHANCE) return false
    this.lockerSideIndex = Math.floor(Math.random() * sideCount)
    bridge.getLockerApproachWorldPosition(this.lockerSideIndex, this._bridgeTmp)
    this.target.set(this._bridgeTmp.x, this.bounds.floorY, this._bridgeTmp.z)
    this.enterState('goToLocker')
    return true
  }

  /**
   * Roll for the shuttle-control table perch diversion. When available, this sends
   * Sushi to the cabin-facing edge of the table and hops him onto the top rail.
   *
   * @returns Whether a table perch run was started.
   */
  private tryStartTableJump(): boolean {
    const bridge = this.bridge
    if (!bridge?.getTableSideCount || !bridge.getTableApproachWorldPosition) {
      return false
    }
    const sideCount = bridge.getTableSideCount()
    if (sideCount <= 0) return false
    if (Math.random() >= TABLE_JUMP_CHANCE) return false
    this.tableSideIndex = Math.floor(Math.random() * sideCount)
    bridge.getTableApproachWorldPosition(this.tableSideIndex, this._bridgeTmp)
    this.target.set(this._bridgeTmp.x, this.bounds.floorY, this._bridgeTmp.z)
    this.enterState('goToTable')
    return true
  }

  /**
   * Roll for the dedicated cat-tower perch. Only available when the player has
   * purchased the appliance (the host wires {@link CatNeedsBridge.getTowerSideCount}
   * to a non-zero count). Uses the buffed {@link TOWER_JUMP_CHANCE} so the cat
   * visibly prefers the tower over the ambient furniture beats.
   *
   * @returns Whether a tower perch run was started.
   */
  private tryStartTowerJump(): boolean {
    const bridge = this.bridge
    if (!bridge?.getTowerSideCount || !bridge.getTowerApproachWorldPosition) {
      return false
    }
    const sideCount = bridge.getTowerSideCount()
    if (sideCount <= 0) return false
    if (Math.random() >= TOWER_JUMP_CHANCE) return false
    this.towerSideIndex = Math.floor(Math.random() * sideCount)
    bridge.getTowerApproachWorldPosition(this.towerSideIndex, this._bridgeTmp)
    this.target.set(this._bridgeTmp.x, this.bounds.floorY, this._bridgeTmp.z)
    this.enterState('goToTower')
    return true
  }

  /**
   * Switch to a new state, crossfading the animation and resetting the timer.
   *
   * @param next - State to enter.
   */
  private enterState(next: CatState): void {
    const wasSleeping = this.state === 'sleeping'
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
    if (wasSleeping && next !== 'sleeping') {
      // Wake up: re-enable the live walk action and re-show the live cat — the
      // host had hidden the live group and shown the baked sleeping clone via
      // {@link CatNeedsBridge.onSleepEnter}, and now reverses both swaps.
      this.actions.walk.paused = false
      this.group.visible = true
      this.bridge?.onSleepExit?.()
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
    } else if (next === 'useLitter') {
      this.stateDuration = LITTER_USE_DURATION_S
    } else if (next === 'sitOnBed') {
      this.stateDuration = SIT_ON_BED_DURATION_S
    } else if (next === 'sitOnSideboard') {
      this.group.rotation.y = SIDEBOARD_SIT_YAW
      this.stateDuration = SIT_ON_SIDEBOARD_DURATION_S
    } else if (next === 'sitOnLocker') {
      this.group.rotation.y = LOCKER_SIT_YAW
      this.stateDuration = SIT_ON_LOCKER_DURATION_S
    } else if (next === 'sitOnTable') {
      this.group.rotation.y = TABLE_SIT_YAW
      this.stateDuration = SIT_ON_TABLE_DURATION_S
    } else if (next === 'sitOnTower') {
      this.group.rotation.y = TOWER_SIT_YAW
      this.stateDuration = SIT_ON_TOWER_DURATION_S
    } else if (next === 'jumpOnBed') {
      // Capture the lerp endpoints the moment we leap. Start = current world pose
      // (cat just arrived at the approach point), end = mattress-top centre.
      this.bedJumpStart.copy(this.group.position)
      this.bedJumpEnd.copy(this.bedJumpStart)
      this.bridge?.getBedTopWorldPosition?.(this._bridgeTmp)
      this.bedJumpEnd.set(this._bridgeTmp.x, this._bridgeTmp.y, this._bridgeTmp.z)
      // Snap yaw to face the mattress so the leap reads as a forward pounce
      // instead of a backward shuffle. Same `atan2(dx, dz)` convention used by
      // tickWalk — the approach waypoint hands us a clean facing direction.
      const jumpDx = this.bedJumpEnd.x - this.bedJumpStart.x
      const jumpDz = this.bedJumpEnd.z - this.bedJumpStart.z
      if (jumpDx * jumpDx + jumpDz * jumpDz > 1e-6) {
        this.group.rotation.y = Math.atan2(jumpDx, jumpDz)
      }
      this.stateDuration = BED_JUMP_DURATION_S
    } else if (next === 'jumpOnLocker') {
      this.lockerJumpStart.copy(this.group.position)
      this.lockerJumpEnd.copy(this.lockerJumpStart)
      this.bridge?.getLockerTopWorldPosition?.(this._bridgeTmp)
      this.lockerJumpEnd.set(this._bridgeTmp.x, this._bridgeTmp.y, this._bridgeTmp.z)
      const jumpDx = this.lockerJumpEnd.x - this.lockerJumpStart.x
      const jumpDz = this.lockerJumpEnd.z - this.lockerJumpStart.z
      if (jumpDx * jumpDx + jumpDz * jumpDz > 1e-6) {
        this.group.rotation.y = Math.atan2(jumpDx, jumpDz)
      }
      this.stateDuration = BED_JUMP_DURATION_S
    } else if (next === 'jumpOnTable') {
      this.tableJumpStart.copy(this.group.position)
      this.tableJumpEnd.copy(this.tableJumpStart)
      this.bridge?.getTableTopWorldPosition?.(this._bridgeTmp)
      this.tableJumpEnd.set(this._bridgeTmp.x, this._bridgeTmp.y, this._bridgeTmp.z)
      const jumpDx = this.tableJumpEnd.x - this.tableJumpStart.x
      const jumpDz = this.tableJumpEnd.z - this.tableJumpStart.z
      if (jumpDx * jumpDx + jumpDz * jumpDz > 1e-6) {
        this.group.rotation.y = Math.atan2(jumpDx, jumpDz)
      }
      this.stateDuration = BED_JUMP_DURATION_S
    } else if (next === 'jumpOnTower') {
      this.towerJumpStart.copy(this.group.position)
      this.towerJumpEnd.copy(this.towerJumpStart)
      this.bridge?.getTowerTopWorldPosition?.(this._bridgeTmp)
      this.towerJumpEnd.set(this._bridgeTmp.x, this._bridgeTmp.y, this._bridgeTmp.z)
      const jumpDx = this.towerJumpEnd.x - this.towerJumpStart.x
      const jumpDz = this.towerJumpEnd.z - this.towerJumpStart.z
      if (jumpDx * jumpDx + jumpDz * jumpDz > 1e-6) {
        this.group.rotation.y = Math.atan2(jumpDx, jumpDz)
      }
      this.stateDuration = BED_JUMP_DURATION_S
    } else if (next === 'jumpOnSideboard') {
      this.sideboardJumpStart.copy(this.group.position)
      this.sideboardJumpEnd.copy(this.sideboardJumpStart)
      this.bridge?.getSideboardTopWorldPosition?.(this._bridgeTmp)
      this.sideboardJumpEnd.set(this._bridgeTmp.x, this._bridgeTmp.y, this._bridgeTmp.z)
      const jumpDx = this.sideboardJumpEnd.x - this.sideboardJumpStart.x
      const jumpDz = this.sideboardJumpEnd.z - this.sideboardJumpStart.z
      if (jumpDx * jumpDx + jumpDz * jumpDz > 1e-6) {
        this.group.rotation.y = Math.atan2(jumpDx, jumpDz)
      }
      this.stateDuration = BED_JUMP_DURATION_S
    } else if (next === 'jumpOffBed') {
      // Reverse leap — start from current on-bed pose, land on the same approach
      // point the cat used to climb up so he doesn't teleport across the room.
      this.bedJumpStart.copy(this.group.position)
      if (this.bridge?.getBedApproachWorldPosition) {
        this.bridge.getBedApproachWorldPosition(this.bedSideIndex, this._bridgeTmp)
        this.bedJumpEnd.set(this._bridgeTmp.x, this.bounds.floorY, this._bridgeTmp.z)
      } else {
        this.bedJumpEnd.set(this.bedJumpStart.x, this.bounds.floorY, this.bedJumpStart.z)
      }
      // After sitOnBed his yaw still points into the mattress (set on jumpOn);
      // re-snap to the dismount direction so the leap-off reads forward instead
      // of as a tail-first shuffle.
      const offDx = this.bedJumpEnd.x - this.bedJumpStart.x
      const offDz = this.bedJumpEnd.z - this.bedJumpStart.z
      if (offDx * offDx + offDz * offDz > 1e-6) {
        this.group.rotation.y = Math.atan2(offDx, offDz)
      }
      this.stateDuration = BED_JUMP_DURATION_S
    } else if (next === 'jumpOffLocker') {
      this.lockerJumpStart.copy(this.group.position)
      if (this.bridge?.getLockerApproachWorldPosition) {
        this.bridge.getLockerApproachWorldPosition(this.lockerSideIndex, this._bridgeTmp)
        this.lockerJumpEnd.set(this._bridgeTmp.x, this.bounds.floorY, this._bridgeTmp.z)
      } else {
        this.lockerJumpEnd.set(
          this.lockerJumpStart.x,
          this.bounds.floorY,
          this.lockerJumpStart.z,
        )
      }
      const offDx = this.lockerJumpEnd.x - this.lockerJumpStart.x
      const offDz = this.lockerJumpEnd.z - this.lockerJumpStart.z
      if (offDx * offDx + offDz * offDz > 1e-6) {
        this.group.rotation.y = Math.atan2(offDx, offDz)
      }
      this.stateDuration = BED_JUMP_DURATION_S
    } else if (next === 'jumpOffTable') {
      this.tableJumpStart.copy(this.group.position)
      if (this.bridge?.getTableApproachWorldPosition) {
        this.bridge.getTableApproachWorldPosition(this.tableSideIndex, this._bridgeTmp)
        this.tableJumpEnd.set(this._bridgeTmp.x, this.bounds.floorY, this._bridgeTmp.z)
      } else {
        this.tableJumpEnd.set(
          this.tableJumpStart.x,
          this.bounds.floorY,
          this.tableJumpStart.z,
        )
      }
      const offDx = this.tableJumpEnd.x - this.tableJumpStart.x
      const offDz = this.tableJumpEnd.z - this.tableJumpStart.z
      if (offDx * offDx + offDz * offDz > 1e-6) {
        this.group.rotation.y = Math.atan2(offDx, offDz)
      }
      this.stateDuration = BED_JUMP_DURATION_S
    } else if (next === 'jumpOffTower') {
      this.towerJumpStart.copy(this.group.position)
      if (this.bridge?.getTowerApproachWorldPosition) {
        this.bridge.getTowerApproachWorldPosition(this.towerSideIndex, this._bridgeTmp)
        this.towerJumpEnd.set(this._bridgeTmp.x, this.bounds.floorY, this._bridgeTmp.z)
      } else {
        this.towerJumpEnd.set(
          this.towerJumpStart.x,
          this.bounds.floorY,
          this.towerJumpStart.z,
        )
      }
      const offDx = this.towerJumpEnd.x - this.towerJumpStart.x
      const offDz = this.towerJumpEnd.z - this.towerJumpStart.z
      if (offDx * offDx + offDz * offDz > 1e-6) {
        this.group.rotation.y = Math.atan2(offDx, offDz)
      }
      this.stateDuration = BED_JUMP_DURATION_S
    } else if (next === 'jumpOffSideboard') {
      this.sideboardJumpStart.copy(this.group.position)
      if (this.bridge?.getSideboardApproachWorldPosition) {
        this.bridge.getSideboardApproachWorldPosition(this.sideboardSideIndex, this._bridgeTmp)
        this.sideboardJumpEnd.set(this._bridgeTmp.x, this.bounds.floorY, this._bridgeTmp.z)
      } else {
        this.sideboardJumpEnd.set(
          this.sideboardJumpStart.x,
          this.bounds.floorY,
          this.sideboardJumpStart.z,
        )
      }
      const offDx = this.sideboardJumpEnd.x - this.sideboardJumpStart.x
      const offDz = this.sideboardJumpEnd.z - this.sideboardJumpStart.z
      if (offDx * offDx + offDz * offDz > 1e-6) {
        this.group.rotation.y = Math.atan2(offDx, offDz)
      }
      this.stateDuration = BED_JUMP_DURATION_S
    } else if (next === 'sleeping') {
      // The visible "asleep" pose is a separate, baked clone owned by the host
      // (parented inside the cat house with tunable rotation/scale). Hide the
      // live cat group entirely and let the bridge swap in the clone — that
      // means we no longer have to do any rotation/anchor/pose math here.
      this.actions.walk.paused = true
      this.group.visible = false
      this.bridge?.onSleepEnter?.()
      this.wakePollTimer = 0
      this.stateDuration = Number.POSITIVE_INFINITY
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
  private clipForState(state: CatState): 'idle' | 'walk' | 'sit' | 'run' {
    switch (state) {
      case 'idle':
      case 'idleNearPlayer':
      case 'eat':
        return 'idle'
      case 'walk':
      case 'goToBowl':
      case 'goToLitter':
      case 'goToHouse':
      case 'goToBedSide':
      case 'goToSideboard':
      case 'goToLocker':
      case 'goToTable':
      case 'goToTower':
      case 'walkSideboardTop':
      case 'follow':
        return 'walk'
      case 'jumpOnBed':
      case 'jumpOffBed':
      case 'jumpOnSideboard':
      case 'jumpOffSideboard':
      case 'jumpOnLocker':
      case 'jumpOffLocker':
      case 'jumpOnTable':
      case 'jumpOffTable':
      case 'jumpOnTower':
      case 'jumpOffTower':
        // No jump animation in the rig — keep the idle pose during the brief arc so
        // the body reads as briefly airborne instead of mid-stride.
        return 'idle'
      case 'sit':
      case 'useLitter':
      case 'sitOnBed':
      case 'sitOnSideboard':
      case 'sitOnLocker':
      case 'sitOnTable':
      case 'sitOnTower':
        return 'sit'
      case 'chase':
        return 'run'
      case 'chaseRest':
        return 'idle'
      case 'sleeping':
        // Walk action is paused at frame 0 — the cat is tipped onto its face
        // inside the house so the visible pose is whatever bind+frame-0 gives.
        return 'walk'
    }
  }

  /**
   * Push (or clear) the world-space point Sushi should sprint toward in laser-pointer
   * mode. While a target is set, the FSM forces the `chase` state and runs at
   * {@link CHASE_SPEED}. Pass `null` to release — Sushi drops into a short post-chase
   * idle and then resumes wandering on his own.
   *
   * @param point - World position of the laser dot, or `null` to release.
   */
  setLaserTarget(point: THREE.Vector3 | null): void {
    if (point === null) {
      this.laserActive = false
      return
    }
    this.laserActive = true
    this.laserTarget.copy(point)
  }

  /**
   * Sprint locomotion used while {@link laserActive} is true. Same pivot-then-march
   * shape as {@link tickWalk} but at {@link CHASE_SPEED}. Crucially, on arrival we do
   * **not** change state — the run animation keeps playing in place so it reads as
   * "Sushi pouncing on the dot" until the player either moves the dot or releases.
   *
   * @param dt - Delta time in seconds.
   */
  private tickChase(dt: number): void {
    // Sprinting after the dot is what tires Sushi out — the meter only rises
    // here, not in `chaseRest`, so a player who keeps the dot still doesn't
    // accidentally drain the cat. Faceplant naps are earned by chasing.
    this.bridge?.addTired(TIRED_RISE_PER_CHASE_SEC * dt)
    this.bridge?.addHunger(-HUNGER_BURN_PER_CHASE_SEC * dt)

    const dx = this.laserTarget.x - this.group.position.x
    const dz = this.laserTarget.z - this.group.position.z
    const dist = Math.hypot(dx, dz)

    if (dist < CHASE_REACHED_EPS) {
      // Pounce complete — flip to the idle clip so Sushi doesn't run in place
      // on top of the dot. He'll re-enter `chase` automatically if the laser
      // moves past the resume hysteresis from where he settled.
      this.chaseRestAnchor.copy(this.laserTarget)
      this.enterState('chaseRest')
      // Reward the player for a successful pounce — small love bump per catch.
      this.bridge?.onCaughtLaser?.()
      return
    }

    const desiredYaw = Math.atan2(dx, dz)
    const currentYaw = this.group.rotation.y
    const delta = wrapAngle(desiredYaw - currentYaw)
    const turnStep = Math.sign(delta) * Math.min(Math.abs(delta), TURN_RATE * dt)
    this.group.rotation.y = currentYaw + turnStep

    if (Math.abs(delta) > WALK_HEADING_TOLERANCE) return

    const step = Math.min(CHASE_SPEED * dt, dist)
    const yaw = this.group.rotation.y
    this.group.position.x += Math.sin(yaw) * step
    this.group.position.z += Math.cos(yaw) * step
  }

  /**
   * Smoothly yaw toward the laser dot without translating. Used while in
   * {@link 'chaseRest'} so Sushi keeps watching the dot while sitting on it,
   * instead of staring off in his last running direction.
   *
   * @param dt - Delta time in seconds.
   */
  private faceTowardLaser(dt: number): void {
    const dx = this.laserTarget.x - this.group.position.x
    const dz = this.laserTarget.z - this.group.position.z
    if (Math.hypot(dx, dz) < 1e-4) return
    const desiredYaw = Math.atan2(dx, dz)
    const currentYaw = this.group.rotation.y
    const delta = wrapAngle(desiredYaw - currentYaw)
    const turnStep = Math.sign(delta) * Math.min(Math.abs(delta), TURN_RATE * dt)
    this.group.rotation.y = currentYaw + turnStep
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
   * Roll once for whether Sushi should already be sleeping in the cat house when
   * the habitat scene first opens. Hits with probability
   * {@link SLEEP_INITIAL_PROBABILITY}; on a hit, snaps the cat into the
   * `sleeping` state (which positions him at the house and pauses the walk
   * clip). Misses are a no-op so the regular wander spawn from the constructor
   * stands.
   *
   * @returns Whether the cat was placed asleep.
   */
  rollInitialSleep(): boolean {
    if (Math.random() >= SLEEP_INITIAL_PROBABILITY) return false
    this.enterState('sleeping')
    return true
  }

  /** True while Sushi is in the {@link 'sleeping'} state — used by hosts to gate input. */
  isSleeping(): boolean {
    return this.state === 'sleeping'
  }

  /**
   * Build a static visual clone of the cat suitable for use as a baked "asleep in
   * the cat house" pose. Uses {@link SkeletonUtils.clone} so the skinned mesh keeps
   * its bind pose and shares no animation state with the live cat. The caller owns
   * the returned object and is free to parent, transform, and toggle visibility on
   * it; we never read from or write to it after handing it back.
   *
   * The clone is wrapped in a {@link THREE.Group} whose local origin sits at the
   * cloned cat's bounding-box centre, so rotations applied by callers pivot around
   * the body centre instead of the feet. The wrapper's position is left at (0, 0, 0)
   * — callers parent it wherever they like and apply their own tunable offsets.
   *
   * @returns A fresh group containing a skinned-mesh clone matching the cat's bind pose.
   */
  createSleepingClone(): THREE.Object3D {
    const clone = cloneSkinnedScene(this.inner)
    const wrapper = new THREE.Group()
    wrapper.name = 'sushiSleepingClone'
    wrapper.add(clone)
    // Re-pivot the clone so the wrapper's local origin sits at the cat's bbox
    // centre. This makes downstream rotation/scale knobs behave intuitively
    // (rotate around the body, not the feet).
    clone.updateMatrixWorld(true)
    const cloneBox = new THREE.Box3().setFromObject(clone)
    const cloneCentre = cloneBox.getCenter(new THREE.Vector3())
    clone.position.x -= cloneCentre.x
    clone.position.y -= cloneCentre.y
    clone.position.z -= cloneCentre.z
    // Close Sushi's eyes: the GLB ships with a dedicated `Persian Cat_Eyes_0`
    // mesh sitting between the eyelid bones, so hiding it leaves the eyelid
    // geometry as a closed-lid silhouette without touching skinning or bones.
    // Match by name fragment (case-insensitive) and skip the
    // "Eyelid"/"Eyebrow" siblings so we only kill the eyeball mesh itself.
    clone.traverse((child) => {
      const name = child.name?.toLowerCase() ?? ''
      if (!name.includes(SLEEPING_EYE_MESH_NAME_FRAGMENT)) return
      if (name.includes('lid') || name.includes('brow') || name.includes('lash')) return
      child.visible = false
    })
    return wrapper
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
