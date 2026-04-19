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

/**
 * Uniform scale on the GLB satellite in map world units. `satellite.glb` is 10.73 units
 * long native; 0.1 × 10.73 ≈ 1.07 world units — reads clearly as a maintenance target in
 * EVA close-up without filling the sky.
 */
const MAP_POI_SATELLITE_SCALE = 0.1

/** Yellow maintenance-beacon color — "needs repair" cue on the POI satellite. */
const SATELLITE_BEACON_COLOR = 0xffc64a

/** Beacon point-light peak intensity; pulsed by a sin(blink) envelope. */
const SATELLITE_BEACON_PEAK_INTENSITY = 3.2

/** Beacon idle intensity floor so the bulb is visible even at the trough of the blink. */
const SATELLITE_BEACON_BASE_INTENSITY = 0.4

/** Beacon blink frequency (Hz). Slow pulse so it reads as "attention" rather than alarm. */
const SATELLITE_BEACON_BLINK_HZ = 0.7

/** Beacon point-light attenuation distance in world units. */
const SATELLITE_BEACON_DISTANCE = 6

/** Beacon point-light decay exponent. */
const SATELLITE_BEACON_DECAY = 1.6

/** Radius of the visible emissive bulb sphere at the beacon. */
const SATELLITE_BEACON_BULB_RADIUS = 0.025

/** Offset (world units) from the satellite's local origin to where the bulb sits. Set
 * to sink the beacon into the upper half of the bus body — emissive glow still reads
 * clearly through the hull, but the bulb itself doesn't float above the silhouette. */
const SATELLITE_BEACON_LOCAL_OFFSET = new THREE.Vector3(0, 0.03, 0)

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
  /** Release geometries, materials, and detach from parent. */
  dispose(): void
}

async function createSatellitePoi(localY: number): Promise<EvaMissionPoiInstance> {
  const model = await SatelliteModel.create({ scale: MAP_POI_SATELLITE_SCALE })
  model.group.position.set(MAP_POI_LOCAL_OFFSET_X, localY, 0)

  const beaconMaterial = new THREE.MeshStandardMaterial({
    color: SATELLITE_BEACON_COLOR,
    emissive: SATELLITE_BEACON_COLOR,
    emissiveIntensity: 1.2,
  })
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(SATELLITE_BEACON_BULB_RADIUS, 12, 8),
    beaconMaterial,
  )
  bulb.position.copy(SATELLITE_BEACON_LOCAL_OFFSET)
  const light = new THREE.PointLight(
    SATELLITE_BEACON_COLOR,
    SATELLITE_BEACON_BASE_INTENSITY,
    SATELLITE_BEACON_DISTANCE,
    SATELLITE_BEACON_DECAY,
  )
  light.position.copy(SATELLITE_BEACON_LOCAL_OFFSET)
  model.group.add(bulb, light)

  let elapsed = 0
  return {
    object: model.group,
    tick: (dt) => {
      elapsed += dt
      const blink = 0.5 + 0.5 * Math.sin(elapsed * SATELLITE_BEACON_BLINK_HZ * Math.PI * 2)
      const pulse = blink * blink
      light.intensity =
        SATELLITE_BEACON_BASE_INTENSITY
        + (SATELLITE_BEACON_PEAK_INTENSITY - SATELLITE_BEACON_BASE_INTENSITY) * pulse
      beaconMaterial.emissiveIntensity = 0.5 + pulse * 3
    },
    dispose: () => {
      light.dispose()
      bulb.geometry.dispose()
      beaconMaterial.dispose()
      model.dispose()
      model.group.removeFromParent()
    },
  }
}

async function createRelayAntennaPoi(localY: number): Promise<EvaMissionPoiInstance> {
  const model = await VoyagerModel.create({ scale: MAP_POI_RELAY_ANTENNA_SCALE })
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
