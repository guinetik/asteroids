/**
 * Controls the lunar lander model — loading, platformer gravity, and main engine thrust.
 *
 * The main descent engine ("Thruster_Lunar Lander_0") fires upward against
 * Moon-level gravity. It requires sustained acceleration to gain lift —
 * you have to commit to the burn.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/asteroid-lander-gdd.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { InputManager } from '@/lib/InputManager'
import { loadGLB } from './loadGLB'
import { PlatformerBody, GRAVITY_MOON } from '@/lib/physics/platformerBody'
import { ParticleEmitter } from './ParticleEmitter'

const LANDER_MODEL_PATH = '/models/lander.glb'

/** Lander model scale — adjust to match game units */
const MODEL_SCALE = 5

/** Ground level — the flat spacetime grid sits at Y = 0 */
const FLOOR_Y = 0

/**
 * Main engine thrust — intentionally weak relative to gravity.
 * You need to hold Space and build up velocity to climb.
 * At 2.4 vs 1.62 gravity, net upward accel is only ~0.78 units/s².
 */
const MAIN_ENGINE_THRUST = 3.5

/** Node name for the main descent engine bell in the GLB */
const MAIN_ENGINE_NODE = 'Thruster_Lunar Lander_0'

/** Particle emitter config for the main engine flame */
const FLAME_POOL_SIZE = 300
const FLAME_COLOR = new THREE.Color(0xff6600)
const FLAME_SIZE = 6
const FLAME_LIFETIME = 1.0
const FLAME_SPREAD = 5
const FLAME_PUSH_FORCE = 22
const FLAME_SPAWN_RATE = 160

/** Offset emit point upward from the nozzle tip to the nozzle mouth */
const FLAME_EMIT_Y_OFFSET = 8

/**
 * Controls the lunar lander model — gravity, main engine, and flame VFX.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/asteroid-lander-gdd.md
 */
export class LanderController implements Tickable {
  readonly group = new THREE.Group()
  readonly body = new PlatformerBody({ gravity: GRAVITY_MOON })
  readonly flameEmitter: ParticleEmitter

  private readonly inputManager: InputManager
  private mainEngineWorldPos = new THREE.Vector3()
  private mainEngineLocalPos = new THREE.Vector3()
  private flameSpawnAccumulator = 0

  constructor(inputManager: InputManager) {
    this.inputManager = inputManager

    this.flameEmitter = new ParticleEmitter({
      poolSize: FLAME_POOL_SIZE,
      color: FLAME_COLOR,
      size: FLAME_SIZE,
      lifetime: FLAME_LIFETIME,
      spread: FLAME_SPREAD,
    })
  }

  async load(): Promise<void> {
    const scene = await loadGLB(LANDER_MODEL_PATH)
    scene.scale.setScalar(MODEL_SCALE)
    this.group.add(scene)

    // Find main engine node and read its local position for particle emission
    const engineNode = this.findNode(scene, MAIN_ENGINE_NODE)
    if (engineNode) {
      // Position is in model coords — scale to game units
      const pos = engineNode.position
      this.mainEngineLocalPos.set(pos.x * MODEL_SCALE, pos.y * MODEL_SCALE, pos.z * MODEL_SCALE)
    }
  }

  get position(): THREE.Vector3 {
    return this.group.position
  }

  get isMainEngineActive(): boolean {
    return this.inputManager.isActionActive('mainEngine')
  }

  tick(dt: number): void {
    // Main engine fights gravity
    if (this.isMainEngineActive) {
      this.body.impulse(MAIN_ENGINE_THRUST * dt)
      this.spawnFlame(dt)
    } else {
      this.flameSpawnAccumulator = 0
    }

    // Platformer gravity + ground collision
    this.group.position.y = this.body.tick(dt, this.group.position.y, FLOOR_Y)

    // Update flame particles
    this.flameEmitter.tick(dt)
  }

  dispose(): void {
    this.flameEmitter.dispose()
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

  private spawnFlame(dt: number): void {
    this.flameSpawnAccumulator += FLAME_SPAWN_RATE * dt

    // Engine position in world space — emit from nozzle mouth, not tip
    this.mainEngineWorldPos.copy(this.mainEngineLocalPos)
    this.mainEngineWorldPos.y += FLAME_EMIT_Y_OFFSET
    this.mainEngineWorldPos.applyQuaternion(this.group.quaternion)
      .add(this.group.position)

    // Push particles downward (engine fires down, flame goes down)
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
