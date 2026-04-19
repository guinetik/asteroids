/**
 * GLB prop for `public/models/sattelite.glb`.
 *
 * Preloads once, then clones the scene so geometries stay shared with the
 * cached template. Supports a local rotation (to reorient the asset's native
 * axes) and replaces solar-panel meshes with the shared TRON hologram shader
 * for a cyan "our-world" look.
 *
 * @author guinetik
 * @date 2026-04-18
 * @spec docs/asteroid-lander-gdd.md
 */
import * as THREE from 'three'
import { clone as cloneSkinnedScene } from 'three/addons/utils/SkeletonUtils.js'
import { fixMaterials, loadGLB } from './loadGLB'
import {
  createTronHologramMaterial,
  disposeTronHologramMaterials,
  syncTronHologramTimeSeconds,
} from './tronHologramMaterial'

/** Public URL path served from `public/models/sattelite.glb`. */
export const SATELLITE_MODEL_PUBLIC_PATH = '/models/sattelite.glb'

/** Uniform scale applied to the cloned satellite before optional per-instance tuning. */
const DEFAULT_SATELLITE_SCALE = 1

/** Default shadow flags for satellite meshes. */
const DEFAULT_CAST_SHADOW = true
const DEFAULT_RECEIVE_SHADOW = true

/** Cyan TRON tint used by default for solar-panel meshes. */
const DEFAULT_PANEL_TRON_COLOR = 0x00e5ff

/** Dark grid tint paired with {@link DEFAULT_PANEL_TRON_COLOR}. */
const DEFAULT_PANEL_GRID_TINT = new THREE.Color(0.02, 0.06, 0.09)

/** Name regex used to detect solar-panel meshes (checked on mesh and material). */
const SOLAR_PANEL_NAME_REGEX = /panel|solar|array|wing|sail/i

/** Minimum margin by which blue must exceed red/green for the color fallback. */
const PANEL_BLUE_DOMINANCE = 0.08

/** Maximum red channel (0–1) for a color to still read as "solar panel blue". */
const PANEL_MAX_RED = 0.35

let loggedTemplateStructure = false

/** Options for {@link SatelliteModel.create}. */
export interface SatelliteModelCreateOptions {
  /** Uniform scale applied to the cloned satellite (default 1). */
  scale?: number
  /** When false, meshes do not cast shadows (default true). */
  castShadow?: boolean
  /** When false, meshes do not receive shadows (default true). */
  receiveShadow?: boolean
  /** Euler rotation applied to the cloned scene (radians) — reorients the asset's native axes. */
  rotation?: { x?: number; y?: number; z?: number }
  /** Tron hologram tint for solar-panel meshes (default cyan). */
  panelTronColor?: THREE.ColorRepresentation
  /** Disable the tron hologram override entirely when false. */
  tronPanels?: boolean
  /** Explicit mesh names to treat as solar panels (overrides name/color heuristic). */
  panelMeshNames?: readonly string[]
}

let satelliteTemplate: THREE.Group | null = null
let satelliteTemplatePromise: Promise<THREE.Group> | null = null

/**
 * Load the satellite GLB once and cache the root group for cloning.
 */
async function ensureSatelliteTemplate(): Promise<THREE.Group> {
  if (satelliteTemplate) return satelliteTemplate
  if (!satelliteTemplatePromise) {
    satelliteTemplatePromise = loadGLB(SATELLITE_MODEL_PUBLIC_PATH).then((scene) => {
      fixMaterials(scene)
      satelliteTemplate = scene
      if (!loggedTemplateStructure) {
        loggedTemplateStructure = true
        const parts: string[] = []
        scene.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh
            const mat = mesh.material as THREE.Material | undefined
            parts.push(`• mesh="${mesh.name}" material="${mat?.name ?? '<unnamed>'}"`)
          }
        })
        console.info('[SatelliteModel] loaded mesh list:\n' + parts.join('\n'))
      }
      return scene
    })
  }
  return satelliteTemplatePromise
}


/**
 * Decorative satellite GLB — add {@link group} to your scene after
 * {@link SatelliteModel.create}. Geometries may be shared with the preload
 * template; {@link dispose} clears this instance's group and disposes any
 * per-instance hologram materials.
 */
export class SatelliteModel {
  /** Parent group for positioning; contains the cloned mesh hierarchy. */
  readonly group = new THREE.Group()
  private readonly tronMaterials: THREE.ShaderMaterial[]

  private constructor(
    sceneClone: THREE.Group,
    tronMaterials: THREE.ShaderMaterial[],
  ) {
    this.group.add(sceneClone)
    this.tronMaterials = tronMaterials
  }

  /**
   * Warm the satellite GLB so the first {@link SatelliteModel.create} does not hitch.
   */
  static async preload(): Promise<void> {
    await ensureSatelliteTemplate()
  }

  /**
   * Create a new satellite instance from the shared template.
   */
  static async create(options?: SatelliteModelCreateOptions): Promise<SatelliteModel> {
    const template = await ensureSatelliteTemplate()
    const sceneClone = cloneSkinnedScene(template) as THREE.Group

    const scale = options?.scale ?? DEFAULT_SATELLITE_SCALE
    sceneClone.scale.setScalar(scale)

    const r = options?.rotation
    if (r) {
      sceneClone.rotation.set(r.x ?? 0, r.y ?? 0, r.z ?? 0)
    }

    const castShadow = options?.castShadow ?? DEFAULT_CAST_SHADOW
    const receiveShadow = options?.receiveShadow ?? DEFAULT_RECEIVE_SHADOW
    const tronPanels = options?.tronPanels ?? true
    const panelColor = options?.panelTronColor ?? DEFAULT_PANEL_TRON_COLOR
    const explicitNames = options?.panelMeshNames
      ? new Set(options.panelMeshNames)
      : null

    const tronMaterials: THREE.ShaderMaterial[] = []
    let timeSyncMesh: THREE.Mesh | null = null

    sceneClone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        mesh.castShadow = castShadow
        mesh.receiveShadow = receiveShadow
        if (!tronPanels) return
        const matRef = mesh.material as THREE.Material | undefined
        const matName = matRef?.name ?? ''
        const stdMat = matRef as THREE.MeshStandardMaterial | undefined
        const col = stdMat?.color
        const colorMatchesPanel =
          col !== undefined &&
          col.r < PANEL_MAX_RED &&
          col.b - col.r > PANEL_BLUE_DOMINANCE &&
          col.b - col.g > PANEL_BLUE_DOMINANCE
        const isPanel = explicitNames
          ? explicitNames.has(mesh.name)
          : SOLAR_PANEL_NAME_REGEX.test(mesh.name) ||
            SOLAR_PANEL_NAME_REGEX.test(matName) ||
            colorMatchesPanel
        if (isPanel) {
          const mat = createTronHologramMaterial({
            color: panelColor,
            gridTint: DEFAULT_PANEL_GRID_TINT,
          })
          mesh.material = mat
          tronMaterials.push(mat)
          if (!timeSyncMesh) timeSyncMesh = mesh
        }
      }
    })

    if (timeSyncMesh && tronMaterials.length > 0) {
      const mats = tronMaterials
      ;(timeSyncMesh as THREE.Mesh).onBeforeRender = () => {
        syncTronHologramTimeSeconds(mats, performance.now() * 0.001)
      }
    }

    return new SatelliteModel(sceneClone, tronMaterials)
  }

  /**
   * Set yaw in radians around world +Y.
   */
  setYaw(yawRadians: number): void {
    this.group.rotation.y = yawRadians
  }

  /**
   * Detach cloned meshes from this group and dispose per-instance hologram materials.
   * TRON overlay meshes share the panel's geometry (no per-instance geometry alloc), so
   * they're freed when the scene clone is cleared.
   */
  dispose(): void {
    if (this.tronMaterials.length > 0) {
      disposeTronHologramMaterials(this.tronMaterials)
    }
    this.group.clear()
  }
}
