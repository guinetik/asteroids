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
import type { Tickable } from '@/lib/Tickable'
import type { EvaMissionPoiType } from '@/lib/missions/types'
import { SatelliteModel } from './SatelliteModel'
import { VoyagerModel } from './VoyagerModel'
import { HubbleModel } from './HubbleModel'
import type { MaintenanceBeaconState } from './MaintenanceBeacon'

/**
 * Base uniform scale on the GLB satellite, tuned for the /map AU view. Sized close to
 * `MAP_SHUTTLE_SCALE = 0.01`-shuttle silhouette so the prop reads as "small craft near
 * the waypoint" rather than dominating the scene. EVA close-up size (~1 world unit next
 * to the ×100 shuttle) is reconstituted by `EVA_MAP_HUGE_POI_BY_TYPE.satellite` applying
 * a 20× boost at EVA enter.
 */
const MAP_POI_SATELLITE_SCALE = 0.005

/**
 * Base uniform scale on the Voyager relay GLB in map world units. Same sizing rationale
 * as {@link MAP_POI_SATELLITE_SCALE} — small on the AU map, boosted ×20 during EVA via
 * `EVA_MAP_HUGE_POI_BY_TYPE.relay_antenna` so close-up reads match the ×100 shuttle.
 * Procedural `RelayAntennaController` is retired from this factory — saved for a future
 * minigame now that all POIs are authored GLBs.
 */
const MAP_POI_RELAY_ANTENNA_SCALE = 0.005

/**
 * Uniform scale on the Hubble telescope GLB in map world units. Kept small so the prop
 * stays a speck from the /map AU-scale camera; EVA huge-scale (see
 * `EVA_MAP_HUGE_POI_BY_TYPE.telescope`) boosts it to real-Hubble size in close-up. Tune
 * against the `[HubbleModel] loaded mesh list (raw size …)` log.
 */
const MAP_POI_TELESCOPE_SCALE = 0.06

/**
 * Local X offset of the POI prop inside its container. Kept at 0 — the POI container
 * is scaled by `EVA_MAP_HUGE_POI_BY_TYPE` during EVA, and any non-zero local offset is
 * amplified by that factor (a 0.3 nudge becomes a 6-world-unit drift at ×20 scale,
 * which puts the prop visibly sideways of its waypoint beam). If a lateral nudge is
 * wanted later, apply it to the POI container's world position, not here.
 */
const MAP_POI_LOCAL_OFFSET_X = 0

/** An EVA mission POI ready to be attached under a waypoint root. */
export interface EvaMissionPoiInstance extends Tickable {
  /** Three.js object to add as a child of the waypoint root group. */
  object: THREE.Object3D
  /** Switch beacon status without rebuilding the prop. */
  setMaintenanceState(state: MaintenanceBeaconState): void
  /** Release geometries, materials, and detach from parent. */
  dispose(): void
}

/** Builds the satellite GLB POI at the waypoint height. */
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
    tickDebugLabel: 'EvaMissionPoiSatellite',
    tick: (dt) => model.tick(dt),
    setMaintenanceState: (state) => model.setMaintenanceState(state),
    dispose: () => {
      model.dispose()
      model.group.removeFromParent()
    },
  }
}

/** Builds the Voyager-style relay antenna POI at the waypoint height. */
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
    tickDebugLabel: 'EvaMissionPoiRelayAntenna',
    tick: (dt) => model.tick(dt),
    setMaintenanceState: (state) => model.setMaintenanceState(state),
    dispose: () => {
      model.dispose()
      model.group.removeFromParent()
    },
  }
}

/** Builds the Hubble-style telescope POI at the waypoint height. */
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
    tickDebugLabel: 'EvaMissionPoiTelescope',
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
