/**
 * Deterministic geometry helpers for the photometry probe standoff.
 *
 * @author guinetik
 * @date 2026-04-26
 * @spec docs/superpowers/specs/2026-04-26-photometry-minigame-design.md
 */

/** Full circle in radians. */
const TAU = Math.PI * 2

/** Minimum climb above the terminal before the probe leaves the launch site. */
const MIN_LAUNCH_APEX_CLEARANCE = 260

/** Extra apex height relative to the final standoff point. */
const STANDOFF_TO_APEX_CLEARANCE = 180

/** Photometry standoff as a multiplier of the asteroid's valid X/Z footprint radius. */
const STANDOFF_FOOTPRINT_RADIUS_MULTIPLIER = 1.45

/** Extra X/Z clearance beyond the scaled asteroid footprint. */
const STANDOFF_FOOTPRINT_CLEARANCE = 250

/**
 * Allowed horizontal reach beyond the mission photometry standoff D before drifting
 * when terrain support reads as ∞ (void / off-body). Matches D + D/2 = 1.5D outer bound.
 *
 * Example: photometry authored at {@link computePhotometryStandoffDistance} = 20u → playable
 * envelope radius ≈ 30u before adrift fails the run for non-finite ALT.
 *
 * @author guinetik
 * @date 2026-04-29
 * @spec docs/superpowers/specs/2026-04-26-photometry-minigame-design.md
 */
export const PHOTOMETRY_ADRIFT_EXTRA_STANDOFF_FRAC = 0.5

/** Golden-ratio-derived bit mixer seed. */
const HASH_MIX_A = 0x9e3779b9

/** Mulberry-style bit mixer increment. */
const HASH_MIX_B = 0x85ebca6b

/**
 * Inputs used to place the photometry probe in a side standoff position.
 *
 * @author guinetik
 * @date 2026-04-26
 * @spec docs/superpowers/specs/2026-04-26-photometry-minigame-design.md
 */
export interface PhotometryProbeTargetInput {
  /** Objective X coordinate at the terminal/mission site, for example `120`. */
  objectiveX: number
  /** Objective Z coordinate at the terminal/mission site, for example `-80`. */
  objectiveZ: number
  /** Terminal launch height, for example `12`. */
  terminalY: number
  /** Desired asteroid mid-height for compatibility; photometry standoff uses the equator plane. */
  asteroidMidY: number
  /** Horizontal standoff distance from the objective site, for example `1000`. */
  probeDistance: number
  /** Deterministic seed used to pick the asteroid side. */
  seed: number
}

/**
 * World-space target and launch apex for a photometry probe.
 *
 * @author guinetik
 * @date 2026-04-26
 * @spec docs/superpowers/specs/2026-04-26-photometry-minigame-design.md
 */
export interface PhotometryProbeTarget {
  /** Final probe X coordinate. */
  x: number
  /** Final probe Y coordinate on the equator plane. */
  y: number
  /** Final probe Z coordinate. */
  z: number
  /** Apex Y coordinate used while the probe climbs before arcing sideways. */
  launchApexY: number
}

/**
 * Minimal heightmap shape needed to pick a photometry surface target.
 *
 * @author guinetik
 * @date 2026-04-26
 * @spec docs/superpowers/specs/2026-04-26-photometry-minigame-design.md
 */
export interface PhotometrySurfaceHeightmap {
  /** Raw height samples, row-major by Z then X. */
  readonly grid: Float32Array
  /** Per-axis sample count. */
  readonly resolution: number
  /** World-space width/depth covered by the heightmap. */
  readonly worldSize: number
  /** Optional validity mask where `1` means surface and `0` means void. */
  readonly validity?: Uint8Array
}

/**
 * Plain world-space point used by photometry geometry helpers.
 *
 * @author guinetik
 * @date 2026-04-26
 * @spec docs/superpowers/specs/2026-04-26-photometry-minigame-design.md
 */
export interface PhotometryWorldPoint {
  /** World X coordinate. */
  x: number
  /** World Y coordinate. */
  y: number
  /** World Z coordinate. */
  z: number
}

/**
 * Compute the final side standoff target for a photometry probe.
 *
 * The probe launches upward first, travels sideways to a clear side of the asteroid,
 * then descends to this mid-height standoff where the waypoint marker appears.
 *
 * @param input - Objective site, altitude, standoff distance, and deterministic seed.
 * @returns Final probe target and launch apex.
 */
export function computePhotometryProbeTarget(
  input: PhotometryProbeTargetInput,
): PhotometryProbeTarget {
  const mixed = (input.seed ^ HASH_MIX_A) >>> 0
  const scrambled = Math.imul(mixed ^ (mixed >>> 16), HASH_MIX_B) >>> 0
  const angle = (scrambled / 0xffffffff) * TAU
  const x = input.objectiveX + Math.cos(angle) * input.probeDistance
  const z = input.objectiveZ + Math.sin(angle) * input.probeDistance
  const y = 0
  const launchApexY = Math.max(
    input.terminalY + MIN_LAUNCH_APEX_CLEARANCE,
    y + STANDOFF_TO_APEX_CLEARANCE,
  )

  return { x, y, z, launchApexY }
}

/**
 * Estimate a photometry standoff distance from the asteroid's valid X/Z footprint.
 *
 * The heightmap's validity mask describes where the asteroid actually exists in
 * projected world space. Using the farthest valid sample keeps the probe clear
 * of small and large asteroid meshes without hand-tuning a mission distance per body.
 *
 * @param heightmap - Heightmap containing asteroid surface samples and validity.
 * @returns Horizontal standoff distance from the asteroid center.
 */
export function computePhotometryStandoffDistance(heightmap: PhotometrySurfaceHeightmap): number {
  const resolution = heightmap.resolution
  if (resolution <= 1 || heightmap.grid.length === 0) return STANDOFF_FOOTPRINT_CLEARANCE

  const halfSize = heightmap.worldSize / 2
  let maxRadius = 0
  for (let gz = 0; gz < resolution; gz++) {
    for (let gx = 0; gx < resolution; gx++) {
      const index = gz * resolution + gx
      if (heightmap.validity && heightmap.validity[index] !== 1) continue
      const x = (gx / (resolution - 1)) * heightmap.worldSize - halfSize
      const z = (gz / (resolution - 1)) * heightmap.worldSize - halfSize
      maxRadius = Math.max(maxRadius, Math.hypot(x, z))
    }
  }

  return maxRadius * STANDOFF_FOOTPRINT_RADIUS_MULTIPLIER + STANDOFF_FOOTPRINT_CLEARANCE
}

/**
 * Maximum horizontal radial distance from asteroid center (xz origin) playable while ALT is
 * non-finite. Uses authored photometry standoff D × (1 + {@link PHOTOMETRY_ADRIFT_EXTRA_STANDOFF_FRAC}),
 * aligning off-body photometry probes with drift failure thresholds.
 *
 * @author guinetik
 * @date 2026-04-29
 * @spec docs/superpowers/specs/2026-04-26-photometry-minigame-design.md
 *
 * @param heightmap - Same surface descriptor used by {@link computePhotometryStandoffDistance}.
 * @returns Radius in world units from (0,y,0): beyond this reads as adrift alongside ∞ ALT.
 */
export function computePhotometryAdriftRadialLimit(heightmap: PhotometrySurfaceHeightmap): number {
  const standoffDistance = computePhotometryStandoffDistance(heightmap)
  return standoffDistance * (1 + PHOTOMETRY_ADRIFT_EXTRA_STANDOFF_FRAC)
}

/**
 * Find the nearest valid asteroid surface sample from the probe viewpoint.
 *
 * This makes the scan focus point land on the visible side closest to the probe
 * instead of using the original objective marker on an arbitrary asteroid face.
 *
 * @param heightmap - Heightmap containing asteroid surface samples.
 * @param probePosition - Final probe standoff position.
 * @param markerHeight - Visual offset above the surface for the focus marker.
 * @returns Closest valid surface point, raised by `markerHeight`, or `null` when none exists.
 */
export function findClosestPhotometrySurfacePoint(
  heightmap: PhotometrySurfaceHeightmap,
  probePosition: PhotometryWorldPoint,
  markerHeight: number,
): PhotometryWorldPoint | null {
  const resolution = heightmap.resolution
  if (resolution <= 1 || heightmap.grid.length === 0) return null

  const halfSize = heightmap.worldSize / 2
  let closest: PhotometryWorldPoint | null = null
  let closestDistanceSq = Number.POSITIVE_INFINITY
  for (let gz = 0; gz < resolution; gz++) {
    for (let gx = 0; gx < resolution; gx++) {
      const index = gz * resolution + gx
      if (heightmap.validity && heightmap.validity[index] !== 1) continue
      const surfaceY = heightmap.grid[index]
      if (surfaceY === undefined) continue
      const x = (gx / (resolution - 1)) * heightmap.worldSize - halfSize
      const z = (gz / (resolution - 1)) * heightmap.worldSize - halfSize
      const dx = probePosition.x - x
      const dy = probePosition.y - surfaceY
      const dz = probePosition.z - z
      const distanceSq = dx * dx + dy * dy + dz * dz
      if (distanceSq < closestDistanceSq) {
        closestDistanceSq = distanceSq
        closest = { x, y: surfaceY + markerHeight, z }
      }
    }
  }

  return closest
}
