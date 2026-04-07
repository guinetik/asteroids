/**
 * Controls the lunar lander model — loading, platformer gravity, main engine,
 * and RCS thruster particle emitters.
 *
 * The main descent engine ("Thruster_Lunar Lander_0") fires upward against
 * Moon-level gravity. RCS thrusters emit white puffs on WASD input.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/asteroid-lander-gdd.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { InputManager } from '@/lib/InputManager'
import { loadGLB } from './loadGLB'
import { PlatformerBody } from '@/lib/physics/platformerBody'
import { CollisionWorld } from '@/lib/physics/worldCollision'
import { ThrusterSystem, type ThrusterSystemConfig } from '@/lib/physics/thrusterSystem'
import type { Heightmap } from '@/lib/terrain/heightmap'
import { ParticleEmitter } from './ParticleEmitter'
import { WarningBeacon } from './WarningBeacon'

const LANDER_MODEL_PATH = '/models/lander.glb'

/** Lander model scale — adjust to match game units */
const MODEL_SCALE = 5

/** Fallback ground level when no heightmap is set */
const DEFAULT_FLOOR_Y = 0

/** Gameplay gravity — harsher than Moon (1.62) but friendlier than Earth (9.81) */
const GAMEPLAY_GRAVITY = 3.0

/**
 * Main engine thrust — generous TWR (~3.3) so you can always arrest a fall.
 * Gravity 3.0 means you need real authority to stop a long drop.
 */
const MAIN_ENGINE_THRUST = 10

/** Lander thruster groups: main engine (red) and RCS (white) */
export type LanderThrusterName = 'mainEngine' | 'rcs'

/** Lander thruster config — shared fuel tank */
const LANDER_THRUSTER_CONFIG: ThrusterSystemConfig<LanderThrusterName> = {
  thrusters: {
    mainEngine: { capacity: 120, burnRate: 18, rechargeRate: 14, fuelCostPerRecharge: 0.4 },
    rcs: { capacity: 80, burnRate: 5, rechargeRate: 9, fuelCostPerRecharge: 0.12 },
  },
  fuelCapacity: 600,
}

/** Node name for the main descent engine bell in the GLB */
const MAIN_ENGINE_NODE = 'Thruster_Lunar_Lander_0'

/** RCS ascend thrust — smaller boost than main engine */
const RCS_ASCEND_THRUST = 3.14

/** Main engine flame emitter config */
const FLAME_POOL_SIZE = 500
const FLAME_COLOR = new THREE.Color(0xffcc66)
const FLAME_SIZE = 6
const FLAME_LIFETIME = 0.5
const FLAME_SPREAD = 2
/** Base downward push for flame particles. */
const FLAME_PUSH_FORCE = 30
/** Extra push added per unit of fall speed so flames stay below the lander. */
const FLAME_VELOCITY_COMPENSATION = 1.5
const FLAME_SPAWN_RATE = 300
const FLAME_EMIT_Y_OFFSET = 4

/** Nozzle glow sprite — always-on idle glow at the engine bell. */
const NOZZLE_GLOW_SIZE = 8
const NOZZLE_GLOW_TEXTURE_SIZE = 64
const NOZZLE_GLOW_COLOR_CORE = '#fff5cc'
const NOZZLE_GLOW_COLOR_EDGE = '#ff9a1f'

/** RCS emitter config — white puffs, smaller and shorter than main flame */
const RCS_POOL_SIZE = 120
const RCS_COLOR = new THREE.Color(0xddeeff)
const RCS_SIZE = 1.2
const RCS_LIFETIME = 0.5
const RCS_SPREAD = 1.5
const RCS_PUSH_FORCE = 10
const RCS_SPAWN_RATE = 250

/** Lander floodlights mounted near the front legs to illuminate the terrain below. */
const FLOODLIGHT_COLOR = 0xf4f7ff
const FLOODLIGHT_INTENSITY = 62
const FLOODLIGHT_DISTANCE = 260
const FLOODLIGHT_ANGLE = Math.PI * 0.22
const FLOODLIGHT_PENUMBRA = 0.88
const FLOODLIGHT_DECAY = 1.35
const FLOODLIGHT_MOUNT_INSET = 0.6
const FLOODLIGHT_AIM_DISTANCE = 220
const FLOODLIGHT_OUTWARD_ANGLE = Math.PI * 0.22
const FLOODLIGHT_FORWARD_ANGLE = Math.PI * 0.14
const FLOODLIGHT_SHADOW_MAP_SIZE = 512
const FLOODLIGHT_SHADOW_BIAS = -0.0008

/** Small fill light so the lander hull stays legible in darkness. */
const BODY_FILL_LIGHT_COLOR = 0xf4f7ff
const BODY_FILL_LIGHT_INTENSITY = 3.4
const BODY_FILL_LIGHT_DISTANCE = 110
const BODY_FILL_LIGHT_Y_OFFSET = 10

/** Roof-mounted warning beacon centered above the lander chassis. */
const TOP_BEACON_Y_OFFSET = 22
const TOP_BEACON_LIGHT_INTENSITY = 24
const TOP_BEACON_LIGHT_DISTANCE = 140
const TOP_BEACON_GLOW_INTENSITY = 7
const TOP_BEACON_GLOW_DISTANCE = 210
const TOP_BEACON_SAFE_COLOR = 0x22c55e
const TOP_BEACON_WARN_COLOR = 0xeab308
const TOP_BEACON_DANGER_COLOR = 0xef4444

/** Visible beam volume so the floodlights read even before they hit terrain. */
const FLOODLIGHT_CONE_LENGTH = 220
const FLOODLIGHT_CONE_RADIUS = 60
const FLOODLIGHT_CONE_BASE_OPACITY = 0.032

/** Use the downward-facing RCS nodes as light mounts. */
const FLOODLIGHT_MOUNT_NODES = ['RCS_FL_Down', 'RCS_BL_Down', 'RCS_BR_Down', 'RCS_FR_Down'] as const

/**
 * Which RCS nodes fire for each input action.
 * Exhaust particles push in the direction of movement (visual feedback).
 * Camera faces -X (from front/stairs side), so from camera's POV:
 *   left/right = ±Z, forward/back = ±X
 *
 * A (rcsLeft)  → exhaust goes -Z (left from camera)
 * D (rcsRight) → exhaust goes +Z (right from camera)
 * W (rcsFore)  → exhaust goes -X (toward camera = forward)
 * S (rcsAft)   → exhaust goes +X (away from camera = backward)
 */
const RCS_ACTION_MAP: Record<string, { nodes: string[]; pushLocal: THREE.Vector3 }> = {
  rcsLeft: {
    nodes: ['RCS_FL_Aft', 'RCS_BL_Aft'],
    pushLocal: new THREE.Vector3(0, 0, -RCS_PUSH_FORCE),
  },
  rcsRight: {
    nodes: ['RCS_FR_Aft', 'RCS_BR_Aft'],
    pushLocal: new THREE.Vector3(0, 0, RCS_PUSH_FORCE),
  },
  rcsFore: {
    nodes: ['RCS_FR_Fore', 'RCS_FL_Fore'],
    pushLocal: new THREE.Vector3(RCS_PUSH_FORCE, 0, 0),
  },
  rcsAft: {
    nodes: ['RCS_BL_Fore', 'RCS_BR_Fore'],
    pushLocal: new THREE.Vector3(-RCS_PUSH_FORCE, 0, 0),
  },
  rcsDescend: {
    nodes: ['RCS_FL_Up', 'RCS_BL_Up', 'RCS_BR_Up', 'RCS_FR_Up'],
    pushLocal: new THREE.Vector3(0, RCS_PUSH_FORCE, 0),
  },
  rcsAscend: {
    nodes: ['RCS_FL_Down', 'RCS_BL_Down', 'RCS_BR_Down', 'RCS_FR_Down'],
    pushLocal: new THREE.Vector3(0, -RCS_PUSH_FORCE, 0),
  },
}

/** All unique RCS node names across all actions */
const ALL_RCS_NODES = [...new Set(Object.values(RCS_ACTION_MAP).flatMap((a) => a.nodes))]

/** RCS lateral movement — tilt + push */
const RCS_LATERAL_FORCE = 14
const TILT_MAX_ANGLE = 0.3 // ~17 degrees max tilt
const LIFTOFF_BOOST = 2.0
const LIFTOFF_BOOST_DURATION = 1.0
const RCS_LIFTOFF_BOOST = 3.0
/** Surface normal Y must be above this to count as "flat" for full liftoff boost */
const FLAT_GROUND_THRESHOLD = 0.95
/** Boost multiplier when launching from a slope */
const SLOPE_LIFTOFF_PENALTY = 0.5
const TILT_LERP_SPEED = 3 // how fast the lander tilts toward target
const TILT_RETURN_SPEED = 6 // how fast it returns to upright
const GROUND_TILT_LERP_SPEED = 4 // how fast the lander conforms to terrain slope
/** Yaw rotation speed in radians per second (gyroscope). */
const YAW_SPEED = 0.6
/** How quickly C key damps lateral velocity (fraction per second, 0-1). */
const RETRO_BRAKE_DAMPING = 3.0

/** Reusable temp objects for quaternion-based rotation. */
const _yAxis = new THREE.Vector3(0, 1, 0)
const _qTilt = new THREE.Quaternion()
const _euler = new THREE.Euler()
const _qYaw = new THREE.Quaternion()
const _sampleOffset = new THREE.Vector3()
const _sampleWorld = new THREE.Vector3()

interface TerrainSupportSample {
  height: number
  normal: { x: number; y: number; z: number }
  colliderId: string | null
  hasSupport: boolean
}

/** Maximum safe landing speed (abs velocityY) — no damage below this. */
const WARN_LANDING_SPEED = 5.0
const SAFE_LANDING_SPEED = 8.0

/** Maximum safe landing angle (combined tilt magnitude, radians ~15°). */
const WARN_LANDING_ANGLE = 0.17
const SAFE_LANDING_ANGLE = 0.26

/** HP damage per unit of excess landing speed. */
const SPEED_DAMAGE_MULTIPLIER = 2.0

/** HP damage per radian of excess landing tilt. */
const ANGLE_DAMAGE_MULTIPLIER = 25.0

/** Lander starting and maximum HP. */
const LANDER_MAX_HP = 100
const LANDING_APPROACH_BUFFER_ALTITUDE = 22
const LANDING_APPROACH_REACTION_TIME = 2.8
const LANDING_APPROACH_MIN_DESCENT_SPEED = 1.0
const LANDING_APPROACH_MAX_ALTITUDE = 150
const LANDING_BRAKING_DECELERATION = Math.max(0.01, MAIN_ENGINE_THRUST - GAMEPLAY_GRAVITY)
const LANDER_SUPPORT_SAMPLE_RADIUS = 9
const LANDER_SUPPORT_SAMPLE_DIAGONAL = LANDER_SUPPORT_SAMPLE_RADIUS * 0.72
const LANDER_SUPPORT_CONTACT_SAMPLE_COUNT = 3
const LANDER_COLLISION_RADIUS = 8.5
const LANDER_COLLISION_SUBSTEP_DISTANCE = 2
const LANDER_COLLISION_SKIN_WIDTH = 0.1
const LANDER_COLLISION_BOTTOM_OFFSET = 2
const LANDER_COLLISION_TOP_OFFSET = 18
const LANDER_SUPPORT_MAX_STEP_UP = 6
const LANDER_COLLIDER_ID = 'lander'

export type LandingWarningLevel = 'safe' | 'warn' | 'danger'

/**
 * Controls the lunar lander — gravity, main engine, and RCS emitters.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/asteroid-lander-gdd.md
 */
export class LanderController implements Tickable {
  readonly group = new THREE.Group()
  readonly body = new PlatformerBody({ gravity: GAMEPLAY_GRAVITY })
  readonly thrusterSystem = new ThrusterSystem<LanderThrusterName>(LANDER_THRUSTER_CONFIG)
  readonly flameEmitter: ParticleEmitter
  readonly nozzleGlow: THREE.Sprite
  readonly floodlights: THREE.SpotLight[] = []
  readonly bodyFillLight = new THREE.PointLight(
    BODY_FILL_LIGHT_COLOR,
    BODY_FILL_LIGHT_INTENSITY,
    BODY_FILL_LIGHT_DISTANCE,
  )
  readonly topWarningBeacon = new WarningBeacon({
    lightIntensity: TOP_BEACON_LIGHT_INTENSITY,
    lightDistance: TOP_BEACON_LIGHT_DISTANCE,
    glowIntensity: TOP_BEACON_GLOW_INTENSITY,
    glowDistance: TOP_BEACON_GLOW_DISTANCE,
    baseRadius: 1.35,
    baseHeight: 0.58,
    mastRadius: 0.24,
    mastHeight: 1.08,
    lensRadius: 0.54,
  })
  readonly floodlightCones: THREE.Mesh[] = []

  /** One emitter per RCS nozzle, keyed by node name */
  readonly rcsEmitters = new Map<string, ParticleEmitter>()

  private readonly inputManager: InputManager
  private heightmap: Heightmap | null = null
  private collisionWorld: CollisionWorld | null = null
  private mainEngineWorldPos = new THREE.Vector3()
  private mainEngineLocalPos = new THREE.Vector3()
  private flameSpawnAccumulator = 0

  /** Lateral velocity on the XZ plane from RCS thrusters */
  private lateralVelocity = new THREE.Vector3()

  /** Current visual tilt angles (X = A/D roll, Z = W/S pitch) */
  private tiltX = 0
  private tiltZ = 0

  /** Current yaw angle (Y rotation, Q/E gyroscope). */
  private yaw = 0
  private nozzleGlowTime = 0
  private engineMesh: THREE.Mesh | null = null

  /** Local-space positions of each RCS nozzle, keyed by node name */
  private readonly rcsLocalPositions = new Map<string, THREE.Vector3>()
  private readonly rcsSpawnAccumulators = new Map<string, number>()
  private readonly floodlightTargets: THREE.Object3D[] = []
  private readonly floodlightConeGeometry = new THREE.CylinderGeometry(
    0,
    FLOODLIGHT_CONE_RADIUS,
    FLOODLIGHT_CONE_LENGTH,
    24,
    1,
    true,
  )
  private readonly floodlightConeMaterial = new THREE.MeshBasicMaterial({
    color: FLOODLIGHT_COLOR,
    transparent: true,
    opacity: FLOODLIGHT_CONE_BASE_OPACITY,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
  private readonly rcsWorldPos = new THREE.Vector3()
  private liftoffBoostTimer = 0

  /** Current lander hit points. */
  private _hp = LANDER_MAX_HP

  /** Maximum lander hit points. */
  readonly maxHp = LANDER_MAX_HP

  /** Current HP (read-only). */
  get hp(): number {
    return this._hp
  }

  /** Combined tilt magnitude in radians (0 = perfectly upright). */
  get tiltAngle(): number {
    return Math.sqrt(this.tiltX * this.tiltX + this.tiltZ * this.tiltZ)
  }

  get altitudeAboveGround(): number {
    const support = this.sampleTerrainSupport()
    if (!support.hasSupport) return Infinity
    const groundY = support.height
    return Math.max(0, this.group.position.y - groundY)
  }

  get isLandingApproachActive(): boolean {
    if (this.body.grounded) return false
    const descentRate = -this.body.velocityY
    if (descentRate < LANDING_APPROACH_MIN_DESCENT_SPEED) return false

    const brakingDistance = (descentRate * descentRate) / (2 * LANDING_BRAKING_DECELERATION)
    const reactionDistance = descentRate * LANDING_APPROACH_REACTION_TIME
    const warningAltitude = Math.min(
      LANDING_APPROACH_MAX_ALTITUDE,
      LANDING_APPROACH_BUFFER_ALTITUDE + brakingDistance + reactionDistance,
    )

    return this.altitudeAboveGround <= warningAltitude
  }

  get descentWarningLevel(): LandingWarningLevel {
    if (!this.isLandingApproachActive) return 'safe'
    const speed = Math.abs(this.body.velocityY)
    if (speed >= SAFE_LANDING_SPEED) return 'danger'
    if (speed >= WARN_LANDING_SPEED) return 'warn'
    return 'safe'
  }

  get attitudeWarningLevel(): LandingWarningLevel {
    if (!this.isLandingApproachActive) return 'safe'
    if (this.tiltAngle >= SAFE_LANDING_ANGLE) return 'danger'
    if (this.tiltAngle >= WARN_LANDING_ANGLE) return 'warn'
    return 'safe'
  }

  get landingSafetyLevel(): LandingWarningLevel {
    if (this.descentWarningLevel === 'danger' || this.attitudeWarningLevel === 'danger') return 'danger'
    if (this.descentWarningLevel === 'warn' || this.attitudeWarningLevel === 'warn') return 'warn'
    return 'safe'
  }

  /** Tracks whether lander was grounded last frame. */
  private wasGrounded = false

  /** Called on hard landing with damage dealt and impact speed. */
  onCrash: ((damage: number, impactSpeed: number) => void) | null = null

  /** Called when HP reaches 0. */
  onDeath: (() => void) | null = null

  /** Called when the lander fuel tank is depleted. */
  onFuelEmpty: (() => void) | null = null

  constructor(inputManager: InputManager) {
    this.inputManager = inputManager
    this.thrusterSystem.onFuelEmpty = () => {
      this.onFuelEmpty?.()
    }
    this.bodyFillLight.position.set(0, BODY_FILL_LIGHT_Y_OFFSET, 0)
    this.topWarningBeacon.group.position.set(0, TOP_BEACON_Y_OFFSET, 0)
    this.group.add(this.bodyFillLight)
    this.group.add(this.topWarningBeacon.group)
    this.updateWarningBeacon()

    this.flameEmitter = new ParticleEmitter({
      poolSize: FLAME_POOL_SIZE,
      color: FLAME_COLOR,
      size: FLAME_SIZE,
      lifetime: FLAME_LIFETIME,
      spread: FLAME_SPREAD,
      sizeAttenuation: true,
      sizeGrowth: 1.8,
    })

    // Nozzle glow sprite — always-on idle glow at the engine bell
    const nozzleTexture = createNozzleGlowTexture()
    this.nozzleGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: nozzleTexture,
      color: new THREE.Color(NOZZLE_GLOW_COLOR_EDGE),
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }))
    this.nozzleGlow.scale.setScalar(NOZZLE_GLOW_SIZE)
    this.group.add(this.nozzleGlow)

    // Create one emitter per RCS nozzle
    for (const nodeName of ALL_RCS_NODES) {
      const emitter = new ParticleEmitter({
        poolSize: RCS_POOL_SIZE,
        color: RCS_COLOR,
        size: RCS_SIZE,
        lifetime: RCS_LIFETIME,
        spread: RCS_SPREAD,
        sizeAttenuation: true,
        soft: true,
        sizeGrowth: 2.5,
      })
      this.rcsEmitters.set(nodeName, emitter)
      this.rcsSpawnAccumulators.set(nodeName, 0)
    }
  }

  async load(): Promise<void> {
    const scene = await loadGLB(LANDER_MODEL_PATH)
    scene.scale.setScalar(MODEL_SCALE)
    this.group.add(scene)

    // Main engine position
    const engineNode = this.findNode(scene, MAIN_ENGINE_NODE)
    if (engineNode) {
      // Get position in group-local space (scene is child of group, scaled by MODEL_SCALE)
      const localPos = new THREE.Vector3()
      engineNode.getWorldPosition(localPos)
      // worldToLocal accounts for group position/rotation, but at load time group is at origin
      this.group.worldToLocal(localPos)
      this.mainEngineLocalPos.copy(localPos)
      // Position nozzle glow just below the engine bell
      this.nozzleGlow.position.set(localPos.x, localPos.y - 2, localPos.z)
      // Store engine mesh for emissive glow when firing
      // Clone the material so we don't affect other meshes sharing it
      if (engineNode instanceof THREE.Mesh) {
        engineNode.material = (engineNode.material as THREE.Material).clone()
        this.engineMesh = engineNode
      } else {
        engineNode.traverse((child) => {
          if (child instanceof THREE.Mesh && !this.engineMesh) {
            child.material = (child.material as THREE.Material).clone()
            this.engineMesh = child
          }
        })
      }
    }

    // RCS nozzle positions
    for (const nodeName of ALL_RCS_NODES) {
      const node = this.findNode(scene, nodeName)
      if (node) {
        const pos = node.position
        this.rcsLocalPositions.set(
          nodeName,
          new THREE.Vector3(pos.x * MODEL_SCALE, pos.y * MODEL_SCALE, pos.z * MODEL_SCALE),
        )
      }
    }

    this.createFloodlights()
  }

  /** Apply damage to the lander. Fires onDeath when HP reaches 0. */
  takeDamage(amount: number): void {
    this._hp = Math.max(0, this._hp - amount)
    if (this._hp <= 0) {
      this.onDeath?.()
    }
  }

  /** Reset lander state for repositioning. */
  resetForRespawn(position: THREE.Vector3): void {
    this.group.position.copy(position)
    this.group.visible = true
    this._hp = LANDER_MAX_HP
    this.thrusterSystem.refuel()
    this.body.velocityY = 0
    this.body.grounded = false
    this.lateralVelocity.set(0, 0, 0)
    this.tiltX = 0
    this.tiltZ = 0
    this.yaw = 0
    this.group.rotation.set(0, 0, 0)
    this.wasGrounded = false
    this.liftoffBoostTimer = 0
    this.updateWarningBeacon()
  }

  /** Set terrain heightmap for ground collision. */
  setHeightmap(hm: Heightmap): void {
    this.heightmap = hm
  }

  setCollisionWorld(collisionWorld: CollisionWorld | null): void {
    this.collisionWorld = collisionWorld
  }

  get position(): THREE.Vector3 {
    return this.group.position
  }

  get isMainEngineActive(): boolean {
    return this.inputManager.isActionActive('mainEngine') && this.thrusterSystem.canFire('mainEngine')
  }

  /** Whether any RCS action is currently firing and has charge. */
  private get isAnyRcsActive(): boolean {
    if (!this.thrusterSystem.canFire('rcs')) return false
    return (
      this.inputManager.isActionActive('rcsLeft') ||
      this.inputManager.isActionActive('rcsRight') ||
      this.inputManager.isActionActive('rcsFore') ||
      this.inputManager.isActionActive('rcsAft') ||
      this.inputManager.isActionActive('rcsAscend') ||
      this.inputManager.isActionActive('rcsDescend')
    )
  }

  tick(dt: number): void {
    // Update tilt + yaw first so quaternion is current for thrust direction and flame
    this.tickTilt(dt)

    // Main engine — thrust along lander's local up axis
    if (this.isMainEngineActive) {
      const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.group.quaternion)
      const slopePenalty = this.getLiftoffSlopePenalty()
      const boost = this.liftoffBoostTimer > 0 ? LIFTOFF_BOOST * slopePenalty : 1
      const thrust = MAIN_ENGINE_THRUST * dt * boost
      this.body.impulse(localUp.y * thrust)
      this.lateralVelocity.x += localUp.x * thrust
      this.lateralVelocity.z += localUp.z * thrust
      this.spawnFlame(dt)
    } else {
      this.flameSpawnAccumulator = 0
    }

    // RCS ascend boost — works from ground (big boost) and air
    if (this.inputManager.isActionActive('rcsAscend') && this.thrusterSystem.canFire('rcs')) {
      const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.group.quaternion)
      const slopePenalty = this.getLiftoffSlopePenalty()
      const boost = this.liftoffBoostTimer > 0 ? RCS_LIFTOFF_BOOST * slopePenalty : 1
      const thrust = RCS_ASCEND_THRUST * dt * boost
      this.body.impulse(localUp.y * thrust)
      this.lateralVelocity.x += localUp.x * thrust
      this.lateralVelocity.z += localUp.z * thrust
    }

    // RCS emitters + lateral movement
    this.tickRcs(dt)
    this.tickLateralMovement(dt)

    // Platformer gravity + ground collision against terrain
    const floorY = this.sampleTerrainSupport().height
    this.group.position.y = this.body.tick(dt, this.group.position.y, floorY)

    // Detect landing transition (airborne → grounded) and evaluate safety
    if (this.body.grounded && !this.wasGrounded) {
      const impactSpeed = Math.abs(this.body.impactVelocityY)
      const impactAngle = Math.sqrt(this.tiltX * this.tiltX + this.tiltZ * this.tiltZ)
      const speedExcess = Math.max(0, impactSpeed - SAFE_LANDING_SPEED)
      const angleExcess = Math.max(0, impactAngle - SAFE_LANDING_ANGLE)
      const damage = speedExcess * SPEED_DAMAGE_MULTIPLIER + angleExcess * ANGLE_DAMAGE_MULTIPLIER
      if (damage > 0) {
        this.takeDamage(damage)
        this.onCrash?.(damage, impactSpeed)
      }
    }
    this.wasGrounded = this.body.grounded

    // Apply lateral velocity (XZ only), blocking against solid world colliders.
    if (this.collisionWorld) {
      const move = this.collisionWorld.moveDiscXZ(
        this.group.position,
        this.lateralVelocity.x * dt,
        this.lateralVelocity.z * dt,
        this.group.position.y - LANDER_COLLISION_BOTTOM_OFFSET,
        this.group.position.y + LANDER_COLLISION_TOP_OFFSET,
        {
          radius: LANDER_COLLISION_RADIUS,
          skinWidth: LANDER_COLLISION_SKIN_WIDTH,
          substepDistance: LANDER_COLLISION_SUBSTEP_DISTANCE,
        },
        LANDER_COLLIDER_ID,
      )
      this.group.position.x = move.x
      this.group.position.z = move.z

      if (move.blocked) {
        this.lateralVelocity.x = 0
        this.lateralVelocity.z = 0
      }
    } else {
      this.group.position.x += this.lateralVelocity.x * dt
      this.group.position.z += this.lateralVelocity.z * dt
    }

    // Liftoff boost timer: starts when leaving ground, counts down
    if (this.body.grounded) {
      this.liftoffBoostTimer = LIFTOFF_BOOST_DURATION
    } else if (this.liftoffBoostTimer > 0) {
      this.liftoffBoostTimer -= dt
    }

    // Thruster charge/fuel system
    this.thrusterSystem.tick(dt, {
      mainEngine: this.isMainEngineActive,
      rcs: this.isAnyRcsActive,
    })

    this.updateWarningBeacon()

    // Nozzle glow pulse — brighter when engine is firing
    this.nozzleGlowTime += dt
    const glowMat = this.nozzleGlow.material as THREE.SpriteMaterial
    if (this.isMainEngineActive) {
      const pulse = 0.7 + 0.3 * Math.sin(this.nozzleGlowTime * 12)
      glowMat.opacity = pulse
      this.nozzleGlow.scale.setScalar(NOZZLE_GLOW_SIZE * (1.0 + 0.3 * Math.sin(this.nozzleGlowTime * 8)))
      // Warm emissive ramp-up on nozzle mesh
      if (this.engineMesh) {
        const mat = this.engineMesh.material as THREE.MeshStandardMaterial
        if (mat.emissive) {
          mat.emissive.set(0xcc4400)
          // Ramp up gradually, max 0.8
          mat.emissiveIntensity = Math.min(0.8, (mat.emissiveIntensity || 0) + dt * 1.5)
        }
      }
    } else {
      const idlePulse = 0.3 + 0.15 * Math.sin(this.nozzleGlowTime * 4)
      glowMat.opacity = idlePulse
      this.nozzleGlow.scale.setScalar(NOZZLE_GLOW_SIZE * 0.7)
      // Cool down emissive
      if (this.engineMesh) {
        const mat = this.engineMesh.material as THREE.MeshStandardMaterial
        if (mat.emissive && mat.emissiveIntensity > 0) {
          mat.emissiveIntensity = Math.max(0, mat.emissiveIntensity - dt * 1.5)
        }
      }
    }

    // Update all emitters
    this.flameEmitter.tick(dt)
    for (const emitter of this.rcsEmitters.values()) {
      emitter.tick(dt)
    }
  }

  dispose(): void {
    this.flameEmitter.dispose()
    ;(this.nozzleGlow.material as THREE.SpriteMaterial).map?.dispose()
    ;(this.nozzleGlow.material as THREE.SpriteMaterial).dispose()
    for (const emitter of this.rcsEmitters.values()) {
      emitter.dispose()
    }
    for (const floodlight of this.floodlights) {
      floodlight.shadow.map?.dispose()
      floodlight.dispose()
    }
    this.topWarningBeacon.dispose()
    this.floodlightConeGeometry.dispose()
    this.floodlightConeMaterial.dispose()
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (this.floodlightCones.includes(child)) return
        if (this.topWarningBeacon.meshes.includes(child)) return
        child.geometry.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose())
        } else {
          child.material.dispose()
        }
      }
    })
  }

  /** Returns 1.0 on flat ground, SLOPE_LIFTOFF_PENALTY on slopes */
  private getLiftoffSlopePenalty(): number {
    const n = this.sampleTerrainSupport().normal
    return n.y >= FLAT_GROUND_THRESHOLD ? 1 : SLOPE_LIFTOFF_PENALTY
  }

  private updateWarningBeacon(): void {
    switch (this.landingSafetyLevel) {
      case 'danger':
        this.topWarningBeacon.setColor(TOP_BEACON_DANGER_COLOR)
        break
      case 'warn':
        this.topWarningBeacon.setColor(TOP_BEACON_WARN_COLOR)
        break
      default:
        this.topWarningBeacon.setColor(TOP_BEACON_SAFE_COLOR)
        break
    }
  }

  private tickLateralMovement(dt: number): void {
    if (this.body.grounded) {
      this.lateralVelocity.set(0, 0, 0)
      return
    }
    if (!this.thrusterSystem.canFire('rcs')) return

    // RCS lateral force — rotated by yaw (camera couples to lander orientation)
    let localX = 0
    let localZ = 0

    if (this.inputManager.isActionActive('rcsLeft')) localZ += RCS_LATERAL_FORCE
    if (this.inputManager.isActionActive('rcsRight')) localZ -= RCS_LATERAL_FORCE
    if (this.inputManager.isActionActive('rcsFore')) localX -= RCS_LATERAL_FORCE
    if (this.inputManager.isActionActive('rcsAft')) localX += RCS_LATERAL_FORCE

    // Rotate by yaw so thrust matches screen directions
    const cosY = Math.cos(this.yaw)
    const sinY = Math.sin(this.yaw)
    this.lateralVelocity.x += (localX * cosY + localZ * sinY) * dt
    this.lateralVelocity.z += (-localX * sinY + localZ * cosY) * dt

    // C (rcsDescend) doubles as retro-brake — damps lateral velocity
    if (this.inputManager.isActionActive('rcsDescend')) {
      const damping = 1 - RETRO_BRAKE_DAMPING * dt
      this.lateralVelocity.x *= damping
      this.lateralVelocity.z *= damping
    }
  }

  private tickTilt(dt: number): void {
    let targetTiltX = 0
    let targetTiltZ = 0
    let speed: number

    if (this.body.grounded && this.heightmap) {
      // Grounded: conform to terrain slope via surface normal
      const n = this.sampleTerrainSupport().normal
      // Normal (nx, ny, nz) → tilt angles:
      //   tiltX (roll around X) = atan2(nz, ny) — slope along Z axis
      //   tiltZ (pitch around Z) = atan2(-nx, ny) — slope along X axis
      targetTiltX = Math.atan2(n.z, n.y)
      targetTiltZ = Math.atan2(-n.x, n.y)
      speed = GROUND_TILT_LERP_SPEED
    } else {
      // Airborne: RCS input drives tilt
      if (this.inputManager.isActionActive('rcsLeft')) targetTiltX += TILT_MAX_ANGLE
      if (this.inputManager.isActionActive('rcsRight')) targetTiltX -= TILT_MAX_ANGLE
      if (this.inputManager.isActionActive('rcsFore')) targetTiltZ += TILT_MAX_ANGLE
      if (this.inputManager.isActionActive('rcsAft')) targetTiltZ -= TILT_MAX_ANGLE
      const hasInput = targetTiltX !== 0 || targetTiltZ !== 0
      speed = hasInput ? TILT_LERP_SPEED : TILT_RETURN_SPEED
    }

    this.tiltX += (targetTiltX - this.tiltX) * speed * dt
    this.tiltZ += (targetTiltZ - this.tiltZ) * speed * dt

    // Snap to target when close enough to avoid residual drift
    if (Math.abs(this.tiltX - targetTiltX) < 0.005) this.tiltX = targetTiltX
    if (Math.abs(this.tiltZ - targetTiltZ) < 0.005) this.tiltZ = targetTiltZ

    // Yaw — gyroscope rotation (airborne only)
    if (!this.body.grounded) {
      if (this.inputManager.isActionActive('yawLeft')) this.yaw += YAW_SPEED * dt
      if (this.inputManager.isActionActive('yawRight')) this.yaw -= YAW_SPEED * dt
    }

    // Build rotation: yaw first, then tilt relative to yaw
    // This ensures tilt directions stay consistent with lander heading
    const q = this.group.quaternion
    q.setFromAxisAngle(_yAxis, this.yaw)
    _qTilt.setFromEuler(_euler.set(this.tiltX, 0, this.tiltZ))
    q.multiply(_qTilt)
  }

  private sampleTerrainSupport(): TerrainSupportSample {
    if (!this.heightmap) {
      return { height: DEFAULT_FLOOR_Y, normal: { x: 0, y: 1, z: 0 }, colliderId: null, hasSupport: true }
    }

    const sampleOffsets = [
      [0, 0],
      [LANDER_SUPPORT_SAMPLE_RADIUS, 0],
      [-LANDER_SUPPORT_SAMPLE_RADIUS, 0],
      [0, LANDER_SUPPORT_SAMPLE_RADIUS],
      [0, -LANDER_SUPPORT_SAMPLE_RADIUS],
      [LANDER_SUPPORT_SAMPLE_DIAGONAL, LANDER_SUPPORT_SAMPLE_DIAGONAL],
      [LANDER_SUPPORT_SAMPLE_DIAGONAL, -LANDER_SUPPORT_SAMPLE_DIAGONAL],
      [-LANDER_SUPPORT_SAMPLE_DIAGONAL, LANDER_SUPPORT_SAMPLE_DIAGONAL],
      [-LANDER_SUPPORT_SAMPLE_DIAGONAL, -LANDER_SUPPORT_SAMPLE_DIAGONAL],
    ] as const

    _qYaw.setFromAxisAngle(_yAxis, this.yaw)

    const sampledHeights: number[] = []
    let normalX = 0
    let normalY = 0
    let normalZ = 0
    let sampledCount = 0

    for (const [offsetX, offsetZ] of sampleOffsets) {
      _sampleOffset.set(offsetX, 0, offsetZ).applyQuaternion(_qYaw)
      _sampleWorld.set(
        this.group.position.x + _sampleOffset.x,
        this.group.position.y,
        this.group.position.z + _sampleOffset.z,
      )

      const sampleHeight = this.heightmap.tryHeightAt(_sampleWorld.x, _sampleWorld.z)
      if (sampleHeight == null) continue
      const sampleNormal = this.heightmap.normalAt(_sampleWorld.x, _sampleWorld.z)

      sampledCount += 1
      sampledHeights.push(sampleHeight)
      normalX += sampleNormal.x
      normalY += sampleNormal.y
      normalZ += sampleNormal.z
    }

    if (sampledCount === 0) {
      return {
        height: -Infinity,
        normal: { x: 0, y: 1, z: 0 },
        colliderId: null,
        hasSupport: false,
      }
    }

    sampledHeights.sort((a, b) => b - a)
    const contactCount = Math.min(LANDER_SUPPORT_CONTACT_SAMPLE_COUNT, sampledHeights.length)
    const contactHeight =
      sampledHeights.slice(0, contactCount).reduce((sum, height) => sum + height, 0) / Math.max(1, contactCount)

    let supportHeight = contactHeight
    let supportNormal: { x: number; y: number; z: number }
    const normalLength = Math.sqrt(normalX * normalX + normalY * normalY + normalZ * normalZ)
    if (normalLength <= 1e-5) {
      supportNormal = { x: 0, y: 1, z: 0 }
    } else {
      supportNormal = {
        x: normalX / normalLength,
        y: normalY / normalLength,
        z: normalZ / normalLength,
      }
    }

    let colliderId: string | null = null
    if (this.collisionWorld) {
      const colliderSupport = this.collisionWorld.getHighestSupportUnderDisc(
        this.group.position.x,
        this.group.position.z,
        supportHeight - 1,
        this.group.position.y + LANDER_SUPPORT_MAX_STEP_UP,
        LANDER_COLLISION_RADIUS,
        LANDER_COLLIDER_ID,
      )
      if (colliderSupport.height > supportHeight) {
        supportHeight = colliderSupport.height
        supportNormal = colliderSupport.normal
        colliderId = colliderSupport.colliderId
      }
    }

    return {
      height: supportHeight,
      normal: supportNormal,
      colliderId,
      hasSupport: true,
    }
  }

  private tickRcs(dt: number): void {
    // Track which nodes are active this frame
    const activeNodes = new Set<string>()

    /** These RCS actions only work in the air */
    const AIRBORNE_ONLY_ACTIONS = new Set(['rcsLeft', 'rcsRight', 'rcsFore', 'rcsAft', 'rcsAscend'])

    for (const [action, mapping] of Object.entries(RCS_ACTION_MAP)) {
      if (!this.inputManager.isActionActive(action)) continue
      if (AIRBORNE_ONLY_ACTIONS.has(action) && this.body.grounded) continue
      for (const nodeName of mapping.nodes) {
        activeNodes.add(nodeName)
      }
    }

    for (const nodeName of ALL_RCS_NODES) {
      if (activeNodes.has(nodeName)) {
        const localPos = this.rcsLocalPositions.get(nodeName)
        if (!localPos) continue

        const acc = (this.rcsSpawnAccumulators.get(nodeName) ?? 0) + RCS_SPAWN_RATE * dt
        this.rcsSpawnAccumulators.set(nodeName, acc)

        // World position of this nozzle
        this.rcsWorldPos.copy(localPos)
          .applyQuaternion(this.group.quaternion)
          .add(this.group.position)

        // Find push direction for this node's action
        const pushLocal = this.getPushForNode(nodeName)
        const pushWorld = pushLocal.clone().applyQuaternion(this.group.quaternion)

        const emitter = this.rcsEmitters.get(nodeName)!
        let remaining = this.rcsSpawnAccumulators.get(nodeName)!
        while (remaining >= 1) {
          emitter.emit(this.rcsWorldPos, pushWorld)
          remaining -= 1
        }
        this.rcsSpawnAccumulators.set(nodeName, remaining)
      } else {
        this.rcsSpawnAccumulators.set(nodeName, 0)
      }
    }
  }

  /** Look up which action owns this node and return its push direction */
  private getPushForNode(nodeName: string): THREE.Vector3 {
    for (const mapping of Object.values(RCS_ACTION_MAP)) {
      if (mapping.nodes.includes(nodeName)) {
        return mapping.pushLocal
      }
    }
    return new THREE.Vector3()
  }

  private spawnFlame(dt: number): void {
    this.flameSpawnAccumulator += FLAME_SPAWN_RATE * dt

    // Emit from directly below the ship center, tucked up near the hull
    this.mainEngineWorldPos.set(
      this.group.position.x,
      this.group.position.y + this.mainEngineLocalPos.y + FLAME_EMIT_Y_OFFSET,
      this.group.position.z,
    )

    // Push particles straight down + inherit lateral velocity so
    // the flame stays under the ship as it drifts
    const fallSpeed = Math.max(0, -this.body.velocityY)
    const push = FLAME_PUSH_FORCE + fallSpeed * FLAME_VELOCITY_COMPENSATION
    const pushDir = new THREE.Vector3(
      this.lateralVelocity.x,
      -push,
      this.lateralVelocity.z,
    )

    while (this.flameSpawnAccumulator >= 1) {
      this.flameEmitter.emit(this.mainEngineWorldPos, pushDir)
      this.flameSpawnAccumulator -= 1
    }
  }

  private createFloodlights(): void {
    for (const nodeName of FLOODLIGHT_MOUNT_NODES) {
      const mount = this.rcsLocalPositions.get(nodeName)
      if (!mount) continue

      const side = Math.sign(mount.x) || 1
      const forward = Math.sign(mount.z) || 1
      const origin = mount.clone()
      origin.x *= FLOODLIGHT_MOUNT_INSET
      origin.z *= FLOODLIGHT_MOUNT_INSET
      const floodlight = new THREE.SpotLight(
        FLOODLIGHT_COLOR,
        FLOODLIGHT_INTENSITY,
        FLOODLIGHT_DISTANCE,
        FLOODLIGHT_ANGLE,
        FLOODLIGHT_PENUMBRA,
        FLOODLIGHT_DECAY,
      )
      floodlight.position.copy(origin)
      floodlight.castShadow = false
      floodlight.shadow.mapSize.set(FLOODLIGHT_SHADOW_MAP_SIZE, FLOODLIGHT_SHADOW_MAP_SIZE)
      floodlight.shadow.bias = FLOODLIGHT_SHADOW_BIAS

      const target = new THREE.Object3D()
      const outward = Math.sin(FLOODLIGHT_OUTWARD_ANGLE) * FLOODLIGHT_AIM_DISTANCE
      const forwardOffset = Math.sin(FLOODLIGHT_FORWARD_ANGLE) * FLOODLIGHT_AIM_DISTANCE
      const downward = Math.cos(FLOODLIGHT_OUTWARD_ANGLE)
        * Math.cos(FLOODLIGHT_FORWARD_ANGLE)
        * FLOODLIGHT_AIM_DISTANCE
      target.position.set(
        origin.x + side * outward,
        origin.y - downward,
        origin.z + forward * forwardOffset,
      )

      floodlight.target = target

      const cone = new THREE.Mesh(this.floodlightConeGeometry, this.floodlightConeMaterial)
      const beamDirection = target.position.clone().sub(floodlight.position).normalize()
      cone.position.copy(floodlight.position).add(target.position).multiplyScalar(0.5)
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), beamDirection)
      cone.castShadow = false
      cone.receiveShadow = false
      cone.renderOrder = 1

      this.group.add(floodlight)
      this.group.add(target)
      this.group.add(cone)

      this.floodlights.push(floodlight)
      this.floodlightCones.push(cone)
      this.floodlightTargets.push(target)
    }
  }

  private findNode(root: THREE.Object3D, name: string): THREE.Object3D | null {
    let found: THREE.Object3D | null = null
    root.traverse((child) => {
      if (child.name === name && !found) {
        found = child
      }
    })
    return found
  }
}

/** Teardrop nozzle glow — bright point at top fading down like a flame lick. */
function createNozzleGlowTexture(): THREE.CanvasTexture {
  const size = NOZZLE_GLOW_TEXTURE_SIZE
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const cx = size / 2
  // Bright core near the top (nozzle throat), fading downward
  const coreY = size * 0.2
  const gradient = ctx.createRadialGradient(cx, coreY, 0, cx, coreY, size * 0.8)
  gradient.addColorStop(0, NOZZLE_GLOW_COLOR_CORE)
  gradient.addColorStop(0.2, NOZZLE_GLOW_COLOR_EDGE)
  gradient.addColorStop(0.6, 'rgba(255, 154, 31, 0.15)')
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}
