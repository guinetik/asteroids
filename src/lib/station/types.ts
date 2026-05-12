/**
 * Type definitions for the data-driven station-interior level format
 * loaded under `/station` by {@link StationLevelLoader}.
 *
 * @author guinetik
 * @date 2026-05-12
 * @spec docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md
 */

/** Which axis-aligned wall of a room an opening or hatch is cut into. */
export type OpeningWall = '+x' | '-x' | '+z' | '-z'

/** A doorway cut into one wall of a room, connecting to another room. */
export interface StationOpeningJson {
  /** Room id this opening leads to. */
  to: string
  /** Wall of the parent room the opening sits on. */
  wall: OpeningWall
  /** Centre offset along that wall, in world units (0 = wall centre). */
  offset: number
  /** Opening width in world units. */
  width: number
}

/** Per-room material tint applied to floor, walls, and ceiling. */
export interface StationMaterialJson {
  /** Floor colour, CSS hex (e.g. `"#3a2f28"`). */
  floor: string
  /** Wall colour, CSS hex. */
  wall: string
  /** Ceiling colour, CSS hex. */
  ceiling: string
}

/** One axis-aligned box room. */
export interface StationRoomJson {
  /** Stable room id used by openings and spawn references. */
  id: string
  /** Inner extent of the room: `[width, height, depth]` in world units. */
  size: [number, number, number]
  /** Minimum corner of the room in world space: `[x, y, z]`. */
  origin: [number, number, number]
  /** Key into the level's `materials` map. */
  material: string
  /** Doorways cut into the walls. Every opening must be declared on both sides. */
  openings: StationOpeningJson[]
}

/** Where the player spawns when the level loads. */
export interface StationSpawnJson {
  /** Room id the spawn point lives in. */
  room: string
  /** World-space spawn position `[x, y, z]`. `y` is usually 0 (floor). */
  pos: [number, number, number]
  /** Yaw in radians; 0 = facing `+Z`. */
  yaw: number
}

/** The single exit hatch back to `/`. */
export interface StationHatchJson {
  /** Room id the hatch is mounted in. */
  room: string
  /** Wall of that room the hatch sits on. */
  wall: OpeningWall
  /** World Y of the hatch centre (eye height ≈ 1.2). */
  centerY: number
}

/** Global ambient-light settings for the level. */
export interface StationAmbientJson {
  /** Ambient light colour, CSS hex. */
  color: string
  /** Ambient intensity (0–1 typical). */
  intensity: number
}

/** Top-level shape of `src/data/stations/*.json`. */
export interface StationLevelJson {
  /** Level id (matches the `station` query param). */
  id: string
  /** Player spawn. */
  spawn: StationSpawnJson
  /** Exit hatch (exactly one per level). */
  exitHatch: StationHatchJson
  /** Rooms making up the interior. */
  rooms: StationRoomJson[]
  /** Material palette keyed by material id. */
  materials: Record<string, StationMaterialJson>
  /** Global ambient light. */
  ambient: StationAmbientJson
}
