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
import { HubbleModel } from './HubbleModel'

/**
 * Uniform scale on the GLB satellite in map world units. Sized to the shuttle's cargo-bay
 * lander (`CARGO_LANDER_SCALE = 30` in `0.01` model space, ≈ 0.3 world units) — the
 * shuttle deploys satellites, so they should read at roughly lander-size next to the
 * hull, not fill the sky.
 */
const MAP_POI_SATELLITE_SCALE = 0.02

/**
 * Uniform scale on the primitive relay antenna in map world units. Matched to the same
 * lander-proportion target as {@link MAP_POI_SATELLITE_SCALE} — the relay's primitives
 * are native ~0.5–3 unit, so a scale of 0.15 lands it near ~0.3 world units overall.
 */
const MAP_POI_RELAY_ANTENNA_SCALE = 0.15

/**
 * Uniform scale on the Hubble telescope GLB in map world units. Native geometry spans
 * ~18×19×27 local units; this puts it at ~0.4 world units, a touch larger than the
 * satellite/relay since Hubble is a bigger sibling of the sat class.
 */
const MAP_POI_TELESCOPE_SCALE = 0.03

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
  /** Release geometries, materials, and detach from parent. */
  dispose(): void
}

async function createSatellitePoi(localY: number): Promise<EvaMissionPoiInstance> {
  const model = await SatelliteModel.create({
    scale: MAP_POI_SATELLITE_SCALE,
    // Only Object_7 gets the TRON hologram; Object_8 keeps its original GLB material.
    panelMeshNames: ['Object_7'],
  })
  model.group.position.set(MAP_POI_LOCAL_OFFSET_X, localY, 0)
  return {
    object: model.group,
    tick: () => {},
    dispose: () => {
      model.dispose()
      model.group.removeFromParent()
    },
  }
}

function createRelayAntennaPoi(localY: number): EvaMissionPoiInstance {
  const controller = new RelayAntennaController()
  controller.group.scale.setScalar(MAP_POI_RELAY_ANTENNA_SCALE)
  controller.group.position.set(MAP_POI_LOCAL_OFFSET_X, localY, 0)
  return {
    object: controller.group,
    tick: (dt) => controller.tick(dt),
    dispose: () => {
      controller.dispose()
      controller.group.removeFromParent()
    },
  }
}

async function createTelescopePoi(localY: number): Promise<EvaMissionPoiInstance> {
  const model = await HubbleModel.create({ scale: MAP_POI_TELESCOPE_SCALE })
  model.group.position.set(MAP_POI_LOCAL_OFFSET_X, localY, 0)
  return {
    object: model.group,
    tick: () => {},
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
): Promise<EvaMissionPoiInstance> {
  switch (poiType) {
    case 'satellite':
      return createSatellitePoi(localY)
    case 'relay_antenna':
      return createRelayAntennaPoi(localY)
    case 'telescope':
      return createTelescopePoi(localY)
  }
}
