/**
 * Shared helpers for {@link MapViewController}: materials, mission-site visibility,
 * gravity wells, and map overlay body lists.
 *
 * @author guinetik
 * @date 2026-04-12
 * @spec docs/asteroid-lander-gdd.md
 */
import * as THREE from 'three'
import { PLANETS } from '@/lib/planets/catalog'
import type { ActiveVisitRelayMission, GeneratedAsteroidMission } from '@/lib/missions/types'
import type { GravityConfig, GravitySource } from '@/lib/physics/gravity'
import { eventHorizonRadius, gravityAt, influenceRadius } from '@/lib/physics/gravity'
import type { GravityWell } from '@/three/ShuttleController'
import {
  AIM_BLOCK_THRESHOLD,
  EARTH_CATALOG_DISPLAY_RADIUS,
  SPAWN_OFFSET_BEHIND_EARTH,
} from '@/lib/map/mapViewControllerConfig'

/** Three.js mesh materials that expose `emissive` for manual glow control. */
export type EmissiveMaterial =
  | THREE.MeshLambertMaterial
  | THREE.MeshPhongMaterial
  | THREE.MeshStandardMaterial
  | THREE.MeshPhysicalMaterial
  | THREE.MeshToonMaterial

/** Whether a material exposes emissive controls. */
export function isEmissiveMaterial(material: THREE.Material): material is EmissiveMaterial {
  return (
    material instanceof THREE.MeshLambertMaterial ||
    material instanceof THREE.MeshPhongMaterial ||
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshPhysicalMaterial ||
    material instanceof THREE.MeshToonMaterial
  )
}

/** Whether the shuttle map should draw the 3D asteroid mission site. */
export function shouldShowAsteroidMissionMapSite(
  mission: GeneratedAsteroidMission | null,
): boolean {
  return mission !== null && (mission.status === 'accepted' || mission.status === 'in-transit')
}

/**
 * Pick the EVA mission whose waypoint should currently be rendered on the map.
 * One site at a time, mirroring the asteroid mission site rule; prefer the first
 * active (not-yet-delivered) EVA mission so the player always sees the oldest target.
 */
export function pickActiveEvaMissionMapSite(
  missions: readonly ActiveVisitRelayMission[],
): ActiveVisitRelayMission | null {
  for (const m of missions) {
    if (m.status === 'active') return m
  }
  return null
}

/** World-space standoff used by dev warp to keep the shuttle off the target body mesh. */
export function mapWarpStandoffWorldUnits(displayRadius: number): number {
  return SPAWN_OFFSET_BEHIND_EARTH * (displayRadius / EARTH_CATALOG_DISPLAY_RADIUS)
}

/** Wraps a GravitySource into a GravityWell that ShuttleController can consume. */
export function makeGravityWell(
  source: GravitySource,
  config: GravityConfig,
): GravityWell & GravitySource {
  return {
    mass: source.mass,
    getWorldX: () => source.getWorldX(),
    getWorldZ: () => source.getWorldZ(),
    getGravityAt(pos: THREE.Vector3): THREE.Vector3 {
      const g = gravityAt(source.getWorldX(), source.getWorldZ(), source.mass, pos.x, pos.z, config)
      return new THREE.Vector3(g.ax, 0, g.az)
    },
  }
}

/** Compute gravity proximity for a single source. */
export function computeGravityProximity(
  sourceX: number,
  sourceZ: number,
  mass: number,
  px: number,
  pz: number,
  config: GravityConfig,
): number {
  const dx = sourceX - px
  const dz = sourceZ - pz
  const dist = Math.sqrt(dx * dx + dz * dz)
  const influence = influenceRadius(mass, config)
  const horizon = eventHorizonRadius(mass, config)
  if (dist >= influence) return 0
  return Math.min(1, 1 - (dist - horizon) / (influence - horizon))
}

/** Max gravity proximity across the Sun and all current planet controllers. */
export function computeMaxGravityProximity(
  px: number,
  pz: number,
  sources: Array<{ getWorldX(): number; getWorldZ(): number; mass: number }>,
  config: GravityConfig,
): number {
  let max = 0
  for (const source of sources) {
    max = Math.max(
      max,
      computeGravityProximity(source.getWorldX(), source.getWorldZ(), source.mass, px, pz, config),
    )
  }
  return max
}

/**
 * Camera-height driven asteroid belt density for the 3D map view.
 *
 * The default orbit camera opens around y=3, so we intentionally avoid
 * full-density belts there to keep the initial map view responsive. The
 * densest presentation is reserved for deliberate close inspection.
 */
export function getMapAsteroidBeltLodFraction(cameraY: number): number {
  const y = Math.abs(cameraY)
  if (y < 2.5) return 1
  if (y < 8) return 0.35
  if (y < 20) return 0.2
  if (y < 50) return 0.1
  return 0.05
}

/** Returns true if the shuttle is aiming toward the currently captured planet. */
export function isShuttleAimingAtPlanet(params: {
  shuttlePosition: { x: number; z: number }
  shuttleQuaternion: THREE.Quaternion
  planetPosition: { x: number; z: number }
}): boolean {
  const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(params.shuttleQuaternion)
  forward.y = 0
  forward.normalize()

  const toPlanet = new THREE.Vector3(
    params.planetPosition.x - params.shuttlePosition.x,
    0,
    params.planetPosition.z - params.shuttlePosition.z,
  ).normalize()

  return forward.dot(toPlanet) > AIM_BLOCK_THRESHOLD
}

/** Build map overlay body data from the active planetarium controllers. */
export function buildMapBodies(params: {
  sun: {
    getWorldX(): number
    getWorldZ(): number
    mass: number
  } | null
  planets: Array<{ getWorldX(): number; getWorldZ(): number; mass: number }>
}): Array<{ id: string; name: string; x: number; z: number; mass: number }> {
  const bodies: Array<{ id: string; name: string; x: number; z: number; mass: number }> = []

  if (params.sun) {
    bodies.push({
      id: 'sun',
      name: 'Sun',
      x: params.sun.getWorldX(),
      z: params.sun.getWorldZ(),
      mass: params.sun.mass,
    })
  }

  for (let i = 0; i < params.planets.length; i++) {
    const planet = params.planets[i]!
    const def = PLANETS[i]
    bodies.push({
      id: def?.id ?? '',
      name: def?.name ?? '',
      x: planet.getWorldX(),
      z: planet.getWorldZ(),
      mass: planet.mass,
    })
  }

  return bodies
}
