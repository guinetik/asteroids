/**
 * Debug wireframe renderer for EVA colliders.
 *
 * Visualizes every {@link EvaCollider} shape as a bright line wireframe so the
 * player can see exactly what is — or is not — blocking their EVA path. AABB
 * and Sphere colliders are snapshot in world space and parented to the scene
 * root; OBB and Cylinder colliders reference an object, so their wireframes
 * are parented to that object and inherit its rotation/scale each frame.
 *
 * @author guinetik
 * @date 2026-04-23
 * @spec docs/superpowers/specs/2026-04-18-visit-relay-mission-design.md
 */
import * as THREE from 'three'
import type { EvaCollider } from '@/lib/physics/evaCollisionResolver'

/** Wireframe color for axis-aligned bounding-box colliders (magenta). */
const WIRE_COLOR_AABB = 0xff00ff

/** Wireframe color for sphere colliders (cyan). */
const WIRE_COLOR_SPHERE = 0x00ffff

/** Wireframe color for oriented bounding-box colliders (yellow). */
const WIRE_COLOR_OBB = 0xffff00

/** Wireframe color for cylinder colliders (green). */
const WIRE_COLOR_CYLINDER = 0x00ff00

/** Horizontal ring divisions on the sphere wireframe. */
const SPHERE_WIRE_WIDTH_SEGMENTS = 16

/** Vertical ring divisions on the sphere wireframe. */
const SPHERE_WIRE_HEIGHT_SEGMENTS = 12

/** Radial segment count for the cylinder wireframe. */
const CYLINDER_WIRE_RADIAL_SEGMENTS = 24

/** Height segment count for the cylinder wireframe. */
const CYLINDER_WIRE_HEIGHT_SEGMENTS = 1

/** Render order used by all debug wires to draw last and stay visible through geometry. */
const DEBUG_RENDER_ORDER = 999

/** Opacity applied to the wireframe materials. */
const WIRE_OPACITY = 0.9

/**
 * Lifecycle handle returned by {@link buildEvaColliderWireframes}. Keep the
 * reference until the caller is ready to tear down EVA; then add the
 * {@link sceneRoot} to the scene once and call {@link dispose} once.
 */
export interface EvaColliderDebugHandle {
  /**
   * Group containing all world-space wireframes (AABB, Sphere). Add this to
   * the active Three.js scene once; OBB/Cylinder wires are parented to their
   * referenced objects directly and travel with them.
   */
  readonly sceneRoot: THREE.Group
  /**
   * Toggle visibility of every wire — including the ones parented to referenced
   * objects, which don't sit under {@link sceneRoot}. Use to hide the debug
   * overlay by default and show it on demand from a DevConsole command.
   */
  setVisible(visible: boolean): void
  /** Detach all wires (including object-parented ones) and free GPU buffers. */
  dispose(): void
}

/**
 * Build wireframes for every registered EVA collider. Safe to call with an
 * empty array — returns a handle whose `sceneRoot` is an empty group, and
 * whose `dispose` is a no-op. Useful for debugging "colliding with nothing"
 * reports: if no wires appear in the scene after EVA begin, the host view
 * isn't providing any `getColliders` to the session.
 */
export function buildEvaColliderWireframes(
  colliders: readonly EvaCollider[],
): EvaColliderDebugHandle {
  const sceneRoot = new THREE.Group()
  sceneRoot.name = 'EvaColliderDebugGroup'
  const detachables: THREE.LineSegments[] = []
  const disposables: (THREE.BufferGeometry | THREE.Material)[] = []

  for (const c of colliders) {
    if (c.kind === 'aabb') {
      const size = new THREE.Vector3().subVectors(c.max, c.min)
      const center = new THREE.Vector3().addVectors(c.min, c.max).multiplyScalar(0.5)
      const box = new THREE.BoxGeometry(size.x, size.y, size.z)
      const edges = new THREE.EdgesGeometry(box)
      box.dispose()
      const mat = new THREE.LineBasicMaterial({
        color: WIRE_COLOR_AABB,
        depthTest: false,
        transparent: true,
        opacity: WIRE_OPACITY,
      })
      const lines = new THREE.LineSegments(edges, mat)
      lines.position.copy(center)
      lines.renderOrder = DEBUG_RENDER_ORDER
      sceneRoot.add(lines)
      detachables.push(lines)
      disposables.push(edges, mat)
      continue
    }
    if (c.kind === 'sphere') {
      const sphere = new THREE.SphereGeometry(
        c.radius,
        SPHERE_WIRE_WIDTH_SEGMENTS,
        SPHERE_WIRE_HEIGHT_SEGMENTS,
      )
      const edges = new THREE.EdgesGeometry(sphere)
      sphere.dispose()
      const mat = new THREE.LineBasicMaterial({
        color: WIRE_COLOR_SPHERE,
        depthTest: false,
        transparent: true,
        opacity: WIRE_OPACITY,
      })
      const lines = new THREE.LineSegments(edges, mat)
      lines.position.copy(c.center)
      lines.renderOrder = DEBUG_RENDER_ORDER
      sceneRoot.add(lines)
      detachables.push(lines)
      disposables.push(edges, mat)
      continue
    }
    if (c.kind === 'obb') {
      const size = new THREE.Vector3().subVectors(c.max, c.min)
      const center = new THREE.Vector3().addVectors(c.min, c.max).multiplyScalar(0.5)
      const box = new THREE.BoxGeometry(size.x, size.y, size.z)
      const edges = new THREE.EdgesGeometry(box)
      box.dispose()
      const mat = new THREE.LineBasicMaterial({
        color: WIRE_COLOR_OBB,
        depthTest: false,
        transparent: true,
        opacity: WIRE_OPACITY,
      })
      const lines = new THREE.LineSegments(edges, mat)
      lines.position.copy(center)
      lines.renderOrder = DEBUG_RENDER_ORDER
      c.object.add(lines)
      detachables.push(lines)
      disposables.push(edges, mat)
      continue
    }
    // kind === 'cylinder'
    const cylinder = new THREE.CylinderGeometry(
      c.radius,
      c.radius,
      c.halfLength * 2,
      CYLINDER_WIRE_RADIAL_SEGMENTS,
      CYLINDER_WIRE_HEIGHT_SEGMENTS,
      true,
    )
    const edges = new THREE.EdgesGeometry(cylinder)
    cylinder.dispose()
    const mat = new THREE.LineBasicMaterial({
      color: WIRE_COLOR_CYLINDER,
      depthTest: false,
      transparent: true,
      opacity: WIRE_OPACITY,
    })
    const lines = new THREE.LineSegments(edges, mat)
    lines.position.copy(c.localCenter)
    // CylinderGeometry is built along +Y; rotate so +Y aligns to the collider's local axis.
    const up = new THREE.Vector3(0, 1, 0)
    const axis = c.localAxis.clone().normalize()
    lines.quaternion.setFromUnitVectors(up, axis)
    lines.renderOrder = DEBUG_RENDER_ORDER
    c.object.add(lines)
    detachables.push(lines)
    disposables.push(edges, mat)
  }

  return {
    sceneRoot,
    setVisible: (visible: boolean) => {
      sceneRoot.visible = visible
      for (const lines of detachables) lines.visible = visible
    },
    dispose: () => {
      for (const lines of detachables) lines.removeFromParent()
      for (const d of disposables) d.dispose()
      sceneRoot.removeFromParent()
    },
  }
}
