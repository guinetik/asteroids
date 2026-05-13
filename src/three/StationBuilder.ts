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
import { Group } from 'three'
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
  ROOM_WALL_OUTER_FACE_OFFSET,
  corridorPortWorldAnchor,
  rotateVec2,
} from '@/lib/station/StationLayout'
import { roomEntranceWorldAnchor, type PortTarget } from '@/lib/station/StationLayout'
import type { StationFloor, StationRect } from '@/lib/station/StationCollider'

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
/** Entrance piece URL — reused for corridor exit caps. */
const ENTRANCE_URL = '/models/station/pieces/entrance.glb'
/** Door piece URL — reused for corridor exit caps. */
const DOOR_URL = '/models/station/pieces/door.glb'

// Door-cap placement constants. Kept in sync with `StationRoomBuilder`
// so corridor exit caps read identically to room entrances.
/** Outward push from the corridor port toward the world exterior. */
const EXIT_CAP_PUSH = 0.85
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
 * Result of {@link buildStation}: scene group, runtime entrances, and
 * the collider rectangles that make every piece's footprint walkable.
 */
export interface BuiltStation {
  /** Root group containing every room + corridor piece. */
  group: Group
  /** Runtime entrance instances aggregated across every room. */
  entrances: StationEntrance[]
  /** Walkable floor rectangles, one per room + one per corridor. */
  floors: StationFloor[]
  /** Walkable seam rectangles between connected room / corridor pieces. */
  passages: StationRect[]
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
 * Build the entire station from a validated layout.
 *
 * @param layout - Validated station layout.
 * @returns Scene group + entrances + collider rects.
 */
export async function buildStation(layout: StationLayout): Promise<BuiltStation> {
  const group = new Group()
  group.name = 'Station'
  const entrances: StationEntrance[] = []
  const floors: StationFloor[] = []
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

    floors.push({
      minX: room.anchor.x - result.halfWidth,
      maxX: room.anchor.x + result.halfWidth,
      minZ: room.anchor.z - result.halfDepth,
      maxZ: room.anchor.z + result.halfDepth,
      y: STATION_FLOOR_Y,
    })
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

  return { group, entrances, floors, passages }
}
