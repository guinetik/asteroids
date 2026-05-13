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
   * Floor surface Y at the given (x, z). Falls back to 0 when no floor
   * rect contains the point — the player should not normally be there,
   * but the fallback keeps physics finite.
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
