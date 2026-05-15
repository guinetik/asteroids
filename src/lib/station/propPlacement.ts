/**
 * Constraint-based prop placement for station rooms — step 1.
 *
 * Anchors are named candidate slots in a room's local coordinate space.
 * The placer matches props to anchors so {@link StationBuilder} can drop
 * each prop's group at the chosen XZ. This module is intentionally pure
 * (no Three.js, no random generators yet) so the algorithm is exercised
 * entirely through unit tests before it touches the live scene.
 *
 * Coordinate convention:
 *   - Room origin (0, 0) is the floor centre.
 *   - +X grows along {@link RoomBox.width}.
 *   - +Z grows along {@link RoomBox.depth}.
 *   - Y is unused at this layer (the builder applies floor height).
 *
 * @author guinetik
 * @date 2026-05-15
 * @spec docs/space-station-update-gdd.md
 */

/** Half-divisor used to convert width / depth into half-extents. */
const HALF = 2

/**
 * Default density factor for {@link roomBudget}. Tuned so a 6 x 4 m
 * room (24 m² floor) yields a budget of 12 — enough for one table
 * (weight 3) plus a handful of chairs (weight 2) before things start
 * looking crowded. Per-room overrides are encouraged.
 */
export const DEFAULT_ROOM_BUDGET_FACTOR = 0.5

/** A room's lateral footprint, expressed in metres. */
export interface RoomBox {
  /** Length along local X, in metres. */
  width: number
  /** Length along local Z, in metres. */
  depth: number
}

/**
 * Coarse classification of an anchor's role. Used by scoring to
 * express affinities ("tables prefer `center`", "containers prefer
 * `corner`"). `attachment` anchors are derived at placement time from
 * already-placed host props (e.g. a chair's anchor behind a table).
 */
export type AnchorKind = 'corner' | 'edge' | 'center' | 'attachment'

/** A candidate placement slot in a room's local coordinate space. */
export interface Anchor {
  /** Stable id, e.g. `'corner-nw'`. Used by tests and by debug overlays. */
  id: string
  /** Local X in metres. */
  x: number
  /** Local Z in metres. */
  z: number
  /** Affinity classification — see {@link AnchorKind}. */
  kind: AnchorKind
  /**
   * Optional facing direction in radians. Convention: `0` faces
   * toward `+Z`, `π/2` faces `+X`, `π` faces `-Z`, `-π/2` faces `-X`
   * (i.e. `Math.atan2(targetX - x, targetZ - z)`). Pre-computed
   * anchors leave this undefined; attachment anchors set it so
   * follower props orient toward their host.
   */
  facingYaw?: number
}

/** Lateral footprint of a prop in its own local space, in metres. */
export interface PropFootprint {
  /** Half-extent along the prop's local X. */
  halfX: number
  /** Half-extent along the prop's local Z. */
  halfZ: number
}

/**
 * Per-{@link AnchorKind} score modifiers expressing how much this prop
 * "likes" each kind of anchor. Positive values pull the prop toward
 * that anchor kind; negative values push it away. Missing entries are
 * treated as `0` (neutral).
 *
 * Conventional ranges:
 *   - `+3` strong preference (table → center, container → corner)
 *   - `+1..+2` mild preference (chair → edge)
 *   - `0` neutral / unspecified
 *   - `-1..-2` mild aversion (chair → center)
 *   - `-3` "do not place here" (table → corner)
 *
 * The placer rejects (prop, anchor) pairs whose score is strictly
 * below {@link AFFINITY_PLACEMENT_THRESHOLD}, so a `-1` or worse acts
 * as a soft veto: the prop will skip rather than place there.
 */
export type PropAffinity = Partial<Record<AnchorKind, number>>

/**
 * Minimum score an (prop, anchor) pair must reach to be eligible for
 * placement. Anchors scoring below this are treated as "the prop
 * refuses to go there"; the placer either picks a better anchor or
 * skips the prop entirely.
 */
export const AFFINITY_PLACEMENT_THRESHOLD = 0

/**
 * Placement priority class. The placer is order-sensitive — followers
 * need their hosts to already exist, gameplay props need first pick
 * of the budget — so the recommended pipeline is
 * {@link placeWithAttachments}(sortByClass(props), pool, budget).
 *
 *   - `gameplay`: must-have mission props (terminals, chests). Placed
 *     first so they always fit, regardless of how cluttered the room
 *     becomes downstream.
 *   - `anchor`: large hosts that follower props attach to (tables,
 *     desks). Placed before followers so the chairs have something to
 *     cluster around.
 *   - `follower`: props with {@link PropSpec.attachTo} (chairs).
 *   - `filler`: low-priority decor that takes whatever's left.
 */
export type PropClass = 'gameplay' | 'anchor' | 'follower' | 'filler'

/**
 * Numeric precedence for {@link PropClass}, lowest = highest priority.
 * Internal — exposed via {@link sortByClass}.
 */
const CLASS_PRIORITY: Readonly<Record<PropClass, number>> = {
  gameplay: 0,
  anchor: 1,
  follower: 2,
  filler: 3,
}

/**
 * Default class assumed when a {@link PropSpec.class} is omitted. Set
 * to `filler` so an unannotated prop never accidentally outranks a
 * properly tagged gameplay or anchor prop.
 */
export const DEFAULT_PROP_CLASS: PropClass = 'filler'

/** Minimal description of a prop the placer needs to know about. */
export interface PropSpec {
  /** Stable id used in the resulting placement. */
  id: string
  /**
   * Per-prop weight against the room budget. Larger / more disruptive
   * props consume more budget. Suggested values: container = 1,
   * chair = 2, table = 3. Must be non-negative; zero is allowed for
   * "free" decor that should never be skipped.
   */
  weight: number
  /**
   * Optional anchor-kind preferences. Defaults to no preferences (the
   * prop is happy at any anchor). See {@link PropAffinity}.
   */
  affinity?: PropAffinity
  /**
   * Optional descriptive tags this prop exposes as an attachment host.
   * Other props with a matching id in {@link attachTo} will treat this
   * prop as a valid host. Example: `tags: ['table']` lets chairs with
   * `attachTo: ['table']` cluster around it.
   */
  tags?: string[]
  /**
   * Optional list of host tags this prop wants to attach to. When set,
   * the placer first synthesises attachment anchors from any already-
   * placed prop whose {@link tags} intersect this list, before falling
   * back to the room anchor pool.
   */
  attachTo?: string[]
  /**
   * Optional lateral footprint. Required on hosts so the placer can
   * compute attachment anchors offset from the host's edge. Followers
   * may omit it; collision math against the host uses the host's
   * footprint plus {@link ATTACHMENT_PADDING}.
   */
  footprint?: PropFootprint
  /**
   * Optional placement priority class — see {@link PropClass}. When
   * omitted, defaults to {@link DEFAULT_PROP_CLASS}. The placer does
   * not auto-sort by class; callers should pipe through
   * {@link sortByClass} first.
   */
  class?: PropClass
}

/** A prop matched to an anchor, with the anchor's coordinates inlined. */
export interface Placement {
  /** Source {@link PropSpec.id}. */
  propId: string
  /** Source {@link Anchor.id}. */
  anchorId: string
  /** Local X in metres, copied from the anchor. */
  x: number
  /** Local Z in metres, copied from the anchor. */
  z: number
  /**
   * Optional facing yaw in radians, copied from the anchor. See
   * {@link Anchor.facingYaw} for convention.
   */
  facingYaw?: number
}

/**
 * Gap, in metres, between a host's edge and the attachment anchor. So
 * a chair's pivot lands `ATTACHMENT_PADDING` past the table's back
 * face — the chair's own footprint then closes the visible gap.
 */
export const ATTACHMENT_PADDING = 0.1

/**
 * Emit one anchor at each of the room's four corners, inset from the
 * walls by `margin` metres so a placed prop's footprint does not clip
 * the wall geometry.
 *
 * @param room - Room footprint.
 * @param margin - Inset from each wall, in metres. Must be `>= 0` and
 *   small enough that the inset corners stay inside the room.
 * @returns Four anchors in NW, NE, SW, SE order.
 */
export function cornerAnchors(room: RoomBox, margin: number): Anchor[] {
  const halfX = room.width / HALF - margin
  const halfZ = room.depth / HALF - margin
  return [
    { id: 'corner-nw', x: -halfX, z: -halfZ, kind: 'corner' },
    { id: 'corner-ne', x: +halfX, z: -halfZ, kind: 'corner' },
    { id: 'corner-sw', x: -halfX, z: +halfZ, kind: 'corner' },
    { id: 'corner-se', x: +halfX, z: +halfZ, kind: 'corner' },
  ]
}

/**
 * Emit `countPerSide` anchors along each of the room's four walls,
 * inset from the wall by `margin` and evenly spaced strictly between
 * the corners (corners are owned by {@link cornerAnchors} and never
 * duplicated here).
 *
 * Spacing uses fence-post interpolation `t = (i + 1) / (countPerSide + 1)`
 * so a single anchor lands at the wall's midpoint, two anchors land at
 * 1/3 and 2/3, three at 1/4, 2/4, 3/4, and so on.
 *
 * @param room - Room footprint.
 * @param countPerSide - Number of anchors per wall. `0` returns an
 *   empty array; the placer treats walls as anchorless.
 * @param margin - Inset from the wall, in metres.
 * @returns Up to `4 * countPerSide` anchors, in N, E, S, W wall order.
 */
export function edgeAnchors(room: RoomBox, countPerSide: number, margin: number): Anchor[] {
  if (countPerSide <= 0) return []
  const halfX = room.width / HALF - margin
  const halfZ = room.depth / HALF - margin
  const spanX = room.width - margin * HALF
  const spanZ = room.depth - margin * HALF
  const out: Anchor[] = []
  for (let i = 0; i < countPerSide; i++) {
    const t = (i + 1) / (countPerSide + 1)
    const x = -halfX + spanX * t
    const z = -halfZ + spanZ * t
    out.push({ id: `edge-n-${i}`, x, z: -halfZ, kind: 'edge' })
    out.push({ id: `edge-e-${i}`, x: +halfX, z, kind: 'edge' })
    out.push({ id: `edge-s-${i}`, x, z: +halfZ, kind: 'edge' })
    out.push({ id: `edge-w-${i}`, x: -halfX, z, kind: 'edge' })
  }
  return out
}

/**
 * Emit a single anchor at the room's floor centre. Mirrors the simple
 * "table goes in the middle" placement most rooms want.
 *
 * @param _room - Room footprint (unused — the centre is always (0, 0)
 *   in local space, but the parameter is kept for API symmetry with
 *   {@link cornerAnchors} and {@link edgeAnchors}).
 * @returns A one-element array containing the centre anchor.
 */
export function centerAnchor(_room: RoomBox): Anchor[] {
  return [{ id: 'center', x: 0, z: 0, kind: 'center' }]
}

/**
 * Compute a room's prop-weight budget from its floor area. Larger rooms
 * tolerate more clutter; the `factor` knob lets per-theme overrides
 * (e.g. a sparse derelict, a packed mess hall) tune density without
 * editing prop weights.
 *
 * @param room - Room footprint.
 * @param factor - Multiplier applied to floor area (m²). Defaults to
 *   {@link DEFAULT_ROOM_BUDGET_FACTOR}.
 * @returns Total weight the room is allowed to spend on props.
 */
export function roomBudget(room: RoomBox, factor: number = DEFAULT_ROOM_BUDGET_FACTOR): number {
  return room.width * room.depth * factor
}

/**
 * Score how much `prop` "wants" `anchor`. Returns `0` when the prop
 * has no opinion about the anchor's kind. Pure helper — exposed for
 * tests and debug overlays.
 *
 * @param prop - Prop being placed.
 * @param anchor - Candidate anchor.
 * @returns Affinity score; higher is better.
 */
export function scoreAnchor(prop: PropSpec, anchor: Anchor): number {
  return prop.affinity?.[anchor.kind] ?? 0
}

/**
 * Affinity-driven placer. For each prop, in input order, picks the
 * highest-scoring still-available anchor (ties broken by anchor input
 * order). Rejects placements whose score is strictly below
 * {@link AFFINITY_PLACEMENT_THRESHOLD} or that would push total spend
 * over `budget`. Skip-and-continue on rejection — same failure mode
 * as {@link placeAtAnchors}.
 *
 * @param props - Props in priority order. Higher-priority props get
 *   first pick of the anchor pool.
 * @param anchors - All candidate anchors. Order is the tiebreaker
 *   when two anchors score equally.
 * @param budget - Maximum total weight to place.
 * @returns Accepted placements, in the order they were chosen.
 */
export function placeByAffinity(
  props: PropSpec[],
  anchors: Anchor[],
  budget: number,
): Placement[] {
  const used = new Set<string>()
  const out: Placement[] = []
  let spent = 0
  for (const prop of props) {
    if (spent + prop.weight > budget) continue
    let bestAnchor: Anchor | null = null
    let bestScore = -Infinity
    for (const anchor of anchors) {
      if (used.has(anchor.id)) continue
      const score = scoreAnchor(prop, anchor)
      if (score < AFFINITY_PLACEMENT_THRESHOLD) continue
      if (score > bestScore) {
        bestScore = score
        bestAnchor = anchor
      }
    }
    if (!bestAnchor) continue
    used.add(bestAnchor.id)
    out.push({ propId: prop.id, anchorId: bestAnchor.id, x: bestAnchor.x, z: bestAnchor.z })
    spent += prop.weight
  }
  return out
}

/**
 * Stable sort by {@link PropClass} priority — gameplay first, filler
 * last. Stable within a class: props that share a class keep their
 * original input order. Returns a new array; the input is not mutated.
 *
 * Pipe the result into {@link placeWithAttachments} so attachment
 * hosts (e.g. desks) are always processed before their followers
 * (e.g. chairs):
 *
 * ```ts
 * placeWithAttachments(sortByClass(roomProps), anchors, budget)
 * ```
 *
 * @param props - Props in any order; class assignments come from
 *   {@link PropSpec.class} (defaults to {@link DEFAULT_PROP_CLASS}).
 * @returns A new array sorted by class priority.
 */
export function sortByClass(props: readonly PropSpec[]): PropSpec[] {
  return [...props].sort(
    (a, b) =>
      CLASS_PRIORITY[a.class ?? DEFAULT_PROP_CLASS] -
      CLASS_PRIORITY[b.class ?? DEFAULT_PROP_CLASS],
  )
}

/**
 * Synthesise an attachment anchor sitting directly behind a host
 * placement (on the host's `-Z` side), facing back toward the host
 * centre. Step-4 keeps it to a single slot per host — desks fit one
 * chair. Future steps can extend to multiple sides.
 *
 * The anchor's Z is offset by `hostFootprint.halfZ + followerHalfZ +
 * padding` so the host and follower edges sit `padding` metres apart
 * once the follower is placed. Pass `0` for `followerHalfZ` when the
 * follower is footprint-less (treated as a point).
 *
 * @param host - Already-placed host (e.g. a table).
 * @param hostFootprint - The host's lateral footprint.
 * @param followerHalfZ - The follower's half-depth along Z. `0` if
 *   the follower has no footprint.
 * @param padding - Extra gap between host edge and follower edge.
 * @returns One anchor pinned to the host, with `facingYaw = 0` so the
 *   follower looks straight at the host.
 */
export function attachmentAnchors(
  host: Placement,
  hostFootprint: PropFootprint,
  followerHalfZ: number,
  padding: number,
): Anchor[] {
  return [
    {
      id: `attach-${host.anchorId}-back`,
      x: host.x,
      z: host.z - hostFootprint.halfZ - followerHalfZ - padding,
      kind: 'attachment',
      facingYaw: 0,
    },
  ]
}

/**
 * Test whether two axis-aligned rectangles overlap, with optional
 * `clearance` extra spacing applied to the overlap threshold. Edge
 * contact at `clearance = 0` does NOT count as overlap; rectangles
 * sharing only a face are considered safely adjacent.
 *
 * Note: rotated props are treated as their bbox at yaw = 0 (the
 * placer does not currently rotate footprints). Acceptable for the
 * roughly-square station furniture; revisit if a long thin prop ever
 * rotates 90° via {@link Anchor.facingYaw}.
 *
 * @param ax - Centre X of rectangle A.
 * @param az - Centre Z of rectangle A.
 * @param aHalfX - Half-extent of A along X.
 * @param aHalfZ - Half-extent of A along Z.
 * @param bx - Centre X of rectangle B.
 * @param bz - Centre Z of rectangle B.
 * @param bHalfX - Half-extent of B along X.
 * @param bHalfZ - Half-extent of B along Z.
 * @param clearance - Extra spacing required between edges. Default 0.
 * @returns True iff the rectangles overlap (or sit closer than
 *   `clearance` to each other).
 */
export function aabbOverlaps(
  ax: number,
  az: number,
  aHalfX: number,
  aHalfZ: number,
  bx: number,
  bz: number,
  bHalfX: number,
  bHalfZ: number,
  clearance: number = 0,
): boolean {
  return (
    Math.abs(ax - bx) < aHalfX + bHalfX + clearance &&
    Math.abs(az - bz) < aHalfZ + bHalfZ + clearance
  )
}

/**
 * A zero-argument function returning the next pseudo-random float in
 * `[0, 1)`. Compatible with `mulberry32` and friends. Pure type alias
 * so callers don't have to import it from a specific module.
 */
export type Rng = () => number

/**
 * Affinity placer with relational attachment AND collision
 * rejection. Behaves like {@link placeByAffinity} but, before scoring
 * each prop, synthesises attachment anchors from prior placements
 * whose host tags intersect the prop's {@link PropSpec.attachTo}
 * list. Synthesised anchors are scored alongside the room pool, so
 * a high `attachment` affinity (e.g. chair → 5) outranks a mild edge
 * preference (chair → 2).
 *
 * Each candidate is then validated against every prior placement: if
 * the prop's {@link PropSpec.footprint} (centred on the candidate)
 * would overlap any placed prop's footprint (plus `clearance`), the
 * candidate is dropped. Footprint-less props skip the check.
 *
 * When `rng` is supplied, ties at the highest *valid* score are
 * broken by sampling uniformly at random.
 *
 * @param props - Props in priority order.
 * @param pool - Room-level anchors (corners + edges + center).
 * @param budget - Maximum total weight to place.
 * @param rng - Optional PRNG for tie-breaking.
 * @param clearance - Minimum gap, in metres, between any two placed
 *   props' edges. Default 0 (touching is allowed).
 * @returns Accepted placements, in the order they were chosen.
 */
export function placeWithAttachments(
  props: PropSpec[],
  pool: Anchor[],
  budget: number,
  rng?: Rng,
  clearance: number = 0,
): Placement[] {
  const propById = new Map(props.map((p) => [p.id, p]))
  const placed: Placement[] = []
  const used = new Set<string>()
  let spent = 0
  for (const prop of props) {
    if (spent + prop.weight > budget) continue
    const candidates = collectCandidateAnchors(prop, placed, propById, pool)
    const valid = filterByCollision(prop, candidates, placed, propById, clearance)
    const choice = pickBestAnchor(prop, valid, used, rng)
    if (!choice) continue
    used.add(choice.id)
    placed.push({
      propId: prop.id,
      anchorId: choice.id,
      x: choice.x,
      z: choice.z,
      facingYaw: choice.facingYaw,
    })
    spent += prop.weight
  }
  return placed
}

/**
 * Build the candidate pool for one prop: synthesise attachment anchors
 * from prior placements (when the prop opts in via `attachTo`), then
 * append the room's pre-computed pool. Attachment anchors come first
 * so they win ties at the same score. The synthesised anchor's offset
 * accounts for the follower's own depth, so the host and follower
 * edges sit {@link ATTACHMENT_PADDING} apart.
 */
function collectCandidateAnchors(
  prop: PropSpec,
  placed: Placement[],
  propById: Map<string, PropSpec>,
  pool: Anchor[],
): Anchor[] {
  const attachTo = prop.attachTo
  if (!attachTo || attachTo.length === 0) return pool
  const followerHalfZ = prop.footprint?.halfZ ?? 0
  const out: Anchor[] = []
  for (const placement of placed) {
    const host = propById.get(placement.propId)
    const hostTags = host?.tags
    const hostFootprint = host?.footprint
    if (!hostTags || !hostFootprint) continue
    const matches = hostTags.some((tag) => attachTo.includes(tag))
    if (!matches) continue
    out.push(
      ...attachmentAnchors(placement, hostFootprint, followerHalfZ, ATTACHMENT_PADDING),
    )
  }
  out.push(...pool)
  return out
}

/**
 * Drop any candidate whose footprint, centred on the candidate, would
 * overlap a previously-placed prop's footprint (plus `clearance`).
 * Props without a footprint skip the check entirely — they're treated
 * as points and never rejected for collision.
 */
function filterByCollision(
  prop: PropSpec,
  candidates: Anchor[],
  placed: Placement[],
  propById: Map<string, PropSpec>,
  clearance: number,
): Anchor[] {
  const fp = prop.footprint
  if (!fp || placed.length === 0) return candidates
  return candidates.filter((anchor) => {
    for (const placement of placed) {
      const otherFp = propById.get(placement.propId)?.footprint
      if (!otherFp) continue
      if (
        aabbOverlaps(
          anchor.x,
          anchor.z,
          fp.halfX,
          fp.halfZ,
          placement.x,
          placement.z,
          otherFp.halfX,
          otherFp.halfZ,
          clearance,
        )
      ) {
        return false
      }
    }
    return true
  })
}

/**
 * Greedy max-score pick across a candidate list, honouring the
 * {@link AFFINITY_PLACEMENT_THRESHOLD} soft veto. Ties at the top
 * score are collected, then broken by `rng` (uniform random) when
 * provided, otherwise by input order (first-encountered wins).
 */
function pickBestAnchor(
  prop: PropSpec,
  candidates: Anchor[],
  used: ReadonlySet<string>,
  rng?: Rng,
): Anchor | null {
  let bestScore = -Infinity
  const ties: Anchor[] = []
  for (const anchor of candidates) {
    if (used.has(anchor.id)) continue
    const score = scoreAnchor(prop, anchor)
    if (score < AFFINITY_PLACEMENT_THRESHOLD) continue
    if (score > bestScore) {
      bestScore = score
      ties.length = 0
      ties.push(anchor)
    } else if (score === bestScore) {
      ties.push(anchor)
    }
  }
  if (ties.length === 0) return null
  if (!rng || ties.length === 1) return ties[0] ?? null
  const index = Math.min(ties.length - 1, Math.floor(rng() * ties.length))
  return ties[index] ?? null
}

/**
 * Greedy placer — pairs props with anchors in input order and stops
 * as soon as anchors run out, props run out, OR the next prop would
 * push total spend over `budget`. Props that don't fit the remaining
 * budget are skipped (not retried), matching the "drop and forget"
 * failure mode used by most procgen room furnishers.
 *
 * @param props - Props in the order they should be considered.
 * @param anchors - Anchors to consume, in priority order.
 * @param budget - Maximum total weight to place, in the same units as
 *   {@link PropSpec.weight}. Use {@link roomBudget} to derive from
 *   room size.
 * @returns One placement per accepted (prop, anchor) pair.
 */
export function placeAtAnchors(
  props: PropSpec[],
  anchors: Anchor[],
  budget: number,
): Placement[] {
  const out: Placement[] = []
  let spent = 0
  let anchorIndex = 0
  for (const prop of props) {
    if (anchorIndex >= anchors.length) break
    if (spent + prop.weight > budget) continue
    const anchor = anchors[anchorIndex]!
    out.push({ propId: prop.id, anchorId: anchor.id, x: anchor.x, z: anchor.z })
    spent += prop.weight
    anchorIndex++
  }
  return out
}
