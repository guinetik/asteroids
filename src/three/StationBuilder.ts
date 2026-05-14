/**
 * Builds a whole station from a {@link StationLayout}: walks the
 * placement plan, instantiates one room per `RoomSpec` (via
 * {@link buildStationRoom}) and one corridor piece per `CorridorNode`,
 * stitches them into a single group, and returns the entrance list +
 * collider rectangles for the controller.
 *
 * Room + corridor placement uses the world anchor and yaw declared in
 * the layout; the layout-math layer has already validated that those
 * anchors mate cleanly.
 *
 * @author guinetik
 * @date 2026-05-13
 */
import { Group, Mesh, Vector3, type Material } from 'three'
import { loadGLB } from '@/three/loadGLB'
import { buildStationRoom, type StationRoom } from '@/three/StationRoomBuilder'
import { StationEntrance } from '@/three/StationEntrance'
import type {
  CorridorKind,
  CorridorNode,
  EntranceSide,
  StationLayout,
  YawTurns,
} from '@/lib/station/StationLayout'
import {
  CORRIDOR_HALF_EXTENTS,
  ROOM_TILE_SIZE,
  ROOM_WALL_OUTER_FACE_OFFSET,
  corridorPortWorldAnchor,
  rotateVec2,
} from '@/lib/station/StationLayout'
import type { EntranceSpec, RoomSpec } from '@/lib/station/StationLayout'
import { roomEntranceWorldAnchor, type PortTarget } from '@/lib/station/StationLayout'
import type { StationFloor, StationRect } from '@/lib/station/StationCollider'
import {
  createStationProp,
  defaultPropScale,
  rollReward,
  type PropInteractorMeta,
  type StationPropInstance,
} from '@/three/stationProps'
import type { RoomPropSpec } from '@/lib/station/StationLayout'

/** Per-piece GLB urls. */
const CORRIDOR_URL: Readonly<Record<CorridorKind, string>> = {
  cross: '/models/station/pieces/corridor_C.glb',
  corner: '/models/station/pieces/corridor_L.glb',
  window: '/models/station/pieces/corridor_T.glb',
  straight: '/models/station/pieces/corridor.glb',
}

/** Per-piece ceiling/roof GLB urls. */
const ROOF_URL: Readonly<Record<CorridorKind, string>> = {
  cross: '/models/station/pieces/roof_corridor.glb',
  corner: '/models/station/pieces/roof_corridor_corner.glb',
  window: '/models/station/pieces/roof_corridor_window.glb',
  straight: '/models/station/pieces/roof_entrance.glb',
}

/**
 * Wall-piece height in world units — shared with the room builder so
 * corridor roofs sit at the same ceiling Y.
 */
const WALL_HEIGHT = 2.93
/** Y centre for the corridor floor+walls piece (its bbox half-height). */
const CORRIDOR_FLOOR_CENTER_Y = WALL_HEIGHT / 2
/** Y centre for the corridor roof piece (just above the wall top). */
const CORRIDOR_ROOF_CENTER_Y = WALL_HEIGHT
/** Visual scale applied along straight corridors' long local axis to hide seams. */
const STRAIGHT_CORRIDOR_LENGTH_SCALE = 1.025
/** Small roof drop for straight corridors so ceiling seams do not expose space. */
const STRAIGHT_CORRIDOR_ROOF_DROP = 0.08
/** Floor surface Y (shared with the room builder). */
const STATION_FLOOR_Y = 0.25
/**
 * Local-space nudge for the L corridor asset. Its visible port markers
 * are slightly off the logical bbox centerline; shifting the clone keeps
 * marker seams aligned without changing graph validation anchors.
 */
const CORNER_VISUAL_ALIGNMENT_OFFSET = 0.21
/**
 * Local-space nudge for the T corridor asset. Its central floor-panel
 * markers sit slightly behind the logical port centerline along the stem;
 * shifting the clone keeps the visible seams aligned without changing
 * layout math.
 */
const WINDOW_VISUAL_ALIGNMENT_OFFSET = 0.21
/** Entrance piece URL — reused for corridor exit caps. */
const ENTRANCE_URL = '/models/station/pieces/entrance.glb'
/** Door piece URL — reused for corridor exit caps. */
const DOOR_URL = '/models/station/pieces/door.glb'

// Door-cap placement constants. Kept in sync with `StationRoomBuilder`
// so corridor exit caps read identically to room entrances.
/**
 * Outward push from the corridor port toward the world exterior. Kept
 * in lock-step with `StationRoomBuilder`'s `ENTRANCE_PUSH` so the
 * station's exit hatch seats flush against the corridor port plane —
 * larger values open a visible black gap behind the door frame.
 */
const EXIT_CAP_PUSH = 0.1
/** Vertical raise of the cap slot above the port-Y. */
const EXIT_CAP_RAISE = 0.2
/** Door child Y offset within the slot. */
const DOOR_LOCAL_Y = -0.1
/** Door child Z offset within the slot. */
const DOOR_LOCAL_Z = -0.55
/** Hinge offset along the door's local X so it pivots around its edge. */
const DOOR_HINGE_OFFSET_X = -0.65
/** Half-width of walkable seams between connected station pieces. */
const PASSAGE_HALF_WIDTH = 1
/** Half-depth of passage rectangles across a shared edge. */
const PASSAGE_HALF_DEPTH = 0.45
/** Extra depth needed to carry room doorway passages through rendered wall thickness. */
const ROOM_PASSAGE_HALF_DEPTH = ROOM_WALL_OUTER_FACE_OFFSET + PASSAGE_HALF_DEPTH
/** Half-width of a corridor arm, reused to make corner collision L-shaped. */
const CORRIDOR_ARM_HALF_WIDTH = CORRIDOR_HALF_EXTENTS.straight.x
/**
 * Opacity applied at runtime to GLB materials whose name contains "glass".
 * The asset author tagged window panes with a `Glass`-prefixed material, but
 * the glTF compression toolchain dropped `alphaMode: BLEND`, leaving them
 * rendering opaque-black. Re-applying transparency in {@link patchGlassTransparency}
 * keeps the fix in code so we do not need an art re-export every time pieces
 * are recompressed.
 */
const GLASS_OPACITY = 0.18

/**
 * Result of {@link buildStation}: scene group, runtime entrances, and
 * the collider rectangles that make every piece's footprint walkable.
 */
/**
 * A prop's F-prompt interaction point. The controller iterates these
 * each frame and surfaces the closest in-range prompt; pressing the
 * interact key dispatches the event through the standard `onInteract`
 * callback (same channel entrances already use).
 */
export interface PropInteractor {
  /** World-space XZ centre used for proximity tests. Y is the floor Y. */
  anchor: Vector3
  /** HUD prompt shown while the player is in range. */
  prompt: string
  /** Event id dispatched to the controller's `onInteract` callback. */
  event: string
  /** Back-reference to the prop instance so consumers can flip status / colour. */
  prop: StationPropInstance
  /** When true, the controller skips this interactor (consumed / one-shot). */
  disabled: boolean
  /** Optional metadata the UI can preview (e.g. chest loot payload). */
  meta: PropInteractorMeta | null
}

export interface BuiltStation {
  /** Root group containing every room + corridor piece. */
  group: Group
  /** Runtime entrance instances aggregated across every room. */
  entrances: StationEntrance[]
  /** Walkable floor rectangles, one per room + one per corridor. */
  floors: StationFloor[]
  /** Walkable seam rectangles between connected room / corridor pieces. */
  passages: StationRect[]
  /** In-room props (terminals, etc.) the controller ticks + disposes. */
  props: StationPropInstance[]
  /**
   * World-space lateral blockers contributed by props that declared a
   * `localFootprint`. Static for a given station load (props don't move),
   * so the controller can union them with door blockers each frame.
   */
  propBlockers: StationRect[]
  /** F-prompt interaction points declared by props. */
  interactors: PropInteractor[]
  /** Hazardous floor regions sampled per-tick for damage application. */
  hazards: StationHazard[]
}

/** A hazardous floor rectangle the controller polls each tick. */
export interface StationHazard {
  /** Hazard kind. Currently only `'lava'`. */
  kind: 'lava'
  /** World-space XZ rectangle the player must avoid. */
  rect: StationRect
}

/**
 * Place a corridor piece at its layout anchor + yaw. Trusts the GLB
 * origin: whatever the asset author set as the model pivot is what the
 * layout maths sees as the piece centre, so authoring tweaks (e.g.
 * moving a corner's elbow off the bbox centre to fix port alignment)
 * survive into the runtime.
 *
 * @param node - Corridor placement description.
 * @returns Group containing the corridor's floor + roof clones.
 */
async function placeCorridor(node: CorridorNode): Promise<Group> {
  const [floorSrc, roofSrc] = await Promise.all([
    loadGLB(CORRIDOR_URL[node.kind]),
    loadGLB(ROOF_URL[node.kind]),
  ])
  const yaw = (node.yaw ?? 0) as YawTurns

  const group = new Group()
  group.name = `corridor-${node.id}`
  group.position.set(node.anchor.x, 0, node.anchor.z)
  group.rotation.y = (yaw * Math.PI) / 2

  const floor = floorSrc.clone(true)
  floor.position.y = CORRIDOR_FLOOR_CENTER_Y
  if (node.kind === 'straight') {
    floor.scale.z = STRAIGHT_CORRIDOR_LENGTH_SCALE
  }
  if (node.kind === 'corner') {
    floor.position.x = -CORNER_VISUAL_ALIGNMENT_OFFSET
    floor.position.z = -CORNER_VISUAL_ALIGNMENT_OFFSET
  }
  if (node.kind === 'window') {
    floor.position.z = -WINDOW_VISUAL_ALIGNMENT_OFFSET
  }
  group.add(floor)

  const roof = roofSrc.clone(true)
  roof.position.y = CORRIDOR_ROOF_CENTER_Y
  if (node.kind === 'straight') {
    roof.position.y -= STRAIGHT_CORRIDOR_ROOF_DROP
    roof.scale.z = STRAIGHT_CORRIDOR_LENGTH_SCALE
  }
  if (node.kind === 'corner') {
    roof.position.x = -CORNER_VISUAL_ALIGNMENT_OFFSET
    roof.position.z = -CORNER_VISUAL_ALIGNMENT_OFFSET
  }
  if (node.kind === 'window') {
    roof.position.z = -WINDOW_VISUAL_ALIGNMENT_OFFSET
  }
  group.add(roof)

  return group
}

/**
 * Convert a local corridor floor rectangle into world coordinates.
 *
 * @param node - Corridor placement description whose anchor/yaw transform the rect.
 * @param rect - Local XZ rectangle around the corridor's origin.
 * @returns Floor rectangle with `y = STATION_FLOOR_Y`.
 */
function localCorridorFloorRect(node: CorridorNode, rect: StationRect): StationFloor {
  const yaw = node.yaw ?? 0
  const corners = [
    rotateVec2({ x: rect.minX, z: rect.minZ }, yaw),
    rotateVec2({ x: rect.maxX, z: rect.minZ }, yaw),
    rotateVec2({ x: rect.minX, z: rect.maxZ }, yaw),
    rotateVec2({ x: rect.maxX, z: rect.maxZ }, yaw),
  ]
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const corner of corners) {
    minX = Math.min(minX, node.anchor.x + corner.x)
    maxX = Math.max(maxX, node.anchor.x + corner.x)
    minZ = Math.min(minZ, node.anchor.z + corner.z)
    maxZ = Math.max(maxZ, node.anchor.z + corner.z)
  }
  return { minX, maxX, minZ, maxZ, y: STATION_FLOOR_Y }
}

/**
 * Compute walkable floor rectangles for a corridor piece in world coordinates.
 *
 * @param node - Corridor placement description.
 * @returns Floor rectangles with `y = STATION_FLOOR_Y`.
 */
function corridorFloorRects(node: CorridorNode): StationFloor[] {
  const half = CORRIDOR_HALF_EXTENTS[node.kind]
  if (node.kind === 'corner') {
    return [
      localCorridorFloorRect(node, {
        minX: -CORRIDOR_ARM_HALF_WIDTH,
        maxX: CORRIDOR_ARM_HALF_WIDTH,
        minZ: -half.z,
        maxZ: CORRIDOR_ARM_HALF_WIDTH,
      }),
      localCorridorFloorRect(node, {
        minX: -half.x,
        maxX: CORRIDOR_ARM_HALF_WIDTH,
        minZ: -CORRIDOR_ARM_HALF_WIDTH,
        maxZ: CORRIDOR_ARM_HALF_WIDTH,
      }),
    ]
  }

  return [
    localCorridorFloorRect(node, {
      minX: -half.x,
      maxX: half.x,
      minZ: -half.z,
      maxZ: half.z,
    }),
  ]
}

/**
 * Build a walkable seam rectangle centred on a port anchor.
 *
 * @param anchor - World-space port anchor.
 * @param outwardYaw - Port outward direction.
 * @returns Passage rectangle crossing the shared edge.
 */
function passageRectForPort(
  anchor: { x: number; z: number },
  outwardYaw: YawTurns,
  halfDepth = PASSAGE_HALF_DEPTH,
): StationRect {
  const northSouth = outwardYaw === 0 || outwardYaw === 2
  if (northSouth) {
    return {
      minX: anchor.x - PASSAGE_HALF_WIDTH,
      maxX: anchor.x + PASSAGE_HALF_WIDTH,
      minZ: anchor.z - halfDepth,
      maxZ: anchor.z + halfDepth,
    }
  }
  return {
    minX: anchor.x - halfDepth,
    maxX: anchor.x + halfDepth,
    minZ: anchor.z - PASSAGE_HALF_WIDTH,
    maxZ: anchor.z + PASSAGE_HALF_WIDTH,
  }
}

/**
 * Build passage rectangles from explicit layout connections.
 *
 * @param layout - Station layout graph.
 * @returns Walkable rectangles spanning all connected ports.
 */
function buildPassages(layout: StationLayout): StationRect[] {
  const roomsById = new Map(layout.rooms.map((room) => [room.id, room]))
  const passages: StationRect[] = []
  const seen = new Set<string>()

  const addPassage = (
    key: string,
    port: { anchor: { x: number; z: number }; outwardYaw: YawTurns } | null,
    halfDepth = PASSAGE_HALF_DEPTH,
  ): void => {
    if (!port || seen.has(key)) return
    seen.add(key)
    passages.push(passageRectForPort(port.anchor, port.outwardYaw, halfDepth))
  }

  for (const corridor of layout.corridors) {
    for (const [side, target] of Object.entries(corridor.ports) as Array<
      [EntranceSide, PortTarget]
    >) {
      if (target.kind === 'corridor') {
        const ids = [corridor.id, target.nodeId].sort().join(':')
        const sides = [side, target.worldSide].sort().join(':')
        addPassage(`corridor:${ids}:${sides}`, corridorPortWorldAnchor(corridor, side))
        continue
      }
      if (target.kind === 'room') {
        const room = roomsById.get(target.roomId)
        const entrance = room?.entrances?.[target.entranceIndex]
        const corridorPort = corridorPortWorldAnchor(corridor, side)
        if (!room || !entrance || !corridorPort) continue
        const roomPort = roomEntranceWorldAnchor(room, entrance)
        addPassage(
          `room:${target.roomId}:${target.entranceIndex}:corridor:${corridor.id}:${side}`,
          roomPort,
          ROOM_PASSAGE_HALF_DEPTH,
        )
      }
    }
  }

  return passages
}

/**
 * Build an exit cap (entrance frame + hinged door) at a corridor port.
 * Used for ports declared as `kind: 'exit'` — the player sees a real
 * door instead of an open hole into the void.
 *
 * @param portAnchor - Port world XZ.
 * @param outwardYaw - Outward direction of the port as a {@link YawTurns}.
 * @param prompt - Prompt text shown when in range.
 * @param event - Event id dispatched on interact.
 * @param entranceSrc - Pre-loaded entrance GLB.
 * @param doorSrc - Pre-loaded door GLB.
 * @returns Scene group containing the frame + door, plus the runtime
 *   {@link StationEntrance} instance for the controller.
 */
function placeExitCap(
  portAnchor: { x: number; z: number },
  outwardYaw: YawTurns,
  prompt: string,
  event: string,
  entranceSrc: Group,
  doorSrc: Group,
): { group: Group; entrance: StationEntrance } {
  // Outward unit vector + per-side yaw for the entrance frame.
  const outwardAngle = outwardYaw * (Math.PI / 2)
  const outwardX = Math.sin(outwardAngle)
  const outwardZ = Math.cos(outwardAngle)
  const slotX = portAnchor.x + outwardX * EXIT_CAP_PUSH
  const slotZ = portAnchor.z + outwardZ * EXIT_CAP_PUSH
  // Frame's natural opening points -Z; rotate so it faces opposite the
  // outward direction (into the corridor interior).
  const entranceYawRad = (((outwardYaw + 2) % 4) * Math.PI) / 2

  const slot = new Group()
  slot.position.set(slotX, WALL_HEIGHT / 2 + EXIT_CAP_RAISE, slotZ)
  slot.rotation.y = entranceYawRad

  const entrance = entranceSrc.clone(true)
  slot.add(entrance)

  const hinge = new Group()
  hinge.position.set(DOOR_HINGE_OFFSET_X, DOOR_LOCAL_Y, DOOR_LOCAL_Z)
  const door = doorSrc.clone(true)
  door.position.set(-DOOR_HINGE_OFFSET_X, 0, 0)
  hinge.add(door)
  slot.add(hinge)

  const entranceInst = new StationEntrance(slot, prompt, event, hinge, 'crack')
  return { group: slot, entrance: entranceInst }
}

/**
 * Restore transparency on any GLB material whose name marks it as window
 * glass. Targets materials named `Glass*` (case-insensitive); other materials
 * are untouched. Run on the assembled station group after every piece has
 * been cloned in so a single traversal covers corridors + room walls.
 *
 * @param group - Scene group to traverse.
 */
function patchGlassTransparency(group: Group): void {
  group.traverse((child) => {
    if (!(child instanceof Mesh)) return
    const mats: Material[] = Array.isArray(child.material) ? child.material : [child.material]
    for (const mat of mats) {
      if (!mat || !mat.name.toLowerCase().includes('glass')) continue
      mat.transparent = true
      mat.opacity = GLASS_OPACITY
      mat.depthWrite = false
      mat.needsUpdate = true
    }
  })
}

/**
 * Build the entire station from a validated layout.
 *
 * @param layout - Validated station layout.
 * @returns Scene group + entrances + collider rects.
 */
/**
 * Tile index of an entrance along its wall, projected onto the
 * `(col, row)` grid the room is built on. Wall `'N'`/`'S'` entrances
 * sit at a known `col` and at the room's north/south extreme `row`;
 * `'E'`/`'W'` entrances at a known `row` and east/west extreme `col`.
 *
 * @param room - Room placement.
 * @param entrance - One of the room's entrances.
 * @returns The `(col, row)` tile pair the entrance opens into.
 */
function entranceInnerTile(
  room: RoomSpec,
  entrance: EntranceSpec,
): { col: number; row: number } {
  switch (entrance.side) {
    case 'N':
      return { col: entrance.index, row: room.depth - 1 }
    case 'S':
      return { col: entrance.index, row: 0 }
    case 'E':
      return { col: room.width - 1, row: entrance.index }
    case 'W':
      return { col: 0, row: entrance.index }
  }
}

/**
 * Fraction of the maximum entrance distance below which a tile is
 * considered "too close to a door" for random prop placement. With the
 * default `0.5`, tiles in the entrance-half of the room are filtered
 * out and the picker only draws from the far half.
 */
const RANDOM_PLACEMENT_MIN_DOOR_DISTANCE_FRACTION = 0.5

/**
 * Pick a uniformly random tile centre inside a room, biased toward the
 * far end relative to its entrances. Tiles directly inside an entrance
 * and any tiles already picked this session are excluded.
 *
 * Returns local XZ in the room's pre-yaw frame so the existing prop
 * transform pipeline still applies room.yaw on top.
 *
 * @param room - Room to sample from.
 * @param used - Mutable set of `"col:row"` keys already claimed; this
 *   call adds its pick to the set.
 * @returns Local-frame `[x, z]` tile centre, or `null` if every tile is
 *   blocked (defensive — only happens for pathological tiny rooms).
 */
function pickRandomInnerTile(
  room: RoomSpec,
  used: Set<string>,
): [number, number] | null {
  const entranceTiles = (room.entrances ?? []).map((e) => entranceInnerTile(room, e))
  const blocked = new Set(entranceTiles.map((t) => `${t.col}:${t.row}`))
  const candidates: Array<{ col: number; row: number; dist: number; key: string }> = []
  for (let col = 0; col < room.width; col++) {
    for (let row = 0; row < room.depth; row++) {
      const key = `${col}:${row}`
      if (blocked.has(key) || used.has(key)) continue
      let nearest = Infinity
      for (const t of entranceTiles) {
        const d = Math.abs(col - t.col) + Math.abs(row - t.row)
        if (d < nearest) nearest = d
      }
      candidates.push({ col, row, dist: nearest, key })
    }
  }
  if (candidates.length === 0) return null
  const maxDist = candidates.reduce((acc, c) => Math.max(acc, c.dist), 0)
  const threshold = Math.ceil(maxDist * RANDOM_PLACEMENT_MIN_DOOR_DISTANCE_FRACTION)
  const farTiles = candidates.filter((c) => c.dist >= threshold)
  const pool = farTiles.length > 0 ? farTiles : candidates
  const pick = pool[Math.floor(Math.random() * pool.length)]!
  used.add(pick.key)
  const x = (pick.col - (room.width - 1) / 2) * ROOM_TILE_SIZE
  const z = (pick.row - (room.depth - 1) / 2) * ROOM_TILE_SIZE
  return [x, z]
}

/**
 * Synthesize chest {@link RoomPropSpec}s from a room's authored
 * `rewards`. Each entry rolls its own item + quantity, picks a random
 * tile (distinct from already-occupied tiles, the entrance, and tiles
 * used by previous rewards), and assigns a stable `chest:open:<roomId>-<n>`
 * event id so the UI layer can target it.
 *
 * @param room - Room owning the reward slots.
 * @param used - Mutable tile-claim set, shared with authored props.
 * @returns The synthesised prop specs (one per resolved reward).
 */
function synthesizeRewardChests(
  room: RoomSpec,
  used: Set<string>,
): RoomPropSpec[] {
  if (!room.rewards || room.rewards.length === 0) return []
  const out: RoomPropSpec[] = []
  const pickedItemIds = new Set<string>()
  for (let i = 0; i < room.rewards.length; i++) {
    const reward = room.rewards[i]!
    const roll = rollReward(reward, pickedItemIds)
    if (!roll) continue
    pickedItemIds.add(roll.itemId)
    const pos = pickRandomInnerTile(room, used)
    if (!pos) continue
    out.push({
      kind: 'chest',
      pos,
      loot: { itemId: roll.itemId, qtyMin: roll.quantity, qtyMax: roll.quantity },
      interact: {
        prompt: 'F  Open Chest',
        event: `chest:open:${room.id}-${i + 1}`,
      },
    })
  }
  return out
}

export async function buildStation(layout: StationLayout): Promise<BuiltStation> {
  const group = new Group()
  group.name = 'Station'
  const entrances: StationEntrance[] = []
  const floors: StationFloor[] = []
  const props: StationPropInstance[] = []
  const propBlockers: StationRect[] = []
  const interactors: PropInteractor[] = []
  const hazards: StationHazard[] = []
  const passages = buildPassages(layout)

  // Rooms — reuse the existing parametric builder, then wrap in a
  // world-transform group so anchors + yaws are applied uniformly.
  const roomResults: Array<{ result: StationRoom; anchor: { x: number; z: number } }> = []
  for (const room of layout.rooms) {
    const result = await buildStationRoom({
      width: room.width,
      depth: room.depth,
      height: room.height,
      entrances: room.entrances?.map((e) => ({ ...e })),
    })
    const wrapper = new Group()
    wrapper.name = `room-${room.id}`
    wrapper.position.set(room.anchor.x, 0, room.anchor.z)
    wrapper.rotation.y = ((room.yaw ?? 0) * Math.PI) / 2
    wrapper.add(result.group)
    group.add(wrapper)
    entrances.push(...result.entrances)
    roomResults.push({ result, anchor: room.anchor })

    const floorRect: StationFloor = {
      minX: room.anchor.x - result.halfWidth,
      maxX: room.anchor.x + result.halfWidth,
      minZ: room.anchor.z - result.halfDepth,
      maxZ: room.anchor.z + result.halfDepth,
      y: STATION_FLOOR_Y,
    }
    floors.push(floorRect)
    if (room.hazard === 'lava') {
      hazards.push({
        kind: 'lava',
        rect: {
          minX: floorRect.minX,
          maxX: floorRect.maxX,
          minZ: floorRect.minZ,
          maxZ: floorRect.maxZ,
        },
      })
    }

    // Shared tile-claim ledger so authored random-placement props and
    // reward-synthesized chests never land on the same tile.
    const claimedTiles = new Set<string>()
    const propSpecs: RoomPropSpec[] = [
      ...(room.props ?? []),
      ...synthesizeRewardChests(room, claimedTiles),
    ]
    for (const propSpec of propSpecs) {
      const prop = createStationProp(propSpec.kind)
      const resolvedPos =
        propSpec.placement === 'random' ? pickRandomInnerTile(room, claimedTiles) : null
      const [localX, localZ] = resolvedPos ?? propSpec.pos ?? [0, 0]
      const scale = propSpec.scale ?? defaultPropScale(propSpec.kind)
      const propYaw = (propSpec.yaw ?? 0) as YawTurns
      prop.group.position.set(localX, STATION_FLOOR_Y, localZ)
      prop.group.rotation.y = (propYaw * Math.PI) / 2
      prop.group.scale.setScalar(scale)
      wrapper.add(prop.group)
      props.push(prop)

      // Generic prop collider: fold room.yaw + propSpec.yaw into the
      // local footprint, scale it, and emit a world-space blocker rect.
      // Static for the lifetime of the station — props don't move.
      const roomYaw = (room.yaw ?? 0) as YawTurns
      const worldCenter = rotateVec2({ x: localX, z: localZ }, roomYaw)
      const worldX = room.anchor.x + worldCenter.x
      const worldZ = room.anchor.z + worldCenter.z
      const footprint = prop.localFootprint
      if (footprint) {
        const combinedYaw = ((roomYaw + propYaw) % 4) as YawTurns
        const isPerpendicular = combinedYaw === 1 || combinedYaw === 3
        const halfX = (isPerpendicular ? footprint.halfZ : footprint.halfX) * scale
        const halfZ = (isPerpendicular ? footprint.halfX : footprint.halfZ) * scale
        propBlockers.push({
          minX: worldX - halfX,
          maxX: worldX + halfX,
          minZ: worldZ - halfZ,
          maxZ: worldZ + halfZ,
        })
      }

      if (propSpec.interact) {
        let meta: PropInteractorMeta | null = null
        if (propSpec.loot) {
          const span = Math.max(0, propSpec.loot.qtyMax - propSpec.loot.qtyMin)
          const quantity = propSpec.loot.qtyMin + Math.floor(Math.random() * (span + 1))
          meta = { kind: 'loot', itemId: propSpec.loot.itemId, quantity }
        }
        interactors.push({
          anchor: new Vector3(worldX, STATION_FLOOR_Y, worldZ),
          prompt: propSpec.interact.prompt,
          event: propSpec.interact.event,
          prop,
          disabled: false,
          meta,
        })
      }
    }
  }

  // Pre-load entrance + door GLBs once if any corridor declares an
  // exit port — the cap renderer needs them.
  const needsExitCap = layout.corridors.some((c) =>
    Object.values(c.ports).some((t) => t.kind === 'exit'),
  )
  const [entranceSrc, doorSrc] = needsExitCap
    ? await Promise.all([loadGLB(ENTRANCE_URL), loadGLB(DOOR_URL)])
    : [null, null]

  // Corridors.
  for (const corridor of layout.corridors) {
    const piece = await placeCorridor(corridor)
    group.add(piece)
    floors.push(...corridorFloorRects(corridor))

    if (!entranceSrc || !doorSrc) continue
    for (const [side, target] of Object.entries(corridor.ports)) {
      if (target.kind !== 'exit') continue
      const portWorld = corridorPortWorldAnchor(corridor, side as 'N' | 'S' | 'E' | 'W')
      if (!portWorld) continue
      const cap = placeExitCap(
        portWorld.anchor,
        portWorld.outwardYaw,
        target.prompt,
        target.event,
        entranceSrc,
        doorSrc,
      )
      group.add(cap.group)
      entrances.push(cap.entrance)
    }
  }

  patchGlassTransparency(group)
  return { group, entrances, floors, passages, props, propBlockers, interactors, hazards }
}
