/**
 * Instanced GLB prop for virus geometry (`public/models/virus.glb`).
 *
 * Preloads the asset once, then clones the scene (via SkeletonUtils `clone`) for
 * each new instance. A shared TRON hologram material from
 * {@link createTronHologramMaterial} animates via {@link syncTronHologramTimeSeconds};
 * geometries stay shared with the cached template.
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

/** Public URL path served from `public/models/virus.glb`. */
export const VIRUS_MODEL_PUBLIC_PATH = '/models/virus.glb'

/** Base asset scale applied to the GLB before per-instance tuning. */
const BASE_VIRUS_ASSET_SCALE = 0.03

/** Default uniform scale multiplier for new instances. */
const DEFAULT_VIRUS_SCALE = 1

/** Default shadow flags for virus meshes. */
const DEFAULT_CAST_SHADOW = true
const DEFAULT_RECEIVE_SHADOW = true

/** Hologram tint — hostile neon green for rescue outbreak sites. */
const HOLOGRAM_COLOR = new THREE.Color(0x39ff14)

/** Extra grid-line tint (matches legacy virus shader bias). */
const VIRUS_GRID_TINT = new THREE.Color(0.03, 0.09, 0.08)

/** Options for {@link VirusModel.create}. */
export interface VirusModelCreateOptions {
  /** Uniform scale applied to the cloned virus (default {@link DEFAULT_VIRUS_SCALE}). */
  scale?: number
  /** When false, meshes do not cast shadows (default {@link DEFAULT_CAST_SHADOW}). */
  castShadow?: boolean
  /** When false, meshes do not receive shadows (default {@link DEFAULT_RECEIVE_SHADOW}). */
  receiveShadow?: boolean
}

let virusTemplate: THREE.Group | null = null
let virusTemplatePromise: Promise<THREE.Group> | null = null

/**
 * Load the virus GLB once and cache the root group for cloning.
 *
 * @returns The frozen template scene (do not add directly to the world — use {@link VirusModel.create})
 */
async function ensureVirusTemplate(): Promise<THREE.Group> {
  if (virusTemplate) return virusTemplate
  if (!virusTemplatePromise) {
    virusTemplatePromise = loadGLB(VIRUS_MODEL_PUBLIC_PATH).then((scene) => {
      virusTemplate = scene
      return scene
    })
  }
  return virusTemplatePromise
}

/**
 * GLB virus — add {@link group} to your scene after {@link VirusModel.create}.
 *
 * The hologram material is disposed in {@link dispose}; mesh geometries remain
 * shared with the preload template and other instances.
 */
export class VirusModel {
  /** Parent group for positioning; contains the cloned mesh hierarchy. */
  readonly group = new THREE.Group()
  private readonly tronMaterial: THREE.ShaderMaterial
  private timeSyncMesh: THREE.Mesh | null = null

  private constructor(sceneClone: THREE.Group, tronMaterial: THREE.ShaderMaterial) {
    this.tronMaterial = tronMaterial
    this.group.add(sceneClone)
  }

  /**
   * Warm the virus GLB so the first {@link VirusModel.create} does not hitch.
   */
  static async preload(): Promise<void> {
    await ensureVirusTemplate()
  }

  /**
   * Create a new virus instance from the shared template.
   *
   * @param options - Scale and shadow tuning
   * @returns A virus ready to place via {@link group}
   */
  static async create(options?: VirusModelCreateOptions): Promise<VirusModel> {
    const template = await ensureVirusTemplate()
    const sceneClone = cloneSkinnedScene(template) as THREE.Group
    const tronMaterial = createTronHologramMaterial({
      color: HOLOGRAM_COLOR,
      gridTint: VIRUS_GRID_TINT,
    })

    const scale = options?.scale ?? DEFAULT_VIRUS_SCALE
    sceneClone.scale.setScalar(BASE_VIRUS_ASSET_SCALE * scale)

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

    const model = new VirusModel(sceneClone, tronMaterial)
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
   * Set world-space position of this virus prop.
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
   * Does not dispose shared mesh geometries from the GLB template.
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
