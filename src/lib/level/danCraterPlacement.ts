/**
 * DAN crater placement search over seeded asteroid GLB rotations.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-dan-mission-design.md
 */

import type * as THREE from 'three'
import type { AsteroidDefinition, RotationLottery } from '@/lib/asteroids/types'
import { rotationFromSeed } from '@/lib/level/levelContext'
import {
  bakeHeightmapFromMesh,
  type BakeHeightmapFromMeshOptions,
} from '@/lib/terrain/meshHeightmap'
import { findCratersInHeightmap, type Crater } from '@/lib/terrain/craterDetection'
import { DEFAULT_CRATER_DEPTH_RATIO } from '@/lib/terrain/craterSynthesis'
import { DEFAULT_ASTEROID_MODEL_PATH } from '@/three/AsteroidSurfaceController'
import { loadGLB } from '@/three/loadGLB'

/** Default DAN crater target radius in world units. Sized for the lander + EVA combat space. */
export const DEFAULT_DAN_CRATER_RADIUS = 60

/** Default minimum depth for a natural crater to qualify (world units). */
export const DEFAULT_DAN_CRATER_MIN_DEPTH = 8

/** Default quality threshold: natural craters below this score lose to synthesis fallback. */
export const DEFAULT_DAN_CRATER_MIN_QUALITY_SCORE = 600

/** Default number of rotation candidates to try. */
export const DEFAULT_DAN_CRATER_ROTATION_CANDIDATES = 8

/** Tuning knobs for the DAN crater chooser. */
export interface DanCraterSpec {
  /** Target bowl radius in world units. Natural craters within +/-50% pass the size match. */
  targetRadius: number
  /** Minimum acceptable bowl depth for natural craters. Below this, prefer synthesis. */
  minDepth: number
  /** Quality threshold a natural crater must clear before being chosen over synthesis. */
  minQualityScore: number
  /** Number of rotation candidates to bake and scan. Defaults to 8. */
  candidateRotationCount?: number
}

/** Where the chosen DAN crater came from. */
export type DanCraterSource = 'natural' | 'synthesized'

/** Result of the DAN crater placement orchestrator. */
export interface DanCraterPlacement {
  /** Euler rotation to apply when calling `createAsteroidSurface`. */
  rotation: { x: number; y: number; z: number }
  /** World-space crater the DAN encounter should center on. */
  crater: Crater
  /** Whether the crater was found in the GLB or must be synthesized post-bake. */
  source: DanCraterSource
}

/** Best natural crater candidate discovered during rotation search. */
interface CandidateResult {
  /** Rotation that exposed this crater on the sampled surface. */
  rotation: { x: number; y: number; z: number }
  /** Detected crater geometry for the DAN encounter. */
  crater: Crater
  /** Final natural-crater score after radius matching. */
  score: number
}

const TAU = Math.PI * 2
const NATURAL_MIN_RADIUS_FACTOR = 0.5
const NATURAL_SCAN_RESULTS = 4

/** Clamp a numeric value to the inclusive `[min, max]` range. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Dispose geometries and materials in a transient loaded GLB scene. */
function disposeScene(scene: THREE.Object3D): void {
  scene.traverse((child) => {
    if ('geometry' in child) {
      ;(child as THREE.Mesh).geometry?.dispose()
    }
    if ('material' in child) {
      const material = (child as THREE.Mesh).material
      if (Array.isArray(material)) {
        material.forEach((entry) => entry.dispose())
      } else {
        material?.dispose()
      }
    }
  })
}

/** Return the perturbed value unless the lottery explicitly locks that axis. */
function perturbAxis(base: number, lockedValue: number | undefined, offset: number): number {
  return lockedValue ?? (base + offset) % TAU
}

/**
 * Derive deterministic rotation candidates from a mission seed.
 *
 * Candidate zero is exactly {@link rotationFromSeed}, preserving the normal
 * non-DAN orientation for synthesized fallback. Later candidates walk around
 * the unlocked Euler axes by an even angular offset, while locked lottery axes
 * remain fixed so elongated asteroids keep their authored playable attitude.
 *
 * @param seed - Mission seed used for the default rotation.
 * @param lottery - Optional per-axis locks from asteroid shape data.
 * @param count - Number of candidates to return.
 * @returns Seeded candidate rotations in deterministic order.
 */
export function deriveCandidateRotations(
  seed: number,
  lottery: RotationLottery | undefined,
  count: number,
): Array<{ x: number; y: number; z: number }> {
  const safeCount = Math.max(1, Math.floor(count))
  const base = rotationFromSeed(seed, lottery)
  const rotations = [base]

  for (let i = 1; i < safeCount; i++) {
    const offset = (TAU * i) / safeCount
    rotations.push({
      x: perturbAxis(base.x, lottery?.x, offset),
      y: perturbAxis(base.y, lottery?.y, offset),
      z: perturbAxis(base.z, lottery?.z, offset),
    })
  }

  return rotations
}

/** Score how close a natural crater radius is to the requested target. */
function sizeMatchFactor(radius: number, targetRadius: number): number {
  if (targetRadius <= 0) return 0
  return 1 - clamp(Math.abs(radius - targetRadius) / targetRadius, 0, 1)
}

/**
 * Choose the best DAN crater placement for an asteroid and mission seed.
 *
 * @param asteroid - Asteroid definition whose GLB should be sampled.
 * @param seed - Mission seed used for deterministic rotations.
 * @param spec - DAN crater tuning values.
 * @param bakeOptions - Heightmap bake parameters used during rotation search.
 * @returns Natural crater placement when one qualifies, otherwise synthesis fallback.
 */
export async function chooseDanCraterPlacement(
  asteroid: AsteroidDefinition,
  seed: number,
  spec: DanCraterSpec,
  bakeOptions: BakeHeightmapFromMeshOptions,
): Promise<DanCraterPlacement> {
  const modelPath = asteroid.surface.modelPath ?? DEFAULT_ASTEROID_MODEL_PATH
  const scene = await loadGLB(modelPath)
  const lottery = asteroid.shape.rotationLottery
  const count = spec.candidateRotationCount ?? DEFAULT_DAN_CRATER_ROTATION_CANDIDATES
  const rotations = deriveCandidateRotations(seed, lottery, count)
  let best: CandidateResult | null = null

  try {
    if (asteroid.surface.modelScale !== undefined && asteroid.surface.modelScale !== 1) {
      scene.scale.setScalar(asteroid.surface.modelScale)
    }

    for (const rotation of rotations) {
      scene.rotation.set(rotation.x, rotation.y, rotation.z)
      scene.updateMatrixWorld(true)

      const heightmap = bakeHeightmapFromMesh(scene, bakeOptions)
      const craters = findCratersInHeightmap(heightmap, {
        minRadius: spec.targetRadius * NATURAL_MIN_RADIUS_FACTOR,
        minDepth: spec.minDepth,
        maxResults: NATURAL_SCAN_RESULTS,
      })

      for (const crater of craters) {
        const score =
          crater.depth * crater.radius * sizeMatchFactor(crater.radius, spec.targetRadius)
        if (!best || score > best.score) {
          best = { rotation, crater, score }
        }
      }
    }

    if (best && best.score >= spec.minQualityScore) {
      return { rotation: best.rotation, crater: best.crater, source: 'natural' }
    }

    return {
      rotation: rotations[0]!,
      crater: {
        x: 0,
        z: 0,
        radius: spec.targetRadius,
        depth: spec.targetRadius * DEFAULT_CRATER_DEPTH_RATIO,
      },
      source: 'synthesized',
    }
  } finally {
    disposeScene(scene)
  }
}
