/**
 * 3D waypoint markers for mission objectives.
 *
 * Each marker is a glowing vertical beam with a pulsing base ring
 * and rotating diamond tip. Placed at flat zone centers on the
 * terrain surface, visible from orbit during lander descent.
 *
 * @author guinetik
 * @date 2026-04-07
 * @spec docs/superpowers/specs/2026-04-07-objective-waypoints-design.md
 */
import * as THREE from 'three'

/** Beam height in world units — tall enough to see from lander altitude. */
const BEAM_HEIGHT = 900

/** Beam core cylinder radius. */
const BEAM_CORE_RADIUS = 1.5

/** Beam glow cylinder radius. */
const BEAM_GLOW_RADIUS = 4

/** Base ring torus major radius. */
const RING_RADIUS = 12

/** Base ring torus tube radius. */
const RING_TUBE = 0.6

/** Default marker color — cyan energy. */
const MARKER_COLOR = 0x66ffee

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

/**
 * Create the mesh group for a single waypoint marker.
 *
 * @param color - Marker color (default cyan).
 * @returns Group containing beam core, glow, ring, and diamond meshes.
 */
function createMarkerMesh(color: number = MARKER_COLOR): THREE.Group {
  const group = new THREE.Group()

  // Beam core — bright inner cylinder
  const beamCoreGeo = new THREE.CylinderGeometry(
    BEAM_CORE_RADIUS * 0.7,
    BEAM_CORE_RADIUS,
    BEAM_HEIGHT,
    10,
    1,
    true,
  )
  const beamCore = new THREE.Mesh(beamCoreGeo, createBeamMaterial(color, 0.72))
  beamCore.name = 'beamCore'
  beamCore.position.y = BEAM_HEIGHT / 2
  group.add(beamCore)

  // Beam glow — softer outer cylinder
  const beamGlowGeo = new THREE.CylinderGeometry(
    BEAM_GLOW_RADIUS * 0.45,
    BEAM_GLOW_RADIUS,
    BEAM_HEIGHT * 1.08,
    12,
    1,
    true,
  )
  const beamGlow = new THREE.Mesh(beamGlowGeo, createBeamMaterial(color, 0.22))
  beamGlow.name = 'beamGlow'
  beamGlow.position.y = (BEAM_HEIGHT * 1.08) / 2
  group.add(beamGlow)

  // Base ring — torus at ground level
  const ringGeo = new THREE.TorusGeometry(RING_RADIUS, RING_TUBE, 8, 32)
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

  // Top diamond — octahedron at beam peak
  const diamondGeo = new THREE.OctahedronGeometry(3, 0)
  const diamondMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.9,
  })
  const diamond = new THREE.Mesh(diamondGeo, diamondMat)
  diamond.name = 'diamond'
  diamond.position.y = BEAM_HEIGHT + 40
  group.add(diamond)

  return group
}

/**
 * Add a waypoint marker to the scene at the given world position.
 *
 * @param id - Unique marker id (objective id).
 * @param x - World X position.
 * @param z - World Z position.
 * @param groundY - Terrain height at (x, z).
 * @param scene - Three.js scene to add marker to.
 */
export function addWaypointMarker(
  id: string,
  x: number,
  z: number,
  groundY: number,
  scene: THREE.Scene,
): void {
  if (markers.find((m) => m.id === id)) return
  const group = createMarkerMesh()
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
export function removeWaypointMarker(id: string, scene: THREE.Scene): void {
  const idx = markers.findIndex((m) => m.id === id)
  if (idx === -1) return
  const marker = markers[idx]!
  scene.remove(marker.group)
  marker.group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
      if (child.material instanceof THREE.Material) child.material.dispose()
    }
  })
  markers.splice(idx, 1)
}

/**
 * Remove all waypoint markers from the scene.
 *
 * @param scene - Three.js scene to clear.
 */
export function clearWaypointMarkers(scene: THREE.Scene): void {
  for (const marker of markers) {
    scene.remove(marker.group)
    marker.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (child.material instanceof THREE.Material) child.material.dispose()
      }
    })
  }
  markers.length = 0
}

/**
 * Animate all markers. Call each frame with elapsed scene time.
 * Pulses the ring, modulates beam opacity, and rotates the diamond.
 *
 * @param elapsed - Total elapsed time in seconds.
 */
export function updateWaypointMarkers(elapsed: number): void {
  const pulse = 0.5 + 0.5 * Math.sin(elapsed * 3)
  for (const marker of markers) {
    const ring = marker.group.getObjectByName('ring') as THREE.Mesh | undefined
    if (ring) {
      ring.scale.setScalar(0.9 + pulse * 0.2)
      ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.4 + pulse * 0.4
    }

    const beamCore = marker.group.getObjectByName('beamCore') as THREE.Mesh | undefined
    if (beamCore) {
      ;(beamCore.material as THREE.MeshBasicMaterial).opacity = 0.55 + pulse * 0.22
    }

    const beamGlow = marker.group.getObjectByName('beamGlow') as THREE.Mesh | undefined
    if (beamGlow) {
      beamGlow.scale.setScalar(0.95 + pulse * 0.1)
      ;(beamGlow.material as THREE.MeshBasicMaterial).opacity = 0.16 + pulse * 0.12
    }

    const diamond = marker.group.getObjectByName('diamond') as THREE.Mesh | undefined
    if (diamond) {
      diamond.rotation.y = elapsed * 2
      diamond.position.y = BEAM_HEIGHT + 40 + Math.sin(elapsed * 2) * 2
    }
  }
}
