/**
 * Builds one hidden instance of every procedural enemy visual so Three.js can
 * compile their shader programs during the level loading path instead of on
 * the first combat RAF.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-18-fps-perf-fixes-design.md
 */
import * as THREE from 'three'
import { Enemy } from '@/lib/fps/enemy'
import { BacteriophageController } from '@/three/BacteriophageController'
import { ChimeraWalkerController } from '@/three/ChimeraWalkerController'
import { SpireController } from '@/three/SpireController'
import type { EnemyLightPool } from '@/three/EnemyLightPool'

const WARMUP_ENEMY_MAX_HP = 1
const WARMUP_ENEMY_HIT_RADIUS = 1
const WARMUP_ENEMY_SPACING = 12
const WARMUP_ENEMY_FLOAT_HEIGHT = 8
const WARMUP_CAMERA_FORWARD_DISTANCE = 24
const WARMUP_CAMERA_VERTICAL_OFFSET = -2

/**
 * Enemy visual warmup bundle kept alive for the level lifetime so renderer
 * program cache entries are not immediately released after precompile.
 */
export interface EnemyVisualWarmup {
  /** Root group containing the staged enemy meshes; hidden after shader warmup. */
  group: THREE.Group
  /** Move the warmup group into the compile camera frustum and disable mesh culling. */
  stageForCamera(camera: THREE.Camera): void
  /** Restore original frustum-culling flags after the compile pass. */
  restoreFrustumCulling(): void
  /** Release all warmup enemy controllers and their materials/geometries. */
  dispose(): void
}

/**
 * Create one visual controller for each procedural enemy type.
 *
 * @param lightPool - Optional enemy light pool. When provided, warmup enemies
 *   borrow point-light slots from it so the precompile pass sees the same
 *   `NUM_POINT_LIGHTS` count as runtime spawns will. Without it, warmup
 *   enemies allocate fresh lights — the program key compiled at warmup will
 *   not match runtime, partially defeating the warmup.
 * @returns Warmup bundle to add to the scene before renderer compilation.
 */
export function createEnemyVisualWarmup(
  lightPool: EnemyLightPool | null = null,
): EnemyVisualWarmup {
  const group = new THREE.Group()
  group.name = 'EnemyVisualWarmup'

  const phageEnemy = createWarmupEnemy(-WARMUP_ENEMY_SPACING, 0, 0)
  const chimeraEnemy = createWarmupEnemy(0, 0, 0)
  const spireEnemy = createWarmupEnemy(WARMUP_ENEMY_SPACING, WARMUP_ENEMY_FLOAT_HEIGHT, 0)

  const phage = new BacteriophageController(phageEnemy, { lightPool })
  phage.group.position.copy(phageEnemy.position)
  group.add(phage.group)

  const chimera = new ChimeraWalkerController(chimeraEnemy, { lightPool })
  chimera.group.position.copy(chimeraEnemy.position)
  group.add(chimera.group)

  const spire = new SpireController(spireEnemy, { lightPool })
  spire.group.position.copy(spireEnemy.position)
  spire.targetPosition.copy(spireEnemy.position)
  group.add(spire.group)

  const controllers = [phage, chimera, spire]
  const frustumCullState: Array<{ obj: THREE.Object3D; frustumCulled: boolean }> = []

  return {
    group,
    stageForCamera(camera: THREE.Camera): void {
      const cameraPosition = new THREE.Vector3()
      const cameraDirection = new THREE.Vector3()
      camera.getWorldPosition(cameraPosition)
      camera.getWorldDirection(cameraDirection)
      group.position
        .copy(cameraPosition)
        .addScaledVector(cameraDirection, WARMUP_CAMERA_FORWARD_DISTANCE)
      group.position.y += WARMUP_CAMERA_VERTICAL_OFFSET
      group.lookAt(cameraPosition.x, group.position.y, cameraPosition.z)
      disableFrustumCullingForCompile()
    },
    restoreFrustumCulling(): void {
      for (const entry of frustumCullState) {
        entry.obj.frustumCulled = entry.frustumCulled
      }
      frustumCullState.length = 0
    },
    dispose(): void {
      group.removeFromParent()
      for (const controller of controllers) {
        controller.dispose()
      }
    },
  }

  /** Disable mesh frustum culling so hidden warmup meshes compile reliably. */
  function disableFrustumCullingForCompile(): void {
    frustumCullState.length = 0
    group.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return
      frustumCullState.push({ obj, frustumCulled: obj.frustumCulled })
      obj.frustumCulled = false
    })
  }
}

/**
 * Create a minimal enemy simulation object for visual controller construction.
 *
 * @param x - Warmup enemy X position.
 * @param y - Warmup enemy Y position.
 * @param z - Warmup enemy Z position.
 * @returns Enemy instance with lightweight combat stats for shader warmup.
 */
function createWarmupEnemy(x: number, y: number, z: number): Enemy {
  const enemy = new Enemy({
    maxHp: WARMUP_ENEMY_MAX_HP,
    hitRadius: WARMUP_ENEMY_HIT_RADIUS,
  })
  enemy.position.set(x, y, z)
  return enemy
}
