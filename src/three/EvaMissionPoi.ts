/**
 * Factory for the prop shown at an EVA mission waypoint on the solar map.
 *
 * Mirrors the role {@link MapMissionAsteroidPreview} plays for asteroid missions:
 * one call returns an instance whose `object` is added as a child of the mission
 * waypoint root, with the root rescaled each frame for constant screen size.
 * New `poiType` values (e.g. `'telescope'`) add one branch here; no call-site changes.
 *
 * @author guinetik
 * @date 2026-04-18
 * @spec docs/superpowers/specs/2026-04-18-visit-relay-mission-design.md
 */
import * as THREE from 'three'
import type { EvaMissionPoiType } from '@/lib/missions/types'
import { SatelliteModel } from './SatelliteModel'
import { RelayAntennaController } from './RelayAntennaController'

/** Uniform scale on the GLB satellite so it reads at map zoom next to the beam marker. */
const MAP_POI_SATELLITE_SCALE = 40

/** Uniform scale on the primitive relay antenna so it reads at map zoom next to the beam marker. */
const MAP_POI_RELAY_ANTENNA_SCALE = 6

/** Local X offset that keeps the prop from overlapping the cyan beam column. */
const MAP_POI_LOCAL_OFFSET_X = 14

/** An EVA mission POI ready to be attached under a waypoint root. */
export interface EvaMissionPoiInstance {
  /** Three.js object to add as a child of the waypoint root group. */
  object: THREE.Object3D
  /** Per-frame update; no-op for static props. */
  tick(dt: number): void
  /** Release geometries, materials, and detach from parent. */
  dispose(): void
}

async function createSatellitePoi(): Promise<EvaMissionPoiInstance> {
  const model = await SatelliteModel.create({ scale: MAP_POI_SATELLITE_SCALE })
  model.group.position.set(MAP_POI_LOCAL_OFFSET_X, 0, 0)
  return {
    object: model.group,
    tick: () => {},
    dispose: () => {
      model.dispose()
      model.group.removeFromParent()
    },
  }
}

function createRelayAntennaPoi(): EvaMissionPoiInstance {
  const controller = new RelayAntennaController()
  controller.group.scale.setScalar(MAP_POI_RELAY_ANTENNA_SCALE)
  controller.group.position.set(MAP_POI_LOCAL_OFFSET_X, 0, 0)
  return {
    object: controller.group,
    tick: (dt) => controller.tick(dt),
    dispose: () => {
      controller.dispose()
      controller.group.removeFromParent()
    },
  }
}

/**
 * Build the POI prop for an EVA mission waypoint.
 *
 * @param poiType - Which model the mission template specifies.
 * @returns Instance ready to be parented to the waypoint root.
 */
export async function createEvaMissionPoi(
  poiType: EvaMissionPoiType,
): Promise<EvaMissionPoiInstance> {
  switch (poiType) {
    case 'satellite':
      return createSatellitePoi()
    case 'relay_antenna':
      return createRelayAntennaPoi()
  }
}
