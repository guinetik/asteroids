/**
 * Builds the {@link MapOverlayState} Vue renders over the tactical map.
 *
 * Owns the persistent world-line history (sampled ship positions across the run)
 * so `buildOverlayState` can attach the projected trajectory without the
 * controller tracking the array itself.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-05-map-overlay-design.md
 */
import * as THREE from 'three'
import type {
  MapAsteroidBelt,
  MapOverlayState,
  MapThermalZone,
} from '@/lib/ShuttleTelemetry'
import { ASTEROID_BELTS } from '@/lib/planets/catalog'
import { ORBIT_SCALE } from '@/lib/planets/constants'
import type { SunController } from '@/three/controllers/SunController'
import type { PlanetSystemController } from '@/three/controllers/PlanetSystemController'
import type { MapCamera } from '@/three/MapCamera'
import type { GeneratedAsteroidMission } from '@/lib/missions/types'
import type { ShipHealthConfig } from '@/lib/shipHealth'
import {
  buildMapBodies,
  shouldShowAsteroidMissionMapSite,
} from '@/lib/map/mapViewControllerHelpers'
import { findNearestBodies, formatDistance, type MapBody } from '@/lib/mapProjection'
import { eventHorizonRadius, influenceRadius, type GravityConfig } from '@/lib/physics/gravity'
import { getThermalZoneBands } from '@/lib/mapThermalZones'
import {
  appendWorldLinePoint,
  shouldRecordWorldLinePoint,
  type WorldLineHistoryPoint,
  type WorldLineRecordState,
} from '@/lib/worldLineHistory'

/** Per-frame inputs for {@link MapOverlayProjector.buildOverlayState}. */
export interface MapOverlayBuildInput {
  /** Tactical-map ortho camera used for projection. */
  mapCamera: MapCamera
  /** Ship world X. */
  shipX: number
  /** Ship world Z. */
  shipZ: number
  /** Ship heading angle in radians (rotation.y; forward = +X at heading 0). */
  heading: number
  /** Ship speed — passed through untouched for arrow-length scaling. */
  speed: number
  /** True while the shuttle is exploding or in the death overlay; suppresses the trajectory. */
  shipDead: boolean
  /** Sun controller for the solar body catalog. */
  sunController: SunController | null
  /** Live planet controllers for the solar body catalog. */
  planetControllers: PlanetSystemController[]
  /** ShipHealth config — drives the thermal band annuli. Null when health hasn't loaded yet. */
  shipHealthConfig: ShipHealthConfig | null
  /** Active asteroid mission, if one is live; projected as a waypoint. */
  activeAsteroidMission: GeneratedAsteroidMission | null
  /** Gravity config (radii for influence + event-horizon rings). */
  gravityConfig: GravityConfig
  /** Data-file tuning (world-line sample cadence, nearest-body count, mass threshold for rings). */
  overlayData: MapOverlayTuning
}

/** Per-frame inputs for {@link MapOverlayProjector.recordWorldLinePoint}. */
export interface MapOverlayRecordInput {
  /** Orbit-capture state — only `free` currently samples the trajectory. */
  orbitState: WorldLineRecordState
  /** Ship world X. */
  shipX: number
  /** Ship world Z. */
  shipZ: number
  /** True while the shuttle is dead (suppresses recording). */
  shipDead: boolean
}

/** Tuning values pulled from `src/data/shuttle/map-overlay.json`. */
export interface MapOverlayTuning {
  /** Minimum world distance between consecutive world-line samples. */
  worldLineSampleDistance: number
  /** Number of bodies to include in the distance-line overlay. */
  nearestBodyCount: number
  /** Minimum mass for a body to draw influence + horizon rings. */
  influenceMassThreshold: number
}

/** Percent scale factor — `MapCamera.projectToScreen` returns 0..1, HUD renders in %. */
const PERCENT = 100

/**
 * Stateful projector: owns the world-line history and produces a frame-ready
 * {@link MapOverlayState} for the Vue HUD.
 */
export class MapOverlayProjector {
  /** Persistent sampled ship trajectory across the current run. */
  private worldLineHistory: WorldLineHistoryPoint[] = []

  /** Number of sampled world-line points — exposed so the message runtime can gate on history depth. */
  get worldLineLength(): number {
    return this.worldLineHistory.length
  }

  /** Sample the current ship position into the world line when orbit state permits. */
  recordWorldLinePoint(input: MapOverlayRecordInput, minDistance: number): void {
    if (!shouldRecordWorldLinePoint(input.orbitState, input.shipDead)) return
    this.worldLineHistory = appendWorldLinePoint(
      this.worldLineHistory,
      { x: input.shipX, z: input.shipZ },
      minDistance,
    )
  }

  /** Clear history and seed it with the current ship position (new run / respawn). */
  reset(input: MapOverlayRecordInput, minDistance: number): void {
    this.worldLineHistory = []
    this.recordWorldLinePoint(input, minDistance)
  }

  /**
   * Build the full overlay state for the Vue HUD.
   *
   * Returns `null` when the projector lacks minimum deps (no ship or no map camera). Callers
   * should skip `onMapOverlay` in that case — the overlay stays hidden.
   */
  buildOverlayState(input: MapOverlayBuildInput): MapOverlayState | null {
    const bodies: MapBody[] = buildMapBodies({
      sun: input.sunController,
      planets: input.planetControllers,
    })

    const shipScreen = input.mapCamera.projectToScreen(
      new THREE.Vector3(input.shipX, 0, input.shipZ),
    )

    const labels = bodies.map((b) => {
      const screen = input.mapCamera.projectToScreen(new THREE.Vector3(b.x, 0, b.z))
      const dx = b.x - input.shipX
      const dz = b.z - input.shipZ
      const dist = Math.sqrt(dx * dx + dz * dz)
      return {
        id: b.id,
        name: b.name,
        screenX: screen.x * PERCENT,
        screenY: screen.y * PERCENT,
        distance: formatDistance(dist),
      }
    })

    const nearest = findNearestBodies(
      input.shipX,
      input.shipZ,
      bodies,
      input.overlayData.nearestBodyCount,
    )
    const distances = nearest.map((b) => {
      const bodyScreen = input.mapCamera.projectToScreen(new THREE.Vector3(b.x, 0, b.z))
      return {
        name: b.name,
        shipX: shipScreen.x * PERCENT,
        shipY: shipScreen.y * PERCENT,
        bodyX: bodyScreen.x * PERCENT,
        bodyY: bodyScreen.y * PERCENT,
        distance: formatDistance(b.distance),
      }
    })

    // Heading arrow: ship rotation.y increases CCW (top-down); CSS rotate increases CW.
    // rotate(0deg) = up; rotate(90deg) = right. Convert so heading 0 (+X forward) maps to
    // rotate(90deg) and continues clockwise.
    const headingDeg = 90 - (input.heading * 180) / Math.PI

    const gravityRings = bodies
      .filter((b) => b.mass >= input.overlayData.influenceMassThreshold)
      .map((b) => {
        const center = input.mapCamera.projectToScreen(new THREE.Vector3(b.x, 0, b.z))
        const infR = influenceRadius(b.mass, input.gravityConfig)
        const horR = eventHorizonRadius(b.mass, input.gravityConfig)
        const edgeInf = input.mapCamera.projectToScreen(new THREE.Vector3(b.x + infR, 0, b.z))
        const edgeHor = input.mapCamera.projectToScreen(new THREE.Vector3(b.x + horR, 0, b.z))
        return {
          name: b.name,
          centerX: center.x * PERCENT,
          centerY: center.y * PERCENT,
          influenceRadius: Math.abs(edgeInf.x - center.x) * PERCENT,
          horizonRadius: Math.abs(edgeHor.x - center.x) * PERCENT,
        }
      })

    // Thermal bands: project X and Z offsets separately so the overlay renders true
    // screen-space circles on aspect-scaled ortho frustums.
    const thermalZones: MapThermalZone[] = input.shipHealthConfig
      ? getThermalZoneBands(input.shipHealthConfig).map((band) => {
          const center = input.mapCamera.projectToScreen(new THREE.Vector3(0, 0, 0))
          const innerEdgeX = input.mapCamera.projectToScreen(
            new THREE.Vector3(band.innerWorldRadius, 0, 0),
          )
          const innerEdgeZ = input.mapCamera.projectToScreen(
            new THREE.Vector3(0, 0, band.innerWorldRadius),
          )
          const outerEdgeX = input.mapCamera.projectToScreen(
            new THREE.Vector3(band.outerWorldRadius, 0, 0),
          )
          const outerEdgeZ = input.mapCamera.projectToScreen(
            new THREE.Vector3(0, 0, band.outerWorldRadius),
          )
          return {
            kind: band.kind,
            centerX: center.x * PERCENT,
            centerY: center.y * PERCENT,
            innerRadiusX: Math.abs(innerEdgeX.x - center.x) * PERCENT,
            innerRadiusY: Math.abs(innerEdgeZ.y - center.y) * PERCENT,
            outerRadiusX: Math.abs(outerEdgeX.x - center.x) * PERCENT,
            outerRadiusY: Math.abs(outerEdgeZ.y - center.y) * PERCENT,
          }
        })
      : []

    const trajectoryPoints = this.buildTrajectory(
      input.mapCamera,
      input.shipX,
      input.shipZ,
      input.shipDead,
    )

    let missionWaypoint: MapOverlayState['missionWaypoint'] = null
    if (shouldShowAsteroidMissionMapSite(input.activeAsteroidMission)) {
      const wp = input.activeAsteroidMission!.waypoint
      const wpScreen = input.mapCamera.projectToScreen(new THREE.Vector3(wp.worldX, 0, wp.worldZ))
      const dx = wp.worldX - input.shipX
      const dz = wp.worldZ - input.shipZ
      const dist = Math.sqrt(dx * dx + dz * dz)
      missionWaypoint = {
        screenX: wpScreen.x * PERCENT,
        screenY: wpScreen.y * PERCENT,
        name: input.activeAsteroidMission!.name,
        distance: formatDistance(dist),
      }
    }

    const asteroidBelts = this.buildAsteroidBelts(input.mapCamera)

    return {
      visible: true,
      labels,
      shipX: shipScreen.x * PERCENT,
      shipY: shipScreen.y * PERCENT,
      headingDeg,
      speed: input.speed,
      distances,
      gravityRings,
      asteroidBelts,
      thermalZones,
      trajectoryPoints,
      missionWaypoint,
    }
  }

  /**
   * Project each asteroid belt's inner/outer radius to screen-space %, centered
   * on the Sun (world origin). Both radii are derived from belt.{inner,outer}Radius
   * (AU) × ORBIT_SCALE — same convention used by the 3D belt controllers.
   */
  private buildAsteroidBelts(mapCamera: MapCamera): MapAsteroidBelt[] {
    const sunCenter = mapCamera.projectToScreen(new THREE.Vector3(0, 0, 0))
    return ASTEROID_BELTS.map((belt) => {
      const innerWorld = belt.innerRadius * ORBIT_SCALE
      const outerWorld = belt.outerRadius * ORBIT_SCALE
      // Project X and Z offsets separately. CSS width % references viewport width
      // and height % references viewport height — using a single radius would
      // stretch the annulus into a stadium on non-square viewports.
      const outerEdgeX = mapCamera.projectToScreen(new THREE.Vector3(outerWorld, 0, 0))
      const outerEdgeZ = mapCamera.projectToScreen(new THREE.Vector3(0, 0, outerWorld))
      const innerEdgeX = mapCamera.projectToScreen(new THREE.Vector3(innerWorld, 0, 0))
      const innerEdgeZ = mapCamera.projectToScreen(new THREE.Vector3(0, 0, innerWorld))
      return {
        id: belt.id,
        name: belt.name,
        centerX: sunCenter.x * PERCENT,
        centerY: sunCenter.y * PERCENT,
        outerRadiusX: Math.abs(outerEdgeX.x - sunCenter.x) * PERCENT,
        outerRadiusY: Math.abs(outerEdgeZ.y - sunCenter.y) * PERCENT,
        innerRadiusX: Math.abs(innerEdgeX.x - sunCenter.x) * PERCENT,
        innerRadiusY: Math.abs(innerEdgeZ.y - sunCenter.y) * PERCENT,
      }
    })
  }

  /** Project the persistent world line to screen space, appending the current ship point. */
  private buildTrajectory(
    mapCamera: MapCamera,
    shipX: number,
    shipZ: number,
    shipDead: boolean,
  ): MapOverlayState['trajectoryPoints'] {
    if (shipDead) return []
    const lastPoint = this.worldLineHistory[this.worldLineHistory.length - 1]
    const points =
      lastPoint && lastPoint.x === shipX && lastPoint.z === shipZ
        ? this.worldLineHistory
        : [...this.worldLineHistory, { x: shipX, z: shipZ }]

    return points.map((sample) => {
      const projected = mapCamera.projectToScreen(new THREE.Vector3(sample.x, 0, sample.z))
      return {
        screenX: projected.x * PERCENT,
        screenY: projected.y * PERCENT,
      }
    })
  }
}
