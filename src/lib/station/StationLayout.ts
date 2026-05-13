/**
 * Pure layout maths for the station-interior level: piece dimensions,
 * port enumeration, port world placement, and connection validation.
 *
 * No Three.js, no Vue — every public function is a pure mapping from
 * data to data so the three.js builder layer can stay thin and so the
 * trickier port-alignment maths is unit-testable in isolation.
 *
 * Coordinate convention (mirrors {@link StationRoomBuilder}):
 *
 * - World Y is up. Layout lives on the XZ plane.
 * - Sides are cardinal: `N` = +Z, `S` = −Z, `E` = +X, `W` = −X.
 * - Yaw is measured in 90° steps. A positive yaw of 1 (corresponds to
 *   `Three.js rotation.y = +π/2`) rotates piece-local +X to world −Z;
 *   in cardinal terms it rotates port labels `N → E → S → W → N`.
 *
 * @author guinetik
 * @date 2026-05-13
 */

/** Cardinal side of a room or corridor port. */
export type EntranceSide = 'N' | 'S' | 'E' | 'W'

/** Discrete yaw measured in 90° steps. `0` = native orientation. */
export type YawTurns = 0 | 1 | 2 | 3

/**
 * Room floor/wall tile pitch in world units. Matches the builder's
 * empirically-tuned value and lives here so the layout maths can place
 * room entrances at the same XZ positions the builder will render them.
 */
export const ROOM_TILE_SIZE = 3.85

/**
 * How wide an entrance door opens when interacted with. `'crack'` is for
 * exits the player leaves through (room is about to unload); `'full'` is
 * for doors the player walks through into another room/corridor.
 */
export type EntranceOpenStyle = 'crack' | 'full'

/**
 * What's on the other side of a room's entrance. Absent means the
 * entrance is a standalone terminator — the player interacts and the
 * controller dispatches the entrance's `event` (e.g. `station:exit`).
 */
export type EntranceTarget =
  /** Mates to a corridor's port on the given world-facing side. */
  | { kind: 'corridor'; nodeId: string; worldSide: EntranceSide }
  /** Mates to another room's entrance (room-to-room doorway). */
  | { kind: 'room'; roomId: string; entranceIndex: number }

/**
 * Data-only description of a single entrance on a room wall. Owned by
 * the room (not the corridor) — corridors-to-rooms are wired through the
 * room's `target` field, not via a corridor port target.
 */
export interface EntranceSpec {
  /** Which perimeter wall the entrance sits in. */
  side: EntranceSide
  /**
   * 0-based wall-tile index along that side. For `N`/`S` the index runs
   * along X (0..width-1); for `E`/`W` it runs along Z (0..depth-1).
   */
  index: number
  /** Storey index this entrance lives on. Defaults to 0. */
  storey?: number
  /** Prompt text to show when the player is in range (e.g. `'F  Leave'`). */
  prompt: string
  /** Identifier passed to `onInteract` when the player triggers it. */
  event: string
  /** How wide the door opens before firing the event. Defaults to `'full'`. */
  openStyle?: EntranceOpenStyle
  /**
   * What this entrance connects to. Omit for a standalone terminator
   * (the existing south-side `station:exit` pattern).
   */
  target?: EntranceTarget
}

/** A room placed in the world. */
export interface RoomSpec {
  /** Layout-unique id. */
  id: string
  /** Wall-piece count along X. */
  width: number
  /** Wall-piece count along Z. */
  depth: number
  /** Wall-piece count stacked vertically (defaults to 1). */
  height?: number
  /** Centre of the room's footprint in world XZ. */
  anchor: Vec2
  /** Yaw applied to the whole room (defaults to 0). Entrances rotate with it. */
  yaw?: YawTurns
  /** Entrance specs on the room's perimeter. */
  entrances?: EntranceSpec[]
}

/** XZ plane vector — anchors, port positions, etc. */
export interface Vec2 {
  /** World X. */
  x: number
  /** World Z. */
  z: number
}

/** Modular corridor piece kinds bundled in the asset pack. */
export type CorridorKind = 'cross' | 'corner' | 'window' | 'straight'

/**
 * Half-extents of each corridor piece along its native (yaw=0) X and Z
 * axes, measured from the asset GLB bounding boxes:
 *
 * - `cross` is square (5.30 × 5.30).
 * - `corner` is square (4.86 × 4.86).
 * - `window` is rectangular — X long (5.30), Z short (4.86).
 * - `straight` is a narrow 2-way corridor — X short (2.20), Z long (4.46).
 */
export const CORRIDOR_HALF_EXTENTS: Readonly<Record<CorridorKind, Vec2>> = {
  cross: { x: 2.65, z: 2.65 },
  corner: { x: 2.43, z: 2.43 },
  window: { x: 2.65, z: 2.43 },
  straight: { x: 1.099, z: 2.231 },
}

/**
 * Sides where each piece kind has a native (yaw=0) port opening. These
 * match the orientation the GLBs ship with: when a piece is dropped at
 * the origin with yaw=0, the listed sides are where the openings
 * physically appear, *not* where math conveniences place them.
 *
 * - `cross` opens on all four sides (just four columns, no walls).
 * - `corner` opens on `S` + `W` — a 90° elbow whose inside angle faces
 *   the −X −Z quadrant. The curved exterior window wall is on the `N`
 *   face; the remaining solid wall is on `E`.
 * - `window` is a T whose long bar runs along X, opening on `N`, `W`,
 *   and `E`. The stem of the T closes off the `S` face.
 */
export const CORRIDOR_NATIVE_PORTS: Readonly<Record<CorridorKind, ReadonlyArray<EntranceSide>>> = {
  cross: ['N', 'E', 'S', 'W'],
  corner: ['S', 'W'],
  window: ['N', 'W', 'E'],
  straight: ['N', 'S'],
}

/** Ordered cardinal cycle used for yaw rotation math. */
const SIDES_CW: ReadonlyArray<EntranceSide> = ['N', 'E', 'S', 'W']

/** Reverse lookup: side label → index into {@link SIDES_CW}. */
const SIDE_INDEX: Readonly<Record<EntranceSide, number>> = { N: 0, E: 1, S: 2, W: 3 }

/**
 * Convert a cardinal side label into the {@link YawTurns} value that
 * represents its outward direction (N=0, E=1, S=2, W=3). Useful when
 * comparing room-entrance world anchors to corridor port anchors.
 *
 * @param side - Cardinal side.
 * @returns The corresponding yaw value.
 */
export function sideToYaw(side: EntranceSide): YawTurns {
  return SIDE_INDEX[side] as YawTurns
}

/**
 * Rotate a side label clockwise by `turns` 90° steps.
 *
 * @param side - Source cardinal side.
 * @param turns - Number of 90° clockwise rotations to apply.
 * @returns Rotated side label.
 */
export function rotateSide(side: EntranceSide, turns: YawTurns): EntranceSide {
  return SIDES_CW[(SIDE_INDEX[side] + turns) % 4] as EntranceSide
}

/**
 * Rotate an XZ vector clockwise (when viewed from +Y) by `turns` 90° steps.
 * Matches Three.js yaw rotation around the +Y axis.
 *
 * @param v - Input vector in piece-local frame.
 * @param turns - Number of 90° rotations to apply.
 * @returns Rotated vector in the same frame.
 */
export function rotateVec2(v: Vec2, turns: YawTurns): Vec2 {
  // `+ 0` collapses the -0 that arises from `-v.x` when `v.x === 0` so
  // unit tests can compare with `toEqual` without signed-zero noise.
  switch (turns) {
    case 0:
      return { x: v.x + 0, z: v.z + 0 }
    case 1:
      return { x: v.z + 0, z: -v.x + 0 }
    case 2:
      return { x: -v.x + 0, z: -v.z + 0 }
    case 3:
      return { x: -v.z + 0, z: v.x + 0 }
  }
}

/**
 * Anchor of a native (yaw=0) port relative to the piece centre. The port
 * sits at the piece's half-extent along the side's outward normal.
 *
 * Note: this describes logical layout anchors, not visual decal/marker
 * alignment. Asset-specific visual nudges belong in the Three.js builder
 * so the authored graph can stay geometrically stable.
 *
 * @param kind - Corridor piece kind.
 * @param side - Native side the port opens on.
 * @returns Local-frame port anchor.
 * @throws If `side` is not a native port for `kind`.
 */
export function nativePortAnchor(kind: CorridorKind, side: EntranceSide): Vec2 {
  if (!CORRIDOR_NATIVE_PORTS[kind].includes(side)) {
    throw new Error(`${kind} has no native port on ${side}`)
  }
  const { x, z } = CORRIDOR_HALF_EXTENTS[kind]
  switch (side) {
    case 'N':
      return { x: 0, z }
    case 'S':
      return { x: 0, z: -z }
    case 'E':
      return { x, z: 0 }
    case 'W':
      return { x: -x, z: 0 }
  }
}

/** A corridor placed in the world. */
export interface CorridorNode {
  /** Layout-unique id. */
  id: string
  /** Piece kind. */
  kind: CorridorKind
  /** Centre of the piece in world XZ. */
  anchor: Vec2
  /** Yaw applied to the piece (defaults to 0). */
  yaw?: YawTurns
}

/**
 * Enumerate the world-facing sides where a placed corridor has port
 * openings. After yaw, a native side `s` shows up as the world side
 * `rotateSide(s, yaw)`.
 *
 * @param node - Placed corridor.
 * @returns World-facing port sides, in clockwise order.
 */
export function corridorWorldPorts(node: CorridorNode): EntranceSide[] {
  const yaw = node.yaw ?? 0
  return CORRIDOR_NATIVE_PORTS[node.kind].map((s) => rotateSide(s, yaw))
}

/**
 * World-space anchor of a corridor's port, given the side that port
 * opens on in *world* coordinates (i.e. after the piece's yaw has been
 * applied). Returns `null` when the corridor has no port on that side.
 *
 * @param node - Placed corridor.
 * @param worldSide - Side, in world coordinates, where the port faces.
 * @returns Port anchor + outward yaw, or `null` if no such port exists.
 */
export function corridorPortWorldAnchor(
  node: CorridorNode,
  worldSide: EntranceSide,
): { anchor: Vec2; outwardYaw: YawTurns } | null {
  const yaw = node.yaw ?? 0
  // Walk the rotation backwards to find which native side rotated into `worldSide`.
  const nativeIdx = (SIDE_INDEX[worldSide] - yaw + 4) % 4
  const nativeSide = SIDES_CW[nativeIdx] as EntranceSide
  if (!CORRIDOR_NATIVE_PORTS[node.kind].includes(nativeSide)) return null

  const local = nativePortAnchor(node.kind, nativeSide)
  const rotated = rotateVec2(local, yaw)
  return {
    anchor: { x: node.anchor.x + rotated.x, z: node.anchor.z + rotated.z },
    outwardYaw: SIDE_INDEX[worldSide] as YawTurns,
  }
}

/**
 * World-space anchor of a room's entrance — the centre of the door slot
 * on the outer face of the room's wall, after the room's yaw has been
 * applied. Symmetric with {@link corridorPortWorldAnchor} so the two can
 * be fed straight into {@link portsMate}.
 *
 * @param room - Room placement.
 * @param entrance - Entrance spec on that room.
 * @returns Anchor + outward yaw of the door slot in world coordinates.
 */
export function roomEntranceWorldAnchor(
  room: RoomSpec,
  entrance: EntranceSpec,
): { anchor: Vec2; outwardYaw: YawTurns } {
  const tile = ROOM_TILE_SIZE
  const halfW = (room.width * tile) / 2
  const halfD = (room.depth * tile) / 2
  let local: Vec2
  switch (entrance.side) {
    case 'N':
      local = { x: (entrance.index - (room.width - 1) / 2) * tile, z: halfD }
      break
    case 'S':
      local = { x: (entrance.index - (room.width - 1) / 2) * tile, z: -halfD }
      break
    case 'E':
      local = { x: halfW, z: (entrance.index - (room.depth - 1) / 2) * tile }
      break
    case 'W':
      local = { x: -halfW, z: (entrance.index - (room.depth - 1) / 2) * tile }
      break
  }
  const yaw = room.yaw ?? 0
  const rotated = rotateVec2(local, yaw)
  return {
    anchor: { x: room.anchor.x + rotated.x, z: room.anchor.z + rotated.z },
    outwardYaw: sideToYaw(rotateSide(entrance.side, yaw)),
  }
}

/** Maximum positional drift (world units) allowed when mating two ports. */
const PORT_MATE_EPSILON = 1e-3
/**
 * Tolerance for piece-vs-piece bbox overlap. Two pieces that share a
 * port edge will have axis-aligned bboxes that touch along a line; we
 * accept anything tighter than this as "sharing an edge" rather than
 * "overlapping in volume".
 */
const BBOX_OVERLAP_EPSILON = 1e-3

/** Axis-aligned XZ-plane bounding box of a placed piece. */
export interface PieceBBox {
  /** Stable identifier used for error messages. */
  id: string
  /** Inclusive min X. */
  minX: number
  /** Inclusive max X. */
  maxX: number
  /** Inclusive min Z. */
  minZ: number
  /** Inclusive max Z. */
  maxZ: number
}

/**
 * World-space bbox of a placed room. Yaw 0/2 keeps the X/Z axes; yaw
 * 1/3 swaps them (the room is rectangular in tile pitch).
 *
 * @param room - Room placement.
 * @returns Axis-aligned bbox in world XZ.
 */
export function roomBBox(room: RoomSpec): PieceBBox {
  const tile = ROOM_TILE_SIZE
  const halfW = (room.width * tile) / 2
  const halfD = (room.depth * tile) / 2
  const yaw = room.yaw ?? 0
  const swapped = yaw === 1 || yaw === 3
  const hx = swapped ? halfD : halfW
  const hz = swapped ? halfW : halfD
  return {
    id: room.id,
    minX: room.anchor.x - hx,
    maxX: room.anchor.x + hx,
    minZ: room.anchor.z - hz,
    maxZ: room.anchor.z + hz,
  }
}

/**
 * World-space bbox of a placed corridor piece. Yaw 0/2 keeps the X/Z
 * axes; yaw 1/3 swaps them (the window piece is rectangular).
 *
 * @param node - Corridor placement.
 * @returns Axis-aligned bbox in world XZ.
 */
export function corridorBBox(node: CorridorNode): PieceBBox {
  const half = CORRIDOR_HALF_EXTENTS[node.kind]
  const yaw = node.yaw ?? 0
  const swapped = yaw === 1 || yaw === 3
  const hx = swapped ? half.z : half.x
  const hz = swapped ? half.x : half.z
  return {
    id: node.id,
    minX: node.anchor.x - hx,
    maxX: node.anchor.x + hx,
    minZ: node.anchor.z - hz,
    maxZ: node.anchor.z + hz,
  }
}

/**
 * Two bboxes overlap in volume when their X *and* Z ranges both share
 * an interval wider than {@link BBOX_OVERLAP_EPSILON}. Pieces that
 * merely share a port edge land at exactly one axis touching, which
 * this function rejects (interior overlap only).
 *
 * @param a - First bbox.
 * @param b - Second bbox.
 * @returns `true` if the bboxes have positive-area interior overlap.
 */
export function bboxOverlapsInterior(a: PieceBBox, b: PieceBBox): boolean {
  const xOverlap = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)
  const zOverlap = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ)
  return xOverlap > BBOX_OVERLAP_EPSILON && zOverlap > BBOX_OVERLAP_EPSILON
}

/**
 * Validate that two world-space anchors mate cleanly. Ports mate when
 * their anchors coincide and their outward directions are opposite —
 * which is what "two pieces share a doorway" means in world terms.
 *
 * @param a - First port world anchor + outward yaw.
 * @param b - Second port world anchor + outward yaw.
 * @returns `true` when the ports overlap and face opposite directions.
 */
export function portsMate(
  a: { anchor: Vec2; outwardYaw: YawTurns },
  b: { anchor: Vec2; outwardYaw: YawTurns },
): boolean {
  const dx = a.anchor.x - b.anchor.x
  const dz = a.anchor.z - b.anchor.z
  if (Math.hypot(dx, dz) > PORT_MATE_EPSILON) return false
  return (a.outwardYaw + 2) % 4 === b.outwardYaw
}

/** Connection of one corridor port to another piece in the layout. */
export type PortTarget =
  /** Seamless mate to another corridor's port (world-facing side). */
  | { kind: 'corridor'; nodeId: string; worldSide: EntranceSide }
  /** Mates to an entrance owned by a room (room owns the door). */
  | { kind: 'room'; roomId: string; entranceIndex: number }
  /** Terminator: closed-off port shown to the player as an exit hatch. */
  | { kind: 'exit'; prompt: string; event: string }
  /** Terminator: closed-off port rendered as a plain wall cap. */
  | { kind: 'sealed' }

/** Full station layout — rooms plus a corridor graph with port targets. */
export interface StationLayout {
  /** Rooms placed in world coordinates. */
  rooms: RoomSpec[]
  /**
   * Corridor pieces and their port targets. Each entry in `ports` is
   * keyed by the *world-facing* side after the corridor's yaw is applied.
   */
  corridors: Array<CorridorNode & { ports: Partial<Record<EntranceSide, PortTarget>> }>
}

/** Final concrete instruction the Three.js builder consumes for a piece. */
export interface PlacementPlan {
  /** Logical id from the layout. */
  id: string
  /** Asset kind to instantiate. */
  kind: 'room' | CorridorKind
  /** World-XZ centre. */
  anchor: Vec2
  /** Yaw in 90° steps. */
  yaw: YawTurns
}

/**
 * Maximum world-side index for a wall-tile entrance on a given side.
 *
 * @param room - Room placement.
 * @param side - Cardinal side the entrance lives on.
 * @returns Index range `[0, max]`.
 */
function entranceIndexRange(room: RoomSpec, side: EntranceSide): number {
  return side === 'N' || side === 'S' ? room.width : room.depth
}

/**
 * Validate an authored layout. Throws on the first inconsistency — the
 * goal is to make bad layouts fail loudly at load time so the player
 * never walks into a broken station. Checks:
 *
 * 1. **Room entrance indices** are within the relevant wall length.
 * 2. **No duplicate entrance slots** on the same room (`(side, index, storey)`).
 * 3. **Corridor port keys** correspond to native openings (after yaw).
 * 4. **All referenced ids exist** in the layout (rooms + corridors).
 * 5. **Reciprocity** — every declared edge is mirrored on the other side.
 * 6. **Geometric mating** — the anchors authored for the two pieces
 *    actually make the ports line up. Catches anchor typos that would
 *    otherwise produce visible gaps in the level.
 *
 * @param layout - Layout to validate.
 * @throws An `Error` describing the first inconsistency found.
 */
export function validateLayout(layout: StationLayout): void {
  const roomsById = new Map(layout.rooms.map((r) => [r.id, r]))
  const corridorsById = new Map(layout.corridors.map((c) => [c.id, c]))

  // 1 + 2: room entrance sanity.
  for (const room of layout.rooms) {
    const slotSeen = new Set<string>()
    for (let i = 0; i < (room.entrances?.length ?? 0); i++) {
      const e = room.entrances![i]!
      const limit = entranceIndexRange(room, e.side)
      if (e.index < 0 || e.index >= limit) {
        throw new Error(
          `Room ${room.id} entrance #${i}: index ${e.index} out of range [0, ${limit - 1}] for side ${e.side}`,
        )
      }
      const slotKey = `${e.side}:${e.index}:${e.storey ?? 0}`
      if (slotSeen.has(slotKey)) {
        throw new Error(`Room ${room.id} has two entrances at slot ${slotKey}`)
      }
      slotSeen.add(slotKey)
    }
  }

  // 3: corridor port keys must be openings the piece actually has.
  for (const corridor of layout.corridors) {
    const worldPorts = new Set(corridorWorldPorts(corridor))
    for (const side of Object.keys(corridor.ports) as EntranceSide[]) {
      if (!worldPorts.has(side)) {
        throw new Error(
          `Corridor ${corridor.id} declares a port on ${side} but the piece has no opening there`,
        )
      }
    }
  }

  // 4 + 5: id resolution and reciprocity.
  for (const room of layout.rooms) {
    for (let i = 0; i < (room.entrances?.length ?? 0); i++) {
      const e = room.entrances![i]!
      const t = e.target
      if (!t) continue
      if (t.kind === 'corridor') {
        const c = corridorsById.get(t.nodeId)
        if (!c) {
          throw new Error(`Room ${room.id} entrance #${i} targets unknown corridor "${t.nodeId}"`)
        }
        const portTarget = c.ports[t.worldSide]
        if (!portTarget) {
          throw new Error(
            `Room ${room.id} entrance #${i} targets corridor ${c.id} side ${t.worldSide}, but that port is undefined`,
          )
        }
        if (
          portTarget.kind !== 'room' ||
          portTarget.roomId !== room.id ||
          portTarget.entranceIndex !== i
        ) {
          throw new Error(
            `Room ${room.id} entrance #${i} ↔ corridor ${c.id} side ${t.worldSide}: reciprocal mismatch`,
          )
        }
      } else if (t.kind === 'room') {
        const r2 = roomsById.get(t.roomId)
        if (!r2) {
          throw new Error(`Room ${room.id} entrance #${i} targets unknown room "${t.roomId}"`)
        }
        const e2 = r2.entrances?.[t.entranceIndex]
        if (!e2 || e2.target?.kind !== 'room' || e2.target.roomId !== room.id) {
          throw new Error(
            `Room ${room.id} entrance #${i} ↔ room ${r2.id} entrance #${t.entranceIndex}: reciprocal mismatch`,
          )
        }
      }
    }
  }

  for (const corridor of layout.corridors) {
    for (const [side, target] of Object.entries(corridor.ports) as Array<
      [EntranceSide, PortTarget]
    >) {
      if (target.kind === 'corridor') {
        const other = corridorsById.get(target.nodeId)
        if (!other) {
          throw new Error(
            `Corridor ${corridor.id} side ${side} targets unknown corridor "${target.nodeId}"`,
          )
        }
        const otherTarget = other.ports[target.worldSide]
        if (
          !otherTarget ||
          otherTarget.kind !== 'corridor' ||
          otherTarget.nodeId !== corridor.id ||
          otherTarget.worldSide !== side
        ) {
          throw new Error(
            `Corridor ${corridor.id} side ${side} ↔ corridor ${other.id} side ${target.worldSide}: reciprocal mismatch`,
          )
        }
      } else if (target.kind === 'room') {
        const room = roomsById.get(target.roomId)
        if (!room) {
          throw new Error(
            `Corridor ${corridor.id} side ${side} targets unknown room "${target.roomId}"`,
          )
        }
        const entrance = room.entrances?.[target.entranceIndex]
        if (
          !entrance ||
          entrance.target?.kind !== 'corridor' ||
          entrance.target.nodeId !== corridor.id ||
          entrance.target.worldSide !== side
        ) {
          throw new Error(
            `Corridor ${corridor.id} side ${side} ↔ room ${room.id} entrance #${target.entranceIndex}: reciprocal mismatch`,
          )
        }
      }
    }
  }

  // 6: no-overlap — every pair of pieces (rooms + corridors) must have
  // axis-aligned bboxes that at worst share an edge.
  const bboxes: PieceBBox[] = [...layout.rooms.map(roomBBox), ...layout.corridors.map(corridorBBox)]
  for (let i = 0; i < bboxes.length; i++) {
    for (let j = i + 1; j < bboxes.length; j++) {
      if (bboxOverlapsInterior(bboxes[i]!, bboxes[j]!)) {
        throw new Error(
          `Pieces ${bboxes[i]!.id} and ${bboxes[j]!.id} have overlapping bounding boxes — they would render on top of each other`,
        )
      }
    }
  }

  // 7: geometric mating — declared anchors must produce port anchors
  // that actually meet in world space and face opposite directions.
  for (const corridor of layout.corridors) {
    for (const [side, target] of Object.entries(corridor.ports) as Array<
      [EntranceSide, PortTarget]
    >) {
      const myPort = corridorPortWorldAnchor(corridor, side)
      if (!myPort) continue // already caught by check #3
      if (target.kind === 'corridor') {
        const other = corridorsById.get(target.nodeId)!
        const otherPort = corridorPortWorldAnchor(other, target.worldSide)
        if (!otherPort || !portsMate(myPort, otherPort)) {
          throw new Error(
            `Corridor ${corridor.id} side ${side} does not geometrically mate with corridor ${other.id} side ${target.worldSide} — check anchors/yaws`,
          )
        }
      } else if (target.kind === 'room') {
        const room = roomsById.get(target.roomId)!
        const entrance = room.entrances![target.entranceIndex]!
        const entrancePort = roomEntranceWorldAnchor(room, entrance)
        if (!portsMate(myPort, entrancePort)) {
          throw new Error(
            `Corridor ${corridor.id} side ${side} does not geometrically mate with room ${room.id} entrance #${target.entranceIndex} — check anchors/yaws`,
          )
        }
      }
    }
  }
}

/**
 * Walk a layout into a flat placement plan. Runs {@link validateLayout}
 * first so callers get loud errors instead of silently broken stations.
 *
 * @param layout - Static layout to resolve.
 * @returns Placement records in declaration order.
 * @throws If validation fails (see {@link validateLayout}).
 */
export function resolveLayout(layout: StationLayout): PlacementPlan[] {
  validateLayout(layout)

  const out: PlacementPlan[] = []

  for (const room of layout.rooms) {
    out.push({ id: room.id, kind: 'room', anchor: room.anchor, yaw: room.yaw ?? 0 })
  }

  for (const corridor of layout.corridors) {
    out.push({
      id: corridor.id,
      kind: corridor.kind,
      anchor: corridor.anchor,
      yaw: corridor.yaw ?? 0,
    })
  }

  return out
}
