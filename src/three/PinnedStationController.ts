/**
 * Renders a station GLB at a deterministic Kuiper-belt position for the
 * duration of an active contract that pins it. Mission-spawned, not a
 * celestial body — the orbit detector never sees it.
 *
 * @author guinetik
 * @date 2026-05-05
 * @spec docs/superpowers/specs/2026-05-05-ceres-station-dock-system-design.md
 */
import * as THREE from 'three'
import { loadGLB, wrapSceneAtBoundingBoxCenter } from '@/three/loadGLB'
import { hashToKuiperPosition } from '@/lib/math/deterministicPositioning'

/** Default uniform scale applied to the station model. */
const DEFAULT_STATION_SCALE = 1

/** Constructor options for {@link PinnedStationController}. */
export interface PinnedStationControllerOptions {
  /** Three.js scene to add the model to. */
  scene: THREE.Scene
  /**
   * Path under `public/` to the station GLB.
   * @example `'models/station.glb'`
   */
  modelPath: string
  /**
   * Stable string hashed to a deterministic Kuiper-belt position.
   * Same seed always produces the same world-space location across reloads.
   * Typically the contract `assetRef` (e.g. `'ceres-archive-site'`).
   */
  positionSeed: string
  /**
   * Uniform world-unit scale applied to the loaded model.
   * @default 1
   */
  scale?: number
}

/**
 * Three.js controller for a mission-spawned, pinned station-kind asset.
 *
 * Loads a GLB asynchronously and places it at a deterministic position derived
 * from `positionSeed` so the same contract always shows the station at the same
 * spot. Exposes `getWorldPosition()` for the proximity loop and `dispose()` for
 * clean contract teardown.
 */
export class PinnedStationController {
  private readonly _scene: THREE.Scene
  private readonly _worldPosition: THREE.Vector3
  private _group: THREE.Group | null = null
  private _disposed = false

  constructor(opts: PinnedStationControllerOptions) {
    this._scene = opts.scene
    this._worldPosition = hashToKuiperPosition(opts.positionSeed)

    const scale = opts.scale ?? DEFAULT_STATION_SCALE
    const path = opts.modelPath.startsWith('/') ? opts.modelPath : `/${opts.modelPath}`

    loadGLB(path).then((scene) => {
      if (this._disposed) return

      const group = wrapSceneAtBoundingBoxCenter(scene)
      group.scale.setScalar(scale)
      group.position.copy(this._worldPosition)

      group.traverse((child) => {
        const mesh = child as THREE.Mesh
        if (mesh.isMesh) {
          mesh.castShadow = true
          mesh.receiveShadow = true
        }
      })

      this._group = group
      this._scene.add(group)
    })
  }

  /**
   * World-space position used by the proximity loop.
   * Returns a clone so callers cannot mutate the internal vector.
   *
   * @returns Copy of the station's world-space position.
   */
  getWorldPosition(): THREE.Vector3 {
    return this._worldPosition.clone()
  }

  /**
   * Remove the model from the scene and dispose all geometries and materials.
   * Safe to call before the async load resolves — in that case the load
   * callback bails immediately and nothing is added to the scene.
   * Safe to call more than once (guarded by a disposed flag).
   */
  dispose(): void {
    if (this._disposed) return
    this._disposed = true

    if (this._group) {
      this._scene.remove(this._group)
      this._group.traverse((child) => {
        const mesh = child as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.geometry.dispose()
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const mat of mats) {
          if (mat) mat.dispose()
        }
      })
      this._group = null
    }
  }
}
