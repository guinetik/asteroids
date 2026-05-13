/**
 * Renders a station GLB at a deterministic Kuiper-belt position for the
 * duration of an active contract that pins it. Mission-spawned, not a
 * celestial body — the orbit detector never sees it.
 *
 * @author guinetik
 * @date 2026-05-12
 * @spec docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md
 */
import * as THREE from 'three'
import { loadGLB, wrapSceneAtBoundingBoxCenter } from '@/three/loadGLB'
import { hashToKuiperPosition } from '@/lib/math/deterministicPositioning'
import {
  createWaypointMarkerGroup,
  disposeWaypointMarkerGroup,
  ORBIT_MAP_WAYPOINT_SCALE_REFERENCE,
  tickWaypointMarkerGroup,
  WAYPOINT_MARKER_DEFAULT_COLOR,
} from '@/three/WaypointMarkers'

/**
 * Default uniform scale applied to the station model on the solar map.
 *
 * The map uses AU units (Mercury at 0.387, Earth at 1.0). The station GLB is
 * authored at near-real-world size, so at scale 1 it occupies ~0.5 AU and
 * dwarfs the inner planets. This default sizes it roughly like the procedural
 * asteroid-mission preview rock — a small navigation target that reads
 * clearly without overlapping orbital geometry. Override per-instance via
 * `PinnedStationControllerOptions.scale` if a specific station needs to be
 * larger or smaller.
 */
const DEFAULT_STATION_SCALE = 0.02

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
   * @default DEFAULT_STATION_SCALE
   */
  scale?: number
}

/**
 * Three.js controller for a mission-spawned, pinned station-kind asset.
 *
 * Loads a GLB asynchronously and places it at a deterministic position derived
 * from `positionSeed` so the same contract always shows the station at the same
 * spot. Also spawns a constant-screen-size waypoint beam at the station so it
 * remains findable from anywhere on the solar map. Exposes `getWorldPosition()`
 * for the proximity loop and `dispose()` for clean contract teardown.
 */
export class PinnedStationController {
  private readonly _scene: THREE.Scene
  private readonly _worldPosition: THREE.Vector3
  private _group: THREE.Group | null = null
  private _waypointRoot: THREE.Group | null = null
  private _waypointMarker: THREE.Group | null = null
  private _disposed = false

  constructor(opts: PinnedStationControllerOptions) {
    this._scene = opts.scene
    this._worldPosition = hashToKuiperPosition(opts.positionSeed)

    const scale = opts.scale ?? DEFAULT_STATION_SCALE
    const path = opts.modelPath.startsWith('/') ? opts.modelPath : `/${opts.modelPath}`

    // Spawn waypoint beam immediately so the station is findable even before the
    // async GLB load resolves. The beam is auto-rescaled per frame via
    // `tickWaypoint` for constant apparent screen size.
    const waypointRoot = new THREE.Group()
    waypointRoot.position.copy(this._worldPosition)
    const waypointMarker = createWaypointMarkerGroup(WAYPOINT_MARKER_DEFAULT_COLOR, 'orbitMap')
    waypointRoot.add(waypointMarker)
    this._scene.add(waypointRoot)
    this._waypointRoot = waypointRoot
    this._waypointMarker = waypointMarker

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
   * Per-frame waypoint rescale + animation. Mirrors the math used by
   * `MapMissionFacade.tickWaypointVisuals` so the station beam stays at a
   * stable apparent size from any zoom level on the solar map.
   *
   * @param camera - The map's perspective camera. Distance to the waypoint
   *   together with the camera's vertical FOV drives the uniform scale.
   * @param apparentSize - Target on-screen height as a fraction of viewport
   *   height (e.g. `MAP_CONFIG.WAYPOINT_APPARENT_SIZE`).
   * @param simTime - Accumulated simulation seconds, drives pulse/rotate VFX.
   * @param shuttleX - Shuttle world-space X (used by proximity fade in the
   *   `surface` preset; harmless for the `orbitMap` preset used here).
   * @param shuttleZ - Shuttle world-space Z (mirrors `shuttleX`).
   */
  tickWaypoint(
    camera: THREE.PerspectiveCamera,
    apparentSize: number,
    simTime: number,
    shuttleX: number,
    shuttleZ: number,
  ): void {
    if (!this._waypointRoot || !this._waypointMarker) return
    const halfFovRad = THREE.MathUtils.degToRad(camera.fov / 2)
    const tanHalfFov = Math.tan(halfFovRad)
    const dist = camera.position.distanceTo(this._waypointRoot.position)
    const targetScreenHeight = apparentSize * 2 * dist * tanHalfFov
    const uniformScale = targetScreenHeight / ORBIT_MAP_WAYPOINT_SCALE_REFERENCE
    this._waypointRoot.scale.setScalar(uniformScale)
    tickWaypointMarkerGroup(this._waypointMarker, simTime, shuttleX, shuttleZ)
  }

  /**
   * Remove the model and waypoint from the scene and dispose all geometries
   * and materials. Safe to call before the async load resolves — in that case
   * the load callback bails immediately and nothing is added to the scene.
   * Safe to call more than once (guarded by a disposed flag).
   */
  dispose(): void {
    if (this._disposed) return
    this._disposed = true

    if (this._waypointMarker) {
      disposeWaypointMarkerGroup(this._waypointMarker)
      this._waypointMarker = null
    }
    if (this._waypointRoot) {
      this._scene.remove(this._waypointRoot)
      this._waypointRoot = null
    }

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
