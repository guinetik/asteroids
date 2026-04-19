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
import { VoyagerModel } from './VoyagerModel'
import { HubbleModel } from './HubbleModel'
import type { MaintenanceBeaconState } from './MaintenanceBeacon'

const MAP_POI_SATELLITE_SCALE = 0.1

/**
 * Uniform scale on the Voyager relay GLB in map world units. Starting point matched to
 * the satellite POI (~1 world unit); tune against the `[VoyagerModel] loaded mesh list
 * (raw size …)` log after the first load. Procedural `RelayAntennaController` is retired
 * from this factory — saved for a future minigame now that all POIs are authored GLBs.
 */
const MAP_POI_RELAY_ANTENNA_SCALE = 0.1

/**
 * Uniform scale on the Hubble telescope GLB in map world units. Kept small so the prop
 * stays a speck from the /map AU-scale camera; EVA huge-scale (see
 * `EVA_MAP_HUGE_POI_BY_TYPE.telescope`) boosts it to real-Hubble size in close-up. Tune
 * against the `[HubbleModel] loaded mesh list (raw size …)` log.
 */
const MAP_POI_TELESCOPE_SCALE = 0.06

/**
 * Local X offset of the POI prop inside its (now world-sized) container. A small
 * lateral nudge so the prop doesn't sit exactly on the beam axis.
 */
const MAP_POI_LOCAL_OFFSET_X = 0.3

/** An EVA mission POI ready to be attached under a waypoint root. */
export interface EvaMissionPoiInstance {
  /** Three.js object to add as a child of the waypoint root group. */
  object: THREE.Object3D
  /** Per-frame update; no-op for static props. */
  tick(dt: number): void
  /** Switch beacon status without rebuilding the prop. */
  setMaintenanceState(state: MaintenanceBeaconState): void
  /** Release geometries, materials, and detach from parent. */
  dispose(): void
}

async function createSatellitePoi(
  localY: number,
  maintenanceState: MaintenanceBeaconState,
): Promise<EvaMissionPoiInstance> {
  const model = await SatelliteModel.create({
    scale: MAP_POI_SATELLITE_SCALE,
    maintenanceState,
  })
  model.group.position.set(MAP_POI_LOCAL_OFFSET_X, localY, 0)
  return {
    object: model.group,
    tick: (dt) => model.tick(dt),
    setMaintenanceState: (state) => model.setMaintenanceState(state),
    dispose: () => {
      model.dispose()
      model.group.removeFromParent()
    },
  }
}

async function createRelayAntennaPoi(
  localY: number,
  maintenanceState: MaintenanceBeaconState,
): Promise<EvaMissionPoiInstance> {
  const model = await VoyagerModel.create({
    scale: MAP_POI_RELAY_ANTENNA_SCALE,
    maintenanceState,
  })
  model.group.position.set(MAP_POI_LOCAL_OFFSET_X, localY, 0)
  return {
    object: model.group,
    tick: (dt) => model.tick(dt),
    setMaintenanceState: (state) => model.setMaintenanceState(state),
    dispose: () => {
      model.dispose()
      model.group.removeFromParent()
    },
  }
}

async function createTelescopePoi(
  localY: number,
  maintenanceState: MaintenanceBeaconState,
): Promise<EvaMissionPoiInstance> {
  const model = await HubbleModel.create({
    scale: MAP_POI_TELESCOPE_SCALE,
    maintenanceState,
  })
  model.group.position.set(MAP_POI_LOCAL_OFFSET_X, localY, 0)
  return {
    object: model.group,
    tick: (dt) => model.tick(dt),
    setMaintenanceState: (state) => model.setMaintenanceState(state),
    dispose: () => {
      model.dispose()
      model.group.removeFromParent()
    },
  }
}

/**
 * Build the POI prop for an EVA mission waypoint.
 *
 * @param poiType - Which model the mission template specifies.
 * @param localY - Vertical offset inside the waypoint root (the root itself sits on Y=0).
 * @returns Instance ready to be parented to the waypoint root.
 */
export async function createEvaMissionPoi(
  poiType: EvaMissionPoiType,
  localY: number,
  maintenanceState: MaintenanceBeaconState = 'needs-maintenance',
): Promise<EvaMissionPoiInstance> {
  switch (poiType) {
    case 'satellite':
      return createSatellitePoi(localY, maintenanceState)
    case 'relay_antenna':
      return createRelayAntennaPoi(localY, maintenanceState)
    case 'telescope':
      return createTelescopePoi(localY, maintenanceState)
  }
}
