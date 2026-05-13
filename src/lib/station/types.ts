/**
 * Type definitions for the data-driven station-interior level format
 * loaded under `/station` by {@link StationLevelLoader}.
 *
 * Each room is a half-cylinder pressurised module (glass canopy + flat
 * floor + D-shaped end caps) modeled after the habitat scene's
 * {@link HabitatInteriorScene} cylinder pattern. Cylinder axes are
 * world-aligned along either the X or Z axis.
 *
 * @author guinetik
 * @date 2026-05-12
 * @spec docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md
 */

/**
 * Which side of a cylindrical room a doorway sits on.
 *
 * - `+xCap` / `-xCap` / `+zCap` / `-zCap` — the D-shaped end caps at the two
 *   ends of the cylinder's axis. Only the pair matching the room's `axis`
 *   field is valid (e.g. an `axis: 'x'` room exposes `+xCap` and `-xCap`).
 * - `+xCurve` / `-xCurve` / `+zCurve` / `-zCurve` — a vertical slot cut into
 *   the curved glass canopy, perpendicular to the cylinder axis. Only the
 *   pair NOT matching the room's `axis` field is valid (e.g. an `axis: 'z'`
 *   room exposes `+xCurve` and `-xCurve`).
 */
export type StationDoorWall =
  | '+xCap'
  | '-xCap'
  | '+zCap'
  | '-zCap'
  | '+xCurve'
  | '-xCurve'
  | '+zCurve'
  | '-zCurve'

/** Which world axis the cylinder's centerline runs along. */
export type StationRoomAxis = 'x' | 'z'

/** A doorway cut into one side of a cylindrical room, connecting to another room. */
export interface StationDoorJson {
  /** Room id this doorway leads to. */
  to: string
  /** Side of the parent room the doorway sits on. */
  wall: StationDoorWall
  /** Doorway width in world units (clear opening). */
  width: number
  /** Doorway height in world units, measured from the floor. */
  height: number
}

/** Per-room material tint applied to floor and end caps. */
export interface StationMaterialJson {
  /** Floor colour, CSS hex (e.g. `"#cccccc"`). */
  floor: string
  /** End-cap colour, CSS hex (e.g. `"#eeeeee"`). */
  cap: string
}

/** One half-cylinder pressurised module. */
export interface StationRoomJson {
  /** Stable room id used by doorways and spawn references. */
  id: string
  /** World axis the cylinder's centerline runs along (`x` or `z`). */
  axis: StationRoomAxis
  /** Cylinder radius (half-width and ceiling height) in world units. */
  radius: number
  /** Cylinder length along its `axis` in world units. */
  length: number
  /**
   * Cylinder centre in world space `[x, y, z]`. `y` should be 0 — every room
   * shares the global floor plane.
   */
  center: [number, number, number]
  /** Key into the level's `materials` map. */
  material: string
  /** Doorways cut into the room. Every door must be declared on both sides. */
  doors: StationDoorJson[]
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
  /** Side of that room the hatch sits on (must be an end cap). */
  wall: StationDoorWall
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
  /** Cylindrical rooms making up the interior. */
  rooms: StationRoomJson[]
  /** Material palette keyed by material id. */
  materials: Record<string, StationMaterialJson>
  /** Global ambient light. */
  ambient: StationAmbientJson
}
