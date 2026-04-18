/**
 * First-person player controller for on-foot EVA movement.
 *
 * Composes {@link PlatformerBody} for gravity/grounding and
 * {@link ThrusterSystem} for O2-fueled stamina (sprint + jump).
 * Thrust-based lateral movement with ground friction and air drift.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-fps-movement-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { InputManager } from '@/lib/InputManager'
import { useAudio } from '@/audio/useAudio'
import type { FpsCamera } from './FpsCamera'
import { PlatformerBody } from '@/lib/physics/platformerBody'
import { ThrusterSystem } from '@/lib/physics/thrusterSystem'
import type { ThrusterSystemConfig } from '@/lib/physics/thrusterSystem'
import type { Heightmap } from '@/lib/terrain/heightmap'
import { CollisionWorld, type CharacterCollisionConfig } from '@/lib/physics/worldCollision'

/** How long after leaving the ground the player can still jump (coyote time). */
const COYOTE_TIME = 0.15
/** Extra vertical boost multiplier when sprint-jumping. */
const SPRINT_JUMP_BOOST = 1.3
/** Strafe speed multiplier relative to forward speed. */
const STRAFE_SPEED_SCALE = 0.9
/** Strafe speed multiplier while ADS. */
const ADS_STRAFE_SPEED_SCALE = 0.8
/** Tiny amount of mid-air steering restored for jump testing. */
const AIR_CONTROL_ACCEL_FRACTION = 0.22
/** Caps how much speed input can add while airborne. */
const AIR_CONTROL_SPEED_FRACTION = 0.2

/**
 * Default duration (seconds) that an external lateral impulse keeps the
 * player's velocity from being overwritten by the grounded-movement loop.
 * Short enough that walking control snaps back almost immediately, long
 * enough that contact knockback actually visibly shoves the player. Callers
 * can override this per-impulse via {@link FpsPlayerController.applyLateralImpulse}.
 */
const KNOCKBACK_OVERRIDE_DURATION = 0.28

/**
 * Once the sprint thruster fully depletes, the player must let it recharge to
 * at least this fraction of its capacity before holding Shift will engage
 * sprint again. Without the lockout, the per-frame `canFire` check lets sprint
 * stutter on for one frame as soon as a sliver of charge is recovered, which
 * feels like the system is fighting the input. The minimum threshold makes
 * "out of stamina" actually mean something.
 */
const SPRINT_RELOCK_FRACTION = 0.3
const PLAYER_COLLISION_CONFIG: CharacterCollisionConfig = {
  radius: 0.65,
  maxStepHeight: 0.9,
  maxClimbAngleRad: Math.PI * 0.34,
  substepDistance: 0.35,
  skinWidth: 0.05,
  airborneClearance: 0.45,
}

/** Thruster names for the player's O2 power system. */
export type FpsThrusterName = 'sprint' | 'jump'

/** Shape of the player-config.json file. */
export interface FpsPlayerConfig {
  /** Health system configuration. */
  health: {
    /** Maximum hit points. */
    maxHp: number
    /** HP lost per second only while O2 (fuel) is fully depleted — no HP drain until then. */
    hypoxiaDamagePerSecond: number
  }
  /** Lateral movement tuning. */
  movement: {
    /** Thrust magnitude applied per frame while moving (units/s²). */
    moveThrust: number
    /** Speed multiplier while sprint is active. */
    sprintMultiplier: number
    /** Deceleration rate when on the ground (units/s per second). */
    groundFriction: number
    /** Deceleration rate while airborne (units/s per second). */
    airFriction: number
    /** Maximum lateral speed during normal movement (units/s). */
    maxSpeed: number
    /** Maximum lateral speed while sprinting (units/s). */
    maxSprintSpeed: number
    /** Upward velocity impulse on jump (units/s). */
    jumpForce: number
    /** Downward acceleration (units/s²). */
    gravity: number
  }
  /** O2 (life support / fuel) system configuration. */
  o2: {
    /** Total O2 units in the tank. */
    fuelCapacity: number
    /** O2 drained per second regardless of activity. */
    baseDrainRate: number
    /** Seconds between O2 empty and death. */
    deathTimerSeconds: number
    /** Per-thruster configuration for sprint and jump. */
    thrusters: {
      /** Sprint thruster drains O2 while sprinting. */
      sprint: { capacity: number; burnRate: number; rechargeRate: number; fuelCostPerRecharge: number }
      /** Jump thruster drains O2 on each jump. */
      jump: { capacity: number; burnRate: number; rechargeRate: number; fuelCostPerRecharge: number }
    }
  }
  /** Camera rig configuration. */
  camera: {
    /** Vertical offset above player origin (meters). */
    eyeHeight: number
    /** Mouse sensitivity multiplier. */
    sensitivity: number
    /** Maximum pitch angle in radians. */
    pitchClamp: number
    /** Perspective field of view in degrees. */
    fov: number
  }
}

/**
 * First-person player entity on asteroid terrain.
 *
 * Handles gravity, grounding, lateral thrust-based movement, friction,
 * speed clamping, terrain conforming, O2 drain, and death timer.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-fps-movement-design.md
 */
export class FpsPlayerController implements Tickable {
  /** Root transform — attach to scene. */
  readonly group = new THREE.Group()
  /** Vertical physics body (gravity + ground collision). */
  readonly body: PlatformerBody
  /** O2-fueled thruster system (sprint + jump). */
  readonly thrusterSystem: ThrusterSystem<FpsThrusterName>

  private readonly inputManager: InputManager
  private readonly camera: FpsCamera
  private readonly config: FpsPlayerConfig
  private readonly collisionWorld: CollisionWorld
  private readonly lateralVelocity = new THREE.Vector3()
  private _hp: number
  private _dead = false
  private _aiming = false
  /** Coyote timer — time since last grounded, allows late jumps. */
  private coyoteTimer = 0
  /** Tracks previous jump state for rising-edge sound trigger. */
  private _prevJumping = false
  /**
   * Seconds remaining during which the grounded-movement loop will preserve
   * momentum instead of overwriting `lateralVelocity` from input. Set by
   * {@link applyLateralImpulse} and decremented in {@link tick}. While > 0,
   * the player slides under ground friction and input only nudges along the
   * carried-over velocity (same shape as the airborne branch).
   */
  private knockbackTimer = 0
  /**
   * Sprint lockout latch. Set to `true` the moment the sprint charge hits
   * zero, cleared once the bar has refilled to {@link SPRINT_RELOCK_FRACTION}
   * of capacity. While latched, holding Shift does nothing — the input is
   * ignored regardless of charge level so the player can't dribble out one
   * frame of sprint at a time.
   */
  private sprintLocked = false
  /**
   * Latest sprint-engagement state from {@link tick}. Exposed via {@link isSprinting}
   * so other systems (audio, FX, gameplay) react to actual sprint instead of
   * recomputing the conditions and missing the lockout.
   */
  private _isSprinting = false

  /** Fired when health reaches zero. */
  onDeath: (() => void) | null = null

  constructor(
    inputManager: InputManager,
    camera: FpsCamera,
    config: FpsPlayerConfig,
    heightmap: Heightmap,
    collisionWorld?: CollisionWorld,
  ) {
    this.inputManager = inputManager
    this.camera = camera
    this.config = config
    this.collisionWorld = collisionWorld ?? new CollisionWorld(heightmap)

    this._hp = config.health.maxHp
    this.body = new PlatformerBody({ gravity: config.movement.gravity })

    const tsConfig: ThrusterSystemConfig<FpsThrusterName> = {
      fuelCapacity: config.o2.fuelCapacity,
      thrusters: config.o2.thrusters,
    }
    this.thrusterSystem = new ThrusterSystem<FpsThrusterName>(tsConfig)
  }

  /** Whether the player is on the ground. */
  get grounded(): boolean {
    return this.body.grounded
  }

  /** Current O2 remaining (fuel level). */
  get o2Level(): number {
    return this.thrusterSystem.fuelLevel
  }

  /** Max O2 capacity. */
  get o2Capacity(): number {
    return this.thrusterSystem.fuelCapacity
  }

  /**
   * Whether the player is actively sprinting this frame.
   *
   * Reflects the same combined check used internally in {@link tick}: grounded,
   * sprint input held, lockout cleared, and at least one frame of charge
   * available. Other systems (breathing audio, dust puffs, FOV kick) should
   * read this instead of duplicating the check — duplicates miss the lockout
   * and end up firing during the recovery window.
   */
  get isSprinting(): boolean {
    return this._isSprinting
  }

  /** Current lateral speed magnitude (XZ plane only). */
  get speed(): number {
    const vx = this.lateralVelocity.x
    const vz = this.lateralVelocity.z
    return Math.sqrt(vx * vx + vz * vz)
  }

  /** Current hit points. */
  get hp(): number {
    return this._hp
  }

  /** Maximum hit points. */
  get maxHp(): number {
    return this.config.health.maxHp
  }

  /** Whether the player is dead. */
  get isDead(): boolean {
    return this._dead
  }

  /**
   * Apply a lateral impulse directly to velocity (for testing / external forces).
   *
   * @param x - X velocity to add (units/s)
   * @param z - Z velocity to add (units/s)
   */
  /**
   * Apply damage to the player. Fires onDeath when HP reaches zero.
   *
   * @param amount - HP to subtract
   */
  takeDamage(amount: number): void {
    if (this._dead) return
    this._hp = Math.max(0, this._hp - amount)
    if (this._hp <= 0) {
      this._dead = true
      this.onDeath?.()
    }
  }

  /** Restore O2, stamina, and health (e.g. returning to lander). */
  replenish(): void {
    this.thrusterSystem.refuel()
    this._hp = this.config.health.maxHp
    this._dead = false
  }

  /** Set ADS state — affects strafe speed. */
  setAiming(aiming: boolean): void {
    this._aiming = aiming
  }

  /**
   * Add an instantaneous lateral velocity change (knockback, explosion push,
   * etc.) and prevent the grounded-movement loop from overwriting it for a
   * short window so the impulse is actually felt.
   *
   * Without the override window the grounded branch of {@link tick} resets
   * `lateralVelocity` to `(input * maxSpeed)` every frame, silently swallowing
   * any impulse that lands while the player has their feet on the ground.
   *
   * @param x - World-space X velocity to add.
   * @param z - World-space Z velocity to add.
   * @param overrideDurationS - How long (seconds) to suppress the grounded
   *   velocity overwrite so the impulse is preserved. Defaults to
   *   {@link KNOCKBACK_OVERRIDE_DURATION}. Pass `0` to opt out (e.g. for unit
   *   tests that want to observe friction decay without the override).
   */
  applyLateralImpulse(
    x: number,
    z: number,
    overrideDurationS: number = KNOCKBACK_OVERRIDE_DURATION,
  ): void {
    this.lateralVelocity.x += x
    this.lateralVelocity.z += z
    if (overrideDurationS > 0) {
      this.knockbackTimer = Math.max(this.knockbackTimer, overrideDurationS)
    }
  }

  /**
   * Attempt to jump. Only works when grounded and jump thruster has charge.
   * Applies an upward velocity impulse via {@link PlatformerBody}.
   */
  jump(): void {
    if (!this.body.grounded) return
    if (!this.thrusterSystem.canFire('jump')) return
    this.body.impulse(this.config.movement.jumpForce)
    this.body.grounded = false
  }

  /**
   * Advance one frame of player simulation.
   *
   * @param dt - Delta time in seconds
   */
  tick(dt: number): void {
    const mv = this.config.movement

    // Sprint lockout — once the bar empties, ignore Shift until the bar has
    // refilled to a meaningful fraction of capacity. Prevents the
    // "stuttering sprint" feel where holding Shift after exhaustion grabs
    // every individual frame of recovered charge.
    const sprintCfg = this.config.o2.thrusters.sprint
    const sprintCharge = this.thrusterSystem.getState('sprint').charge
    if (sprintCharge <= 0) {
      this.sprintLocked = true
    } else if (
      this.sprintLocked &&
      sprintCharge >= sprintCfg.capacity * SPRINT_RELOCK_FRACTION
    ) {
      this.sprintLocked = false
    }

    const isSprinting =
      this.body.grounded &&
      this.inputManager.isActionActive('sprint') &&
      !this.sprintLocked &&
      this.thrusterSystem.canFire('sprint')
    this._isSprinting = isSprinting

    // --- Coyote time — track how long since last grounded ---
    if (this.body.grounded) {
      this.coyoteTimer = COYOTE_TIME
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt)
    }

    // --- Input-driven jump (hold to auto-hop) ---
    const jumpHeld = this.inputManager.isActionActive('jump')
    const canJump = jumpHeld && this.coyoteTimer > 0 && this.thrusterSystem.canFire('jump')
    if (canJump) {
      const jumpBoost = isSprinting ? SPRINT_JUMP_BOOST : 1
      this.body.impulse(this.config.movement.jumpForce * jumpBoost)
      this.body.grounded = false
      this.coyoteTimer = 0
      if (!this._prevJumping) {
        useAudio().play('sfx.jump')
      }
    }
    this._prevJumping = canJump

    // --- Thruster system tick (recharge / drain) ---
    this.thrusterSystem.tick(dt, {
      sprint: isSprinting,
      jump: canJump,
    })

    // --- Base O2 drain (breathing) ---
    this.thrusterSystem.consumeFuel(this.config.o2.baseDrainRate * dt)

    // --- Hypoxia: HP drain only when O2 tank is empty ---
    if (this.thrusterSystem.isFuelEmpty && !this._dead) {
      this.takeDamage(this.config.health.hypoxiaDamagePerSecond * dt)
    }

    // --- Lateral movement ---
    const forward = this.camera.getForwardXZ()
    const right = this.camera.getRightXZ()
    const maxSpd = isSprinting ? mv.maxSprintSpeed : mv.maxSpeed
    const strafe = this._aiming ? ADS_STRAFE_SPEED_SCALE : STRAFE_SPEED_SCALE
    let wishX = 0
    let wishZ = 0
    if (this.inputManager.isActionActive('moveForward')) {
      wishX += forward.x; wishZ += forward.y
    }
    if (this.inputManager.isActionActive('moveBack')) {
      wishX -= forward.x; wishZ -= forward.y
    }
    if (this.inputManager.isActionActive('moveLeft')) {
      wishX -= right.x * strafe; wishZ -= right.y * strafe
    }
    if (this.inputManager.isActionActive('moveRight')) {
      wishX += right.x * strafe; wishZ += right.y * strafe
    }
    const wishLen = Math.sqrt(wishX * wishX + wishZ * wishZ)

    // Decay the knockback override window — while it's active the grounded
    // branch below preserves momentum instead of clobbering `lateralVelocity`,
    // so external impulses (contact damage, explosions, projectile pushback)
    // are actually visible.
    if (this.knockbackTimer > 0) {
      this.knockbackTimer = Math.max(0, this.knockbackTimer - dt)
    }

    if (this.body.grounded && this.knockbackTimer <= 0) {
      // Grounded: instant velocity toward input direction (responsive walking)
      if (wishLen > 0) {
        // Normalize and scale to target speed
        this.lateralVelocity.x = (wishX / wishLen) * maxSpd
        this.lateralVelocity.z = (wishZ / wishLen) * maxSpd
      } else {
        // No input: stop immediately on ground
        this.lateralVelocity.x = 0
        this.lateralVelocity.z = 0
      }
    } else if (this.body.grounded) {
      // Knockback override active — let the impulse carry the player while
      // ground friction bleeds it off. Input still nudges along the existing
      // direction (same shape as the airborne branch) so the player can
      // partially fight the push.
      if (wishLen > 0) {
        const dirX = wishX / wishLen
        const dirZ = wishZ / wishLen
        const currentAlongWish = this.lateralVelocity.x * dirX + this.lateralVelocity.z * dirZ
        if (currentAlongWish < maxSpd) {
          const addSpeed = Math.min(maxSpd - currentAlongWish, mv.moveThrust * dt)
          this.lateralVelocity.x += dirX * addSpeed
          this.lateralVelocity.z += dirZ * addSpeed
        }
      }

      const speed = this.speed
      if (speed > 0) {
        const drop = mv.groundFriction * dt
        const factor = Math.max(0, speed - drop) / speed
        this.lateralVelocity.x *= factor
        this.lateralVelocity.z *= factor
      }
    } else {
      // Airborne: preserve trajectory, but allow a very small amount of steering.
      if (wishLen > 0) {
        const dirX = wishX / wishLen
        const dirZ = wishZ / wishLen
        const currentAlongWish = this.lateralVelocity.x * dirX + this.lateralVelocity.z * dirZ
        const maxAirControlSpeed = maxSpd * AIR_CONTROL_SPEED_FRACTION
        if (currentAlongWish < maxAirControlSpeed) {
          const addSpeed = Math.min(
            maxAirControlSpeed - currentAlongWish,
            maxSpd * AIR_CONTROL_ACCEL_FRACTION * dt,
          )
          this.lateralVelocity.x += dirX * addSpeed
          this.lateralVelocity.z += dirZ * addSpeed
        }
      }

      // Air friction (weak — momentum carries)
      const speed = this.speed
      if (speed > 0) {
        const drop = mv.airFriction * dt
        const factor = Math.max(0, speed - drop) / speed
        this.lateralVelocity.x *= factor
        this.lateralVelocity.z *= factor
      }

      // Speed clamp in air
      const currentSpeed = this.speed
      if (currentSpeed > maxSpd) {
        const scale = maxSpd / currentSpeed
        this.lateralVelocity.x *= scale
        this.lateralVelocity.z *= scale
      }
    }

    // --- Apply lateral velocity ---
    const horizontalMove = this.collisionWorld.moveCharacterXZ(
      this.group.position,
      this.lateralVelocity.x * dt,
      this.lateralVelocity.z * dt,
      this.group.position.y,
      this.group.position.y + this.config.camera.eyeHeight,
      PLAYER_COLLISION_CONFIG,
    )
    this.group.position.x = horizontalMove.x
    this.group.position.z = horizontalMove.z

    // --- Gravity + grounding ---
    const support = this.collisionWorld.getHighestSupportUnderDisc(
      this.group.position.x,
      this.group.position.z,
      this.group.position.y - PLAYER_COLLISION_CONFIG.airborneClearance,
      this.group.position.y + PLAYER_COLLISION_CONFIG.maxStepHeight,
      PLAYER_COLLISION_CONFIG.radius,
    )
    this.group.position.y = this.body.tick(dt, this.group.position.y, support.height)

    // --- Surface conforming (align up to terrain/support normal when grounded) ---
    if (this.body.grounded) {
      const n = support.normal
      const tiltX = Math.atan2(n.z, n.y)
      const tiltZ = Math.atan2(-n.x, n.y)
      this.group.rotation.set(tiltX, this.group.rotation.y, tiltZ)
    }
  }

  /** Release resources. No owned listeners — pointer lock handled by ViewController. */
  dispose(): void {
    // No owned resources to clean up
  }
}
