/**
 * Floor + lateral-bounds collision for the cylindrical station-interior
 * FPS view. Every room is a half-cylinder whose floor footprint is the
 * AABB `[centerX ± R/2 across, centerZ ± L/2 along]` (with axes swapped
 * for `axis: 'x'` rooms). Doorways punch passage rectangles between
 * adjacent room AABBs.
 *
 * The player is allowed in any point that lies inside (room ∪ doorways).
 * Lateral movement clamps the destination back into that union, sliding
 * along boundaries when the desired move would leave it.
 *
 * @author guinetik
 * @date 2026-05-12
 * @spec docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md
 */

/** A flat horizontal rectangle. Used for room floors and doorway passages. */
export interface StationRect {
  /** Minimum X in world units. */
  minX: number
  /** Maximum X in world units. */
  maxX: number
  /** Minimum Z in world units. */
  minZ: number
  /** Maximum Z in world units. */
  maxZ: number
}

/** A room's walkable footprint (the half-cylinder's floor). */
export interface StationFloor extends StationRect {
  /** Floor surface Y in world units. */
  y: number
}

/** Default floor Y used when the player's (x, z) is outside every room. */
const FLOOR_FALLBACK_Y = 0

/** Numeric epsilon used for `inside` tests so a clamped point reads as inside. */
const INSIDE_EPSILON = 1e-4

/**
 * Number of equally-spaced samples (including the endpoint, excluding the
 * start) checked along a desired move. Sampling guards against the
 * pathological case where two adjacent room AABBs share an edge in
 * collision space — without sampling, a single per-frame step could
 * teleport across the shared edge outside any passage rectangle.
 */
const MOVE_SAMPLE_COUNT = 4

/**
 * Pure collision math for the cylindrical station interior. No Three.js
 * dependencies. Tested under Vitest.
 */
export class StationCollider {
  private readonly _floors: readonly StationFloor[]
  private readonly _passages: readonly StationRect[]
  private readonly _floorY: number
  private _blockers: readonly StationRect[] = []

  /**
   * Construct a collider over a fixed list of room floors and doorway
   * passage rectangles.
   *
   * @param floors - Per-room walkable floor rectangles.
   * @param passages - Per-doorway passage rectangles that bridge adjacent
   *   floor rectangles. Each passage should overlap the boundary between
   *   the two rooms it connects so movement is continuous.
   */
  constructor(floors: readonly StationFloor[], passages: readonly StationRect[]) {
    this._floors = floors
    this._passages = passages
    this._floorY = floors[0]?.y ?? FLOOR_FALLBACK_Y
  }

  /**
   * Replace the dynamic solid rectangles layered over the walkable union.
   * Used by station doors: closed / moving panels block the doorway, while
   * fully-open panels remove their blocker so the player can pass through the
   * model's visible hole.
   *
   * @param blockers - World-space XZ rectangles that are currently solid.
   */
  setBlockers(blockers: readonly StationRect[]): void {
    this._blockers = blockers
  }

  /**
   * Floor surface Y at the given (x, z). Station interiors are flat, so
   * doorway passages and fallback points use the same floor Y as the
   * first floor rectangle instead of dipping to world zero.
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
    return this._floorY
  }

  /**
   * Whether `(x, z)` is blocked by station geometry — outside the
   * walkable union of (room floors ∪ doorway passages), or inside any
   * dynamic blocker rect (closed door panels, prop AABBs).
   *
   * Used by the projectile system for wall/door/prop collision: bolts
   * stop the moment they cross into a blocked point. The radius arg is
   * 0 by default so the test is a true point-in-region (callers can
   * pass a small margin if they want bolts to detonate slightly before
   * the surface).
   *
   * @param x - World X.
   * @param z - World Z.
   * @returns `true` when the point sits in a wall, closed door, or prop.
   */
  isPointBlocked(x: number, z: number): boolean {
    return !this._isInsideUnion(x, z, 0)
  }

  /**
   * Resolve the wall normal (in XZ) at the point a bolt entered a
   * blocked region between `(prevX, prevZ)` and `(x, z)`. The bolt
   * segment is assumed to start unblocked and end blocked.
   *
   * - Blocker (door panel / prop AABB) hit: the normal is the outward
   *   face of the AABB the bolt entered through, computed by picking the
   *   smallest positive `t` among the four face-crossing planes.
   * - Walkable-edge hit (bolt left every floor + passage rect): finds the
   *   floor rect the segment started in and returns the outward face of
   *   that rect the bolt crossed.
   *
   * Both cases yield axis-aligned `(±1, 0)` or `(0, ±1)` normals, which
   * matches a station made of half-cylinder rooms (AABB floor footprints)
   * and AABB blockers — no smoothed curvature.
   *
   * @param prevX - Previous bolt X (unblocked).
   * @param prevZ - Previous bolt Z (unblocked).
   * @param x - Current bolt X (blocked).
   * @param z - Current bolt Z (blocked).
   * @param out - Reused 2D normal scratch; populated on hit.
   * @returns `true` when the segment hit a wall, `false` otherwise.
   */
  findWallNormal(
    prevX: number,
    prevZ: number,
    x: number,
    z: number,
    out: { nx: number; nz: number; t: number },
  ): boolean {
    const dx = x - prevX
    const dz = z - prevZ

    for (const b of this._blockers) {
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) {
        StationCollider._fillEntryNormal(prevX, prevZ, dx, dz, b, out)
        return true
      }
    }

    if (this._isInsideUnion(x, z, 0)) return false

    for (const f of this._floors) {
      if (prevX >= f.minX && prevX <= f.maxX && prevZ >= f.minZ && prevZ <= f.maxZ) {
        StationCollider._fillExitNormal(prevX, prevZ, dx, dz, f, out)
        return true
      }
    }

    const len = Math.hypot(dx, dz)
    if (len > 1e-5) {
      out.nx = -dx / len
      out.nz = -dz / len
    } else {
      out.nx = 0
      out.nz = 1
    }
    out.t = 1
    return true
  }

  /** Outward AABB face the segment entered through (blocker hits). */
  private static _fillEntryNormal(
    prevX: number,
    prevZ: number,
    dx: number,
    dz: number,
    rect: StationRect,
    out: { nx: number; nz: number; t: number },
  ): void {
    let bestT = Number.POSITIVE_INFINITY
    let nx = 0
    let nz = 0
    if (dx > 0) {
      const t = (rect.minX - prevX) / dx
      if (t >= 0 && t < bestT) {
        bestT = t
        nx = -1
        nz = 0
      }
    } else if (dx < 0) {
      const t = (rect.maxX - prevX) / dx
      if (t >= 0 && t < bestT) {
        bestT = t
        nx = 1
        nz = 0
      }
    }
    if (dz > 0) {
      const t = (rect.minZ - prevZ) / dz
      if (t >= 0 && t < bestT) {
        bestT = t
        nx = 0
        nz = -1
      }
    } else if (dz < 0) {
      const t = (rect.maxZ - prevZ) / dz
      if (t >= 0 && t < bestT) {
        bestT = t
        nx = 0
        nz = 1
      }
    }
    out.nx = nx
    out.nz = nz
    out.t = bestT === Number.POSITIVE_INFINITY ? 1 : bestT
  }

  /** Outward AABB face the segment exited through (walkable-edge hits). */
  private static _fillExitNormal(
    prevX: number,
    prevZ: number,
    dx: number,
    dz: number,
    rect: StationRect,
    out: { nx: number; nz: number; t: number },
  ): void {
    let bestT = Number.POSITIVE_INFINITY
    let nx = 0
    let nz = 0
    if (dx > 0) {
      const t = (rect.maxX - prevX) / dx
      if (t >= 0 && t < bestT) {
        bestT = t
        nx = 1
        nz = 0
      }
    } else if (dx < 0) {
      const t = (rect.minX - prevX) / dx
      if (t >= 0 && t < bestT) {
        bestT = t
        nx = -1
        nz = 0
      }
    }
    if (dz > 0) {
      const t = (rect.maxZ - prevZ) / dz
      if (t >= 0 && t < bestT) {
        bestT = t
        nx = 0
        nz = 1
      }
    } else if (dz < 0) {
      const t = (rect.minZ - prevZ) / dz
      if (t >= 0 && t < bestT) {
        bestT = t
        nx = 0
        nz = -1
      }
    }
    out.nx = nx
    out.nz = nz
    out.t = bestT === Number.POSITIVE_INFINITY ? 1 : bestT
  }

  /**
   * Resolve a desired lateral move so the player stays inside the union
   * of (room floors ∪ doorway passages), shrunk by the player capsule
   * radius. Tries axis-decomposed steps so the player slides along walls
   * instead of stopping dead.
   *
   * Algorithm:
   * 1. Try the full move; if its endpoint is inside the union, accept it.
   * 2. Otherwise try X-only and Z-only sub-moves; accept whichever lands
   *    inside the union.
   * 3. Otherwise stay put.
   *
   * The union is shrunk per-rectangle: a point is inside `rect` if it sits
   * at least `radius` away from every edge of `rect`. This keeps the
   * player capsule clear of the (invisible) curved canopy walls.
   * Doorway passages are NOT shrunk so the player can cross them freely.
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
    if (this._isPathInside(fromX, fromZ, toX, toZ, radius)) return { x: toX, z: toZ }
    // Try sliding along X only.
    if (this._isPathInside(fromX, fromZ, toX, fromZ, radius)) return { x: toX, z: fromZ }
    // Try sliding along Z only.
    if (this._isPathInside(fromX, fromZ, fromX, toZ, radius)) return { x: fromX, z: toZ }
    return { x: fromX, z: fromZ }
  }

  /**
   * True iff every sampled point along the segment lies inside the union.
   * The start point is assumed inside; this checks the path from the start
   * to the end so the player cannot teleport across a shared edge between
   * two adjacent room AABBs that happens to fall outside any passage.
   */
  private _isPathInside(
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
    radius: number,
  ): boolean {
    for (let i = 1; i <= MOVE_SAMPLE_COUNT; i++) {
      const t = i / MOVE_SAMPLE_COUNT
      const x = fromX + (toX - fromX) * t
      const z = fromZ + (toZ - fromZ) * t
      if (!this._isInsideUnion(x, z, radius)) return false
    }
    return true
  }

  /**
   * True iff `(x, z)` lies inside any room floor (shrunk by `radius`) or
   * any doorway passage (not shrunk).
   */
  private _isInsideUnion(x: number, z: number, radius: number): boolean {
    for (const b of this._blockers) {
      if (
        x >= b.minX - radius - INSIDE_EPSILON &&
        x <= b.maxX + radius + INSIDE_EPSILON &&
        z >= b.minZ - radius - INSIDE_EPSILON &&
        z <= b.maxZ + radius + INSIDE_EPSILON
      ) {
        return false
      }
    }

    for (const f of this._floors) {
      if (
        x >= f.minX + radius - INSIDE_EPSILON &&
        x <= f.maxX - radius + INSIDE_EPSILON &&
        z >= f.minZ + radius - INSIDE_EPSILON &&
        z <= f.maxZ - radius + INSIDE_EPSILON
      ) {
        return true
      }
    }
    for (const p of this._passages) {
      if (
        x >= p.minX - INSIDE_EPSILON &&
        x <= p.maxX + INSIDE_EPSILON &&
        z >= p.minZ - INSIDE_EPSILON &&
        z <= p.maxZ + INSIDE_EPSILON
      ) {
        return true
      }
    }
    return false
  }
}
