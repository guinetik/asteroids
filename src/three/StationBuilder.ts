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
  StationLayout,
  YawTurns,
} from '@/lib/station/StationLayout'
import {
  CORRIDOR_HALF_EXTENTS,
  corridorPortWorldAnchor,
} from '@/lib/station/StationLayout'
import type { StationFloor } from '@/lib/station/StationCollider'

/** Per-piece GLB urls. */
const CORRIDOR_URL: Readonly<Record<CorridorKind, string>> = {
  cross: '/models/station/pieces/corridor.glb',
  corner: '/models/station/pieces/corridor_corner.glb',
  window: '/models/station/pieces/corridor_window.glb',
  straight: '/models/station/pieces/corridor_straight.glb',
}

/** Per-piece ceiling/roof GLB urls. */
const ROOF_URL: Readonly<Record<CorridorKind, string>> = {
  cross: '/models/station/pieces/roof_corridor.glb',
  corner: '/models/station/pieces/roof_corridor_corner.glb',
  window: '/models/station/pieces/roof_corridor_window.glb',
  // No dedicated roof for the straight piece yet — reuse the cross roof
  // (it's wider than the straight corridor; player won't notice unless
  // they look up at the seams). Replace when a matching asset ships.
  straight: '/models/station/pieces/roof_corridor.glb',
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
/** Floor surface Y (shared with the room builder). */
const STATION_FLOOR_Y = 0.25
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
  group.add(floor)

  const roof = roofSrc.clone(true)
  roof.position.y = CORRIDOR_ROOF_CENTER_Y
  group.add(roof)

  return group
}

/**
 * Compute the axis-aligned floor rectangle for a corridor piece in
 * world coordinates. Accounts for the X/Z swap when the piece is
 * rotated by an odd number of 90° turns (window is rectangular).
 *
 * @param node - Corridor placement description.
 * @returns Floor rectangle with `y = STATION_FLOOR_Y`.
 */
function corridorFloorRect(node: CorridorNode): StationFloor {
  const half = CORRIDOR_HALF_EXTENTS[node.kind]
  const yaw = node.yaw ?? 0
  const swapped = yaw === 1 || yaw === 3
  const hx = swapped ? half.z : half.x
  const hz = swapped ? half.x : half.z
  return {
    minX: node.anchor.x - hx,
    maxX: node.anchor.x + hx,
    minZ: node.anchor.z - hz,
    maxZ: node.anchor.z + hz,
    y: STATION_FLOOR_Y,
  }
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
    floors.push(corridorFloorRect(corridor))

    if (!entranceSrc || !doorSrc) continue
    for (const [side, target] of Object.entries(corridor.ports)) {
      if (target.kind !== 'exit') continue
      const portWorld = corridorPortWorldAnchor(
        corridor,
        side as 'N' | 'S' | 'E' | 'W',
      )
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

  return { group, entrances, floors }
}
