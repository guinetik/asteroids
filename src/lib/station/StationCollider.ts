/**
 * Axis-aligned floor + wall collision for the station-interior FPS view.
 * Floors are flat rectangles with a fixed Y; walls are thin AABBs that the
 * player capsule cannot pass through. Openings (archways) are represented
 * by their absence — the loader splits wall spans around openings before
 * passing the resulting AABB list in.
 *
 * @author guinetik
 * @date 2026-05-12
 * @spec docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md
 */

/** Flat horizontal rectangle that the player stands on. */
export interface StationFloor {
  /** Minimum X in world units. */
  minX: number
  /** Maximum X in world units. */
  maxX: number
  /** Minimum Z in world units. */
  minZ: number
  /** Maximum Z in world units. */
  maxZ: number
  /** Floor surface Y in world units. */
  y: number
}

/** Thin wall AABB the player capsule cannot penetrate. */
export interface StationWallAabb {
  /** Minimum X in world units. */
  minX: number
  /** Maximum X in world units. */
  maxX: number
  /** Minimum Z in world units. */
  minZ: number
  /** Maximum Z in world units. */
  maxZ: number
}

/** Default floor Y when the player's (x, z) is outside every floor rect. */
const FLOOR_FALLBACK_Y = 0

/**
 * Pure collision math for the station interior. No Three.js dependencies.
 * Tested under Vitest.
 */
export class StationCollider {
  private readonly _floors: readonly StationFloor[]
  private readonly _walls: readonly StationWallAabb[]

  /**
   * Construct a collider over a fixed list of floors and wall AABBs.
   *
   * @param floors - Floor rectangles.
   * @param walls - Wall AABBs with openings already removed.
   */
  constructor(floors: readonly StationFloor[], walls: readonly StationWallAabb[]) {
    this._floors = floors
    this._walls = walls
  }

  /**
   * Floor surface Y at the given (x, z). Falls back to 0 when no floor rect
   * contains the point — the player should not normally be there, but the
   * fallback keeps physics finite.
   *
   * @param x - World X.
   * @param z - World Z.
   * @returns Floor Y.
   */
  groundedYAt(x: number, z: number): number {
    for (const f of this._floors) {
      if (x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ) {
        return f.y
      }
    }
    return FLOOR_FALLBACK_Y
  }

  /**
   * Resolve a desired lateral move so the capsule cannot enter a wall AABB.
   * Each wall is checked once; the move is clamped per-axis so the player
   * slides along walls instead of stopping dead.
   *
   * @param fromX - Current X.
   * @param fromZ - Current Z.
   * @param toX - Desired X.
   * @param toZ - Desired Z.
   * @param radius - Player capsule radius.
   * @returns Clamped destination `{ x, z }`.
   */
  resolveLateralMove(
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
    radius: number,
  ): { x: number; z: number } {
    let x = toX
    let z = toZ

    for (const w of this._walls) {
      // X-axis resolve: only clamp if moving into the wall on X. The player
      // must end up overlapping the wall in Z (expanded) for the wall to
      // matter, and must not have already been overlapping the wall on X
      // (otherwise this is parallel slide along it).
      const fromOverlapsX = this._overlapsX(fromX, w, radius)
      const fromOverlapsZ = this._overlapsZ(fromZ, w, radius)
      // Sweep test on X: the motion crosses the wall's expanded X range when
      // the start is outside on the near side and the end is at or past the
      // near edge of the expanded wall.
      const xSweepHits =
        !fromOverlapsX &&
        ((toX > fromX && fromX <= w.minX - radius && x > w.minX - radius) ||
          (toX < fromX && fromX >= w.maxX + radius && x < w.maxX + radius))
      if (fromOverlapsZ && xSweepHits) {
        if (toX > fromX) {
          x = Math.min(x, w.minX - radius)
        } else if (toX < fromX) {
          x = Math.max(x, w.maxX + radius)
        }
      }
      // Z-axis resolve: only clamp if the new Z brings the player into the
      // wall, and they were not already overlapping it on Z (i.e. moving
      // along a wall is not blocked).
      const xOverlapsAfter = this._overlapsX(x, w, radius)
      const zSweepHits =
        !fromOverlapsZ &&
        ((toZ > fromZ && fromZ <= w.minZ - radius && z > w.minZ - radius) ||
          (toZ < fromZ && fromZ >= w.maxZ + radius && z < w.maxZ + radius))
      if (xOverlapsAfter && zSweepHits) {
        if (toZ > fromZ) {
          z = Math.min(z, w.minZ - radius)
        } else if (toZ < fromZ) {
          z = Math.max(z, w.maxZ + radius)
        }
      }
    }

    return { x, z }
  }

  private _overlapsX(x: number, w: StationWallAabb, radius: number): boolean {
    return x > w.minX - radius && x < w.maxX + radius
  }

  private _overlapsZ(z: number, w: StationWallAabb, radius: number): boolean {
    return z > w.minZ - radius && z < w.maxZ + radius
  }
}
