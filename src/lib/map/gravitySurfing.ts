/**
 * Space Fabric rail snapping, headings, and planar velocity helpers for the solar map.
 *
 * @author guinetik
 * @date 2026-04-19
 * @spec docs/asteroid-lander-gdd.md
 */
import * as THREE from 'three'

/** Which world axis the player is riding on the fabric grid. */
export type GravitySurfRailAxis = 'x' | 'z'

/** Nearest rail segment and snapped shuttle position after a snap query. */
export interface GravitySurfRailTarget {
  axis: GravitySurfRailAxis
  lineCoord: number
  alongCoord: number
  snappedX: number
  snappedZ: number
  distance: number
}

/** Inputs for {@link findNearestGravitySurfRail}. */
export interface FindGravitySurfRailParams {
  x: number
  z: number
  gridSize: number
  gridResolution: number
  maxSnapDistanceCells: number
}

/**
 * World-space spacing between neighboring map Space Fabric rails.
 */
export function computeGravitySurfGridStep(gridSize: number, gridResolution: number): number {
  if (gridResolution <= 0) return 0
  return gridSize / gridResolution
}

/** Snaps a world coordinate to the nearest grid line along one axis. */
function nearestGridLineCoord(value: number, halfSize: number, step: number): number {
  if (step <= 0) return value
  const index = Math.round((value + halfSize) / step)
  return -halfSize + index * step
}

/**
 * Finds the nearest horizontal/vertical fabric rail within snap range.
 */
export function findNearestGravitySurfRail(
  params: FindGravitySurfRailParams,
): GravitySurfRailTarget | null {
  const step = computeGravitySurfGridStep(params.gridSize, params.gridResolution)
  if (step <= 0) return null

  const halfSize = params.gridSize / 2
  const maxSnapDistance = Math.max(0, params.maxSnapDistanceCells) * step

  const nearestZ = nearestGridLineCoord(params.z, halfSize, step)
  const zDistance = Math.abs(params.z - nearestZ)

  const nearestX = nearestGridLineCoord(params.x, halfSize, step)
  const xDistance = Math.abs(params.x - nearestX)

  const closestDistance = Math.min(zDistance, xDistance)
  if (closestDistance > maxSnapDistance) {
    return null
  }

  if (zDistance <= xDistance) {
    return {
      axis: 'x',
      lineCoord: nearestZ,
      alongCoord: params.x,
      snappedX: params.x,
      snappedZ: nearestZ,
      distance: zDistance,
    }
  }

  return {
    axis: 'z',
    lineCoord: nearestX,
    alongCoord: params.z,
    snappedX: nearestX,
    snappedZ: params.z,
    distance: xDistance,
  }
}

/**
 * Heading to face while traveling along a rail with a signed direction.
 */
export function gravitySurfRailHeading(axis: GravitySurfRailAxis, directionSign: number): number {
  if (axis === 'x') {
    return directionSign >= 0 ? 0 : Math.PI
  }
  return directionSign >= 0 ? -Math.PI / 2 : Math.PI / 2
}

/**
 * Preferred direction sign on a rail given the current shuttle yaw.
 */
export function gravitySurfDirectionFromHeading(
  axis: GravitySurfRailAxis,
  heading: number,
): number {
  const forward = new THREE.Vector3(1, 0, 0)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), heading)
  const component = axis === 'x' ? forward.x : forward.z
  return component >= 0 ? 1 : -1
}

/**
 * Converts signed rail speed into a planar velocity vector.
 */
export function gravitySurfVelocityVector(
  axis: GravitySurfRailAxis,
  signedSpeed: number,
): THREE.Vector3 {
  return axis === 'x'
    ? new THREE.Vector3(signedSpeed, 0, 0)
    : new THREE.Vector3(0, 0, signedSpeed)
}
