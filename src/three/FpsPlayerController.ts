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
import type { FpsCamera } from './FpsCamera'
import { PlatformerBody } from '@/lib/physics/platformerBody'
import { ThrusterSystem } from '@/lib/physics/thrusterSystem'
import type { ThrusterSystemConfig } from '@/lib/physics/thrusterSystem'
import type { Heightmap } from '@/lib/terrain/heightmap'

/** How long a jump press is buffered (seconds). */
const JUMP_BUFFER_TIME = 0.2
/** How long after leaving the ground the player can still jump (coyote time). */
const COYOTE_TIME = 0.15

/** Thruster names for the player's O2 power system. */
export type FpsThrusterName = 'sprint' | 'jump'

/** Shape of the player-config.json file. */
export interface FpsPlayerConfig {
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
  private readonly heightmap: Heightmap
  private readonly lateralVelocity = new THREE.Vector3()
  private _deathTimer: number | null = null
  /** Jump input buffer — time remaining to honor a jump press. */
  private jumpBuffer = 0
  /** Coyote timer — time since last grounded, allows late jumps. */
  private coyoteTimer = 0

  /** Fired when death timer expires. */
  onDeath: (() => void) | null = null

  constructor(
    inputManager: InputManager,
    camera: FpsCamera,
    config: FpsPlayerConfig,
    heightmap: Heightmap,
  ) {
    this.inputManager = inputManager
    this.camera = camera
    this.config = config
    this.heightmap = heightmap

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

  /** Current lateral speed magnitude (XZ plane only). */
  get speed(): number {
    const vx = this.lateralVelocity.x
    const vz = this.lateralVelocity.z
    return Math.sqrt(vx * vx + vz * vz)
  }

  /** Death timer seconds remaining, or null if not active. */
  get deathTimer(): number | null {
    return this._deathTimer
  }

  /**
   * Apply a lateral impulse directly to velocity (for testing / external forces).
   *
   * @param x - X velocity to add (units/s)
   * @param z - Z velocity to add (units/s)
   */
  applyLateralImpulse(x: number, z: number): void {
    this.lateralVelocity.x += x
    this.lateralVelocity.z += z
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
    const isSprinting =
      this.inputManager.isActionActive('sprint') && this.thrusterSystem.canFire('sprint')

    // --- Coyote time — track how long since last grounded ---
    if (this.body.grounded) {
      this.coyoteTimer = COYOTE_TIME
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt)
    }

    // --- Input-driven jump (buffered + coyote) ---
    if (this.inputManager.wasActionPressed('jump')) {
      this.jumpBuffer = JUMP_BUFFER_TIME
    }
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt)
    const canJump = this.jumpBuffer > 0 && this.coyoteTimer > 0
    const jumpPressed = canJump && this.thrusterSystem.canFire('jump')
    if (jumpPressed) {
      this.body.impulse(this.config.movement.jumpForce)
      this.body.grounded = false
      this.coyoteTimer = 0
      this.jumpBuffer = 0
    }

    // --- Thruster system tick (recharge / drain) ---
    this.thrusterSystem.tick(dt, {
      sprint: isSprinting,
      jump: jumpPressed,
    })

    // --- Base O2 drain (breathing) ---
    this.thrusterSystem.consumeFuel(this.config.o2.baseDrainRate * dt)

    // --- Death timer ---
    if (this.thrusterSystem.isFuelEmpty) {
      if (this._deathTimer === null) {
        this._deathTimer = this.config.o2.deathTimerSeconds
      }
      this._deathTimer -= dt
      if (this._deathTimer <= 0) {
        this._deathTimer = 0
        this.onDeath?.()
      }
    } else if (this._deathTimer !== null) {
      // O2 restored — cancel timer
      this._deathTimer = null
    }

    // --- Lateral movement ---
    const forward = this.camera.getForwardXZ()
    const right = this.camera.getRightXZ()
    const maxSpd = isSprinting ? mv.maxSprintSpeed : mv.maxSpeed

    if (this.body.grounded) {
      // Grounded: instant velocity toward input direction (responsive walking)
      let wishX = 0
      let wishZ = 0
      if (this.inputManager.isActionActive('moveForward')) {
        wishX += forward.x; wishZ += forward.y
      }
      if (this.inputManager.isActionActive('moveBack')) {
        wishX -= forward.x; wishZ -= forward.y
      }
      if (this.inputManager.isActionActive('moveLeft')) {
        wishX -= right.x; wishZ -= right.y
      }
      if (this.inputManager.isActionActive('moveRight')) {
        wishX += right.x; wishZ += right.y
      }
      const wishLen = Math.sqrt(wishX * wishX + wishZ * wishZ)
      if (wishLen > 0) {
        // Normalize and scale to target speed
        this.lateralVelocity.x = (wishX / wishLen) * maxSpd
        this.lateralVelocity.z = (wishZ / wishLen) * maxSpd
      } else {
        // No input: stop immediately on ground
        this.lateralVelocity.x = 0
        this.lateralVelocity.z = 0
      }
    } else {
      // Airborne: thrust-based (committal, floaty)
      const thrustMag = mv.moveThrust * (isSprinting ? mv.sprintMultiplier : 1)
      if (this.inputManager.isActionActive('moveForward')) {
        this.lateralVelocity.x += forward.x * thrustMag * dt
        this.lateralVelocity.z += forward.y * thrustMag * dt
      }
      if (this.inputManager.isActionActive('moveBack')) {
        this.lateralVelocity.x -= forward.x * thrustMag * dt
        this.lateralVelocity.z -= forward.y * thrustMag * dt
      }
      if (this.inputManager.isActionActive('moveLeft')) {
        this.lateralVelocity.x -= right.x * thrustMag * dt
        this.lateralVelocity.z -= right.y * thrustMag * dt
      }
      if (this.inputManager.isActionActive('moveRight')) {
        this.lateralVelocity.x += right.x * thrustMag * dt
        this.lateralVelocity.z += right.y * thrustMag * dt
      }

      // Air friction (weak — commit to your jump)
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
    this.group.position.x += this.lateralVelocity.x * dt
    this.group.position.z += this.lateralVelocity.z * dt

    // --- Gravity + grounding ---
    const floorY = this.heightmap.heightAt(this.group.position.x, this.group.position.z)
    this.group.position.y = this.body.tick(dt, this.group.position.y, floorY)

    // --- Terrain conforming (align up to surface normal when grounded) ---
    if (this.body.grounded) {
      const n = this.heightmap.normalAt(this.group.position.x, this.group.position.z)
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
