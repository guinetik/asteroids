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
import {
  Group,
  Mesh,
  PlaneGeometry,
  Vector3,
  type Material,
  type ShaderMaterial,
} from 'three'
import { generateSafePath, type MazeMap, type Tile } from '@/lib/station/safePath'
import { createTronHologramMaterial } from '@/three/tronHologramMaterial'
import { loadGLB } from '@/three/loadGLB'
import { buildStationRoom, type StationRoom } from '@/three/StationRoomBuilder'
import { StationEntrance } from '@/three/StationEntrance'
import type {
  CorridorKind,
  CorridorNode,
  EntranceSide,
  StationLayout,
  StationTheme,
  YawTurns,
} from '@/lib/station/StationLayout'
import {
  CORRIDOR_HALF_EXTENTS,
  CORRIDOR_NATIVE_PORTS,
  ROOM_TILE_SIZE,
  ROOM_WALL_OUTER_FACE_OFFSET,
  corridorPortWorldAnchor,
  nativePortAnchor,
  rotateSide,
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
import { autoFurnishRoom, type AuthoredPropSummary } from '@/lib/station/autoFurnish'

/** Per-station gate for the procedural auto-furnish pass. */
const AUTO_FURNISH_ENABLED = true

/** Room ids that opt into the auto-furnish pass. Wider rollout follows visual tuning. */
const AUTO_FURNISH_ROOMS: ReadonlySet<string> = new Set(['r-terminal'])
import {
  applyDerelictWallOverlay,
  applyMetalDoorOverlay,
  loadDerelictWallOverlayTextures,
  loadMetalDoorOverlayTextures,
} from '@/three/stationDerelictWallOverlay'

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
const STRAIGHT_CORRIDOR_ROOF_DROP = 0.18
/** Small roof drop for window/T corridors so roof seams do not expose space. */
const WINDOW_CORRIDOR_ROOF_DROP = 0.18
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
/** Wall piece URL — used to cap unused corridor art openings. */
const WALL_URL = '/models/station/pieces/wall.glb'

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
/** Local wall yaw for each native corridor side opening. */
const CORRIDOR_PORT_WALL_YAW: Readonly<Record<EntranceSide, number>> = {
  N: Math.PI / 2,
  E: Math.PI,
  S: -Math.PI / 2,
  W: 0,
}

/**
 * Probability that any single eligible corridor wall spawns nothing
 * (decorative-only wall). The remaining probability mass is split
 * evenly between the two wall-station variants.
 */
const WALL_PROP_PROB_NONE = 0.5
/** Probability that an eligible wall hosts the oxygen station. */
const WALL_PROP_PROB_OXYGEN = (1 - WALL_PROP_PROB_NONE) / 2
/**
 * Native sides per corridor kind that ship with a window pane instead of
 * a flat wall surface. These are excluded from the wall-station roll —
 * mounting a glowing utility on top of the exterior window reads wrong
 * and would clip into the glass.
 */
const CORRIDOR_WINDOW_NATIVE_SIDES: Readonly<Record<CorridorKind, ReadonlySet<EntranceSide>>> = {
  cross: new Set(),
  corner: new Set(['N']),
  window: new Set(['N']),
  straight: new Set(),
}
/**
 * Vertical anchor for wall-mounted props — exactly the midline of the
 * wall span (`Y ∈ [0, WALL_HEIGHT]`). Wall props are baked with their
 * pivot at bbox-Y centre so this places them centred top-to-bottom on
 * the wall surface.
 */
const WALL_PROP_MID_Y = WALL_HEIGHT / 2
/**
 * Small inward push (metres) along the wall's inward normal so a wall
 * prop with its back exactly at the wall plane doesn't z-fight the
 * corridor wall mesh.
 */
const WALL_PROP_INWARD_PUSH = 0.02
/**
 * Yaw (radians) applied to a wall-station prop so its baked local +Z
 * (forward face) points into the corridor interior, keyed by the wall's
 * *world* side. Wall props ship with the back face at Z=0 and the body
 * extending in +Z, so a wall on world side N (corridor +Z exterior)
 * needs π to flip the prop forward toward -Z, and so on.
 */
const WALL_PROP_YAW_BY_WORLD_SIDE: Readonly<Record<EntranceSide, number>> = {
  N: Math.PI,
  E: -Math.PI / 2,
  S: 0,
  W: Math.PI / 2,
}
/**
 * Unit inward normal at each corridor world-side. Pointing from the
 * wall surface toward the corridor's centre, used to push the prop
 * slightly off the wall plane (see {@link WALL_PROP_INWARD_PUSH}).
 */
const WALL_INWARD_UNIT: Readonly<Record<EntranceSide, { x: number; z: number }>> = {
  N: { x: 0, z: -1 },
  E: { x: -1, z: 0 },
  S: { x: 0, z: 1 },
  W: { x: 1, z: 0 },
}
/** Wall-station prop kinds, used by the corridor placement pass. */
type WallStationKind = 'wall_oxygen' | 'wall_heal'

/**
 * Per-corridor-kind outward offset (metres) applied when computing the
 * wall-station mount anchor. The layout {@link CORRIDOR_HALF_EXTENTS}
 * describe the *walkable interior* half-extents used by collision; the
 * visible wall surfaces of some GLBs (notably `corridor.glb` for the
 * straight piece) sit further outward, so anchoring purely on the
 * collider half-extent leaves the prop hovering in mid-corridor. This
 * table nudges the anchor outward to the asset's actual wall plane.
 */
const CORRIDOR_WALL_OUTWARD_OFFSET: Readonly<Record<CorridorKind, number>> = {
  cross: 0,
  corner: 0,
  window: 0,
  straight: 0.85,
}

/**
 * F-prompt anchor offset from the wall plane, in metres. Pushes the
 * interactor's proximity centre into the corridor far enough that the
 * player can stand directly under the prop and still register as
 * "in range" — the wall plane itself is unreachable.
 */
const WALL_PROP_INTERACTOR_INWARD_PUSH = 0.5
/** F-prompt prefix per variant. Combined with a stable index per slot. */
const WALL_PROP_EVENT_PREFIX: Readonly<Record<WallStationKind, string>> = {
  wall_oxygen: 'wallstation:oxygen',
  wall_heal: 'wallstation:heal',
}
/** Prompt text shown when the player walks into range. */
const WALL_PROP_PROMPT: Readonly<Record<WallStationKind, string>> = {
  wall_oxygen: 'F  Refill Oxygen',
  wall_heal: 'F  Restore Health',
}

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

/**
 * Fully assembled runtime station graph plus collision, interaction, hazard,
 * and shader resources consumed by {@link StationViewController}.
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
  /**
   * TRON-hologram shader materials owned by the station (lava + safe-path
   * tile markers). The view controller must call
   * {@link syncTronHologramTimeSeconds} on this list each frame so the
   * scan bands and grid scroll animate.
   */
  hologramMaterials: ShaderMaterial[]
  /**
   * Procedurally planned tile maps for every hazard room. Keyed by
   * `RoomSpec.id`. Used by the peek-terminal puzzle to render the path
   * the player must memorise before crossing the lava floor.
   */
  mazeMaps: Map<string, MazeMap>
}

/** A hazardous floor rectangle the controller polls each tick. */
export interface StationHazard {
  /** Hazard kind. Currently only `'lava'`. */
  kind: 'lava'
  /** World-space XZ rectangle the player must avoid. */
  rect: StationRect
  /**
   * Red "you stepped on lava" marker. Hidden by default; the controller
   * flips it visible while the player's footprint sits on this tile.
   */
  marker: Mesh | null
  /**
   * Blue "secure floor" marker. Always visible — gives the player a
   * uniform floor texture so the lava layout isn't obvious until they
   * misstep. Paired with {@link marker}: when the red marker shows the
   * blue one hides, so the two additive materials don't blend into a
   * muddy purple.
   */
  secureMarker: Mesh | null
}

/**
 * Place a corridor piece at its layout anchor + yaw. Trusts the GLB
 * origin: whatever the asset author set as the model pivot is what the
 * layout maths sees as the piece centre, so authoring tweaks (e.g.
 * moving a corner's elbow off the bbox centre to fix port alignment)
 * survive into the runtime.
 *
 * @param node - Corridor placement description.
 * @param theme - Station visual theme inherited from the layout.
 * @returns Group containing the corridor's floor + roof clones.
 */
async function placeCorridor(
  node: CorridorNode & { ports: Partial<Record<EntranceSide, PortTarget>> },
  theme?: StationTheme,
): Promise<Group> {
  const isDerelict = theme === 'derelict'
  const yaw = (node.yaw ?? 0) as YawTurns
  const unusedNativePorts = CORRIDOR_NATIVE_PORTS[node.kind].filter((nativeSide) => {
    const worldSide = rotateSide(nativeSide, yaw)
    return !Object.hasOwn(node.ports ?? {}, worldSide)
  })
  const needsPortCaps = unusedNativePorts.length > 0
  const [floorSrc, roofSrc, wallSrc, derelictOverlay] = await Promise.all([
    loadGLB(CORRIDOR_URL[node.kind]),
    loadGLB(ROOF_URL[node.kind]),
    needsPortCaps ? loadGLB(WALL_URL) : Promise.resolve(null),
    isDerelict ? loadDerelictWallOverlayTextures() : Promise.resolve(null),
  ])
  if (derelictOverlay) {
    applyDerelictWallOverlay(floorSrc, derelictOverlay)
    applyDerelictWallOverlay(roofSrc, derelictOverlay)
    if (wallSrc) {
      applyDerelictWallOverlay(wallSrc, derelictOverlay)
    }
  }

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
    roof.position.y -= WINDOW_CORRIDOR_ROOF_DROP
    roof.position.z = -WINDOW_VISUAL_ALIGNMENT_OFFSET
  }
  group.add(roof)

  if (wallSrc) {
    for (const nativeSide of unusedNativePorts) {
      const port = nativePortAnchor(node.kind, nativeSide)
      const wall = wallSrc.clone(true)
      wall.position.set(port.x, CORRIDOR_FLOOR_CENTER_Y, port.z)
      wall.rotation.y = CORRIDOR_PORT_WALL_YAW[nativeSide]
      group.add(wall)
    }
  }

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
 * Minimum tile count for the procedurally generated safe path through a
 * lava-floor room (inclusive of both endpoints). Sized so a small 3×3
 * room still gets at least one detour rather than a straight line.
 */
const SAFE_PATH_MIN_LENGTH = 5
/**
 * Maximum tile count for the safe path, expressed as a fraction of the
 * room's total tiles. Caps how convoluted the path can be so the player
 * doesn't burn their whole O2 reserve crossing a single room.
 */
const SAFE_PATH_MAX_FRACTION = 0.75

/** Per-tile-square inset so adjacent overlays don't z-fight at their seam. */
const SAFE_PATH_DEBUG_INSET = 0.04
/** Y offset above the floor for the debug plane. */
const SAFE_PATH_DEBUG_Y_OFFSET = 0.012
/** Primary tint for the lava-tile TRON hologram material (warm red). */
const LAVA_TILE_TRON_COLOR = 0xff2a1a
/** Slightly cooler grid bias so the lattice reads distinct from the hull tint. */
const LAVA_TILE_TRON_GRID_TINT = 0xff5533
/** Color gain on the lava hologram — punches the red brighter than a prop. */
const LAVA_TILE_TRON_COLOR_GAIN = 1.55
/** Alpha gain on the lava hologram — sits heavier than the default prop pass. */
const LAVA_TILE_TRON_ALPHA_GAIN = 1.45
/** Material opacity hint for the lava hologram. */
const LAVA_TILE_TRON_OPACITY = 0.9
/** Primary tint for the safe-path TRON hologram (cyan / Tron blue). */
const SAFE_TILE_TRON_COLOR = 0x3399ff
/** Cooler grid bias on the safe tiles. */
const SAFE_TILE_TRON_GRID_TINT = 0x88ccff
/** Color gain for safe tiles — calmer than the lava red. */
const SAFE_TILE_TRON_COLOR_GAIN = 1.15
/** Alpha gain for safe tiles. */
const SAFE_TILE_TRON_ALPHA_GAIN = 1.1
/** Material opacity hint for safe tiles. */
const SAFE_TILE_TRON_OPACITY = 0.7

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
): { pos: [number, number]; tile: Tile } | null {
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
  const pos = tileLocalPos(room, pick)
  return { pos, tile: { col: pick.col, row: pick.row } }
}

/**
 * Convert a fixed room-local prop position back to the nearest tile and
 * mark it as occupied for random prop/reward placement. Authored props
 * such as terminals often sit on exact tile centres; rounding keeps
 * slightly hand-tuned positions on their intended floor square.
 *
 * @param room - Room whose tile grid owns the prop.
 * @param pos - Room-local XZ prop position.
 * @param used - Mutable set of occupied `"col:row"` tile keys.
 */
function claimPropTile(room: RoomSpec, pos: readonly [number, number], used: Set<string>): void {
  const col = Math.round(pos[0] / ROOM_TILE_SIZE + (room.width - 1) / 2)
  const row = Math.round(pos[1] / ROOM_TILE_SIZE + (room.depth - 1) / 2)
  if (col < 0 || col >= room.width || row < 0 || row >= room.depth) return
  used.add(`${col}:${row}`)
}

/**
 * Convert a `(col, row)` tile to its local-frame XZ centre (pre-yaw).
 *
 * @param room - Room owning the grid.
 * @param tile - Tile to project.
 * @returns Local `[x, z]` centre of the tile.
 */
function tileLocalPos(room: RoomSpec, tile: Tile): [number, number] {
  const x = (tile.col - (room.width - 1) / 2) * ROOM_TILE_SIZE
  const z = (tile.row - (room.depth - 1) / 2) * ROOM_TILE_SIZE
  return [x, z]
}

/**
 * World-space XZ rectangle covering a single tile of a room, accounting
 * for the room's yaw + anchor.
 *
 * @param room - Room owning the tile.
 * @param tile - Tile to project.
 * @returns Axis-aligned world rect around the tile centre.
 */
function tileWorldRect(room: RoomSpec, tile: Tile): StationRect {
  const [lx, lz] = tileLocalPos(room, tile)
  const roomYaw = (room.yaw ?? 0) as YawTurns
  const world = rotateVec2({ x: lx, z: lz }, roomYaw)
  const cx = room.anchor.x + world.x
  const cz = room.anchor.z + world.z
  const half = ROOM_TILE_SIZE / 2
  return { minX: cx - half, maxX: cx + half, minZ: cz - half, maxZ: cz + half }
}

/**
 * Spawn a thin emissive plane over the given tile in the room's local
 * frame, parented under the room wrapper. Used as a debug visualisation
 * of safe tiles while playtesting the path planner — gated by
 * {@link DEBUG_SHOW_SAFE_PATH}.
 *
 * @param wrapper - Room wrapper group the marker is parented to.
 * @param room - Room owning the tile.
 * @param tile - Tile to highlight.
 */
/**
 * Spawn a red glow plane over a single lava tile, parented to the room
 * wrapper. Hidden by default — the view controller flips
 * `mesh.visible = true` while the player is standing on this exact
 * tile, then hides it again on exit.
 *
 * @param wrapper - Room wrapper group the marker is parented to.
 * @param room - Room owning the tile.
 * @param tile - Tile to highlight.
 * @returns The created mesh so the caller can wire it into a hazard.
 */
function addLavaTileGlowMarker(
  wrapper: Group,
  room: RoomSpec,
  tile: Tile,
): { mesh: Mesh; material: ShaderMaterial } {
  const [lx, lz] = tileLocalPos(room, tile)
  const size = ROOM_TILE_SIZE - SAFE_PATH_DEBUG_INSET * 2
  const material = createTronHologramMaterial({
    color: LAVA_TILE_TRON_COLOR,
    gridTint: LAVA_TILE_TRON_GRID_TINT,
    colorGain: LAVA_TILE_TRON_COLOR_GAIN,
    alphaGain: LAVA_TILE_TRON_ALPHA_GAIN,
    opacity: LAVA_TILE_TRON_OPACITY,
  })
  const mesh = new Mesh(new PlaneGeometry(size, size), material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(lx, STATION_FLOOR_Y + SAFE_PATH_DEBUG_Y_OFFSET + 0.006, lz)
  mesh.visible = false
  mesh.name = `lava-tile:${tile.col}:${tile.row}`
  wrapper.add(mesh)
  return { mesh, material }
}

/**
 * Add the blue hologram overlay used to mark a safe maze tile.
 *
 * @param wrapper - Room-local group receiving the marker mesh.
 * @param room - Room owning the tile.
 * @param tile - Maze tile to cover.
 * @returns The marker mesh and material for animation/disposal.
 */
function addSecureTileMarker(
  wrapper: Group,
  room: RoomSpec,
  tile: Tile,
): { mesh: Mesh; material: ShaderMaterial } {
  const [lx, lz] = tileLocalPos(room, tile)
  const size = ROOM_TILE_SIZE - SAFE_PATH_DEBUG_INSET * 2
  const material = createTronHologramMaterial({
    color: SAFE_TILE_TRON_COLOR,
    gridTint: SAFE_TILE_TRON_GRID_TINT,
    colorGain: SAFE_TILE_TRON_COLOR_GAIN,
    alphaGain: SAFE_TILE_TRON_ALPHA_GAIN,
    opacity: SAFE_TILE_TRON_OPACITY,
  })
  const mesh = new Mesh(new PlaneGeometry(size, size), material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(lx, STATION_FLOOR_Y + SAFE_PATH_DEBUG_Y_OFFSET, lz)
  mesh.name = `secure-tile:${tile.col}:${tile.row}`
  wrapper.add(mesh)
  return { mesh, material }
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
    const pick = pickRandomInnerTile(room, used)
    if (!pick) continue
    out.push({
      kind: 'chest',
      pos: pick.pos,
      loot: { itemId: roll.itemId, qtyMin: roll.quantity, qtyMax: roll.quantity },
      interact: {
        prompt: 'F  Open Chest',
        event: `chest:open:${room.id}-${i + 1}`,
      },
    })
  }
  return out
}

/**
 * Eligible wall slot on a placed corridor that the wall-station roll
 * considers. A slot is eligible if the side is either (a) a built-in
 * non-window wall of the GLB, or (b) a native port that the layout
 * leaves unused (so it gets capped with a wall.glb). Ports connected
 * to another piece are holes, not walls, and are skipped.
 */
interface CorridorWallSlot {
  /** Source corridor whose wall hosts the slot. */
  corridor: CorridorNode
  /** Wall side in *world* coordinates (post-yaw). */
  worldSide: EntranceSide
  /** Wall side in the corridor's *native* (pre-yaw) frame. */
  nativeSide: EntranceSide
}

/**
 * Enumerate the eligible wall slots for a placed corridor. Skips world
 * sides that connect to another piece (ports = holes) and native sides
 * authored as windows.
 *
 * @param corridor - Placed corridor with its layout ports map populated.
 * @returns Slots, one per eligible wall side.
 */
function corridorWallSlots(
  corridor: CorridorNode & { ports: Partial<Record<EntranceSide, PortTarget>> },
): CorridorWallSlot[] {
  const yaw = (corridor.yaw ?? 0) as YawTurns
  const nativePorts = new Set<EntranceSide>(CORRIDOR_NATIVE_PORTS[corridor.kind])
  const windowed = CORRIDOR_WINDOW_NATIVE_SIDES[corridor.kind]
  const usedWorldSides = new Set(Object.keys(corridor.ports ?? {}))
  const out: CorridorWallSlot[] = []
  for (const native of ['N', 'E', 'S', 'W'] as const) {
    const world = rotateSide(native, yaw)
    if (nativePorts.has(native)) {
      if (usedWorldSides.has(world)) continue
    } else if (windowed.has(native)) {
      continue
    }
    out.push({ corridor, worldSide: world, nativeSide: native })
  }
  return out
}

/**
 * World-space XZ anchor of a corridor's wall midpoint on the given
 * native side. Mirrors {@link nativePortAnchor} but works for *every*
 * side, not just authored ports.
 *
 * @param corridor - Placed corridor.
 * @param nativeSide - Wall side in the corridor's native frame.
 * @returns World-space XZ point on the wall's interior surface.
 */
function corridorWallWorldAnchor(
  corridor: CorridorNode,
  nativeSide: EntranceSide,
): { x: number; z: number } {
  const half = CORRIDOR_HALF_EXTENTS[corridor.kind]
  const outward = CORRIDOR_WALL_OUTWARD_OFFSET[corridor.kind]
  let local: { x: number; z: number }
  switch (nativeSide) {
    case 'N':
      local = { x: 0, z: half.z + outward }
      break
    case 'S':
      local = { x: 0, z: -(half.z + outward) }
      break
    case 'E':
      local = { x: half.x + outward, z: 0 }
      break
    case 'W':
      local = { x: -(half.x + outward), z: 0 }
      break
  }
  const rotated = rotateVec2(local, (corridor.yaw ?? 0) as YawTurns)
  return { x: corridor.anchor.x + rotated.x, z: corridor.anchor.z + rotated.z }
}

/**
 * Roll one wall-station outcome: either nothing or one of the two
 * variants, weighted by {@link WALL_PROP_PROB_NONE} and split evenly
 * across the variants.
 *
 * @returns Selected wall-station kind, or `null` for an empty wall.
 */
function rollWallStationKind(): WallStationKind | null {
  const r = Math.random()
  if (r < WALL_PROP_PROB_NONE) return null
  if (r < WALL_PROP_PROB_NONE + WALL_PROP_PROB_OXYGEN) return 'wall_oxygen'
  return 'wall_heal'
}

/**
 * Force at least one wall slot in the layout to host the requested
 * variant. Prefers to upgrade an empty slot; if every slot is already
 * spoken for and another variant has at least two copies, demote one
 * of those to the missing variant. No-op when nothing needs forcing.
 *
 * @param picks - Wall slot kind picks (mutated in-place).
 * @param required - Variant that must appear at least once.
 */
/**
 * Walk the rolled wall-station kinds and drop any duplicate within the
 * same corridor. The first occurrence per corridor wins; later same-
 * kind picks flip to the other variant when it's still free, otherwise
 * to `null`. Keeps any single corridor from doubling up on oxygen or
 * heal — the player should always need to walk a stretch to top off
 * the other resource.
 *
 * @param slots - Wall slots in the order their picks were rolled.
 * @param picks - Rolled kinds (mutated in place).
 */
function dedupeKindsPerCorridor(
  slots: ReadonlyArray<CorridorWallSlot>,
  picks: Array<WallStationKind | null>,
): void {
  const seenByCorridor = new Map<string, Set<WallStationKind>>()
  for (let i = 0; i < slots.length; i++) {
    const kind = picks[i]
    if (!kind) continue
    const corridorId = slots[i]!.corridor.id
    let seen = seenByCorridor.get(corridorId)
    if (!seen) {
      seen = new Set<WallStationKind>()
      seenByCorridor.set(corridorId, seen)
    }
    if (!seen.has(kind)) {
      seen.add(kind)
      continue
    }
    const other: WallStationKind = kind === 'wall_oxygen' ? 'wall_heal' : 'wall_oxygen'
    if (!seen.has(other)) {
      picks[i] = other
      seen.add(other)
    } else {
      picks[i] = null
    }
  }
}

function ensureAtLeastOneWallStation(
  picks: Array<WallStationKind | null>,
  required: WallStationKind,
): void {
  if (picks.some((k) => k === required)) return
  const emptyIdx = picks.findIndex((k) => k === null)
  if (emptyIdx >= 0) {
    picks[emptyIdx] = required
    return
  }
  const other: WallStationKind = required === 'wall_oxygen' ? 'wall_heal' : 'wall_oxygen'
  const otherCount = picks.filter((k) => k === other).length
  if (otherCount > 1) {
    const idx = picks.findIndex((k) => k === other)
    if (idx >= 0) picks[idx] = required
  }
}

/**
 * Spawn the corridor wall-mounted utility stations across the whole
 * station. Each corridor's eligible walls get one independent
 * none/oxygen/heal roll; a final post-pass guarantees at least one of
 * each variant station-wide.
 *
 * @param layout - Validated station layout (corridor graph).
 * @param root - Root scene group the wall props are parented to.
 * @param props - Mutable list of prop instances the controller ticks
 *   + disposes; the function pushes every spawned wall-station onto it.
 */
function placeCorridorWallStations(
  layout: StationLayout,
  root: Group,
  props: StationPropInstance[],
  interactors: PropInteractor[],
): void {
  const slots: CorridorWallSlot[] = []
  for (const corridor of layout.corridors) {
    slots.push(...corridorWallSlots(corridor))
  }
  if (slots.length === 0) return

  const picks: Array<WallStationKind | null> = slots.map(() => rollWallStationKind())
  dedupeKindsPerCorridor(slots, picks)
  ensureAtLeastOneWallStation(picks, 'wall_oxygen')
  ensureAtLeastOneWallStation(picks, 'wall_heal')

  let stableIndex = 0
  for (let i = 0; i < slots.length; i++) {
    const kind = picks[i]
    if (!kind) continue
    const slot = slots[i]!
    const prop = createStationProp(kind)
    const anchor = corridorWallWorldAnchor(slot.corridor, slot.nativeSide)
    const inward = WALL_INWARD_UNIT[slot.worldSide]
    prop.group.position.set(
      anchor.x + inward.x * WALL_PROP_INWARD_PUSH,
      WALL_PROP_MID_Y,
      anchor.z + inward.z * WALL_PROP_INWARD_PUSH,
    )
    prop.group.rotation.y = WALL_PROP_YAW_BY_WORLD_SIDE[slot.worldSide]
    root.add(prop.group)
    props.push(prop)

    const eventIndex = stableIndex++
    interactors.push({
      anchor: new Vector3(
        anchor.x + inward.x * WALL_PROP_INTERACTOR_INWARD_PUSH,
        STATION_FLOOR_Y,
        anchor.z + inward.z * WALL_PROP_INTERACTOR_INWARD_PUSH,
      ),
      prompt: WALL_PROP_PROMPT[kind],
      event: `${WALL_PROP_EVENT_PREFIX[kind]}:${slot.corridor.id}:${slot.worldSide}:${eventIndex}`,
      prop,
      disabled: false,
      meta: null,
    })
  }
}

/**
 * Build a complete station interior scene graph from a validated station layout.
 *
 * @param layout - Authored station layout data loaded from `public/data/stations`.
 * @param stationId - Stable id used to seed the auto-furnish RNG so each
 *   station+room combination produces the same filler layout across reloads.
 * @returns The assembled station and runtime metadata used by the station view.
 */
export async function buildStation(
  layout: StationLayout,
  stationId: string = 'unknown',
): Promise<BuiltStation> {
  const group = new Group()
  group.name = 'Station'
  const entrances: StationEntrance[] = []
  const floors: StationFloor[] = []
  const props: StationPropInstance[] = []
  const propBlockers: StationRect[] = []
  const interactors: PropInteractor[] = []
  const hazards: StationHazard[] = []
  const hologramMaterials: ShaderMaterial[] = []
  const mazeMaps = new Map<string, MazeMap>()
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
      theme: layout.theme,
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

    // Shared tile-claim ledger so authored random-placement props and
    // reward-synthesized chests never land on the same tile.
    const claimedTiles = new Set<string>()
    const propSpecs: RoomPropSpec[] = [...(room.props ?? [])]
    for (const propSpec of propSpecs) {
      if (propSpec.placement === 'random' || !propSpec.pos) continue
      claimPropTile(room, propSpec.pos, claimedTiles)
    }
    /**
     * Tile chosen for each random-placement prop, in spec order. The
     * first one (the "target" prop for a lava room — typically the
     * keycard terminal) is the path planner's endpoint. Other random
     * props in the same room are stuck on the safe path so the player
     * can actually reach them.
     */
    const randomTilesByPropIndex = new Map<number, Tile>()
    for (let i = 0; i < propSpecs.length; i++) {
      const propSpec = propSpecs[i]!
      if (propSpec.placement !== 'random') continue
      const pick = pickRandomInnerTile(room, claimedTiles)
      if (!pick) continue
      randomTilesByPropIndex.set(i, pick.tile)
      propSpec.pos = pick.pos
    }
    propSpecs.push(...synthesizeRewardChests(room, claimedTiles))

    for (let i = 0; i < propSpecs.length; i++) {
      const propSpec = propSpecs[i]!
      const prop = createStationProp(propSpec.kind)
      const [localX, localZ] = propSpec.pos ?? [0, 0]
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

    // Auto-furnish pass: deterministically scatter filler props (boxes
    // for now) around the room's leftover budget. Treats the JSON-
    // authored gameplay props as immovable seeds so collision and
    // attachment honour them. Hazard rooms opt out — lava tiles aren't
    // valid floor for filler.
    if (
      AUTO_FURNISH_ENABLED &&
      !room.hazard &&
      AUTO_FURNISH_ROOMS.has(room.id) &&
      propSpecs.every((s) => s.pos)
    ) {
      const authored: AuthoredPropSummary[] = propSpecs
        .filter((s) => s.pos)
        .map((s) => ({
          kind: s.kind,
          localX: s.pos![0],
          localZ: s.pos![1],
          yaw: s.yaw ?? 0,
        }))
      const fillPlacements = autoFurnishRoom({
        stationId,
        roomId: room.id,
        widthMeters: room.width * ROOM_TILE_SIZE,
        depthMeters: room.depth * ROOM_TILE_SIZE,
        authored,
      })
      const roomYaw = (room.yaw ?? 0) as YawTurns
      for (const fill of fillPlacements) {
        const fillProp = createStationProp(fill.kind)
        const scale = defaultPropScale(fill.kind)
        fillProp.group.position.set(fill.x, STATION_FLOOR_Y, fill.z)
        fillProp.group.rotation.y = fill.facingYaw
        fillProp.group.scale.setScalar(scale)
        wrapper.add(fillProp.group)
        props.push(fillProp)

        const worldCenter = rotateVec2({ x: fill.x, z: fill.z }, roomYaw)
        const worldX = room.anchor.x + worldCenter.x
        const worldZ = room.anchor.z + worldCenter.z
        const footprint = fillProp.localFootprint
        if (footprint) {
          propBlockers.push({
            minX: worldX - footprint.halfX * scale,
            maxX: worldX + footprint.halfX * scale,
            minZ: worldZ - footprint.halfZ * scale,
            maxZ: worldZ + footprint.halfZ * scale,
          })
        }
      }
    }

    if (room.hazard === 'lava') {
      const entranceTiles = (room.entrances ?? []).map((e) => entranceInnerTile(room, e))
      const targetTile = randomTilesByPropIndex.get(0) ?? entranceTiles[0] ?? null
      const safeTileKeys = new Set<string>()
      if (targetTile) {
        const minLen = Math.max(SAFE_PATH_MIN_LENGTH, 2)
        const maxLen = Math.max(minLen, Math.floor(room.width * room.depth * SAFE_PATH_MAX_FRACTION))
        for (const entranceTile of entranceTiles) {
          const path = generateSafePath(
            room.width,
            room.depth,
            entranceTile,
            targetTile,
            minLen,
            maxLen,
          )
          for (const t of path) safeTileKeys.add(`${t.col}:${t.row}`)
        }
        // Any other random-placement prop or reward chest in this room
        // also needs to be reachable, so add every claimed tile to the
        // safe set. `claimedTiles` tracks both authored random props
        // and synthesized reward chests, so this single loop covers
        // them all.
        for (const key of claimedTiles) safeTileKeys.add(key)
      }

      // Every tile in a hazard room reads as a uniform blue "secure
      // floor" — the lava layout isn't visible until the player steps
      // wrong. Lava tiles get a red marker stacked on top of their
      // blue one; the controller toggles them as a pair so the
      // misstep flash isn't muddied by the underlying blue.
      for (let col = 0; col < room.width; col++) {
        for (let row = 0; row < room.depth; row++) {
          const key = `${col}:${row}`
          const tile = { col, row }
          const secure = addSecureTileMarker(wrapper, room, tile)
          hologramMaterials.push(secure.material)
          if (!safeTileKeys.has(key)) {
            const lava = addLavaTileGlowMarker(wrapper, room, tile)
            hologramMaterials.push(lava.material)
            hazards.push({
              kind: 'lava',
              rect: tileWorldRect(room, tile),
              marker: lava.mesh,
              secureMarker: secure.mesh,
            })
          }
        }
      }

      mazeMaps.set(room.id, {
        roomId: room.id,
        width: room.width,
        depth: room.depth,
        safeTileKeys,
        entranceTiles,
        targetTile,
      })
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
  if (layout.theme === 'derelict' && entranceSrc) {
    applyDerelictWallOverlay(entranceSrc, await loadDerelictWallOverlayTextures())
  }
  if (layout.theme === 'derelict' && doorSrc) {
    applyMetalDoorOverlay(doorSrc, await loadMetalDoorOverlayTextures())
  }

  // Corridors.
  for (const corridor of layout.corridors) {
    const piece = await placeCorridor(corridor, layout.theme)
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

  placeCorridorWallStations(layout, group, props, interactors)

  patchGlassTransparency(group)
  return {
    group,
    entrances,
    floors,
    passages,
    props,
    propBlockers,
    interactors,
    hazards,
    hologramMaterials,
    mazeMaps,
  }
}
