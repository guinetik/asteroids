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
import type { Heightmap } from '@/lib/terrain/heightmap'
import { ParticleEmitter } from './ParticleEmitter'

const LANDER_MODEL_PATH = '/models/lander.glb'

/** Lander model scale — adjust to match game units */
const MODEL_SCALE = 5

/** Fallback ground level when no heightmap is set */
const DEFAULT_FLOOR_Y = 0

/** Gameplay gravity — harsher than Moon (1.62) but friendlier than Earth (9.81) */
const GAMEPLAY_GRAVITY = 3.0

/**
 * Main engine thrust — intentionally weak relative to gravity.
 * You need to hold Space and build up velocity to climb.
 */
const MAIN_ENGINE_THRUST = 3.5

/** Node name for the main descent engine bell in the GLB */
const MAIN_ENGINE_NODE = 'Thruster_Lunar Lander_0'

/** RCS ascend thrust — smaller boost than main engine */
const RCS_ASCEND_THRUST = 3.14

/** Main engine flame emitter config */
const FLAME_POOL_SIZE = 300
const FLAME_COLOR = new THREE.Color(0xff6600)
const FLAME_SIZE = 6
const FLAME_LIFETIME = 1.0
const FLAME_SPREAD = 5
const FLAME_PUSH_FORCE = 22
const FLAME_SPAWN_RATE = 160
const FLAME_EMIT_Y_OFFSET = 8

/** RCS emitter config — white puffs, smaller and shorter than main flame */
const RCS_POOL_SIZE = 30
const RCS_COLOR = new THREE.Color(0xccddff)
const RCS_SIZE = 3
const RCS_LIFETIME = 0.25
const RCS_SPREAD = 2
const RCS_PUSH_FORCE = 10
const RCS_SPAWN_RATE = 50

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
const RCS_LATERAL_FORCE = 4
const TILT_MAX_ANGLE = 0.3 // ~17 degrees max tilt
const TILT_LERP_SPEED = 3 // how fast the lander tilts toward target
const TILT_RETURN_SPEED = 2.5 // how fast it returns to upright
const GROUND_TILT_LERP_SPEED = 4 // how fast the lander conforms to terrain slope

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
  readonly flameEmitter: ParticleEmitter

  /** One emitter per RCS nozzle, keyed by node name */
  readonly rcsEmitters = new Map<string, ParticleEmitter>()

  private readonly inputManager: InputManager
  private heightmap: Heightmap | null = null
  private mainEngineWorldPos = new THREE.Vector3()
  private mainEngineLocalPos = new THREE.Vector3()
  private flameSpawnAccumulator = 0

  /** Lateral velocity on the XZ plane from RCS thrusters */
  private lateralVelocity = new THREE.Vector3()

  /** Current visual tilt angles (X = A/D roll, Z = W/S pitch) */
  private tiltX = 0
  private tiltZ = 0

  /** Local-space positions of each RCS nozzle, keyed by node name */
  private readonly rcsLocalPositions = new Map<string, THREE.Vector3>()
  private readonly rcsSpawnAccumulators = new Map<string, number>()
  private readonly rcsWorldPos = new THREE.Vector3()

  constructor(inputManager: InputManager) {
    this.inputManager = inputManager

    this.flameEmitter = new ParticleEmitter({
      poolSize: FLAME_POOL_SIZE,
      color: FLAME_COLOR,
      size: FLAME_SIZE,
      lifetime: FLAME_LIFETIME,
      spread: FLAME_SPREAD,
    })

    // Create one emitter per RCS nozzle
    for (const nodeName of ALL_RCS_NODES) {
      const emitter = new ParticleEmitter({
        poolSize: RCS_POOL_SIZE,
        color: RCS_COLOR,
        size: RCS_SIZE,
        lifetime: RCS_LIFETIME,
        spread: RCS_SPREAD,
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
      const pos = engineNode.position
      this.mainEngineLocalPos.set(pos.x * MODEL_SCALE, pos.y * MODEL_SCALE, pos.z * MODEL_SCALE)
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
  }

  /** Set terrain heightmap for ground collision. */
  setHeightmap(hm: Heightmap): void {
    this.heightmap = hm
  }

  get position(): THREE.Vector3 {
    return this.group.position
  }

  get isMainEngineActive(): boolean {
    return this.inputManager.isActionActive('mainEngine')
  }

  tick(dt: number): void {
    // Main engine
    if (this.isMainEngineActive) {
      this.body.impulse(MAIN_ENGINE_THRUST * dt)
      this.spawnFlame(dt)
    } else {
      this.flameSpawnAccumulator = 0
    }

    // RCS ascend boost (airborne only)
    if (!this.body.grounded && this.inputManager.isActionActive('rcsAscend')) {
      this.body.impulse(RCS_ASCEND_THRUST * dt)
    }

    // RCS emitters + lateral movement
    this.tickRcs(dt)
    this.tickLateralMovement(dt)
    this.tickTilt(dt)

    // Platformer gravity + ground collision against terrain
    const floorY = this.heightmap
      ? this.heightmap.heightAt(this.group.position.x, this.group.position.z)
      : DEFAULT_FLOOR_Y
    this.group.position.y = this.body.tick(dt, this.group.position.y, floorY)

    // Apply lateral velocity (XZ only)
    this.group.position.x += this.lateralVelocity.x * dt
    this.group.position.z += this.lateralVelocity.z * dt

    // Update all emitters
    this.flameEmitter.tick(dt)
    for (const emitter of this.rcsEmitters.values()) {
      emitter.tick(dt)
    }
  }

  dispose(): void {
    this.flameEmitter.dispose()
    for (const emitter of this.rcsEmitters.values()) {
      emitter.dispose()
    }
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose())
        } else {
          child.material.dispose()
        }
      }
    })
  }

  private tickLateralMovement(dt: number): void {
    if (this.body.grounded) {
      this.lateralVelocity.set(0, 0, 0)
      return
    }

    // RCS lateral force — camera faces -X, so:
    //   A = -Z, D = +Z, W = -X (toward camera), S = +X (away)
    let forceX = 0
    let forceZ = 0

    if (this.inputManager.isActionActive('rcsLeft')) forceZ += RCS_LATERAL_FORCE
    if (this.inputManager.isActionActive('rcsRight')) forceZ -= RCS_LATERAL_FORCE
    if (this.inputManager.isActionActive('rcsFore')) forceX -= RCS_LATERAL_FORCE
    if (this.inputManager.isActionActive('rcsAft')) forceX += RCS_LATERAL_FORCE

    this.lateralVelocity.x += forceX * dt
    this.lateralVelocity.z += forceZ * dt
  }

  private tickTilt(dt: number): void {
    let targetTiltX = 0
    let targetTiltZ = 0
    let speed: number

    if (this.body.grounded && this.heightmap) {
      // Grounded: conform to terrain slope via surface normal
      const n = this.heightmap.normalAt(this.group.position.x, this.group.position.z)
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

    this.group.rotation.x = this.tiltX
    this.group.rotation.z = this.tiltZ
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

    this.mainEngineWorldPos.copy(this.mainEngineLocalPos)
    this.mainEngineWorldPos.y += FLAME_EMIT_Y_OFFSET
    this.mainEngineWorldPos.applyQuaternion(this.group.quaternion)
      .add(this.group.position)

    const pushDir = new THREE.Vector3(0, -FLAME_PUSH_FORCE, 0)

    while (this.flameSpawnAccumulator >= 1) {
      this.flameEmitter.emit(this.mainEngineWorldPos, pushDir)
      this.flameSpawnAccumulator -= 1
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
