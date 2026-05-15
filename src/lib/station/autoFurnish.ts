/**
 * Procedural filler-prop pass that runs after JSON-authored gameplay
 * props (terminals, chests) have been positioned. Treats the authored
 * placements as immovable seeds, then asks {@link placeFillers} to
 * fill any leftover budget with cosmetic decor (currently just
 * `'box'` containers in corners).
 *
 * Per-kind metadata (weight, footprint, affinity, tags) lives in
 * {@link PROP_META}; kinds not in the table are silently skipped so
 * the pass never crashes a room with an unfamiliar authored prop.
 *
 * @author guinetik
 * @date 2026-05-15
 * @spec docs/space-station-update-gdd.md
 */
import { hashString, mulberry32 } from '@/lib/minigame/relayRepair/rng'
import {
  centerAnchor,
  cornerAnchors,
  edgeAnchors,
  type Placement,
  placeFillers,
  type PropAffinity,
  type PropFootprint,
  type PropSpec,
  roomBudget,
  type RoomBox,
  sortByClass,
} from '@/lib/station/propPlacement'

/** Per-kind metadata used to translate a `kind` string into a {@link PropSpec}. */
interface PropMeta {
  /** Weight charged against the room budget. */
  weight: number
  /** Lateral footprint, used for collision + attachment. */
  footprint: PropFootprint
  /** Optional anchor-kind preferences. */
  affinity?: PropAffinity
  /** Optional host tags exposed for follower attachment. */
  tags?: string[]
}

/**
 * Static catalog. Authored props (terminal, chest) need only their
 * physical metadata so seeding works; filler props additionally
 * declare an affinity so the placer scores them.
 */
const PROP_META: Readonly<Record<string, PropMeta>> = {
  terminal: {
    weight: 2,
    footprint: { halfX: 0.5, halfZ: 0.7 },
  },
  chest: {
    weight: 1,
    footprint: { halfX: 0.85, halfZ: 0.55 },
  },
  box: {
    weight: 1,
    footprint: { halfX: 0.3, halfZ: 0.3 },
    affinity: { corner: 3, edge: 1, center: -2 },
  },
  table: {
    weight: 3,
    footprint: { halfX: 0.89, halfZ: 0.95 },
    affinity: { center: 3, edge: 1, corner: -2 },
    tags: ['table'],
  },
}

/**
 * Budget per square metre of floor. Tuned so {@link r-terminal}
 * (~89 m²) yields a budget of ~9 — fits the authored 2-weight
 * terminal plus one 3-weight table plus four 1-weight boxes.
 */
const AUTO_FURNISH_BUDGET_FACTOR = 0.1

/** Inset from the wall when generating anchors, in metres. */
const ANCHOR_MARGIN = 0.7

/** Minimum gap between any two placed props' edges, in metres. */
const COLLISION_CLEARANCE = 0.1

/**
 * Distance from an authored prop's centre, along its facing direction,
 * to the centre of the phantom approach-zone seed that reserves the
 * tile in front of it. Tuned so a 0.5 m-deep terminal leaves a clean
 * ~0.5 m gap and the phantom centre sits just under one tile away.
 */
const APPROACH_OFFSET = 0.9

/** Half-extent of the phantom approach-zone seed (square). */
const APPROACH_HALF = 0.65

/** How many filler `box` candidates to consider per room. */
const FILLER_BOX_CANDIDATES = 6

/**
 * How many filler `table` candidates to consider per room. Most
 * rooms only need one — the second is there as a fallback if the
 * first overlaps an authored prop.
 */
const FILLER_TABLE_CANDIDATES = 2

/** Authored-prop summary handed in by the builder. */
export interface AuthoredPropSummary {
  /** Prop kind id from {@link createStationProp}. */
  kind: string
  /** Local X, in metres, in the room's local coordinate space. */
  localX: number
  /** Local Z, in metres, in the room's local coordinate space. */
  localZ: number
  /**
   * Yaw in 90° turns (0..3). Used to orient the phantom approach-zone
   * seed in front of the prop so fillers leave a clear walk-up tile.
   * `0` = facing `+Z`, `1` = `+X`, `2` = `-Z`, `3` = `-X`.
   */
  yaw?: number
}

/** Inputs to {@link autoFurnishRoom}. */
export interface AutoFurnishInput {
  /** Stable station id (e.g. `'yamada-titania'`), used in the RNG seed. */
  stationId: string
  /** Stable room id (e.g. `'r-terminal'`), used in the RNG seed. */
  roomId: string
  /** Room width along local X, in metres (caller converts from tiles). */
  widthMeters: number
  /** Room depth along local Z, in metres. */
  depthMeters: number
  /** Already-placed gameplay props in this room. */
  authored: AuthoredPropSummary[]
}

/** Returned per filler placement, ready for the builder to instantiate. */
export interface AutoFurnishPlacement {
  /** Prop kind id for {@link createStationProp}. */
  kind: string
  /** Local X, in metres. */
  x: number
  /** Local Z, in metres. */
  z: number
  /** Facing yaw in radians, suitable for `group.rotation.y`. */
  facingYaw: number
}

/**
 * Run the filler pass for one room. Returns an empty array when no
 * fillers fit (room too small, budget already spent on authored
 * gameplay props, etc.).
 *
 * @param input - Room metadata + authored prop summary.
 * @returns Filler placements in pick order.
 */
export function autoFurnishRoom(input: AutoFurnishInput): AutoFurnishPlacement[] {
  const seedProps: PropSpec[] = []
  const seedPlacements: Placement[] = []
  let authoredWeight = 0
  for (let i = 0; i < input.authored.length; i++) {
    const authored = input.authored[i]!
    const meta = PROP_META[authored.kind]
    if (!meta) continue
    const id = `authored-${i}`
    seedProps.push({ id, weight: meta.weight, footprint: meta.footprint, tags: meta.tags })
    seedPlacements.push({ propId: id, anchorId: id, x: authored.localX, z: authored.localZ })
    authoredWeight += meta.weight

    // Phantom approach-zone seed: invisible blocker dropped one tile
    // in front of the authored prop, oriented by its `yaw`. Reserves
    // the walk-up tile so fillers can't crowd the player out of
    // interacting with the prop.
    const yawRad = (authored.yaw ?? 0) * (Math.PI / 2)
    const dx = Math.sin(yawRad)
    const dz = Math.cos(yawRad)
    const approachId = `authored-${i}-approach`
    seedProps.push({
      id: approachId,
      weight: 0,
      footprint: { halfX: APPROACH_HALF, halfZ: APPROACH_HALF },
    })
    seedPlacements.push({
      propId: approachId,
      anchorId: approachId,
      x: authored.localX + dx * APPROACH_OFFSET,
      z: authored.localZ + dz * APPROACH_OFFSET,
    })
  }

  const room: RoomBox = { width: input.widthMeters, depth: input.depthMeters }
  const remaining = roomBudget(room, AUTO_FURNISH_BUDGET_FACTOR) - authoredWeight
  if (remaining <= 0) return []

  const fillProps: PropSpec[] = []
  const idToKind = new Map<string, string>()
  for (let i = 0; i < FILLER_TABLE_CANDIDATES; i++) {
    const id = `fill-table-${i}`
    fillProps.push({
      id,
      weight: PROP_META.table!.weight,
      footprint: PROP_META.table!.footprint,
      affinity: PROP_META.table!.affinity,
      tags: PROP_META.table!.tags,
      class: 'anchor',
    })
    idToKind.set(id, 'table')
  }
  for (let i = 0; i < FILLER_BOX_CANDIDATES; i++) {
    const id = `fill-box-${i}`
    fillProps.push({
      id,
      weight: PROP_META.box!.weight,
      footprint: PROP_META.box!.footprint,
      affinity: PROP_META.box!.affinity,
      class: 'filler',
    })
    idToKind.set(id, 'box')
  }

  const pool = [
    ...cornerAnchors(room, ANCHOR_MARGIN),
    ...edgeAnchors(room, 1, ANCHOR_MARGIN),
    ...centerAnchor(room),
  ]
  const rng = mulberry32(hashString(`${input.stationId}/${input.roomId}`))
  const placements = placeFillers(
    seedProps,
    seedPlacements,
    sortByClass(fillProps),
    pool,
    remaining,
    rng,
    COLLISION_CLEARANCE,
  )

  return placements.map((p) => ({
    kind: idToKind.get(p.propId) ?? 'box',
    x: p.x,
    z: p.z,
    facingYaw: p.facingYaw ?? 0,
  }))
}
