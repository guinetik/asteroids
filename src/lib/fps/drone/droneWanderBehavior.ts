/**
 * Drone interior wander behavior — picks random points inside a patrol AABB
 * and steers toward them, with a sin-wave hover bob layered on top.
 *
 * Pure functions, deterministic against an injected RNG. No Three.js.
 *
 * @author guinetik
 * @date 2026-05-16
 * @spec docs/superpowers/specs/2026-05-16-station-drone-enemy-design.md
 */

import {
  DRONE_ARRIVE_RADIUS,
  DRONE_HOVER_BOB_AMPLITUDE,
  DRONE_HOVER_BOB_FREQUENCY,
  DRONE_PATROL_SPEED,
  DRONE_REROLL_SECONDS,
} from './droneConfig'

/** Two-pi constant for bob-phase wrapping. */
const TWO_PI = Math.PI * 2

/**
 * Axis-aligned floor rectangle that bounds drone patrol movement on the XZ
 * plane. The drone's vertical position is anchored to `floorY` plus its hover
 * offset — the rectangle itself is flat.
 */
export interface DronePatrolRect {
  /** Inclusive minimum world X coordinate of the patrol rectangle. */
  minX: number
  /** Inclusive maximum world X coordinate of the patrol rectangle. */
  maxX: number
  /** Inclusive minimum world Z coordinate of the patrol rectangle. */
  minZ: number
  /** Inclusive maximum world Z coordinate of the patrol rectangle. */
  maxZ: number
  /**
   * World Y coordinate used as the base of the hover bob — the drone hovers
   * around this height. Y is not bounded by the rectangle, only X and Z are.
   */
  floorY: number
}

/**
 * Persistent per-drone wander state. Mutated in place by {@link tickWander}
 * each frame; the controller stores one of these alongside its model.
 */
export interface DroneWanderState {
  /** Current target world X coordinate. Re-rolled on arrival or timeout. */
  targetX: number
  /** Current target world Z coordinate. Re-rolled on arrival or timeout. */
  targetZ: number
  /** Hover-bob phase in radians, wrapped to `[0, 2π)`. */
  bobPhase: number
  /** Seconds elapsed since the last target re-roll — forces re-roll on timeout. */
  secondsSinceReroll: number
}

/**
 * Per-tick inputs to {@link tickWander}. The controller passes the drone's
 * current world XZ position and a delta time; an RNG is included so test code
 * can drive deterministic behavior.
 */
export interface DroneWanderInput {
  /** Drone's current world X coordinate. */
  x: number
  /** Drone's current world Z coordinate. */
  z: number
  /** Delta time for this tick, in seconds. */
  dt: number
  /** Uniform `[0, 1)` random source — injected for determinism. */
  rng: () => number
}

/**
 * Per-tick movement intent produced by {@link tickWander}. The controller
 * integrates `moveX`/`moveZ` into the drone position and offsets visual Y by
 * `bobY`.
 */
export interface DroneWanderOutput {
  /** XZ velocity component along world X, in units/s. */
  moveX: number
  /** XZ velocity component along world Z, in units/s. */
  moveZ: number
  /** Vertical hover offset relative to `rect.floorY`, in units. */
  bobY: number
  /** True on the single tick where a re-roll happens (arrival or timeout). */
  reachedTarget: boolean
}

/**
 * Pick a uniform random point inside the rectangle.
 *
 * @param rect - Patrol rectangle.
 * @param rng - Uniform `[0, 1)` random source.
 * @returns A tuple of `[x, z]` inside the rectangle.
 */
function pickRandomPoint(rect: DronePatrolRect, rng: () => number): [number, number] {
  const x = rect.minX + (rect.maxX - rect.minX) * rng()
  const z = rect.minZ + (rect.maxZ - rect.minZ) * rng()
  return [x, z]
}

/**
 * Build an initial wander state for a freshly spawned drone. Picks a random
 * target inside `rect`, starts the bob phase at a random offset so multiple
 * drones don't bob in unison, and zeroes the re-roll timer.
 *
 * @param rect - Patrol rectangle that bounds future targets.
 * @param rng - Uniform `[0, 1)` random source.
 * @returns A fresh wander state owned by the caller (controller).
 */
export function makeInitialWanderState(
  rect: DronePatrolRect,
  rng: () => number,
): DroneWanderState {
  const [targetX, targetZ] = pickRandomPoint(rect, rng)
  return {
    targetX,
    targetZ,
    bobPhase: rng() * TWO_PI,
    secondsSinceReroll: 0,
  }
}

/**
 * Advance the wander state by `dt` and produce a movement intent.
 *
 * Mutates `state` in place — bob phase advances, re-roll timer accumulates,
 * and target X/Z are replaced on arrival or timeout. The controller is
 * expected to read the returned vector and integrate it into world position.
 *
 * @param state - Persistent wander state for this drone. Mutated in place.
 * @param input - Per-tick inputs (current XZ, dt, RNG).
 * @param rect - Patrol rectangle that bounds new targets.
 * @returns Movement intent for this tick.
 */
export function tickWander(
  state: DroneWanderState,
  input: DroneWanderInput,
  rect: DronePatrolRect,
): DroneWanderOutput {
  // Bob phase always advances, wrapped to [0, 2π).
  state.bobPhase = (state.bobPhase + DRONE_HOVER_BOB_FREQUENCY * input.dt) % TWO_PI
  if (state.bobPhase < 0) state.bobPhase += TWO_PI
  const bobY = DRONE_HOVER_BOB_AMPLITUDE * Math.sin(state.bobPhase)

  state.secondsSinceReroll += input.dt

  // Determine reach vs timeout.
  const dx = state.targetX - input.x
  const dz = state.targetZ - input.z
  const dist = Math.sqrt(dx * dx + dz * dz)
  const arrived = dist <= DRONE_ARRIVE_RADIUS
  const timedOut = state.secondsSinceReroll >= DRONE_REROLL_SECONDS

  if (arrived || timedOut) {
    const [nextX, nextZ] = pickRandomPoint(rect, input.rng)
    state.targetX = nextX
    state.targetZ = nextZ
    state.secondsSinceReroll = 0
    return { moveX: 0, moveZ: 0, bobY, reachedTarget: true }
  }

  // Steer toward current target at patrol speed. `arrived` above already
  // handled `dist <= DRONE_ARRIVE_RADIUS`, so `dist` is strictly positive
  // here and `1 / dist` is safe.
  const invDist = 1 / dist
  const moveX = dx * invDist * DRONE_PATROL_SPEED
  const moveZ = dz * invDist * DRONE_PATROL_SPEED
  return { moveX, moveZ, bobY, reachedTarget: false }
}
