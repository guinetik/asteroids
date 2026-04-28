/**
 * 3D waypoint markers for mission objectives.
 *
 * Each marker is a glowing vertical beam with a pulsing base ring
 * and rotating diamond tip. Placed at flat zone centers on the
 * terrain surface, visible from orbit during lander descent.
 * The solar map uses a smaller {@link ORBIT_MAP_LAYOUT} preset.
 *
 * @author guinetik
 * @date 2026-04-07
 * @spec docs/superpowers/specs/2026-04-07-objective-waypoints-design.md
 */
import * as THREE from 'three'

/** Default marker color — cyan energy (matches shuttle mission UI). */
export const WAYPOINT_MARKER_DEFAULT_COLOR = 0x66ffee

/** Authoring dimensions for one marker variant. */
interface WaypointMarkerLayout {
  /** Vertical beam length (world units). */
  beamHeight: number
  beamCoreRadius: number
  beamGlowRadius: number
  ringRadius: number
  ringTube: number
  diamondSize: number
  /** World units above beam top for the octahedron. */
  diamondTipOffset: number
  /** Vertical bob amplitude for diamond (world units). */
  diamondBobAmp: number
  /** When true, fade marker when the player is nearby (level EVA). */
  useProximityFade: boolean
  fadeStartDistance: number
  fadeEndDistance: number
}

/** Full-size markers on asteroid terrain / lander approach. */
export const WAYPOINT_SURFACE_BEAM_HEIGHT = 900

/** Full-size marker diamond height offset above the beam top. */
export const WAYPOINT_SURFACE_DIAMOND_TIP_OFFSET = 40

const SURFACE_LAYOUT: WaypointMarkerLayout = {
  beamHeight: WAYPOINT_SURFACE_BEAM_HEIGHT,
  beamCoreRadius: 1.5,
  beamGlowRadius: 4,
  ringRadius: 12,
  ringTube: 0.6,
  diamondSize: 3,
  diamondTipOffset: WAYPOINT_SURFACE_DIAMOND_TIP_OFFSET,
  diamondBobAmp: 2,
  useProximityFade: true,
  fadeStartDistance: 300,
  fadeEndDistance: 80,
}

/** Compact marker for {@link MapViewController} orbit map (shorter beam, no proximity fade). */
const ORBIT_MAP_LAYOUT: WaypointMarkerLayout = {
  beamHeight: 620,
  beamCoreRadius: 1.25,
  beamGlowRadius: 3.2,
  ringRadius: 12,
  ringTube: 0.55,
  diamondSize: 1.35,
  diamondTipOffset: 14,
  diamondBobAmp: 0.5,
  useProximityFade: false,
  fadeStartDistance: 300,
  fadeEndDistance: 80,
}

/**
 * Nominal vertical extent for scaling the orbit-map marker to a stable screen size
 * (beam + tip offset + diamond).
 */
export const ORBIT_MAP_WAYPOINT_SCALE_REFERENCE =
  ORBIT_MAP_LAYOUT.beamHeight + ORBIT_MAP_LAYOUT.diamondTipOffset + ORBIT_MAP_LAYOUT.diamondSize * 2

/** Preset id for {@link createWaypointMarkerGroup}. */
export type WaypointMarkerPreset = 'surface' | 'orbitMap'

/** Animation state stored on `group.userData.waypointMarkerAnim`. */
interface WaypointMarkerAnimUserData {
  diamondRestY: number
  diamondBobAmp: number
  useProximityFade: boolean
  fadeStartDistance: number
  fadeEndDistance: number
}

/** Tracked marker entry. */
interface WaypointMarker {
  /** Unique objective id. */
  id: string
  /** Three.js group containing all marker meshes. */
  group: THREE.Group
}

/** Module-level marker registry. */
const markers: WaypointMarker[] = []

/**
 * Build a translucent additive beam material.
 *
 * @param color - Hex color.
 * @param opacity - Base opacity (0-1).
 * @returns MeshBasicMaterial configured for additive blending.
 */
function createBeamMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
}

/** Assembles beam + cap geometry for one waypoint color/layout preset. */
function buildMarkerGroupFromLayout(color: number, layout: WaypointMarkerLayout): THREE.Group {
  const group = new THREE.Group()
  const H = layout.beamHeight

  const beamCoreGeo = new THREE.CylinderGeometry(
    layout.beamCoreRadius * 0.7,
    layout.beamCoreRadius,
    H,
    10,
    1,
    true,
  )
  const beamCore = new THREE.Mesh(beamCoreGeo, createBeamMaterial(color, 0.72))
  beamCore.name = 'beamCore'
  beamCore.position.y = H / 2
  group.add(beamCore)

  const beamGlowGeo = new THREE.CylinderGeometry(
    layout.beamGlowRadius * 0.45,
    layout.beamGlowRadius,
    H * 1.08,
    12,
    1,
    true,
  )
  const beamGlow = new THREE.Mesh(beamGlowGeo, createBeamMaterial(color, 0.22))
  beamGlow.name = 'beamGlow'
  beamGlow.position.y = (H * 1.08) / 2
  group.add(beamGlow)

  const ringGeo = new THREE.TorusGeometry(layout.ringRadius, layout.ringTube, 8, 32)
  const ringMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.7,
  })
  const ring = new THREE.Mesh(ringGeo, ringMat)
  ring.name = 'ring'
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.1
  group.add(ring)

  const diamondGeo = new THREE.OctahedronGeometry(layout.diamondSize, 0)
  const diamondMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.9,
  })
  const diamond = new THREE.Mesh(diamondGeo, diamondMat)
  diamond.name = 'diamond'
  const diamondRestY = H + layout.diamondTipOffset
  diamond.position.y = diamondRestY
  group.add(diamond)

  const anim: WaypointMarkerAnimUserData = {
    diamondRestY,
    diamondBobAmp: layout.diamondBobAmp,
    useProximityFade: layout.useProximityFade,
    fadeStartDistance: layout.fadeStartDistance,
    fadeEndDistance: layout.fadeEndDistance,
  }
  group.userData.waypointMarkerAnim = anim

  return group
}

/**
 * Create a waypoint marker group (beam + ring + diamond).
 *
 * @param color - Hex emissive color.
 * @param preset - `surface` for levels; `orbitMap` for solar map mission waypoint.
 */
export function createWaypointMarkerGroup(
  color: number = WAYPOINT_MARKER_DEFAULT_COLOR,
  preset: WaypointMarkerPreset = 'surface',
): THREE.Group {
  const layout = preset === 'orbitMap' ? ORBIT_MAP_LAYOUT : SURFACE_LAYOUT
  return buildMarkerGroupFromLayout(color, layout)
}

/**
 * Pulse / rotate / fade one marker group. Safe for orbit-map markers (no proximity fade).
 *
 * @param group - Group from {@link createWaypointMarkerGroup}.
 * @param elapsed - Scene time (s).
 * @param playerX - Optional player X for proximity fade.
 * @param playerZ - Optional player Z for proximity fade.
 */
export function tickWaypointMarkerGroup(
  group: THREE.Group,
  elapsed: number,
  playerX?: number,
  playerZ?: number,
): void {
  const anim = group.userData.waypointMarkerAnim as WaypointMarkerAnimUserData | undefined
  if (!anim) return

  const pulse = 0.5 + 0.5 * Math.sin(elapsed * 3)

  let proximity = 1
  if (anim.useProximityFade && playerX !== undefined && playerZ !== undefined) {
    const dx = group.position.x - playerX
    const dz = group.position.z - playerZ
    const dist = Math.sqrt(dx * dx + dz * dz)
    if (dist < anim.fadeStartDistance) {
      proximity = Math.max(
        0,
        (dist - anim.fadeEndDistance) / (anim.fadeStartDistance - anim.fadeEndDistance),
      )
    }
  }

  const ring = group.getObjectByName('ring') as THREE.Mesh | undefined
  if (ring) {
    ring.scale.setScalar(0.9 + pulse * 0.2)
    ;(ring.material as THREE.MeshBasicMaterial).opacity = (0.4 + pulse * 0.4) * proximity
  }

  const beamCore = group.getObjectByName('beamCore') as THREE.Mesh | undefined
  if (beamCore) {
    ;(beamCore.material as THREE.MeshBasicMaterial).opacity = (0.55 + pulse * 0.22) * proximity
  }

  const beamGlow = group.getObjectByName('beamGlow') as THREE.Mesh | undefined
  if (beamGlow) {
    beamGlow.scale.setScalar(0.95 + pulse * 0.1)
    ;(beamGlow.material as THREE.MeshBasicMaterial).opacity = (0.16 + pulse * 0.12) * proximity
  }

  const diamond = group.getObjectByName('diamond') as THREE.Mesh | undefined
  if (diamond) {
    diamond.rotation.y = elapsed * 2
    diamond.position.y = anim.diamondRestY + Math.sin(elapsed * 2) * anim.diamondBobAmp
    ;(diamond.material as THREE.MeshBasicMaterial).opacity = 0.9 * proximity
  }
}

/**
 * Dispose all geometries and materials under a marker group, then remove from parent.
 *
 * @param group - Marker group to destroy.
 */
export function disposeWaypointMarkerGroup(group: THREE.Group): void {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
      if (child.material instanceof THREE.Material) child.material.dispose()
    }
  })
  group.removeFromParent()
}

/**
 * Add a waypoint marker to the scene at the given world position.
 *
 * @param id - Unique marker id.
 * @param x - World X position.
 * @param z - World Z position.
 * @param groundY - Terrain height at (x, z).
 * @param scene - Three.js scene to add marker to.
 * @param color - Optional hex color; defaults to {@link WAYPOINT_MARKER_DEFAULT_COLOR}.
 */
export function addWaypointMarker(
  id: string,
  x: number,
  z: number,
  groundY: number,
  scene: THREE.Scene,
  color: number = WAYPOINT_MARKER_DEFAULT_COLOR,
): void {
  if (markers.find((m) => m.id === id)) return
  const group = createWaypointMarkerGroup(color, 'surface')
  group.position.set(x, groundY, z)
  scene.add(group)
  markers.push({ id, group })
}

/**
 * Remove a specific waypoint marker by id.
 *
 * @param id - Marker id to remove.
 * @param scene - Three.js scene to remove from.
 */
export function removeWaypointMarker(id: string, _scene: THREE.Scene): void {
  const idx = markers.findIndex((m) => m.id === id)
  if (idx === -1) return
  const marker = markers[idx]!
  disposeWaypointMarkerGroup(marker.group)
  markers.splice(idx, 1)
}

/**
 * Remove all waypoint markers from the scene.
 *
 * @param scene - Three.js scene to clear.
 */
export function clearWaypointMarkers(_scene: THREE.Scene): void {
  for (const marker of markers) {
    disposeWaypointMarkerGroup(marker.group)
  }
  markers.length = 0
}

/**
 * Toggle visibility of all live waypoint marker groups. Used by the level
 * view to hide objective beams while the player is inside the bunker
 * interior (the asteroid surface scene is hidden, but the markers were
 * added directly to the THREE scene so they need their own toggle).
 *
 * @param visible - True to show all markers, false to hide them.
 */
export function setWaypointMarkersVisible(visible: boolean): void {
  for (const marker of markers) {
    marker.group.visible = visible
  }
}

/**
 * Animate all markers. Call each frame with elapsed scene time.
 * Pulses the ring, modulates beam opacity, rotates the diamond,
 * and fades markers when the player is nearby.
 *
 * @param elapsed - Total elapsed time in seconds.
 * @param playerX - Player world X position (for proximity fade).
 * @param playerZ - Player world Z position (for proximity fade).
 */
export function updateWaypointMarkers(elapsed: number, playerX?: number, playerZ?: number): void {
  for (const marker of markers) {
    tickWaypointMarkerGroup(marker.group, elapsed, playerX, playerZ)
  }
}
