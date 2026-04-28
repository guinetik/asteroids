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
import {
  CollisionWorld,
  type CharacterCollisionConfig,
  type SupportSurfaceResult,
} from '@/lib/physics/worldCollision'

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
 * Air-control acceleration fraction while hovering — the multitool RTG
 * is supplying the thrust now, so aerial mobility can be much closer
 * to grounded responsiveness without trivialising plain jump arcs.
 */
const HOVER_AIR_CONTROL_ACCEL_FRACTION = 0.7
/**
 * Speed cap for hover-driven air control. Pushed up alongside the
 * accel fraction so the player can actually reach a meaningful
 * lateral velocity from a standing jump while holding hover.
 */
const HOVER_AIR_CONTROL_SPEED_FRACTION = 0.6
/** Maximum vertical gap (units) the boots will snap downward over while walking. */
const GRAVITY_BOOTS_SNAP_DISTANCE = 0.18
/** Maximum ledge drop (units) the boots will briefly mask before declaring a fall. */
const GRAVITY_BOOTS_LEDGE_DROP = 0.35
/** How long the boots preserve locomotion-grounded state across tiny gaps. */
const GRAVITY_BOOTS_GRACE_TIME = 0.08
/** Downward snap speed (units/s) while the boots pull the player onto support. */
const GRAVITY_BOOTS_SNAP_SPEED = 18
/** Upward velocity above this breaks the boots immediately into airborne mode. */
const GRAVITY_BOOTS_UPWARD_BREAK_SPEED = 0.75

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
 * a full bar before holding Shift can engage sprint again. Without the lockout,
 * the per-frame `canFire` check lets sprint stutter on for one frame as soon as
 * a sliver of charge is recovered, which feels like the system is fighting the
 * input. Requiring a full refill makes "out of stamina" read as a complete
 * cooldown instead of a partial pause.
 *
 * Tuned to `1` so sprint stays unavailable until the tank has completely
 * recovered. Combined with the `sprintReleasedSinceLockout` gate this gives a
 * recognisable "winded" cooldown instead of the previous recharge-drain-lock
 * cycle that pulsed the breathing audio every couple of seconds.
 */
const SPRINT_RELOCK_FRACTION = 1
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
    /** Upward acceleration applied while holding jump in mid-air to soften gravity. */
    hoverForce: number
    /** Downward acceleration (units/s²). */
    gravity: number
  }
  /** O2 (life support / fuel) system configuration. */
  o2: {
    /** Total O2 units in the tank. */
    fuelCapacity: number
    /** O2 drained per second regardless of activity. */
    baseDrainRate: number
    /** Extra O2 drained per second while the player is holding hover thrust in mid-air. */
    hoverDrainRate: number
    /** Seconds between O2 empty and death. */
    deathTimerSeconds: number
    /** Per-thruster configuration for sprint and jump. */
    thrusters: {
      /** Sprint thruster drains O2 while sprinting. */
      sprint: {
        capacity: number
        burnRate: number
        rechargeRate: number
        fuelCostPerRecharge: number
      }
      /** Jump thruster drains O2 on each jump. */
      jump: {
        capacity: number
        burnRate: number
        rechargeRate: number
        fuelCostPerRecharge: number
      }
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

  /**
   * Optional fuel pool the airborne hover thrusters drain from instead
   * of O2. When set (typically the multitool's RTG), holding jump in
   * mid-air no longer steals breathable oxygen — it costs power. The
   * empty check used to gate hover engagement also follows the source,
   * so a depleted RTG cuts hover even with O2 in the tank.
   */
  private hoverFuelSource: {
    consumeFuel(amount: number): void
    readonly isFuelEmpty: boolean
  } | null = null

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
   * zero, cleared only after BOTH:
   *   1. The sprint button has been released for at least one frame
   *      (tracked via {@link sprintReleasedSinceLockout}), AND
   *   2. The bar has refilled to {@link SPRINT_RELOCK_FRACTION} of capacity.
   *
   * The release requirement matters for audio/feel: without it, holding Shift
   * after exhaustion auto-cycles `recharge → unlock → drain → lock` every
   * couple of seconds, restarting the breathing-run sample on each cycle and
   * producing an audible "spam" pulse even though the mechanical sprint is
   * correctly suppressed most of the time. Forcing a Shift release breaks
   * that cycle — the player has to deliberately re-engage the sprint, which
   * is also the standard FPS stamina convention.
   */
  private sprintLocked = false
  /**
   * True once the sprint button has been observed released since the latest
   * lockout. Stays `false` while the player keeps Shift held through a
   * depletion event, gating the lockout's auto-clear. Reset back to `false`
   * each time the lockout latches.
   */
  private sprintReleasedSinceLockout = true
  /**
   * Latest sprint-engagement state from {@link tick}. Exposed via {@link isSprinting}
   * so other systems (audio, FX, gameplay) react to actual sprint instead of
   * recomputing the conditions and missing the lockout.
   */
  private _isSprinting = false
  /** Latest airborne hover-thrust engagement state from {@link tick}. */
  private _isHovering = false
  /** Stable grounded state used by locomotion/audio/UI consumers. */
  private bootsGrounded = false
  /** Short grace window so tiny support ambiguity does not flicker grounded state. */
  private bootsGraceTimer = 0

  /**
   * When set, overrides the collision-world ground sampler in `tick()` —
   * the player walks on a flat plane at this world Y. Used by the level
   * controller during `bunker-interior` to bypass the asteroid heightmap
   * (which doesn't model the bunker floor). Set to `null` to restore
   * normal terrain-driven ground sampling.
   */
  private groundYOverride: number | null = null

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
    return this.bootsGrounded
  }

  /** Whether the physics body has strict support contact this frame. */
  get physicsGrounded(): boolean {
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

  /** Whether the player is actively holding hover thrust in mid-air this frame. */
  get isHovering(): boolean {
    return this._isHovering
  }

  /**
   * Route hover-thruster fuel cost away from O2 and into the supplied
   * pool (typically `MultiToolState.thrusterSystem` for the RTG).
   * Pass `null` to revert to draining the O2 tank.
   */
  setHoverFuelSource(
    source: { consumeFuel(amount: number): void; readonly isFuelEmpty: boolean } | null,
  ): void {
    this.hoverFuelSource = source
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
    this._isHovering = false
    // Clear sprint lockout state — a full bar should mean fresh sprint
    // available without forcing a Shift release first.
    this.sprintLocked = false
    this.sprintReleasedSinceLockout = true
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
    if (!this.grounded) return
    if (!this.thrusterSystem.canFire('jump')) return
    this.body.impulse(this.config.movement.jumpForce)
    this.body.grounded = false
    this.breakGravityBoots()
  }

  /**
   * Advance one frame of player simulation.
   *
   * @param dt - Delta time in seconds
   */
  tick(dt: number): void {
    const mv = this.config.movement

    // Sprint lockout — once the bar empties, ignore Shift until BOTH the bar
    // has refilled to SPRINT_RELOCK_FRACTION and the player has released
    // Shift at least once. The release requirement breaks the auto
    // "recharge → drain → lock" cycle that otherwise restarts the breathing
    // -run audio every couple of seconds when the player keeps Shift held
    // through exhaustion. Mechanically this matches the standard FPS feel
    // ("you ran out of stamina, let go and re-press to sprint again").
    const sprintCfg = this.config.o2.thrusters.sprint
    const sprintCharge = this.thrusterSystem.getState('sprint').charge
    const sprintHeld = this.inputManager.isActionActive('sprint')
    const hasMoveInput =
      this.inputManager.isActionActive('moveForward') ||
      this.inputManager.isActionActive('moveBack') ||
      this.inputManager.isActionActive('moveLeft') ||
      this.inputManager.isActionActive('moveRight')
    const sprintWantsEngage = this.grounded && sprintHeld && hasMoveInput
    const sprintCanFire = this.thrusterSystem.canFire('sprint')

    if (sprintCharge <= 0 || (sprintWantsEngage && !sprintCanFire)) {
      if (!this.sprintLocked) {
        this.sprintLocked = true
        this.sprintReleasedSinceLockout = false
      }
    }

    if (this.sprintLocked && !sprintHeld) {
      this.sprintReleasedSinceLockout = true
    }

    if (
      this.sprintLocked &&
      this.sprintReleasedSinceLockout &&
      sprintCharge >= sprintCfg.capacity * SPRINT_RELOCK_FRACTION
    ) {
      this.sprintLocked = false
    }

    const isSprinting = sprintWantsEngage && !this.sprintLocked && sprintCanFire
    this._isSprinting = isSprinting

    // --- Coyote time — track how long since last grounded ---
    if (this.grounded) {
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
      this.breakGravityBoots()
      this.coyoteTimer = 0
      if (!this._prevJumping) {
        // Layer the thruster cue + the effort grunt on the rising edge.
        // The grunt's manifest entry is rate-limited so a burst of hops
        // doesn't repeat the vocal — only the first jump in a window
        // colours in.
        const audio = useAudio()
        audio.play('sfx.jump')
        audio.play('sfx.jump.voice')
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

    // Hover gate: if a separate fuel source is wired up (RTG), require
    // its tank to be non-empty instead of the O2 tank. Without an
    // override, breathable oxygen still doubles as the energy reserve.
    const hoverFuelEmpty = this.hoverFuelSource
      ? this.hoverFuelSource.isFuelEmpty
      : this.thrusterSystem.isFuelEmpty
    const hoverActive = jumpHeld && !canJump && !this.grounded && !hoverFuelEmpty
    this._isHovering = hoverActive
    if (hoverActive) {
      this.body.impulse(this.config.movement.hoverForce * dt)
      const drain = this.config.o2.hoverDrainRate * dt
      if (this.hoverFuelSource) {
        this.hoverFuelSource.consumeFuel(drain)
      } else {
        this.thrusterSystem.consumeFuel(drain)
      }
      this.breakGravityBoots()
    }

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
      wishX += forward.x
      wishZ += forward.y
    }
    if (this.inputManager.isActionActive('moveBack')) {
      wishX -= forward.x
      wishZ -= forward.y
    }
    if (this.inputManager.isActionActive('moveLeft')) {
      wishX -= right.x * strafe
      wishZ -= right.y * strafe
    }
    if (this.inputManager.isActionActive('moveRight')) {
      wishX += right.x * strafe
      wishZ += right.y * strafe
    }
    const wishLen = Math.sqrt(wishX * wishX + wishZ * wishZ)

    // Decay the knockback override window — while it's active the grounded
    // branch below preserves momentum instead of clobbering `lateralVelocity`,
    // so external impulses (contact damage, explosions, projectile pushback)
    // are actually visible.
    if (this.knockbackTimer > 0) {
      this.knockbackTimer = Math.max(0, this.knockbackTimer - dt)
    }

    if (this.grounded && this.knockbackTimer <= 0) {
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
    } else if (this.grounded) {
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
      const airControlAccelFraction = hoverActive
        ? HOVER_AIR_CONTROL_ACCEL_FRACTION
        : AIR_CONTROL_ACCEL_FRACTION
      const airControlSpeedFraction = hoverActive
        ? HOVER_AIR_CONTROL_SPEED_FRACTION
        : AIR_CONTROL_SPEED_FRACTION
      if (wishLen > 0) {
        const dirX = wishX / wishLen
        const dirZ = wishZ / wishLen
        const currentAlongWish = this.lateralVelocity.x * dirX + this.lateralVelocity.z * dirZ
        const maxAirControlSpeed = maxSpd * airControlSpeedFraction
        if (currentAlongWish < maxAirControlSpeed) {
          const addSpeed = Math.min(
            maxAirControlSpeed - currentAlongWish,
            maxSpd * airControlAccelFraction * dt,
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
    const support: SupportSurfaceResult =
      this.groundYOverride !== null
        ? {
            height: this.groundYOverride,
            normal: { x: 0, y: 1, z: 0 },
            colliderId: null,
          }
        : this.collisionWorld.getHighestSupportUnderDisc(
            this.group.position.x,
            this.group.position.z,
            this.group.position.y - PLAYER_COLLISION_CONFIG.airborneClearance,
            this.group.position.y + PLAYER_COLLISION_CONFIG.maxStepHeight,
            PLAYER_COLLISION_CONFIG.radius,
          )
    const wantsMovementBoots = wishLen > 0 && this.knockbackTimer <= 0
    const shouldBreakBoots =
      canJump ||
      hoverActive ||
      this.knockbackTimer > 0 ||
      this.body.velocityY > GRAVITY_BOOTS_UPWARD_BREAK_SPEED
    const supportGap = this.group.position.y - support.height
    const supportBelowFeet = support.height <= this.group.position.y
    const supportWalkable = support.normal.y >= Math.cos(PLAYER_COLLISION_CONFIG.maxClimbAngleRad)
    const canUseGravityBoots =
      wantsMovementBoots &&
      !shouldBreakBoots &&
      supportWalkable &&
      supportBelowFeet &&
      supportGap >= 0 &&
      supportGap <= GRAVITY_BOOTS_LEDGE_DROP

    if (shouldBreakBoots) {
      this.breakGravityBoots()
    } else if (canUseGravityBoots) {
      this.bootsGraceTimer = GRAVITY_BOOTS_GRACE_TIME
    } else {
      this.bootsGraceTimer = Math.max(0, this.bootsGraceTimer - dt)
    }

    const shouldSnapToSupport = canUseGravityBoots && supportGap <= GRAVITY_BOOTS_SNAP_DISTANCE

    if (shouldSnapToSupport) {
      const snapDistance = Math.min(supportGap, GRAVITY_BOOTS_SNAP_SPEED * dt)
      this.group.position.y = Math.max(support.height, this.group.position.y - snapDistance)
      if (this.group.position.y <= support.height + 1e-4) {
        this.group.position.y = support.height
        if (this.body.velocityY < 0) {
          this.body.velocityY = 0
        }
      }
    }

    this.group.position.y = this.body.tick(dt, this.group.position.y, support.height)
    this.bootsGrounded =
      this.body.grounded ||
      (this.bootsGraceTimer > 0 && canUseGravityBoots && supportGap <= GRAVITY_BOOTS_SNAP_DISTANCE)

    // --- Surface conforming (align up to terrain/support normal when grounded) ---
    if (this.grounded) {
      const n = support.normal
      const tiltX = Math.atan2(n.z, n.y)
      const tiltZ = Math.atan2(-n.x, n.y)
      this.group.rotation.set(tiltX, this.group.rotation.y, tiltZ)
    }
  }

  /** Clear boots-grounded state so the next frame uses airborne locomotion rules. */
  private breakGravityBoots(): void {
    this.bootsGrounded = false
    this.bootsGraceTimer = 0
  }

  /**
   * Override the ground Y the player physics samples each tick. Pass `null`
   * to restore terrain-based ground sampling.
   *
   * @param y - World Y of the override floor, or null to clear
   */
  setGroundYOverride(y: number | null): void {
    this.groundYOverride = y
  }

  /** Release resources. No owned listeners — pointer lock handled by ViewController. */
  dispose(): void {
    this._isHovering = false
    // No owned resources to clean up
  }
}
