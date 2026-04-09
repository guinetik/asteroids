/**
 * Instanced GLB prop for bug nests (`public/models/nest.glb`).
 *
 * Preloads the asset once, then clones the scene (via SkeletonUtils `clone`) for
 * each new instance so geometries stay shared across copies. Rendering uses the
 * shared {@link createTronHologramMaterial} pipeline with a warm grid bias.
 *
 * @author guinetik
 * @date 2026-04-08
 * @spec docs/superpowers/specs/2026-04-05-enemy-system-design.md
 */
import * as THREE from 'three'
import { clone as cloneSkinnedScene } from 'three/addons/utils/SkeletonUtils.js'
import { loadGLB } from './loadGLB'
import {
  createTronHologramMaterial,
  disposeTronHologramMaterials,
  syncTronHologramTimeSeconds,
} from './tronHologramMaterial'

/** Public URL path served from `public/models/nest.glb`. */
export const NEST_MODEL_PUBLIC_PATH = '/models/nest.glb'

/** Base asset scale applied to the GLB before per-instance tuning. */
const BASE_NEST_ASSET_SCALE = 0.03

/** Default uniform scale multiplier for new instances. */
const DEFAULT_NEST_SCALE = 1

/** Default shadow flags for nest meshes. */
const DEFAULT_CAST_SHADOW = true
const DEFAULT_RECEIVE_SHADOW = true

/** Primary nest hologram tint — coral hostile. */
const HOLOGRAM_COLOR = new THREE.Color(0xff5b4d)

/** Extra grid-line tint (matches legacy nest shader bias). */
const NEST_GRID_TINT = new THREE.Color(0.09, 0.03, 0.03)

/** Options for {@link NestModel.create}. */
export interface NestModelCreateOptions {
  /** Uniform scale applied to the cloned nest (default {@link DEFAULT_NEST_SCALE}). */
  scale?: number
  /** When false, meshes do not cast shadows (default {@link DEFAULT_CAST_SHADOW}). */
  castShadow?: boolean
  /** When false, meshes do not receive shadows (default {@link DEFAULT_RECEIVE_SHADOW}). */
  receiveShadow?: boolean
}

let nestTemplate: THREE.Group | null = null
let nestTemplatePromise: Promise<THREE.Group> | null = null

/**
 * Load the nest GLB once and cache the root group for cloning.
 *
 * @returns The frozen template scene (do not add directly to the world — use {@link NestModel.create})
 */
async function ensureNestTemplate(): Promise<THREE.Group> {
  if (nestTemplate) return nestTemplate
  if (!nestTemplatePromise) {
    nestTemplatePromise = loadGLB(NEST_MODEL_PUBLIC_PATH).then((scene) => {
      nestTemplate = scene
      return scene
    })
  }
  return nestTemplatePromise
}

/**
 * GLB nest — add {@link group} to your scene after {@link NestModel.create}.
 *
 * GPU geometries are shared across instances; {@link dispose} releases this
 * instance’s hologram material only.
 */
export class NestModel {
  /** Parent group for positioning; contains the cloned mesh hierarchy. */
  readonly group = new THREE.Group()
  private readonly tronMaterial: THREE.ShaderMaterial
  private timeSyncMesh: THREE.Mesh | null = null

  private constructor(sceneClone: THREE.Group, tronMaterial: THREE.ShaderMaterial) {
    this.tronMaterial = tronMaterial
    this.group.add(sceneClone)
  }

  /**
   * Warm the nest GLB so the first {@link NestModel.create} does not hitch.
   */
  static async preload(): Promise<void> {
    await ensureNestTemplate()
  }

  /**
   * Create a new nest instance from the shared template.
   *
   * @param options - Scale and shadow tuning
   * @returns A nest ready to place via {@link group}
   */
  static async create(options?: NestModelCreateOptions): Promise<NestModel> {
    const template = await ensureNestTemplate()
    const sceneClone = cloneSkinnedScene(template) as THREE.Group
    const tronMaterial = createTronHologramMaterial({
      color: HOLOGRAM_COLOR,
      gridTint: NEST_GRID_TINT,
    })

    const scale = options?.scale ?? DEFAULT_NEST_SCALE
    sceneClone.scale.setScalar(BASE_NEST_ASSET_SCALE * scale)

    const castShadow = options?.castShadow ?? DEFAULT_CAST_SHADOW
    const receiveShadow = options?.receiveShadow ?? DEFAULT_RECEIVE_SHADOW
    const meshesForTimeSync: THREE.Mesh[] = []
    sceneClone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        mesh.castShadow = castShadow
        mesh.receiveShadow = receiveShadow
        mesh.material = tronMaterial
        meshesForTimeSync.push(mesh)
      }
    })

    const model = new NestModel(sceneClone, tronMaterial)
    const timeSyncTarget = meshesForTimeSync[0]
    if (timeSyncTarget) {
      model.timeSyncMesh = timeSyncTarget
      timeSyncTarget.onBeforeRender = () => {
        syncTronHologramTimeSeconds([tronMaterial], performance.now() * 0.001)
      }
    }
    return model
  }

  /**
   * Set world-space position of this nest.
   *
   * @param x - World X
   * @param y - World Y
   * @param z - World Z
   */
  placeAt(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z)
  }

  /**
   * Set yaw in radians around world Y (after any existing rotation on the clone).
   *
   * @param yawRadians - Rotation about +Y
   */
  setYaw(yawRadians: number): void {
    this.group.rotation.y = yawRadians
  }

  /**
   * Remove this instance from the scene graph and dispose its hologram material.
   *
   * Does not dispose shared geometries from the GLB template.
   */
  dispose(): void {
    if (this.timeSyncMesh) {
      this.timeSyncMesh.onBeforeRender = () => {}
      this.timeSyncMesh = null
    }
    disposeTronHologramMaterials([this.tronMaterial])
    this.group.clear()
  }
}
