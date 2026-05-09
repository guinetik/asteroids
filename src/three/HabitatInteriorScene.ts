/**
 * Self-contained Three.js scene for the walkable habitat interior.
 *
 * Handles cylinder geometry, lighting, starfield, furniture loading,
 * FPS movement, and table interaction. Designed to be swapped into an
 * EffectComposer renderPass by MapViewController.
 *
 * **Dev (`import.meta.env.DEV`):** LMB near the table grabs it (floats in front of the camera);
 * LMB again places it and logs world pose to the browser console.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-habitat-interior-design.md
 */
import * as THREE from 'three'
import { FpsCamera, type FpsCameraConfig } from '@/three/FpsCamera'
import { InputManager } from '@/lib/InputManager'
import { HABITAT_BINDINGS } from '@/lib/defaultBindings'
import { BOWL_SERVINGS_MAX, LITTER_POLLUTION_MAX } from '@/lib/player/profile'
import { loadGLB } from '@/three/loadGLB'
import { FootstepSystem } from '@/lib/fps/footstepSystem'
import {
  CatController,
  type CatNeedsBridge,
  type CatObstacle,
  type CatWanderBounds,
} from '@/three/CatController'
import { CatAudioDirector, type CatAudioState } from '@/audio/CatAudioDirector'
import { useAudio } from '@/audio/useAudio'
import { JOURNEY_LARGE_POSTER_CATALOG } from '@/lib/posters/journeyLargePosterUnlocks'
import { HabitatCompletionPoster } from '@/three/HabitatCompletionPoster'
import { HabitatLargeAchievementPoster } from '@/three/HabitatLargeAchievementPoster'
import { HabitatPosterWall } from '@/three/HabitatPosterWall'
import { HabitatTablePosterRow } from '@/three/HabitatTablePosterRow'
import { LavaLampModel } from '@/three/LavaLampModel'
import { HabitatSideboardModel } from '@/three/HabitatSideboardModel'
import { HabitatCoffeeMachineModel } from '@/three/HabitatCoffeeMachineModel'
import { HabitatRecordPlayerModel } from '@/three/HabitatRecordPlayerModel'
import { HabitatMoonLampModel } from '@/three/HabitatMoonLampModel'
import { HabitatRefractorTelescopeModel } from '@/three/HabitatRefractorTelescopeModel'
import { HabitatLoungeChairModel } from '@/three/HabitatLoungeChairModel'
import { HabitatArcadeMachineModel } from '@/three/HabitatArcadeMachineModel'
import { HabitatCatTowerModel } from '@/three/HabitatCatTowerModel'
import { HabitatBackdrop, type HabitatBackdropContext } from '@/three/HabitatBackdrop'
import { findCosmeticOptionById } from '@/lib/cosmetics/catalog'
import { getPlayerCosmetics } from '@/lib/cosmetics/profileCosmetics'
import type { PlayerProfile } from '@/lib/player/types'

// ---------------------------------------------------------------------------
// Constants — no magic numbers
// ---------------------------------------------------------------------------

/** Radius of the habitat cylinder in world units. */
const CYLINDER_RADIUS = 5
/** Length of the habitat cylinder along the Z axis. */
const CYLINDER_LENGTH = 16
/** Number of radial segments on the cylinder mesh. */
const CYLINDER_RADIAL_SEGMENTS = 24
/** Number of height segments used for the girder rings. */
const GIRDER_SEGMENTS_HEIGHT = 6
/** Number of radial steps per girder arc. */
const GIRDER_SEGMENTS_RADIAL = 12
/** Tint colour of the glass shell. */
const GLASS_COLOR = 0x88ccff
/** Transparency of the glass shell (0 = fully transparent, 1 = opaque). */
const GLASS_OPACITY = 0.15
/** Colour of the metallic wireframe girders. */
const GIRDER_COLOR = 0x888888
/** Colour of the end-cap disc. */
const CAP_COLOR = 0xaaaaaa
/** Fallback CSS color for missing habitat theme stops. */
const HABITAT_THEME_FALLBACK_COLOR = '#dadbd8'
/** Gradient stop index for the habitat floor color. */
const HABITAT_THEME_FLOOR_STOP_INDEX = 0
/** Gradient stop index for the cockpit-hatch wall color. */
const HABITAT_THEME_HATCH_WALL_STOP_INDEX = 1
/** Gradient stop index for the table wall color. */
const HABITAT_THEME_TABLE_WALL_STOP_INDEX = 2
/** Gradient stop index for the lava lamp liquid color. */
const HABITAT_THEME_LAMP_STOP_INDEX = 3
/** Gradient stop index for the lava lamp wax blob color. */
const HABITAT_THEME_BLOB_STOP_INDEX = 4
/** Painted interior floor metalness; lower than stock so theme color is not washed into grey. */
const HABITAT_PAINT_FLOOR_METALNESS = 0.28
/** Painted interior wall metalness; high enough for plate maps to catch cabin highlights. */
const HABITAT_PAINT_WALL_METALNESS = 0.42
/** Painted interior roughness; higher values hold diffuse color instead of mirror-like glare. */
const HABITAT_PAINT_ROUGHNESS = 0.76
/** Emissive lift for painted walls so theme colors survive the cool ambient pass. */
const HABITAT_PAINT_WALL_EMISSIVE_INTENSITY = 0.18
/** Emissive lift for the deck so saturated theme colors don't read as washed-out grey. */
const HABITAT_PAINT_FLOOR_EMISSIVE_INTENSITY = 0.28
/** Paintable floor albedo map generated from image/textures/checkers/color.jpg. */
const HABITAT_FLOOR_COLOR_TEXTURE_URL = '/textures/checkers/color.webp'
/** Paintable floor normal map generated from image/textures/checkers/normal.jpg. */
const HABITAT_FLOOR_NORMAL_TEXTURE_URL = '/textures/checkers/normal.webp'
/** Paintable floor roughness map generated from image/textures/checkers/roughness.jpg. */
const HABITAT_FLOOR_ROUGHNESS_TEXTURE_URL = '/textures/checkers/roughness.webp'
/** Paintable wall albedo map generated from image/textures/plates/color.jpg. */
const HABITAT_WALL_COLOR_TEXTURE_URL = '/textures/plates/color.webp'
/** Paintable wall normal map generated from image/textures/plates/normal.jpg. */
const HABITAT_WALL_NORMAL_TEXTURE_URL = '/textures/plates/normal.webp'
/** Paintable wall roughness map generated from image/textures/plates/roughness.jpg. */
const HABITAT_WALL_ROUGHNESS_TEXTURE_URL = '/textures/plates/roughness.webp'
/** Paintable wall metalness map generated from image/textures/plates/metalness.jpg. */
const HABITAT_WALL_METALNESS_TEXTURE_URL = '/textures/plates/metalness.webp'
/** Paintable wall height map generated from image/textures/plates/displacement.jpg. */
const HABITAT_WALL_DISPLACEMENT_TEXTURE_URL = '/textures/plates/displacement.webp'
/** Number of checker repeats across the habitat floor width. */
const HABITAT_FLOOR_TEXTURE_REPEAT_X = 5
/** Number of checker repeats down the habitat floor length. */
const HABITAT_FLOOR_TEXTURE_REPEAT_Y = 8
/** Number of wall-plate repeats across each end-cap wall. */
const HABITAT_WALL_TEXTURE_REPEAT_X = 1.35
/** Number of wall-plate repeats up each end-cap wall. */
const HABITAT_WALL_TEXTURE_REPEAT_Y = 0.9
/** Floor normal-map strength in tangent space. */
const HABITAT_FLOOR_NORMAL_SCALE = 0.28
/** Wall normal-map strength in tangent space. */
const HABITAT_WALL_NORMAL_SCALE = 0.85
/** Wall bump-map strength from the plates displacement source. */
const HABITAT_WALL_BUMP_SCALE = 0.12
/** Small anisotropy lift for shallow floor viewing angles. */
const HABITAT_PAINT_TEXTURE_ANISOTROPY = 4
/** Gradient stop index for the warm interior point light tint. */
const HABITAT_THEME_POINT_LIGHT_STOP_INDEX = 5
/** Gradient stop index for the cool ambient fill tint. */
const HABITAT_THEME_AMBIENT_STOP_INDEX = 6
/** Default warm interior light tint when a theme omits the dedicated stop. */
const HABITAT_DEFAULT_POINT_LIGHT_COLOR = '#ffeedd'
/** Default cool ambient fill tint when a theme omits the dedicated stop. */
const HABITAT_DEFAULT_AMBIENT_COLOR = '#334466'
/** Default cool exterior rim tint applied through the canopy. */
const HABITAT_DEFAULT_RIM_COLOR = 0x6688cc
/** Number of star points in the background starfield. */
const STAR_COUNT = 2000
/** Radius of the sphere on which stars are placed. */
const STAR_SPHERE_RADIUS = 200
/** Y position of the walkable floor (world units). */
const FLOOR_Y = 0
/** Player movement speed (world units per second). */
const MOVE_SPEED = 6
/** Minimum distance between player centre and cylinder wall. */
const COLLISION_MARGIN = 1.5
/** Distance within which the player can interact with the table. */
const INTERACT_DISTANCE = 2.5

/** Eye height of the FPS camera above the floor (world units). */
const HABITAT_EYE_HEIGHT = 1.7
/** Mouse sensitivity for the FPS camera (radians per pixel). */
const HABITAT_SENSITIVITY = 0.002
/** Maximum up/down pitch angle of the FPS camera (radians). */
const HABITAT_PITCH_CLAMP = Math.PI / 3
/** Vertical field of view for the FPS camera (degrees). */
const HABITAT_FOV = 70
/** Intensity of the warm point light inside the habitat. */
const INTERIOR_LIGHT_INTENSITY = 1.4
/** Maximum range of the interior point light (world units). */
const INTERIOR_LIGHT_RANGE = 28
/** Intensity of the ambient fill light. */
const AMBIENT_INTENSITY = 0.9
/** Intensity of the exterior directional rim light. */
const EXTERIOR_LIGHT_INTENSITY = 0.5
/** How far inside the cylinder radius the girder rings sit. */
const GIRDER_INSET = 0.05
/** Render size of each star point (world units, with sizeAttenuation). */
const STAR_POINT_SIZE = 0.8
/**
 * Floor width as a multiple of the cylinder radius. With the canopy lowered to floor level
 * (axis at {@link FLOOR_Y}), the deck needs to span the full diameter so its edges meet the
 * curved walls instead of leaving a gap that exposes the curved hull underside.
 */
const FLOOR_WIDTH_FACTOR = 2
/** Vertical thickness of the deck (world units). Top sits at {@link FLOOR_Y}. */
const FLOOR_THICKNESS = 0.12
/**
 * Clearance between the table's pivot and the **front** (cockpit-side, +Z) end-cap of the
 * habitat cylinder, in world units. Picked from the dev grab tool output (LMB-place log)
 * so the prop sits flush against the cockpit wall without clipping the cap geometry.
 */
const TABLE_FRONT_CAP_CLEARANCE = 0.65

/**
 * World X position the bed is shoved to so its long edge sits against the +X wall (the
 * player's left when facing the cockpit at spawn) instead of dominating the centre of the
 * cabin. The canopy curves inward as Y rises, so pushing the bed too far hits the arch —
 * +2.6 puts the bed's outer edge near X≈+3.6, which clears the half-cylinder ceiling at
 * bed height comfortably.
 */
const BED_X = 3.6

/**
 * Distance (world units) the cat parks himself away from the bed edge before leaping
 * up. Picked so the lerp from approach → mattress reads as a single hop instead of a
 * long glide, while still clearing the bed obstacle padding.
 */
const BED_APPROACH_OFFSET = 0.45
/**
 * Vertical inset (world units) under the bed's bbox top where the cat sits while
 * "on the bed". The bbox includes the pillows at the head of the bed, so the inset
 * has to drop the perch back down to the mattress surface — otherwise Sushi floats
 * a pillow's height above the duvet.
 */
const BED_TOP_Y_INSET = 0.45

/**
 * World X of the sideboard centre. Pushed close to the +X wall so the unit hugs
 * the same side as the bed, leaving the area in front of the achievement posters
 * clear for the player to read them.
 */
const SIDEBOARD_X = 3.0
/**
 * Tiny gap (world units) between the back of the sideboard and the −Z hatch wall.
 * Prevents Z-fighting on the painted cap material.
 */
const SIDEBOARD_WALL_CLEARANCE = 0.05
/**
 * Fraction of the sideboard's local-X half-width that the coffee machine sits
 * away from centre. Kept near the record player so the +X end remains open for
 * Sushi's sideboard sit beat.
 */
const SIDEBOARD_COFFEE_OFFSET_FRAC = 0.45
/**
 * Fraction of the sideboard's local-X half-width that the record player sits
 * away from centre on the −X side (closer to the hatch).
 */
const SIDEBOARD_RECORD_PLAYER_OFFSET_FRAC = -0.05
/**
 * Fraction of the sideboard's local-X half-width that the moon lamp sits on the
 * opposite (-X) side from the coffee + record player duo, so it lights the
 * darker corner near the hatch grid.
 */
const SIDEBOARD_MOON_LAMP_OFFSET_FRAC = -0.7
/** Tiny vertical clearance above the sideboard top so toppings don't z-fight. */
const SIDEBOARD_TOP_CLEARANCE = 0.005
/**
 * Distance (world units) Sushi waits away from the sideboard front before
 * hopping onto the top. Mirrors the bed approach spacing so the jump reads as
 * a short hop, not a long glide.
 */
const SIDEBOARD_CAT_APPROACH_OFFSET = 0.45
/**
 * Fraction of the sideboard half-width where Sushi perches. This sits beside
 * the moon lamp toward the centre of the sideboard, leaving the lamp visible
 * while avoiding the coffee-machine end.
 */
const SIDEBOARD_CAT_PERCH_OFFSET_FRAC = -0.38
/**
 * Fraction of the sideboard half-width where Sushi finishes the lamp beat. This
 * places him on the former coffee-machine end, opposite the moon lamp.
 */
const SIDEBOARD_CAT_SIT_OFFSET_FRAC = 0.85
/**
 * Inset from the cabin-facing sideboard edge for Sushi's top-walk lane. Keeping the
 * lane slightly forward lets him pass in front of the moon lamp instead of through it.
 */
const SIDEBOARD_CAT_TOP_FRONT_INSET = 0.24
/** Tiny lift above the sideboard bbox top for Sushi's feet while perched. */
const SIDEBOARD_CAT_TOP_Y_OFFSET = 0.01455

/**
 * World X of the refractor telescope, mirrored across the cabin from the bed
 * (which sits at +{@link BED_X}). Negative so it lands in the −X "sun corner",
 * opposite the bed and clear of the +Z table.
 */
const REFRACTOR_TELESCOPE_X = -4.0
/**
 * World Z of the refractor telescope. Pulled forward toward the cockpit canopy
 * so the eyepiece sits where the player would lean in to use it; clear of the
 * cat feeding area further +Z.
 */
const REFRACTOR_TELESCOPE_Z = 0.0
/** Y-axis rotation (radians) so the telescope lens points east (3 o'clock) instead of south. */
const REFRACTOR_TELESCOPE_ROTATION_Y = Math.PI / 2

/**
 * World X of the lounge chair, tucked into the −X (telescope-side) wall in the
 * back-left corner of the cabin so it doesn't crowd the centre walking path.
 */
const LOUNGE_CHAIR_X = -3.8
/**
 * World Z of the lounge chair, near the −Z hatch wall so it sits in the corner
 * between the telescope wall and the hatch wall.
 */
const LOUNGE_CHAIR_Z = -7
/**
 * Y-axis rotation (radians) so the chair faces into the cabin (toward +X, +Z)
 * with its back tucked toward the corner walls.
 */
const LOUNGE_CHAIR_ROTATION_Y = Math.PI / 5 + Math.PI

/**
 * World X of the arcade machine, tucked beside the cockpit table on the −X
 * side. Far enough from the table edge to leave standing room, and clear of
 * the cat feeding area further toward the −X wall.
 */
const ARCADE_MACHINE_X = -2.3
/** World Z of the arcade machine — flush with the cockpit table line. */
const ARCADE_MACHINE_Z = 7.5
/**
 * Y-axis rotation (radians) so the marquee + screen face into the cabin (−Z),
 * letting the player walk up to it from the bed/sofa side.
 */
const ARCADE_MACHINE_ROTATION_Y = -Math.PI / 2

/**
 * World X of the cat tower, hugging the +X wall just outside the locker so the
 * climbing tower silhouette doesn't intrude on the bed walking lane.
 */
const CAT_TOWER_X = 4.3
/**
 * World Z of the cat tower — placed forward (+Z) of the locker so the cat has
 * to walk across the cabin from the feeding area to reach it.
 */
const CAT_TOWER_Z = 2.2
/**
 * Distance (world units) Sushi waits away from the cat tower's cabin-facing edge
 * before leaping onto the top platform. Same shape as the locker beat.
 */
const CAT_TOWER_APPROACH_OFFSET = 0.45
/**
 * Fraction of the cat tower's authored height shaved off the perch Y so Sushi sits
 * on the visible top platform rather than floating a hair above the highest poly.
 */
const CAT_TOWER_TOP_HEIGHT_DROP_RATIO = 0.08
/**
 * Sideways nudge (world units) applied to the perch X so Sushi sits a touch back
 * toward the +X wall on the top platform instead of teetering over its inner edge.
 */
const CAT_TOWER_TOP_WALL_NUDGE_X = 0.05
/**
 * Fraction of the tower's Z depth used to slide Sushi's perch toward the cockpit
 * table side (+Z) instead of the hatch wall (-Z). Small offset so he reads as
 * sitting on the table-facing edge of the top platform.
 */
const CAT_TOWER_TOP_TABLE_NUDGE_Z_FRAC = 0.05
/**
 * Player capsule radius (world units) used when resolving against furniture
 * obstacle AABBs. Tuned to feel like a person in a cabin without snagging on
 * corners. The cylindrical wall clamp uses {@link COLLISION_MARGIN} separately.
 */
const PLAYER_OBSTACLE_RADIUS = 0.35

// --- Cockpit hatch (back cap, -Z) ------------------------------------------
// Submarine-style pressure hatch: a grey metallic ring frame around a white
// circular door, with a yellow wheel-knob (torus + crossed spokes) at the
// center. Geometry-only, no textures.

/** Radius of the white circular door disc (world units). */
const HATCH_DOOR_RADIUS = 0.66
/** Thickness of the door disc (world units). */
const HATCH_DOOR_THICKNESS = 0.06
/** Radial segment count for the door disc and frame. */
const HATCH_DOOR_SEGMENTS = 48
/** Radius from the centre of the frame torus to the centre of its tube. */
const HATCH_FRAME_RING_RADIUS = HATCH_DOOR_RADIUS + 0.12
/** Tube radius of the frame torus (world units). */
const HATCH_FRAME_TUBE_RADIUS = 0.12
/** Major radius of the wheel-knob torus (world units). */
const HATCH_KNOB_RING_RADIUS = 0.19
/** Tube radius of the wheel-knob torus (world units). */
const HATCH_KNOB_TUBE_RADIUS = 0.045
/** Length of each crossed spoke through the wheel-knob (world units). */
const HATCH_KNOB_SPOKE_LENGTH = HATCH_KNOB_RING_RADIUS * 2
/** Thickness (square cross-section) of each crossed spoke (world units). */
const HATCH_KNOB_SPOKE_THICKNESS = 0.045
/** Floor-relative Y of the hatch centre (world units). Roughly at eye height. */
const HATCH_CENTRE_Y = FLOOR_Y + 1.2
/** Offset from the back-cap surface so the door doesn't z-fight with the disc. */
const HATCH_DOOR_SURFACE_OFFSET = 0.05
/** Tiny offset that keeps the wheel-knob in front of the door panel (world units). */
const HATCH_KNOB_Z_BIAS = HATCH_DOOR_THICKNESS / 2 + 0.02
/** White circular door panel colour. */
const HATCH_DOOR_COLOR = 0xeaeaea
/** Grey metallic frame ring colour. */
const HATCH_FRAME_COLOR = 0x9aa3ad
/** Yellow wheel-knob colour. */
const HATCH_KNOB_COLOR = 0xf2c438
/** XZ proximity (world units) at which the "F Exit" hatch prompt appears. */
const HATCH_INTERACT_DISTANCE = 1.8
/** Seconds the wheel-knob spin animation lasts when the player opens the hatch. */
const HATCH_KNOB_SPIN_DURATION_S = 0.7
/** Total Z-axis rotation applied to the knob group during the exit animation (1.5 full turns). */
const HATCH_KNOB_SPIN_RADIANS = Math.PI * 3

/** Scale applied to the poster wall so two rows fit above the back hatch. */
const POSTER_WALL_SCALE = 0.78
/** Back-cap offset that keeps the poster wall in front of the cap without z-fighting. */
const POSTER_WALL_Z_OFFSET = 0.085
/** Height of the poster wall centre above the hatch centre. */
const POSTER_WALL_ABOVE_HATCH_Y = 2.06
/**
 * Horizontal distance from hatch centre for the solar completion poster on the −Z back cap at +X
 * (starboard when facing the hatch).
 */
const HATCH_WALL_SIDE_LARGE_POSTER_OFFSET_X = 2.18
/**
 * Port (−X) horizontal offset for the Act I journey poster on the −Z back cap — slightly larger
 * than {@link HATCH_WALL_SIDE_LARGE_POSTER_OFFSET_X} so the tall frame clears the scaled solar
 * grid's port-column bottom row (e.g. Jupiter) without overlapping.
 */
const HATCH_WALL_PORT_ACT1_JOURNEY_POSTER_OFFSET_X = 2.62
/** Y offset for large hatch-wall frames relative to the hatch centre (Act I + solar completion). */
const COMPLETION_POSTER_ABOVE_HATCH_Y = 0.55
/** Back-cap offset that keeps large hatch-wall frames in front of the cap. */
const COMPLETION_POSTER_Z_OFFSET = 0.09
/**
 * World X offset from center for large journey posters on the front (+Z) bulkhead — flanks the
 * mess console; magnitude keeps frames on the flat cap (clear of the cylindrical canopy).
 */
const JOURNEY_LARGE_POSTER_BULKHEAD_OFFSET_X = 2.85
/**
 * Scale for the three mission posters above the mess table (full width of three slots).
 */
const TABLE_POSTER_ROW_SCALE = 0.5
/**
 * Front-cap inset matching {@link POSTER_WALL_Z_OFFSET} logic so frames sit just inside
 * the cockpit bulkhead without z-fighting.
 */
const TABLE_POSTER_ROW_Z_OFFSET = 0.085
/**
 * World Y of the table poster row center — above the mess table/console, below the canopy.
 */
const TABLE_POSTER_ROW_CENTER_Y = FLOOR_Y + 3.05
/**
 * Author-corrective rotation applied to the table model so the Sketchfab mesh reads the
 * right way up after import. The pre-centered GLB
 * (see `scripts/center-table-glb.mjs`) has its origin at the floor-center, so this
 * rotation now orbits the correct pivot.
 */
const TABLE_LAYOUT_ROT_X = Math.PI
/**
 * 180° yaw so the table's authored front faces back into the cabin (−Z) instead of into the
 * cockpit cap (+Z). Without this you spawn looking at the back panel.
 */
const TABLE_LAYOUT_ROT_Y = Math.PI
const TABLE_LAYOUT_ROT_Z = Math.PI
/**
 * How far in front of the camera (along its yaw forward, on the XZ plane) the table sits
 * while grabbed (dev tool, world units).
 */
const TABLE_DEBUG_HOLD_DISTANCE = 2.75
/**
 * Vertical offset relative to the camera eye while grabbed (world units, negative = below
 * the lens). Keeps the prop in frame instead of floating into the ceiling.
 */
const TABLE_DEBUG_HOLD_BELOW_EYE = 0.55
/**
 * Minimum clearance above {@link FLOOR_Y} for the hold position so the table never clips
 * through the floor when the player looks down.
 */
const TABLE_DEBUG_HOLD_MIN_ABOVE_FLOOR = 0.35
/**
 * Grab reach multiplier on {@link INTERACT_DISTANCE} — slightly forgiving so LMB grab works
 * from the same ring as F Shuttle Control.
 */
const TABLE_DEBUG_GRAB_REACH_MULT = 1.35
/**
 * Distance (world units) Sushi waits in front of the shuttle-control table before hopping up.
 */
const TABLE_CAT_APPROACH_OFFSET = 0.58
/** Drop below the table bbox top for Sushi's feet while perched. */
const TABLE_CAT_TOP_Y_DROP = 0.12
/** Fraction of table half-width that biases Sushi onto the roomier left side. */
const TABLE_CAT_TOP_SIDE_OFFSET_FRAC = -0.56
/** Fraction of table half-depth that biases Sushi's perch toward the +Z cockpit wall. */
const TABLE_CAT_TOP_WALL_OFFSET_FRAC = 0.28

/** Rounds to 4 decimal places for devtools pose logs. */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/**
 * Compute the XZ footprint of a placed Object3D as an axis-aligned obstacle rectangle,
 * padded outward on every side. Used to feed the cat's pathing the live world-space
 * extents of furniture without hardcoding magic placement numbers.
 *
 * @param obj - The placed object (must already be in the scene graph for accurate bbox).
 * @param padding - World-units to expand the rectangle on each side.
 * @returns A {@link CatObstacle} rectangle in world XZ.
 */
function footprintFromObject(obj: THREE.Object3D, padding: number): CatObstacle {
  obj.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(obj)
  return {
    minX: box.min.x - padding,
    maxX: box.max.x + padding,
    minZ: box.min.z - padding,
    maxZ: box.max.z + padding,
  }
}

/**
 * Reset the locker GLB's authored open door orientation to match the cabinet body.
 *
 * @param locker - Loaded locker scene root.
 */
function closeLockerDoor(locker: THREE.Object3D): void {
  const door = locker.getObjectByName(LOCKER_DOOR_NODE_NAME)
  const body = locker.getObjectByName(LOCKER_BODY_NODE_NAME)
  if (!door || !body) return
  door.quaternion.copy(body.quaternion)
  door.updateMatrixWorld(true)
}

/**
 * Add a subtle local fill to the locker so its dark material stays readable in the bedroom.
 *
 * @param locker - Placed locker scene root.
 */
function addLockerFillLight(locker: THREE.Object3D): void {
  const fill = new THREE.PointLight(
    LOCKER_FILL_LIGHT_COLOR,
    LOCKER_FILL_LIGHT_INTENSITY,
    LOCKER_FILL_LIGHT_RANGE,
  )
  fill.position.set(
    LOCKER_FILL_LIGHT_OFFSET_X,
    LOCKER_FILL_LIGHT_OFFSET_Y,
    LOCKER_FILL_LIGHT_OFFSET_Z,
  )
  locker.add(fill)
}

/**
 * Mildly lifts the locker material response so the prop is not crushed to black indoors.
 *
 * @param locker - Loaded locker scene root.
 */
function tuneLockerMaterials(locker: THREE.Object3D): void {
  locker.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.material) return
    const mats = Array.isArray(child.material) ? child.material : [child.material]
    for (const mat of mats) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue
      mat.roughness = Math.max(mat.roughness, LOCKER_MIN_ROUGHNESS)
      mat.metalness = Math.min(mat.metalness, LOCKER_MAX_METALNESS)
      mat.envMapIntensity = Math.max(mat.envMapIntensity, LOCKER_MIN_ENV_MAP_INTENSITY)
      mat.emissive.setHex(LOCKER_MATERIAL_EMISSIVE_COLOR)
      mat.emissiveIntensity = Math.max(mat.emissiveIntensity, LOCKER_MATERIAL_EMISSIVE_INTENSITY)
      mat.needsUpdate = true
    }
  })
}

/**
 * Place the centered locker model against the bed wall at the opposite end from the cat house.
 *
 * @param locker - Loaded locker scene root.
 */
function placeLocker(locker: THREE.Object3D): void {
  locker.rotation.y = LOCKER_YAW_RADIANS
  locker.position.set(LOCKER_X, FLOOR_Y, LOCKER_Z)
  locker.updateMatrixWorld(true)
}

/**
 * Compute a uniform scale that makes a centered locker asset match the target world height.
 *
 * @param locker - Loaded locker scene root.
 * @returns Uniform scale multiplier.
 */
function computeLockerScale(locker: THREE.Object3D): number {
  const lockerBox = new THREE.Box3().setFromObject(locker)
  const lockerSize = lockerBox.getSize(new THREE.Vector3())
  return LOCKER_TARGET_HEIGHT / lockerSize.y
}

/**
 * Scale the centered locker asset once its runtime bbox is known.
 *
 * @param locker - Loaded locker scene root.
 */
function applyLockerScale(locker: THREE.Object3D): void {
  locker.scale.setScalar(computeLockerScale(locker))
  locker.updateMatrixWorld(true)
}

/**
 * Drop the locker to the habitat floor after its scale and rotation are applied.
 *
 * @param locker - Loaded locker scene root.
 */
function groundLocker(locker: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(locker)
  locker.position.y -= box.min.y - FLOOR_Y
  locker.updateMatrixWorld(true)
}

/**
 * Prepare locker geometry, closed-door pose, materials, lighting, and final placement.
 *
 * @param locker - Loaded locker scene root.
 */
function configureLocker(locker: THREE.Object3D): void {
  applyLockerScale(locker)
  closeLockerDoor(locker)
  tuneLockerMaterials(locker)
  placeLocker(locker)
  groundLocker(locker)
  addLockerFillLight(locker)
}

/**
 * Compile-time feature flag for the LMB grab/place tool used to author the table's resting
 * pose. The code path stays compiled in (re-enable by flipping this constant to `true` and
 * running a `bun dev` session); it's gated to `false` by default so dev builds don't expose
 * the dev-only LMB binding to playtesters.
 */
const TABLE_PLACEMENT_DEBUG_ENABLED = false

/**
 * Whether LMB grab/place for the habitat table is enabled.
 *
 * @returns The current value of {@link TABLE_PLACEMENT_DEBUG_ENABLED}.
 */
function isTablePlacementDebugEnabled(): boolean {
  return TABLE_PLACEMENT_DEBUG_ENABLED
}

/**
 * World-space rectangle Sushi (the habitat cat) is allowed to wander within.
 * Kept inside the cylinder collision envelope and clear of the table at +Z so
 * the cat doesn't path-find through furniture.
 */
const CAT_WANDER_BOUNDS: CatWanderBounds = {
  minX: -2.5,
  maxX: 2.5,
  minZ: -6,
  maxZ: 5,
  floorY: FLOOR_Y,
}

/** Path to the cat GLB asset (rigged Persian cat with idle/walk/sit/run clips). */
const CAT_MODEL_URL = '/models/cat.glb'

// --- Sushi feeding area (food bowl + water fountain) -----------------------
// Procedural geometry — no GLB needed. Sits beside the table at the +Z end so
// it reads as "the cat's corner" without crowding the bed or interaction zone.

/** World X of the food bowl (off-centre, port side of the cabin). */
const CAT_BOWL_X = -3.85
/** World X of the water fountain (next to the bowl). */
const CAT_FOUNTAIN_X = -4.25
/** Shared world Z of the feeding area — sits just shy of the +Z wall, beside the table. */
const CAT_FEEDING_Z = 7.2

// --- Sushi cat house (sleeps when tired) ----------------------------------
/** World X of Sushi's wooden cat house — tucked beside the bed on the +X side. */
const CAT_HOUSE_X = 4.25
/** World Z of Sushi's cat house — pushed back near the -Z end cap so it hugs the wall. */
const CAT_HOUSE_Z = -1.75
/** Yaw applied to the cat house group so the entry hole faces -X (toward the cabin centre). */
const CAT_HOUSE_YAW_RADIANS = Math.PI / 2
/**
 * Distance (world units) from the house centre at which Sushi lines up directly
 * in front of the entry before marching straight in. Far enough that the final
 * segment is unmistakably perpendicular to the door (no diagonal cut), close
 * enough that the line-up doesn't read as an extra detour.
 */
const CAT_HOUSE_APPROACH_DISTANCE = 0.55
/** Outer width (along X) of the cat house body, world units. */
const CAT_HOUSE_WIDTH = 0.8
/** Outer depth (along Z) of the cat house body, world units. */
const CAT_HOUSE_DEPTH = 0.8
/** Wall height of the cat house (under the pitched roof), world units. */
const CAT_HOUSE_WALL_HEIGHT = 0.55
/** Wall + floor + roof panel thickness, world units. */
const CAT_HOUSE_THICKNESS = 0.025
/** Radius of the round entry hole on the front face (–Z), world units. */
const CAT_HOUSE_ENTRY_RADIUS = 0.18
/** Vertical centre of the entry hole above the cabin floor, world units. */
const CAT_HOUSE_ENTRY_CENTRE_Y = 0.22
/** Roof peak height above the wall top, world units. */
const CAT_HOUSE_ROOF_PEAK = 0.22
/** Eaves overhang (X+Z) past the wall plane, world units. */
const CAT_HOUSE_ROOF_OVERHANG = 0.05
/** ShapeGeometry sweep — 0..2π — used when carving the round entry hole. */
const TWO_PI = Math.PI * 2

// --- Bedside locker --------------------------------------------------------
/** Path to the bedroom locker GLB asset. */
const LOCKER_MODEL_URL = '/models/locker.glb'
/** World X of the locker, pressed close to the same +X wall as the bed. */
const LOCKER_X = 4.32
/** World Z of the locker, placed at the bed end opposite Sushi's cat house. */
const LOCKER_Z = 1.35
/** Target world height of the locker after GLB normalization. */
const LOCKER_TARGET_HEIGHT = 1.7
/** Yaw applied to the locker so its front faces back into the walkable cabin. */
const LOCKER_YAW_RADIANS = -Math.PI / 2
/** Node name of the locker body transform in `locker.glb`. */
const LOCKER_BODY_NODE_NAME = 'body'
/** Node name of the locker door mesh pivot in `locker.glb`. */
const LOCKER_DOOR_NODE_NAME = 'door'
/** Minimum locker material roughness so local fill light reads softly. */
const LOCKER_MIN_ROUGHNESS = 0.72
/** Maximum locker material metalness so it does not crush to black under habitat light. */
const LOCKER_MAX_METALNESS = 0.28
/** Minimum environment-map intensity for the locker materials. */
const LOCKER_MIN_ENV_MAP_INTENSITY = 0.85
/** Low neutral emissive color that lifts the dark locker material without glowing. */
const LOCKER_MATERIAL_EMISSIVE_COLOR = 0x111820
/** Low neutral emissive intensity that keeps the locker readable in the bedroom corner. */
const LOCKER_MATERIAL_EMISSIVE_INTENSITY = 0.18
/** Color of the small locker-local visibility fill light. */
const LOCKER_FILL_LIGHT_COLOR = 0xb8d8ff
/** Intensity of the small locker-local visibility fill light. */
const LOCKER_FILL_LIGHT_INTENSITY = 0.65
/** Range of the small locker-local visibility fill light. */
const LOCKER_FILL_LIGHT_RANGE = 2.2
/** Local X offset of the locker fill light. */
const LOCKER_FILL_LIGHT_OFFSET_X = -0.28
/** Local Y offset of the locker fill light. */
const LOCKER_FILL_LIGHT_OFFSET_Y = 1.12
/** Local Z offset of the locker fill light. */
const LOCKER_FILL_LIGHT_OFFSET_Z = 0.35
/**
 * Distance (world units) Sushi waits away from the locker front before hopping
 * onto the top. Kept short because the locker is a compact perch.
 */
const LOCKER_CAT_APPROACH_OFFSET = 0.42
/** Fraction of the locker half-width that biases Sushi's perch toward the +X wall. */
const LOCKER_CAT_TOP_WALL_OFFSET_FRAC = 0.34
/** Small sideways nudge that moves Sushi toward the locker right side on top. */
const LOCKER_CAT_TOP_RIGHT_NUDGE_Z = 0.05
/** Fraction of the authored locker height used to lower Sushi's perch target. */
const LOCKER_CAT_TOP_HEIGHT_DROP_RATIO = 0.1

// --- Sleeping cat clone tunables ------------------------------------------
// The "asleep" visual is a separate baked clone of the live cat, parented to
// the cat house group so it inherits the house transform. These knobs let us
// dial in the curled-up pose by hand without touching the rig.

/** Local X position offset of the sleeping clone relative to the cat house origin. */
const CAT_SLEEP_OFFSET_X = 0
/** Local Y position offset of the sleeping clone relative to the cat house floor.
 * Wrapper origin sits at the cat's bbox centre, so we lift it ~half the cat's
 * lateral thickness so the body rests on the floor when rolled onto a side. */
const CAT_SLEEP_OFFSET_Y = 0.08
/** Local Z position offset of the sleeping clone relative to the cat house origin. */
const CAT_SLEEP_OFFSET_Z = 0
/** Local pitch (radians) applied to the sleeping clone — tips the body forward. */
const CAT_SLEEP_ROTATION_X = 0
/** Local yaw (radians) applied to the sleeping clone — spins the body about vertical.
 * 0 leaves the head pointed at the back wall so the player sees Sushi's back/side
 * through the doorway instead of staring straight at his face (which read as
 * unsettling without closed-eye morphs in the rig). */
const CAT_SLEEP_ROTATION_Y = 1.5
/** Local roll (radians) applied to the sleeping clone — rolls onto a side. */
const CAT_SLEEP_ROTATION_Z = Math.PI / 2
/** Uniform scale multiplier applied to the sleeping clone (1 = identical to live cat). */
const CAT_SLEEP_SCALE = 1

/** World X of the litterbox — mirror of the feeding bowl on the starboard (+X) side. */
const CAT_LITTER_X = 3.85
/** World Z of the litterbox, mirroring the feeding-area corner. */
const CAT_LITTER_Z = 7.2
/** Outer X half-extent of the litterbox tray (world units). */
const CAT_LITTER_HALF_X = 0.32
/** Outer Z half-extent of the litterbox tray (world units). */
const CAT_LITTER_HALF_Z = 0.42
/** Outer wall thickness of the litterbox tray (world units). */
const CAT_LITTER_WALL_THICKNESS = 0.025
/** Total wall height of the litterbox tray above {@link FLOOR_Y} (world units). */
const CAT_LITTER_WALL_HEIGHT = 0.09
/** Litter sand surface height above {@link FLOOR_Y} (world units). */
const CAT_LITTER_SAND_HEIGHT = 0.04
/** Radius of each waste-chunk sphere (world units). */
const LITTER_CHUNK_RADIUS = 0.018
/** Padding (world units) keeping chunks away from the inner tray walls. */
const LITTER_CHUNK_PAD = 0.04
/**
 * Normalized scatter pattern (each axis in `[-1, 1]`) for waste chunks inside the
 * litter sand. Indexed up to `LITTER_POLLUTION_MAX`; offsets are scaled by the inner
 * half-extents so chunks always sit inside the walls regardless of tray size.
 */
const LITTER_CHUNK_OFFSETS: ReadonlyArray<{ x: number; z: number }> = [
  { x: -0.5, z: -0.4 },
  { x: 0.4, z: -0.55 },
  { x: -0.2, z: 0.2 },
  { x: 0.55, z: 0.35 },
  { x: -0.6, z: 0.55 },
  { x: 0.15, z: -0.15 },
]
/** Outer radius of the ceramic food bowl (world units). */
const CAT_BOWL_RADIUS = 0.14
/** Total height of the food bowl (world units). */
const CAT_BOWL_HEIGHT = 0.05
/** Outer radius of the water fountain base (world units). */
const CAT_FOUNTAIN_RADIUS = 0.13
/** Total height of the water fountain (base cylinder + top dish), world units. */
const CAT_FOUNTAIN_HEIGHT = 0.2

/**
 * Padding (world units) added to each side of every furniture obstacle handed to the cat.
 * Slightly larger than the cat's body radius so paths skirt furniture instead of clipping
 * through corners.
 */
const CAT_OBSTACLE_PADDING = 0.35

/** Distance (XZ, world units) the player ends up in front of Sushi during a pet. */
const PET_APPROACH_DISTANCE = 0.7
/** XZ proximity (world units) at which the "Pet Sushi" prompt appears. */
const PET_PROMPT_DISTANCE = 1.6
/** XZ distance beyond which a sitting Sushi gets up and resumes wandering. */
const PET_SIT_CANCEL_DISTANCE = 3.0
/** Total seconds the pet glide-to-front animation lasts. */
const PET_APPROACH_DURATION_S = 0.55
/** Lerp factor (per second) for camera tracking onto Sushi during the pet sequence. */
const PET_CAMERA_TURN_RATE = 8
/**
 * Cooldown (seconds) between consecutive pets. Stops the player from spam-grinding
 * love by mashing F at zero love — Sushi needs a beat to re-warm-up before the next
 * scratch lands. Tuned so a polite cadence feels natural and a button-mash feels
 * blocked.
 */
const PET_COOLDOWN_S = 5

/** Lerp factor (per second) for the camera turn when interacting with the shuttle controls. */
const TABLE_CAMERA_TURN_RATE = 5
/** Total seconds the shuttle-controls camera-turn sequence lasts. */
const TABLE_CAMERA_TURN_DURATION_S = 0.65
/**
 * Vertical offset above {@link FLOOR_Y} used as the Y component of the table look-at target
 * so the camera tilts down toward the console surface rather than the floor beneath it.
 */
const TABLE_LOOK_TARGET_Y_OFFSET = 0.9

/** XZ proximity (world units) at which the "Fill Bowl" prompt appears. */
const BOWL_FILL_PROMPT_DISTANCE = 1.4
/** Distance (world units) within which the litterbox cleaning prompt appears. */
const LITTER_PROMPT_DISTANCE = 1.4
/** Total seconds the bowl scale-punch cue plays after a refill. */
const BOWL_FILL_CUE_DURATION_S = 0.45
/** Peak scale multiplier applied to the bowl mesh during the refill cue. */
const BOWL_FILL_CUE_SCALE_PEAK = 1.35

/** Radius (world units) of the red laser-pointer dot drawn on the floor. */
const LASER_DOT_RADIUS = 0.06
/** Vertical offset above {@link FLOOR_Y} so the dot doesn't z-fight the deck. */
const LASER_DOT_Y_BIAS = 0.005
/** Hex colour of the laser-pointer dot. */
const LASER_DOT_COLOR = 0xff2233

/**
 * How far from the back cap (-Z) the player stands when entering through the hatch on a
 * return visit. Set to {@link COLLISION_MARGIN} + a small buffer so the player is clearly
 * inside the cabin and not clipping the wall geometry.
 */
const HATCH_SPAWN_INSET = COLLISION_MARGIN + 0.5

/** FPS camera configuration for the habitat interior. */
const HABITAT_CAMERA_CONFIG: FpsCameraConfig = {
  eyeHeight: HABITAT_EYE_HEIGHT,
  sensitivity: HABITAT_SENSITIVITY,
  pitchClamp: HABITAT_PITCH_CLAMP,
  fov: HABITAT_FOV,
}

/**
 * Host-supplied callbacks that bridge the {@link HabitatInteriorScene} to Pinia-backed
 * profile state. The scene never reads stores directly; the facade owns persistence and
 * achievement evaluation.
 *
 * @author guinetik
 * @date 2026-05-07
 * @spec docs/superpowers/specs/2026-05-07-sushi-care-design.md
 */
export interface SushiBridgeCallbacks {
  /** Read current hunger (0..100) from the player profile. */
  getHunger(): number
  /** Read current love (0..100) from the player profile. */
  getLove(): number
  /** Read current bowl servings (0..10) from the player profile. */
  getBowlServings(): number
  /** Read current bladder (0..100) from the player profile. */
  getBladder(): number
  /** Read current tiredness (0..100) from the player profile. */
  getTired(): number
  /** Apply a tiredness delta — facade clamps + persists on its own throttle. */
  addTired(delta: number): void
  /** Apply a hunger delta — used by the cat controller while sprinting after the laser. */
  addHunger(delta: number): void
  /** Cat consumed one serving — facade decrements bowl + restores hunger + saves. */
  onEatServing(): void
  /** Cat got pet — facade adds love + bumps stats + saves + evaluates achievements. */
  onPetted(): void
  /** Cat just pounced on the laser dot — facade adds a small love bump per catch. */
  onCaughtLaser(): void
  /** Cat finished using the litterbox — facade resets bladder + saves. */
  onUsedLitter(): void
  /** Read the current waste-chunk count in the litterbox (0..LITTER_POLLUTION_MAX). */
  getLitterPollution(): number
  /** Player pressed F at the litterbox while it had chunks — facade clears pollution. */
  onEmptyLitter(): void
  /** Cat woke up from a nap — facade resets tiredness + saves. */
  onWoke(): void
  /**
   * Cat finished a hangout on the cat tower — facade adds a small love bump and
   * persists. Fires once per visit, mirroring {@link onCaughtLaser}.
   */
  onUsedTower(): void
  /** True when the player can fill the bowl (≥1 cat-food in inventory AND bowl not full). */
  canFillBowl(): boolean
  /** True when the player has at least one cat-food unit available in the shuttle inventory. */
  hasCatFood(): boolean
  /** Player pressed F at the bowl — facade fills bowl from inventory + saves. */
  onFillBowl(): void
}

/**
 * Shared loader for habitat interior PBR maps. Hoisted so re-entering the
 * habitat doesn't refetch 8 webp files on every scene swap.
 */
const HABITAT_TEXTURE_LOADER = new THREE.TextureLoader()

/** Module-scoped texture cache keyed by URL — habitat textures are read-only and shared. */
const HABITAT_TEXTURE_CACHE = new Map<string, THREE.Texture>()

/**
 * Load (or fetch from cache) a tiled habitat texture. Returns the shared instance — callers
 * must not mutate `repeat`, `wrapS/T`, or `colorSpace` after the first load.
 *
 * @param url - Public texture URL generated by the texture build pipeline.
 * @param colorSpace - Color-space hint for color maps vs data maps.
 * @param repeatX - Horizontal repeat count.
 * @param repeatY - Vertical repeat count.
 */
function loadHabitatTextureCached(
  url: string,
  colorSpace: THREE.ColorSpace,
  repeatX: number,
  repeatY: number,
): THREE.Texture {
  const cached = HABITAT_TEXTURE_CACHE.get(url)
  if (cached) return cached
  const texture = HABITAT_TEXTURE_LOADER.load(url)
  texture.colorSpace = colorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeatX, repeatY)
  texture.anisotropy = HABITAT_PAINT_TEXTURE_ANISOTROPY
  HABITAT_TEXTURE_CACHE.set(url, texture)
  return texture
}

// ---------------------------------------------------------------------------
// Scene class
// ---------------------------------------------------------------------------

/**
 * Walkable first-person habitat interior scene.
 *
 * Instantiate, call {@link load} to stream in furniture, then call
 * {@link tick} every frame. The host ViewController is responsible for
 * mounting the camera, handling pointer-lock mouse deltas via
 * `fpsCamera.applyMouseDelta()`, and resizing with `fpsCamera.resize()`.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-habitat-interior-design.md
 */
export class HabitatInteriorScene {
  /** The Three.js scene graph. */
  readonly scene: THREE.Scene

  /** First-person camera controller. */
  readonly fpsCamera: FpsCamera

  /** Keyboard input tracker. */
  readonly inputManager: InputManager

  /**
   * Called when the player successfully interacts with a named object.
   * @param target - Identifier of the interacted object (e.g. `'table'`).
   */
  onInteract: ((target: string) => void) | null = null

  /**
   * Called whenever the interaction prompt should appear or disappear.
   * Pass `null` to hide the prompt; pass a string to show it.
   * @param prompt - Prompt text or `null`.
   */
  onPrompt: ((prompt: string | null) => void) | null = null

  /** Player avatar Object3D — moved each frame, camera tracks it. */
  private readonly player: THREE.Object3D

  /** World position of the table, used for interaction distance checks. */
  private tablePosition = new THREE.Vector3()

  /** Guards against calling load() more than once. */
  private loaded = false

  /**
   * Cached spawn yaw for {@link getSpawnPosition}. `Math.PI` so the player wakes up facing
   * the **table** (+Z, cockpit-side cap) rather than the cockpit hatch (−Z, back cap). At
   * yaw=0 the FPS forward is (0, 0, -1); flipping by π puts forward at (0, 0, +1) toward
   * the table.
   */
  private spawnYaw = Math.PI

  /** Footstep audio for the flat habitat floor. */
  private readonly footsteps = new FootstepSystem('habitat')

  /** Loaded table root — moved when using the dev grab/place tool. */
  private tableRoot: THREE.Object3D | null = null

  /** Achievement poster wall mounted above the cockpit hatch. */
  private readonly posterWall = new HabitatPosterWall()

  /**
   * Large solar completion poster (all achievement-backed planet slots) — starboard side of the
   * hatch on the −Z back cap.
   */
  private readonly completionPoster = new HabitatCompletionPoster()

  /** Three mission-line posters centered on the front bulkhead above the mess table. */
  private readonly tablePosterRow = new HabitatTablePosterRow()

  /** Procedural animated lava lamp placed on the raised bed rail. */
  private readonly lavaLamp = new LavaLampModel()

  /** Wall-mounted sideboard on the +X corner of the back hatch wall. */
  private readonly sideboard = new HabitatSideboardModel()

  /** Coffee machine prop sitting on top of the sideboard. */
  private readonly coffeeMachine = new HabitatCoffeeMachineModel()

  /** Record player prop sitting on top of the sideboard. */
  private readonly recordPlayer = new HabitatRecordPlayerModel()

  /** Moon lamp sitting on the opposite end of the sideboard, lighting the corner. */
  private readonly moonLamp = new HabitatMoonLampModel()

  /** Free-standing refractor telescope in the −X sun corner. Optional appliance. */
  private readonly refractorTelescope = new HabitatRefractorTelescopeModel()

  /** Lounge chair in the −X / −Z corner of the cabin. Optional appliance. */
  private readonly loungeChair = new HabitatLoungeChairModel()

  /** Arcade machine next to the cockpit table on the −X side. Optional appliance. */
  private readonly arcadeMachine = new HabitatArcadeMachineModel()

  /** Cat climbing tower next to the bedside locker. Optional appliance. */
  private readonly catTower = new HabitatCatTowerModel()

  /**
   * Conditional appliance unlocks consulted before fetching optional GLBs.
   * Default everything off — facade pushes the live profile flags in via
   * {@link setHabitatAppliances} before {@link load} runs.
   */
  private habitatAppliances = {
    coffeeMachine: false,
    recordPlayer: false,
    refractorTelescope: false,
    loungeChair: false,
    arcadeMachine: false,
    catTower: false,
  }

  /** World-space AABBs the player movement resolver pushes the player out of. */
  private readonly playerObstacles: THREE.Box3[] = []

  /** Paintable habitat floor material. */
  private habitatFloorMaterial: THREE.MeshStandardMaterial | null = null

  /** Paintable cockpit-hatch wall material on the back cap. */
  private habitatHatchWallMaterial: THREE.MeshStandardMaterial | null = null

  /** Paintable table wall material on the front cap. */
  private habitatTableWallMaterial: THREE.MeshStandardMaterial | null = null

  /** Hatch frame torus material — retinted from the hatch-wall theme stop. */
  private habitatHatchFrameMaterial: THREE.MeshStandardMaterial | null = null

  /** Warm interior point light retinted by the active habitat theme. */
  private habitatPointLight: THREE.PointLight | null = null

  /** Cool ambient fill retinted by the active habitat theme. */
  private habitatAmbientLight: THREE.AmbientLight | null = null

  /** Cool exterior directional rim retinted by the active habitat theme. */
  private habitatRimLight: THREE.DirectionalLight | null = null

  /**
   * Backdrop celestial body visible through the canopy. Smoke-test stage:
   * Earth is hardcoded; future patches will route the docked / nearest-orbit
   * body in from the map controller.
   */
  private readonly backdrop = new HabitatBackdrop()

  /** Act I journey art — large frame port of the hatch grid on the −Z back cap (viewer −X). */
  private readonly journeyAct1Wall = new HabitatLargeAchievementPoster({
    poster: JOURNEY_LARGE_POSTER_CATALOG[0]!,
  })

  /** Act II journey art — port of the mess console on the +Z bulkhead (viewer −X). */
  private readonly journeyAct2Wall = new HabitatLargeAchievementPoster({
    poster: JOURNEY_LARGE_POSTER_CATALOG[1]!,
  })

  /** Act III journey art — starboard of the mess console on the +Z bulkhead (viewer +X). */
  private readonly journeyAct3Wall = new HabitatLargeAchievementPoster({
    poster: JOURNEY_LARGE_POSTER_CATALOG[2]!,
  })

  /**
   * Sushi the cat — roams the cabin once {@link load} resolves. Kept as a tribute
   * to the author's cat (R.I.P. 2026); load failures are non-fatal so the rest of
   * the habitat still works without the model.
   */
  private cat: CatController | null = null

  /**
   * Set to true the moment {@link dispose} runs so the deferred cat load can bail out
   * before mutating a tear-down scene. The cat GLB resolves a frame or two after the
   * cabin is mounted; without this guard, a quick enter→exit could let the cat's
   * group land in a disposed scene and leak.
   */
  private disposed = false

  /**
   * 3D positional audio director for Sushi (purr / sleep loops + idle one-shot meows).
   * Started after the cat model loads in {@link load}, ticked each frame in {@link tick},
   * disposed alongside the rest of the scene.
   */
  private readonly catAudio = new CatAudioDirector()
  /** Reused snapshot fed into {@link CatAudioDirector.update} every frame. */
  private readonly _catAudioState: CatAudioState = {
    catState: 'idle',
    isSleeping: false,
    love: 0,
    hunger: 0,
    bladder: 0,
    tired: 0,
    catWorldPos: new THREE.Vector3(),
    houseWorldPos: new THREE.Vector3(),
  }
  /**
   * Cat-house group reference (built in {@link buildCatHouse}) — kept so the
   * sleeping-cat clone can be parented inside the house and inherit the house
   * yaw/position automatically.
   */
  private catHouseGroup: THREE.Group | null = null
  /**
   * Baked "asleep in the cat house" visual — a static {@link SkeletonUtils.clone}
   * of the live cat's bind pose, parented inside the house with tunable
   * rotation/scale. Hidden by default; the bridge toggles its visibility in
   * lockstep with the live cat's `sleeping` state.
   */
  private sleepingCatClone: THREE.Object3D | null = null

  /** When true, table follows the camera until the next LMB releases it. */
  private tablePlacementGrabbed = false

  private readonly _tmpWorldPos = new THREE.Vector3()
  private readonly _tmpWorldQuat = new THREE.Quaternion()
  private readonly _tmpEuler = new THREE.Euler()

  /** Stored world-space position of the food bowl, populated by {@link buildCatFeedingArea}. */
  private readonly bowlWorldPosition = new THREE.Vector3()

  /** Stored world-space position of the litterbox, populated by {@link buildCatLitterArea}. */
  private readonly litterWorldPosition = new THREE.Vector3()
  /**
   * Waste chunk meshes inside the litterbox sand. Visibility per index is driven by
   * `litterPollution` from the player profile — index `i` is visible when `i < pollution`.
   */
  private readonly litterChunkMeshes: THREE.Mesh[] = []

  /**
   * World-space sit point on top of the bed (XZ at mattress centre, Y at mattress top
   * minus {@link BED_TOP_Y_INSET}). Populated after the bed mesh lands during
   * {@link load}; consumed by the bed-jumping bridge so the cat lerps onto the duvet.
   */
  private readonly bedTopWorldPosition = new THREE.Vector3()
  /**
   * Approach waypoints on the floor next to the bed (foot, long side, head). The cat
   * walks to one of these before leaping up — populated during {@link load} from the
   * bed's runtime bbox so the points follow the mesh wherever it lands.
   */
  private readonly bedApproachWorldPositions: THREE.Vector3[] = []

  /** World-space sideboard-top landing point beside the moon lamp. Populated after load. */
  private readonly sideboardTopWorldPosition = new THREE.Vector3()
  /** World-space sideboard-top final sit point on the far side of the moon lamp. */
  private readonly sideboardSitWorldPosition = new THREE.Vector3()
  /** Floor approach waypoints that let Sushi hop onto the sideboard from the cabin side. */
  private readonly sideboardApproachWorldPositions: THREE.Vector3[] = []
  /** World-space locker-top sit point. Populated after locker placement. */
  private readonly lockerTopWorldPosition = new THREE.Vector3()
  /** Floor approach waypoints that let Sushi hop onto the bedside locker. */
  private readonly lockerApproachWorldPositions: THREE.Vector3[] = []
  /** World-space shuttle-control table-top sit point. Populated after table placement. */
  private readonly tableTopWorldPosition = new THREE.Vector3()
  /** Floor approach waypoints that let Sushi hop onto the shuttle-control table. */
  private readonly tableApproachWorldPositions: THREE.Vector3[] = []
  /** World-space cat-tower top-platform sit point. Populated after the tower loads. */
  private readonly towerTopWorldPosition = new THREE.Vector3()
  /**
   * Floor approach waypoints that let Sushi hop onto the cat tower. Empty until
   * the optional appliance has finished loading; the bridge reports a zero side
   * count in that case so the cat falls back to ambient perch beats.
   */
  private readonly towerApproachWorldPositions: THREE.Vector3[] = []

  /** Stored world-space position of the cat house, populated by {@link buildCatHouse}. */
  private readonly houseWorldPosition = new THREE.Vector3()
  /**
   * World-space waypoint sitting {@link CAT_HOUSE_APPROACH_DISTANCE} directly in front
   * of the cat-house entry. Populated by {@link buildCatHouse} and read by the cat
   * controller through `getHouseApproachWorldPosition` so it lines up perpendicular
   * to the door before walking straight in.
   */
  private readonly houseApproachWorldPosition = new THREE.Vector3()

  /** Reference to the bowl mesh so the refill cue can punch its scale. */
  private bowlMesh: THREE.Mesh | null = null

  /** Reference to the kibble disc rendered inside the bowl — hidden when bowl is empty. */
  private kibbleMesh: THREE.Mesh | null = null

  /** Seconds remaining on the active bowl-fill scale-punch cue (0 when idle). */
  private bowlFillCueTimer = 0

  /** Optional sushi care callbacks installed via {@link setSushiBridgeCallbacks}. */
  private sushiCallbacks: SushiBridgeCallbacks | null = null

  /** Red dot drawn on the floor while the player holds LMB to drive Sushi's chase. */
  private laserDot: THREE.Mesh | null = null
  /** Whether the host facade reports LMB is currently held this frame. */
  private laserPointerHeld = false
  /** Reused raycaster for the camera-forward → floor query. */
  private readonly laserRaycaster = new THREE.Raycaster()
  /** Reused floor plane (Y = FLOOR_Y) for laser raycasting. */
  private readonly laserFloorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -FLOOR_Y)
  /** Scratch vector for the laser ray direction. */
  private readonly _laserDir = new THREE.Vector3()
  /** Scratch vector for the laser hit point. */
  private readonly _laserHit = new THREE.Vector3()

  /** True while the player is being glided into petting position in front of Sushi. */
  private petSequenceActive = false
  /** Seconds elapsed in the current pet glide-to-front sequence. */
  private petSequenceTime = 0
  /**
   * Seconds remaining on the no-pet cooldown after a successful F-press. Counts
   * down in {@link tick}; while > 0 the prompt swaps to a "needs a moment" hint
   * and the F-press is ignored. See {@link PET_COOLDOWN_S}.
   */
  private petCooldownTimer = 0
  /** XZ start of the pet glide; Y reused as floor. */
  private readonly _petStartXZ = new THREE.Vector2()
  /** XZ end of the pet glide — a point in front of Sushi. */
  private readonly _petTargetXZ = new THREE.Vector2()

  /** True while the camera is turning to look at the shuttle controls table after F is pressed. */
  private tableSequenceActive = false
  /** Seconds elapsed in the current shuttle-controls camera-turn sequence. */
  private tableSequenceTime = 0

  /**
   * The sub-group containing the hatch wheel-knob ring and crossed spokes. Parented inside
   * the hatch group; rotating this around Z spins the handle without moving the door or frame.
   */
  private hatchKnobPivot: THREE.Group | null = null
  /** True while the knob spin animation is playing after the player presses F at the hatch. */
  private hatchExitActive = false
  /** Seconds elapsed in the current hatch knob-spin animation. */
  private hatchExitTime = 0

  constructor() {
    this.scene = new THREE.Scene()
    this.fpsCamera = new FpsCamera(HABITAT_CAMERA_CONFIG)
    this.inputManager = new InputManager(HABITAT_BINDINGS)

    // Player avatar — an empty Object3D the camera attaches to
    this.player = new THREE.Object3D()
    this.player.position.set(0, FLOOR_Y, 0)
    this.scene.add(this.player)
    this.fpsCamera.setTarget(this.player)
    this.fpsCamera.yaw = this.spawnYaw

    this.buildCylinder()
    this.buildCockpitHatch()
    this.buildPosterWall()
    this.buildCompletionPoster()
    this.buildJourneyAct1HatchPoster()
    this.buildJourneyAct2And3TableBulkheadPosters()
    this.buildTablePosterRow()
    this.buildLighting()
    this.buildStarfield()
    this.buildBackdrop()
    this.buildFloor()
    this.buildLaserDot()
  }

  /**
   * Build the floor-hugging red dot used for the laser-pointer chase. Hidden by
   * default; {@link tickLaserPointer} flips its visibility on the frames the
   * player is holding LMB and the ray hits the deck.
   */
  private buildLaserDot(): void {
    const geo = new THREE.CircleGeometry(LASER_DOT_RADIUS, 24)
    const mat = new THREE.MeshBasicMaterial({
      color: LASER_DOT_COLOR,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      toneMapped: false,
    })
    const dot = new THREE.Mesh(geo, mat)
    dot.rotation.x = -Math.PI / 2
    dot.position.y = FLOOR_Y + LASER_DOT_Y_BIAS
    dot.visible = false
    this.scene.add(dot)
    this.laserDot = dot
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Returns the Three.js perspective camera owned by the FPS controller. */
  getCamera(): THREE.PerspectiveCamera {
    return this.fpsCamera.camera
  }

  /** Returns the scene graph. */
  getScene(): THREE.Scene {
    return this.scene
  }

  /**
   * Push the player's habitat-appliance unlock flags into the scene before
   * {@link load} runs. Conditional GLBs (coffee machine, record player) are
   * skipped entirely when their flag is false — the network request is never
   * made and no scene node is created.
   *
   * @param flags - Live flags from `profile.habitatAppliances` (or `undefined` for legacy saves).
   */
  setHabitatAppliances(
    flags:
      | {
          coffeeMachine: boolean
          recordPlayer: boolean
          refractorTelescope: boolean
          loungeChair: boolean
          arcadeMachine: boolean
          catTower: boolean
        }
      | undefined,
  ): void {
    this.habitatAppliances = {
      coffeeMachine: flags?.coffeeMachine === true,
      recordPlayer: flags?.recordPlayer === true,
      refractorTelescope: flags?.refractorTelescope === true,
      loungeChair: flags?.loungeChair === true,
      arcadeMachine: flags?.arcadeMachine === true,
      catTower: flags?.catTower === true,
    }
  }

  /**
   * Apply the active habitat interior cosmetic from a player profile. Theme stop order:
   * floor, hatch wall, table wall, lava lamp liquid, lava lamp wax.
   *
   * @param profile - Active player profile containing persisted cosmetics.
   */
  applyHabitatInteriorFromProfile(profile: PlayerProfile): void {
    const cosmetics = getPlayerCosmetics(profile)
    const option = findCosmeticOptionById(cosmetics.habitatInteriorId)
    if (!option || option.category !== 'habitat-interior') return
    const stops = option.gradientStops
    const floor = stops[HABITAT_THEME_FLOOR_STOP_INDEX] ?? HABITAT_THEME_FALLBACK_COLOR
    const hatchWall = stops[HABITAT_THEME_HATCH_WALL_STOP_INDEX] ?? floor
    const tableWall = stops[HABITAT_THEME_TABLE_WALL_STOP_INDEX] ?? hatchWall
    const lamp = stops[HABITAT_THEME_LAMP_STOP_INDEX] ?? tableWall
    const blob = stops[HABITAT_THEME_BLOB_STOP_INDEX] ?? lamp

    const pointLight = stops[HABITAT_THEME_POINT_LIGHT_STOP_INDEX] ?? HABITAT_DEFAULT_POINT_LIGHT_COLOR
    const ambient = stops[HABITAT_THEME_AMBIENT_STOP_INDEX] ?? HABITAT_DEFAULT_AMBIENT_COLOR

    this.applyHabitatPaintMaterial(this.habitatFloorMaterial, floor, {
      emissiveIntensity: HABITAT_PAINT_FLOOR_EMISSIVE_INTENSITY,
      metalness: HABITAT_PAINT_FLOOR_METALNESS,
    })
    this.applyHabitatPaintMaterial(this.habitatHatchWallMaterial, hatchWall, {
      emissiveIntensity: HABITAT_PAINT_WALL_EMISSIVE_INTENSITY,
      metalness: HABITAT_PAINT_WALL_METALNESS,
    })
    this.applyHabitatPaintMaterial(this.habitatTableWallMaterial, tableWall, {
      emissiveIntensity: HABITAT_PAINT_WALL_EMISSIVE_INTENSITY,
      metalness: HABITAT_PAINT_WALL_METALNESS,
    })
    this.applyHabitatHatchFrameTint(hatchWall)
    this.lavaLamp.applyTheme({
      glassColor: lamp,
      liquidColor: lamp,
      hotBlobColor: blob,
      lightColor: lamp,
    })
    this.habitatPointLight?.color.set(pointLight)
    this.habitatAmbientLight?.color.set(ambient)
    this.habitatRimLight?.color.set(ambient)
  }

  /**
   * Tint the hatch frame torus from the hatch-wall stop so the outer ring reads as
   * trim painted to match the wall, not stock grey hardware. Frame keeps its
   * higher metalness + lower roughness so it still looks like a metal collar.
   *
   * @param hatchWallColor - Hatch-wall theme stop color.
   */
  private applyHabitatHatchFrameTint(hatchWallColor: string): void {
    const material = this.habitatHatchFrameMaterial
    if (!material) return
    material.color.set(hatchWallColor)
    material.needsUpdate = true
  }

  /**
   * Re-tune a paintable habitat material so catalog colors remain visible under cabin lighting.
   *
   * @param material - Paintable material reference captured during scene construction.
   * @param color - CSS hex color from the active habitat interior cosmetic.
   * @param finish - Small finish override used to keep walls/floor readable.
   */
  private applyHabitatPaintMaterial(
    material: THREE.MeshStandardMaterial | null,
    color: string,
    finish: { readonly emissiveIntensity: number; readonly metalness: number },
  ): void {
    if (!material) return
    material.color.set(color)
    material.emissive.set(color)
    material.emissiveIntensity = finish.emissiveIntensity
    material.metalness = finish.metalness
    material.roughness = HABITAT_PAINT_ROUGHNESS
    material.needsUpdate = true
  }

  /**
   * Add checker PBR maps to the deck while leaving catalog theme color as a tint.
   *
   * @param material - Paintable floor material created by {@link buildFloor}.
   */
  private applyHabitatFloorTextureMaps(material: THREE.MeshStandardMaterial): void {
    material.map = loadHabitatTextureCached(
      HABITAT_FLOOR_COLOR_TEXTURE_URL,
      THREE.SRGBColorSpace,
      HABITAT_FLOOR_TEXTURE_REPEAT_X,
      HABITAT_FLOOR_TEXTURE_REPEAT_Y,
    )
    material.normalMap = loadHabitatTextureCached(
      HABITAT_FLOOR_NORMAL_TEXTURE_URL,
      THREE.NoColorSpace,
      HABITAT_FLOOR_TEXTURE_REPEAT_X,
      HABITAT_FLOOR_TEXTURE_REPEAT_Y,
    )
    material.roughnessMap = loadHabitatTextureCached(
      HABITAT_FLOOR_ROUGHNESS_TEXTURE_URL,
      THREE.NoColorSpace,
      HABITAT_FLOOR_TEXTURE_REPEAT_X,
      HABITAT_FLOOR_TEXTURE_REPEAT_Y,
    )
    material.normalScale.set(HABITAT_FLOOR_NORMAL_SCALE, HABITAT_FLOOR_NORMAL_SCALE)
    material.needsUpdate = true
  }

  /**
   * Add plate PBR maps to an end-cap wall while leaving catalog theme color as a tint.
   *
   * @param material - Paintable wall material created by {@link buildCylinder}.
   */
  private applyHabitatWallTextureMaps(material: THREE.MeshStandardMaterial): void {
    material.map = loadHabitatTextureCached(
      HABITAT_WALL_COLOR_TEXTURE_URL,
      THREE.SRGBColorSpace,
      HABITAT_WALL_TEXTURE_REPEAT_X,
      HABITAT_WALL_TEXTURE_REPEAT_Y,
    )
    material.normalMap = loadHabitatTextureCached(
      HABITAT_WALL_NORMAL_TEXTURE_URL,
      THREE.NoColorSpace,
      HABITAT_WALL_TEXTURE_REPEAT_X,
      HABITAT_WALL_TEXTURE_REPEAT_Y,
    )
    material.roughnessMap = loadHabitatTextureCached(
      HABITAT_WALL_ROUGHNESS_TEXTURE_URL,
      THREE.NoColorSpace,
      HABITAT_WALL_TEXTURE_REPEAT_X,
      HABITAT_WALL_TEXTURE_REPEAT_Y,
    )
    material.metalnessMap = loadHabitatTextureCached(
      HABITAT_WALL_METALNESS_TEXTURE_URL,
      THREE.NoColorSpace,
      HABITAT_WALL_TEXTURE_REPEAT_X,
      HABITAT_WALL_TEXTURE_REPEAT_Y,
    )
    material.bumpMap = loadHabitatTextureCached(
      HABITAT_WALL_DISPLACEMENT_TEXTURE_URL,
      THREE.NoColorSpace,
      HABITAT_WALL_TEXTURE_REPEAT_X,
      HABITAT_WALL_TEXTURE_REPEAT_Y,
    )
    material.bumpScale = HABITAT_WALL_BUMP_SCALE
    material.normalScale.set(HABITAT_WALL_NORMAL_SCALE, HABITAT_WALL_NORMAL_SCALE)
    material.needsUpdate = true
  }

  /**
   * Snap the player and camera to the hatch entry spawn — standing just inside the back cap,
   * facing into the cabin (+Z toward the table). Called by the facade on return habitat entries
   * to replace the bed wake-up cinematic with a "stepping through the hatch" feel.
   */
  setHatchSpawn(): void {
    this.player.position.set(0, FLOOR_Y, -CYLINDER_LENGTH / 2 + HATCH_SPAWN_INSET)
    this.fpsCamera.yaw = Math.PI // facing +Z, into the cabin
    this.fpsCamera.pitch = 0
  }

  /**
   * Returns the recommended spawn position and yaw for the player camera.
   * Call this before handing off pointer-lock to ensure the view faces the table.
   */
  getSpawnPosition(): { position: THREE.Vector3; yaw: number } {
    return {
      position: new THREE.Vector3(0, FLOOR_Y + HABITAT_CAMERA_CONFIG.eyeHeight, 0),
      yaw: this.spawnYaw,
    }
  }

  /**
   * Primary mouse button while pointer-locked. In dev, grab/release the table for manual pose
   * tuning: first LMB near the table attaches it in front of the view; second LMB places it
   * and logs world {@link THREE.Vector3 | position} + {@link THREE.Quaternion | quaternion}
   * to the browser console.
   */
  onPrimaryClick(): void {
    if (!isTablePlacementDebugEnabled() || !this.tableRoot) return
    if (this.tablePlacementGrabbed) {
      this.commitTablePlacementFromDebug()
      return
    }
    const px = this.player.position.x - this.tablePosition.x
    const pz = this.player.position.z - this.tablePosition.z
    const distXZ = Math.hypot(px, pz)
    if (distXZ < INTERACT_DISTANCE * TABLE_DEBUG_GRAB_REACH_MULT) {
      this.tablePlacementGrabbed = true
      this.onPrompt?.('LMB place table → devtools console')
    }
  }

  /**
   * Asynchronously loads bed.glb and table.glb and places them in the scene.
   * Safe to call multiple times — returns early after the first successful load.
   */
  async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true

    const [, , , , , , bedModel, tableModel, lockerModel] = await Promise.all([
      this.posterWall.load(),
      this.completionPoster.load(),
      this.journeyAct1Wall.load(),
      this.journeyAct2Wall.load(),
      this.journeyAct3Wall.load(),
      this.tablePosterRow.load(),
      loadGLB('/models/bed.glb'),
      loadGLB('/models/table.glb'),
      loadGLB(LOCKER_MODEL_URL),
    ])

    // --- Bed ----------------------------------------------------------------
    const bedBox = new THREE.Box3().setFromObject(bedModel)
    const bedSize = bedBox.getSize(new THREE.Vector3())
    const bedMaxDim = Math.max(bedSize.x, bedSize.y, bedSize.z)
    // Scale so the longest dimension ≈ 2 world units
    const BED_TARGET_SIZE = 2
    bedModel.scale.setScalar(BED_TARGET_SIZE / bedMaxDim)
    bedModel.rotation.y = Math.PI // face toward the base

    // Re-centre after scale + rotation, then shove against the −X wall.
    bedBox.setFromObject(bedModel)
    const bedCenter = bedBox.getCenter(new THREE.Vector3())
    bedModel.position.sub(bedCenter)
    bedModel.position.x += BED_X

    // Drop to floor
    bedBox.setFromObject(bedModel)
    const bedMin = bedBox.min.y
    bedModel.position.y -= bedMin - FLOOR_Y

    this.scene.add(bedModel)

    // Cache bed approach + mattress-top waypoints from the live bbox so the cat's
    // bed-jumping behaviour follows the mesh without any hardcoded offsets.
    this.computeBedJumpWaypoints(bedModel)

    // --- Bed lava lamp ------------------------------------------------------
    this.lavaLamp.placeOnBed(bedModel)
    this.scene.add(this.lavaLamp.group)

    // --- Table --------------------------------------------------------------
    // The GLB ships with its origin at the floor-center thanks to
    // `scripts/center-table-glb.mjs` (runs `@gltf-transform/functions`'s
    // `center({ pivot: 'below' })`). That means we only need scale + author
    // rotation + final XZ placement; no runtime re-centering needed.
    const tableBox = new THREE.Box3().setFromObject(tableModel)
    const tableSize = tableBox.getSize(new THREE.Vector3())
    const tableMaxDim = Math.max(tableSize.x, tableSize.y, tableSize.z)
    const TABLE_TARGET_SIZE = 3.5
    tableModel.scale.setScalar(TABLE_TARGET_SIZE / tableMaxDim)
    tableModel.rotation.set(TABLE_LAYOUT_ROT_X, TABLE_LAYOUT_ROT_Y, TABLE_LAYOUT_ROT_Z)

    const TABLE_Z = CYLINDER_LENGTH / 2 - TABLE_FRONT_CAP_CLEARANCE
    tableModel.position.set(0, FLOOR_Y, TABLE_Z)

    // Defensive drop-to-floor in case the layout rotation flipped Y past zero.
    tableBox.setFromObject(tableModel)
    if (tableBox.min.y < FLOOR_Y) {
      tableModel.position.y -= tableBox.min.y - FLOOR_Y
    }

    // Tame the emissive LEDs on the table model
    tableModel.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        for (const mat of mats) {
          if (mat instanceof THREE.MeshStandardMaterial && mat.emissiveIntensity > 0) {
            mat.emissiveIntensity = Math.min(mat.emissiveIntensity, 0.7)
          }
        }
      }
    })

    this.scene.add(tableModel)
    this.tableRoot = tableModel
    tableModel.updateMatrixWorld(true)
    new THREE.Box3().setFromObject(tableModel).getCenter(this.tablePosition)
    this.tablePosition.y = FLOOR_Y
    this.computeTableJumpWaypoints(tableModel)

    // --- Sushi's feeding area ----------------------------------------------
    const feedingArea = this.buildCatFeedingArea()
    this.scene.add(feedingArea)

    // --- Sushi's litterbox (mirror of feeding area on the +X side) ---------
    const litterArea = this.buildCatLitterArea()
    this.scene.add(litterArea)

    // --- Sushi's cat house (sleeps when tired) -----------------------------
    const catHouse = this.buildCatHouse()
    this.scene.add(catHouse)
    this.catHouseGroup = catHouse

    // --- Bedside locker -----------------------------------------------------
    configureLocker(lockerModel)
    this.scene.add(lockerModel)
    this.computeLockerJumpWaypoints(lockerModel)

    // --- Sushi (habitat cat) -----------------------------------------------
    // Tribute NPC. Loaded best-effort: a load failure should not break the
    // rest of the habitat scene, so we swallow the error and log it instead.
    // Obstacle rectangles are computed from the *current* world bbox of each
    // piece of furniture so the avoidance follows the actual placement, not
    // hardcoded numbers that would drift if layout constants change. The
    // hatch-wall sideboard is loaded async (see {@link loadHatchWallFurnitureAsync});
    // it sits in a corner outside the cat's wander rectangle so its absence here
    // is harmless.
    const obstacles: CatObstacle[] = [
      footprintFromObject(bedModel, CAT_OBSTACLE_PADDING),
      footprintFromObject(tableModel, CAT_OBSTACLE_PADDING),
      footprintFromObject(feedingArea, CAT_OBSTACLE_PADDING),
      footprintFromObject(litterArea, CAT_OBSTACLE_PADDING),
      footprintFromObject(catHouse, CAT_OBSTACLE_PADDING),
      footprintFromObject(lockerModel, CAT_OBSTACLE_PADDING),
    ]
    // Fire-and-forget: the GLB takes a few hundred ms to fetch + parse, and we
    // don't want the cabin to appear blank while we wait. The cat will pop in
    // and start its FSM the frame this promise resolves. `tick()` already guards
    // every cat read with `?.`, so the scene runs cleanly without him.
    void this.loadCatAsync(obstacles)

    // Same fire-and-forget rule for the hatch-wall sideboard plus the coffee
    // machine and record player that mount on top. None of these block the
    // cabin from appearing; the player can move around while they stream in.
    void this.loadHatchWallFurnitureAsync()

    // Optional refractor telescope in the −X sun corner. Conditional on its
    // own profile flag — when locked, the GLB is never fetched.
    void this.loadRefractorTelescopeAsync()

    // Optional lounge chair tucked between telescope wall and hatch wall. Same
    // fire-and-forget rule + conditional gate.
    void this.loadLoungeChairAsync()

    // Optional arcade machine next to the cockpit table. Same rule.
    void this.loadArcadeMachineAsync()

    // Optional cat tower next to the bedside locker. Same rule.
    void this.loadCatTowerAsync()
  }

  /**
   * Deferred conditional load of the refractor telescope. Skipped entirely
   * when {@link habitatAppliances.refractorTelescope} is false. Bails silently
   * on load errors so a missing prop doesn't kill the scene.
   */
  private async loadRefractorTelescopeAsync(): Promise<void> {
    if (!this.habitatAppliances.refractorTelescope) return
    try {
      await this.refractorTelescope.load()
      if (this.disposed) return
      this.refractorTelescope.group.position.set(
        REFRACTOR_TELESCOPE_X,
        FLOOR_Y,
        REFRACTOR_TELESCOPE_Z,
      )
      this.refractorTelescope.group.rotation.y = REFRACTOR_TELESCOPE_ROTATION_Y
      this.refractorTelescope.refreshAabb()
      this.scene.add(this.refractorTelescope.group)
      this.playerObstacles.push(this.refractorTelescope.getCollisionAabb().clone())
    } catch (err) {
      console.warn('[HabitatInteriorScene] Refractor telescope load failed:', err)
    }
  }

  /**
   * Deferred conditional load of the lounge chair. Skipped entirely when
   * {@link habitatAppliances.loungeChair} is false. Bails silently on load
   * errors so a missing prop doesn't kill the scene.
   */
  private async loadLoungeChairAsync(): Promise<void> {
    if (!this.habitatAppliances.loungeChair) return
    try {
      await this.loungeChair.load()
      if (this.disposed) return
      this.loungeChair.group.position.set(LOUNGE_CHAIR_X, FLOOR_Y, LOUNGE_CHAIR_Z)
      this.loungeChair.group.rotation.y = LOUNGE_CHAIR_ROTATION_Y
      this.loungeChair.refreshAabb()
      this.scene.add(this.loungeChair.group)
      this.playerObstacles.push(this.loungeChair.getCollisionAabb().clone())
    } catch (err) {
      console.warn('[HabitatInteriorScene] Lounge chair load failed:', err)
    }
  }

  /**
   * Deferred conditional load of the arcade machine. Skipped entirely when
   * {@link habitatAppliances.arcadeMachine} is false. Bails silently on load
   * errors so a missing prop doesn't kill the scene.
   */
  private async loadArcadeMachineAsync(): Promise<void> {
    if (!this.habitatAppliances.arcadeMachine) return
    try {
      await this.arcadeMachine.load()
      if (this.disposed) return
      this.arcadeMachine.group.position.set(ARCADE_MACHINE_X, FLOOR_Y, ARCADE_MACHINE_Z)
      this.arcadeMachine.group.rotation.y = ARCADE_MACHINE_ROTATION_Y
      this.arcadeMachine.refreshAabb()
      this.scene.add(this.arcadeMachine.group)
      this.playerObstacles.push(this.arcadeMachine.getCollisionAabb().clone())
    } catch (err) {
      console.warn('[HabitatInteriorScene] Arcade machine load failed:', err)
    }
  }

  /**
   * Deferred conditional load of the cat tower. Skipped entirely when
   * {@link habitatAppliances.catTower} is false. Bails silently on load
   * errors so a missing prop doesn't kill the scene.
   */
  private async loadCatTowerAsync(): Promise<void> {
    if (!this.habitatAppliances.catTower) return
    try {
      await this.catTower.load()
      if (this.disposed) return
      this.catTower.group.position.set(CAT_TOWER_X, FLOOR_Y, CAT_TOWER_Z)
      this.catTower.refreshAabb()
      this.scene.add(this.catTower.group)
      this.playerObstacles.push(this.catTower.getCollisionAabb().clone())
      this.computeTowerJumpWaypoints()
    } catch (err) {
      console.warn('[HabitatInteriorScene] Cat tower load failed:', err)
    }
  }

  /**
   * Deferred load of the hatch-wall sideboard, plus the coffee machine and
   * record player that mount on top. Mirrors {@link loadCatAsync} so the cabin
   * appears immediately while heavy GLBs stream in.
   *
   * Bails silently on load errors — a missing prop shouldn't kill the scene.
   * Re-checks {@link loaded} between awaits so a {@link dispose} that races
   * the in-flight load doesn't add stale meshes to a torn-down scene.
   */
  private async loadHatchWallFurnitureAsync(): Promise<void> {
    try {
      await this.sideboard.load()
      if (this.disposed) return

      // Place the sideboard against the −Z hatch wall on the +X (bed) side.
      // The wrapper drops its base to local Y=0 so it sits flush on the floor.
      this.sideboard.group.position.set(SIDEBOARD_X, FLOOR_Y, -CYLINDER_LENGTH / 2)
      this.sideboard.group.rotation.y = 0
      this.sideboard.group.updateMatrixWorld(true)
      const sideboardBox = new THREE.Box3().setFromObject(this.sideboard.group)
      const sideboardDepth = sideboardBox.max.z - sideboardBox.min.z
      this.sideboard.group.position.z =
        -CYLINDER_LENGTH / 2 + sideboardDepth / 2 + SIDEBOARD_WALL_CLEARANCE
      this.sideboard.refreshAabb()
      this.scene.add(this.sideboard.group)
      this.playerObstacles.push(this.sideboard.getCollisionAabb().clone())

      // Baseline cabin furniture: moon lamp (Marta's gift) always loads with the
      // sideboard. Optional appliances are gated behind profile flags so locked
      // ones never trigger a GLB fetch.
      const coffeeFlag = this.habitatAppliances.coffeeMachine
      const recordFlag = this.habitatAppliances.recordPlayer
      await Promise.all([
        this.moonLamp.load(),
        coffeeFlag ? this.coffeeMachine.load() : Promise.resolve(),
        recordFlag ? this.recordPlayer.load() : Promise.resolve(),
      ])
      if (this.disposed) return

      const aabb = this.sideboard.getCollisionAabb()
      const sideboardTopY = aabb.max.y
      const sideboardCentreX = (aabb.min.x + aabb.max.x) / 2
      const sideboardCentreZ = (aabb.min.z + aabb.max.z) / 2
      const sideboardHalfWidthX = (aabb.max.x - aabb.min.x) / 2
      this.computeSideboardJumpWaypoints(aabb)

      if (coffeeFlag) {
        this.coffeeMachine.group.position.set(
          sideboardCentreX + sideboardHalfWidthX * SIDEBOARD_COFFEE_OFFSET_FRAC,
          sideboardTopY + SIDEBOARD_TOP_CLEARANCE,
          sideboardCentreZ,
        )
        this.scene.add(this.coffeeMachine.group)
      }

      if (recordFlag) {
        this.recordPlayer.group.position.set(
          sideboardCentreX + sideboardHalfWidthX * SIDEBOARD_RECORD_PLAYER_OFFSET_FRAC,
          sideboardTopY + SIDEBOARD_TOP_CLEARANCE,
          sideboardCentreZ,
        )
        this.scene.add(this.recordPlayer.group)
      }

      this.moonLamp.group.position.set(
        sideboardCentreX + sideboardHalfWidthX * SIDEBOARD_MOON_LAMP_OFFSET_FRAC,
        sideboardTopY + SIDEBOARD_TOP_CLEARANCE,
        sideboardCentreZ,
      )
      this.scene.add(this.moonLamp.group)
    } catch (err) {
      console.warn('[HabitatInteriorScene] Hatch-wall furniture load failed:', err)
    }
  }

  /**
   * Deferred cat-model load. Kicked off without `await` from {@link load} so the
   * cabin mounts immediately. Bails out if {@link dispose} ran while the GLB was
   * still in flight.
   *
   * @param obstacles - Footprint rectangles the cat's wander uses for avoidance.
   */
  private async loadCatAsync(obstacles: CatObstacle[]): Promise<void> {
    try {
      const cat = await CatController.create(CAT_MODEL_URL, {
        ...CAT_WANDER_BOUNDS,
        obstacles,
      })
      if (this.disposed) {
        cat.dispose()
        return
      }
      this.cat = cat
      this.scene.add(cat.group)
      // Hearts emit in world space — add as a sibling so they stay where spawned
      // even if Sushi walks off mid-burst.
      this.scene.add(cat.hearts)
      // Bake a static sleeping clone parented inside the cat house so it
      // inherits the house yaw/position. Sleep-state visibility is driven by
      // the bridge — see {@link applySushiBridgeToCat}.
      this.sleepingCatClone = cat.createSleepingClone()
      this.sleepingCatClone.position.set(CAT_SLEEP_OFFSET_X, CAT_SLEEP_OFFSET_Y, CAT_SLEEP_OFFSET_Z)
      this.sleepingCatClone.rotation.set(
        CAT_SLEEP_ROTATION_X,
        CAT_SLEEP_ROTATION_Y,
        CAT_SLEEP_ROTATION_Z,
      )
      this.sleepingCatClone.scale.multiplyScalar(CAT_SLEEP_SCALE)
      this.sleepingCatClone.visible = false
      this.catHouseGroup?.add(this.sleepingCatClone)
      this.applySushiBridgeToCat()
      // 50% chance Sushi greets you mid-nap inside the house. Roll happens
      // after the bridge is wired so the cat can read tiredness and onWoke.
      cat.rollInitialSleep()
      this.catAudio.start()
    } catch (err) {
      console.warn('[HabitatInteriorScene] failed to load cat model:', err)
    }
  }

  /**
   * Advance the scene by one frame.
   *
   * @param dt - Delta time in seconds since the last frame.
   */
  tick(dt: number): void {
    this.inputManager.tick(dt)
    if (!this.tickPetSequence(dt) && !this.tickTableLookSequence(dt) && !this.hatchExitActive) {
      this.tickMovement(dt)
    }
    this.tickInteraction()
    this.fpsCamera.tick(dt)
    this.tickTablePlacementHold()
    this.tickLaserPointer()
    this.cat?.tick(dt)
    this.tickCatAudio()
    if (this.petCooldownTimer > 0) {
      this.petCooldownTimer = Math.max(0, this.petCooldownTimer - dt)
    }
    this.tickBowlFillCue(dt)
    this.tickKibbleVisual()
    this.tickLitterChunkVisual()
    this.tickHatchKnob(dt)
    this.lavaLamp.tick(dt)
    this.backdrop.tick(dt)
  }

  /**
   * Report the current LMB-held state from the host pointer-lock session. Called
   * once per frame *before* {@link tick} so {@link tickLaserPointer} can consume
   * the latest value when deciding whether to project a laser dot onto the floor.
   *
   * @param held - Whether the primary mouse button is currently down.
   */
  setLaserPointerHeld(held: boolean): void {
    this.laserPointerHeld = held
  }

  /**
   * Project a ray straight forward from the FPS camera onto the floor plane while
   * the player is holding LMB. On a hit, position the visible red dot there and
   * push the world-space target into the cat so it sprints toward it. On release
   * (or if any gate fails — dev table-grab mode, pet sequence, or table reach),
   * hide the dot and clear the cat's laser target so it falls back to wander.
   */
  private tickLaserPointer(): void {
    const dot = this.laserDot
    if (!dot) return

    // Gate: dev table-grab tool owns LMB, pet glide sequence shouldn't be
    // interrupted, and we don't want laser activation while the player is at
    // the cockpit table reaching for shuttle controls.
    const gateOpen =
      this.laserPointerHeld &&
      !isTablePlacementDebugEnabled() &&
      !this.petSequenceActive &&
      !this.tablePlacementGrabbed &&
      !(this.cat?.isSleeping() ?? false)

    if (!gateOpen) {
      if (dot.visible) dot.visible = false
      this.cat?.setLaserTarget(null)
      return
    }

    const cam = this.fpsCamera.camera
    cam.getWorldDirection(this._laserDir)
    // Looking up — no floor hit possible, treat as no laser this frame.
    if (this._laserDir.y >= 0) {
      if (dot.visible) dot.visible = false
      this.cat?.setLaserTarget(null)
      return
    }
    this.laserRaycaster.set(cam.position, this._laserDir)
    const hit = this.laserRaycaster.ray.intersectPlane(this.laserFloorPlane, this._laserHit)
    if (!hit) {
      if (dot.visible) dot.visible = false
      this.cat?.setLaserTarget(null)
      return
    }
    // Clamp into the cabin envelope so the dot can't appear outside the walls.
    const maxX = CYLINDER_RADIUS - COLLISION_MARGIN * 0.6
    const maxZ = CYLINDER_LENGTH / 2 - COLLISION_MARGIN * 0.6
    hit.x = Math.max(-maxX, Math.min(maxX, hit.x))
    hit.z = Math.max(-maxZ, Math.min(maxZ, hit.z))
    dot.position.set(hit.x, FLOOR_Y + LASER_DOT_Y_BIAS, hit.z)
    dot.visible = true
    this.cat?.setLaserTarget(hit)
  }

  /**
   * Advance the bowl scale-punch cue. Uses a half-sine envelope so the bowl puffs up
   * and settles back to neutral over {@link BOWL_FILL_CUE_DURATION_S}.
   *
   * @param dt - Delta time in seconds.
   */
  /**
   * Build a {@link CatAudioState} snapshot from the live cat + profile bridge and feed
   * it to the audio director so the purr/sleep loops and idle meows pan + fade with
   * the cat's position relative to the FPS camera. No-op when the cat hasn't loaded
   * yet or no Sushi bridge is wired.
   */
  private tickCatAudio(): void {
    const cat = this.cat
    const cb = this.sushiCallbacks
    if (!cat || !cb) return
    const snap = this._catAudioState
    snap.catState = cat.currentState
    snap.isSleeping = cat.isSleeping()
    snap.love = cb.getLove()
    snap.hunger = cb.getHunger()
    snap.bladder = cb.getBladder()
    snap.tired = cb.getTired()
    snap.catWorldPos.copy(cat.group.position)
    snap.houseWorldPos.copy(this.houseWorldPosition)
    this.catAudio.update(snap, this.fpsCamera.camera)
  }

  private tickBowlFillCue(dt: number): void {
    if (this.bowlFillCueTimer <= 0 || !this.bowlMesh) return
    this.bowlFillCueTimer = Math.max(0, this.bowlFillCueTimer - dt)
    const t = 1 - this.bowlFillCueTimer / BOWL_FILL_CUE_DURATION_S
    const env = Math.sin(Math.min(1, t) * Math.PI)
    const scale = 1 + (BOWL_FILL_CUE_SCALE_PEAK - 1) * env
    this.bowlMesh.scale.setScalar(scale)
  }

  /**
   * Sync the kibble disc's visibility with the persisted bowl-servings count so the
   * dish doesn't keep showing food after Sushi has eaten his way through it. Hidden
   * outright at zero servings; visible otherwise (the disc represents "there is at
   * least some food in the bowl" — we don't model individual kibble pieces).
   */
  private tickKibbleVisual(): void {
    if (!this.kibbleMesh) return
    const servings = this.sushiCallbacks?.getBowlServings() ?? 0
    this.kibbleMesh.visible = servings > 0
  }

  /** Release GPU resources and event listeners. */
  dispose(): void {
    this.disposed = true
    this.inputManager.dispose()
    this.fpsCamera.dispose()
    this.catAudio.dispose()
    this.cat?.dispose()
    this.cat = null
    this.scene.remove(this.posterWall.group)
    this.posterWall.dispose()
    this.scene.remove(this.completionPoster.group)
    this.completionPoster.dispose()
    this.scene.remove(this.journeyAct1Wall.group)
    this.journeyAct1Wall.dispose()
    this.scene.remove(this.journeyAct2Wall.group)
    this.journeyAct2Wall.dispose()
    this.scene.remove(this.journeyAct3Wall.group)
    this.journeyAct3Wall.dispose()
    this.scene.remove(this.tablePosterRow.group)
    this.tablePosterRow.dispose()
    this.scene.remove(this.lavaLamp.group)
    this.lavaLamp.dispose()
    this.scene.remove(this.sideboard.group)
    this.sideboard.dispose()
    this.scene.remove(this.coffeeMachine.group)
    this.coffeeMachine.dispose()
    this.scene.remove(this.recordPlayer.group)
    this.recordPlayer.dispose()
    this.scene.remove(this.moonLamp.group)
    this.moonLamp.dispose()
    this.scene.remove(this.refractorTelescope.group)
    this.refractorTelescope.dispose()
    this.scene.remove(this.loungeChair.group)
    this.loungeChair.dispose()
    this.scene.remove(this.arcadeMachine.group)
    this.arcadeMachine.dispose()
    this.scene.remove(this.catTower.group)
    this.catTower.dispose()
    this.playerObstacles.length = 0
    this.scene.remove(this.backdrop.group)
    this.backdrop.dispose()
    this.scene.traverse((child) => {
      if (
        child instanceof THREE.Mesh ||
        child instanceof THREE.Points ||
        child instanceof THREE.LineSegments
      ) {
        child.geometry.dispose()
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        mats.forEach((m) => m.dispose())
      }
    })
  }

  /**
   * Mount the canopy backdrop from a frozen snapshot of the docked state. The sun is
   * always shown; the orbited planet (if any) is added on the opposite side of the
   * canopy. Pass `null` to clear both — the cabin then falls back to the starfield.
   *
   * @param context - Snapshot built by the map facade at habitat-entry time.
   */
  setBackdropContext(context: HabitatBackdropContext | null): void {
    if (!context) {
      this.backdrop.clear()
      return
    }
    this.backdrop.setContext(context)
  }

  /**
   * Update poster visibility from persisted achievement ids.
   *
   * @param unlockedAchievementIds - Current unlocked achievement ids from the map UI.
   */
  setUnlockedAchievementIds(unlockedAchievementIds: readonly string[]): void {
    this.posterWall.setUnlockedAchievementIds(unlockedAchievementIds)
    this.completionPoster.setUnlockedAchievementIds(unlockedAchievementIds)
    this.journeyAct1Wall.setUnlockedAchievementIds(unlockedAchievementIds)
    this.journeyAct2Wall.setUnlockedAchievementIds(unlockedAchievementIds)
    this.journeyAct3Wall.setUnlockedAchievementIds(unlockedAchievementIds)
    this.tablePosterRow.setUnlockedAchievementIds(unlockedAchievementIds)
  }

  /**
   * Install (or replace) the Sushi care callbacks. Safe to call before or after the cat
   * model finishes loading — the scene stores the callbacks and applies them once the
   * cat exists.
   *
   * @param callbacks - Host-supplied callbacks. Pass `null` to detach.
   */
  setSushiBridgeCallbacks(callbacks: SushiBridgeCallbacks | null): void {
    this.sushiCallbacks = callbacks
    this.applySushiBridgeToCat()
  }

  /**
   * Derive the mattress-top sit point and three floor approach waypoints (foot, long
   * side facing the cabin, head) from the placed bed's runtime bounding box. Cached
   * once at load time and read every frame via the cat bridge — keeping the source
   * of truth on the live mesh means the cat tracks the bed if its placement changes.
   *
   * @param bedModel - Bed root after final scale/rotation/translation have settled.
   */
  private computeBedJumpWaypoints(bedModel: THREE.Object3D): void {
    bedModel.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(bedModel)
    const cx = (box.min.x + box.max.x) / 2
    const cz = (box.min.z + box.max.z) / 2
    this.bedTopWorldPosition.set(cx, box.max.y - BED_TOP_Y_INSET, cz)
    this.bedApproachWorldPositions.length = 0
    // Foot of bed (-Z short end) — approach from the cabin centre.
    this.bedApproachWorldPositions.push(
      new THREE.Vector3(cx, FLOOR_Y, box.min.z - BED_APPROACH_OFFSET),
    )
    // Long side facing the cabin (-X) — the most accessible approach in this layout.
    this.bedApproachWorldPositions.push(
      new THREE.Vector3(box.min.x - BED_APPROACH_OFFSET, FLOOR_Y, cz),
    )
    // Head of bed (+Z short end).
    this.bedApproachWorldPositions.push(
      new THREE.Vector3(cx, FLOOR_Y, box.max.z + BED_APPROACH_OFFSET),
    )
  }

  /**
   * Cache sideboard approach + top waypoints for Sushi's moon-lamp perch beat.
   * The perch uses the live sideboard AABB so it follows the asynchronous model
   * placement. The top lane sits toward the cabin-facing edge so Sushi can cross
   * in front of the lamp before sitting on its far side.
   *
   * @param sideboardBox - World-space sideboard bounds after final placement.
   */
  private computeSideboardJumpWaypoints(sideboardBox: Readonly<THREE.Box3>): void {
    const cx = (sideboardBox.min.x + sideboardBox.max.x) / 2
    const halfWidthX = (sideboardBox.max.x - sideboardBox.min.x) / 2
    const perchX = cx + halfWidthX * SIDEBOARD_CAT_PERCH_OFFSET_FRAC
    const sitX = cx + halfWidthX * SIDEBOARD_CAT_SIT_OFFSET_FRAC
    const topY = sideboardBox.max.y + SIDEBOARD_CAT_TOP_Y_OFFSET
    const catTopZ = sideboardBox.max.z - SIDEBOARD_CAT_TOP_FRONT_INSET
    this.sideboardTopWorldPosition.set(perchX, topY, catTopZ)
    this.sideboardSitWorldPosition.set(sitX, topY, catTopZ)
    this.sideboardApproachWorldPositions.length = 0
    this.sideboardApproachWorldPositions.push(
      new THREE.Vector3(
        perchX,
        FLOOR_Y,
        sideboardBox.max.z + SIDEBOARD_CAT_APPROACH_OFFSET,
      ),
    )
  }

  /**
   * Cache locker approach + top waypoints for Sushi's compact locker perch beat.
   * The locker sits against the +X wall, so the approach point is on the cabin-facing
   * -X side and the top point stays slightly wall-biased on the small flat surface.
   *
   * @param locker - Placed locker root after final scale/rotation/translation.
   */
  private computeLockerJumpWaypoints(locker: THREE.Object3D): void {
    locker.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(locker)
    const cx = (box.min.x + box.max.x) / 2
    const cz = (box.min.z + box.max.z) / 2
    const halfWidthX = (box.max.x - box.min.x) / 2
    const perchX = cx + halfWidthX * LOCKER_CAT_TOP_WALL_OFFSET_FRAC
    const perchZ = cz + LOCKER_CAT_TOP_RIGHT_NUDGE_Z
    const loweredTopY = box.max.y - LOCKER_TARGET_HEIGHT * LOCKER_CAT_TOP_HEIGHT_DROP_RATIO
    this.lockerTopWorldPosition.set(perchX, loweredTopY, perchZ)
    this.lockerApproachWorldPositions.length = 0
    this.lockerApproachWorldPositions.push(
      new THREE.Vector3(box.min.x - LOCKER_CAT_APPROACH_OFFSET, FLOOR_Y, cz),
    )
  }

  /**
   * Cache shuttle-control table approach + top waypoints for Sushi's cockpit perch beat.
   * The table sits at the +Z cockpit cap, so the approach point uses the cabin-facing
   * -Z edge and the top point shifts onto the roomier left side panel.
   *
   * @param table - Placed table root after final scale/rotation/translation.
   */
  private computeTableJumpWaypoints(table: THREE.Object3D): void {
    table.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(table)
    const cx = (box.min.x + box.max.x) / 2
    const cz = (box.min.z + box.max.z) / 2
    const halfWidthX = (box.max.x - box.min.x) / 2
    const halfDepthZ = (box.max.z - box.min.z) / 2
    const perchX = cx + halfWidthX * TABLE_CAT_TOP_SIDE_OFFSET_FRAC
    const perchZ = cz + halfDepthZ * TABLE_CAT_TOP_WALL_OFFSET_FRAC
    this.tableTopWorldPosition.set(perchX, box.max.y - TABLE_CAT_TOP_Y_DROP, perchZ)
    this.tableApproachWorldPositions.length = 0
    this.tableApproachWorldPositions.push(
      new THREE.Vector3(perchX, FLOOR_Y, box.min.z - TABLE_CAT_APPROACH_OFFSET),
    )
  }

  /**
   * Cache cat-tower approach + top waypoints for Sushi's dedicated climbing-tower
   * perch. The tower hugs the +X wall just outside the locker, so the approach
   * point sits on the cabin-facing -X side and the perch sits on the top platform
   * with a slight wall-side nudge so the cat doesn't teeter over the inner edge.
   * Reads the tower's runtime AABB so the points follow the appliance wherever the
   * loader places it.
   */
  private computeTowerJumpWaypoints(): void {
    const box = this.catTower.getCollisionAabb()
    const cz = (box.min.z + box.max.z) / 2
    const depthZ = box.max.z - box.min.z
    const towerHeight = box.max.y - box.min.y
    const perchX = CAT_TOWER_X + CAT_TOWER_TOP_WALL_NUDGE_X
    const perchZ = cz + depthZ * CAT_TOWER_TOP_TABLE_NUDGE_Z_FRAC
    const perchY = box.max.y - towerHeight * CAT_TOWER_TOP_HEIGHT_DROP_RATIO
    this.towerTopWorldPosition.set(perchX, perchY, perchZ)
    this.towerApproachWorldPositions.length = 0
    this.towerApproachWorldPositions.push(
      new THREE.Vector3(box.min.x - CAT_TOWER_APPROACH_OFFSET, FLOOR_Y, cz),
    )
  }

  /**
   * Toggle the baked sleeping-cat clone parented inside the cat house. The live
   * cat's visibility is owned by {@link CatController}; this method only flips
   * the static asleep visual that lives in scene space.
   *
   * @param visible - Whether the sleeping clone should be drawn.
   */
  private setSleepingVisualVisible(visible: boolean): void {
    if (!this.sleepingCatClone) return
    this.sleepingCatClone.visible = visible
  }

  /**
   * Build a {@link CatNeedsBridge} from the current callbacks and hand it to the cat.
   * No-op if either side is missing.
   */
  private applySushiBridgeToCat(): void {
    if (!this.cat) return
    const callbacks = this.sushiCallbacks
    if (!callbacks) {
      this.cat.setBridge(null)
      return
    }
    const bridge: CatNeedsBridge = {
      getHunger: () => callbacks.getHunger(),
      getLove: () => callbacks.getLove(),
      getBowlServings: () => callbacks.getBowlServings(),
      getBladder: () => callbacks.getBladder(),
      getLitterPollution: () => callbacks.getLitterPollution(),
      getTired: () => callbacks.getTired(),
      addTired: (delta) => callbacks.addTired(delta),
      addHunger: (delta) => callbacks.addHunger(delta),
      getPlayerWorldPosition: (out) => out.copy(this.player.position),
      getBowlWorldPosition: (out) => out.copy(this.bowlWorldPosition),
      getLitterWorldPosition: (out) => out.copy(this.litterWorldPosition),
      getHouseWorldPosition: (out) => out.copy(this.houseWorldPosition),
      getHouseApproachWorldPosition: (out) => out.copy(this.houseApproachWorldPosition),
      getBedSideCount: () => this.bedApproachWorldPositions.length,
      getBedApproachWorldPosition: (sideIndex, out) => {
        // Clamp the index defensively — the controller only ever asks for indices it
        // received from getBedSideCount, but a stale index would otherwise read past
        // the end of the array and produce a NaN approach position.
        const i = Math.max(0, Math.min(this.bedApproachWorldPositions.length - 1, sideIndex))
        const wp = this.bedApproachWorldPositions[i]
        if (wp) out.copy(wp)
        return out
      },
      getBedTopWorldPosition: (out) => out.copy(this.bedTopWorldPosition),
      getSideboardSideCount: () => this.sideboardApproachWorldPositions.length,
      getSideboardApproachWorldPosition: (sideIndex, out) => {
        const i = Math.max(0, Math.min(this.sideboardApproachWorldPositions.length - 1, sideIndex))
        const wp = this.sideboardApproachWorldPositions[i]
        if (wp) out.copy(wp)
        return out
      },
      getSideboardTopWorldPosition: (out) => out.copy(this.sideboardTopWorldPosition),
      getSideboardSitWorldPosition: (out) => out.copy(this.sideboardSitWorldPosition),
      getLockerSideCount: () => this.lockerApproachWorldPositions.length,
      getLockerApproachWorldPosition: (sideIndex, out) => {
        const i = Math.max(0, Math.min(this.lockerApproachWorldPositions.length - 1, sideIndex))
        const wp = this.lockerApproachWorldPositions[i]
        if (wp) out.copy(wp)
        return out
      },
      getLockerTopWorldPosition: (out) => out.copy(this.lockerTopWorldPosition),
      getTableSideCount: () => this.tableApproachWorldPositions.length,
      getTableApproachWorldPosition: (sideIndex, out) => {
        const i = Math.max(0, Math.min(this.tableApproachWorldPositions.length - 1, sideIndex))
        const wp = this.tableApproachWorldPositions[i]
        if (wp) out.copy(wp)
        return out
      },
      getTableTopWorldPosition: (out) => out.copy(this.tableTopWorldPosition),
      getTowerSideCount: () => this.towerApproachWorldPositions.length,
      getTowerApproachWorldPosition: (sideIndex, out) => {
        const i = Math.max(0, Math.min(this.towerApproachWorldPositions.length - 1, sideIndex))
        const wp = this.towerApproachWorldPositions[i]
        if (wp) out.copy(wp)
        return out
      },
      getTowerTopWorldPosition: (out) => out.copy(this.towerTopWorldPosition),
      onUsedTower: () => callbacks.onUsedTower(),
      onEatServing: () => callbacks.onEatServing(),
      onPetted: () => callbacks.onPetted(),
      onCaughtLaser: () => callbacks.onCaughtLaser(),
      onUsedLitter: () => callbacks.onUsedLitter(),
      onWoke: () => callbacks.onWoke(),
      onSleepEnter: () => this.setSleepingVisualVisible(true),
      onSleepExit: () => this.setSleepingVisualVisible(false),
    }
    this.cat.setBridge(bridge)
    // Re-sync the sleeping clone in case the cat was already in the sleeping
    // state when the bridge was installed (e.g. {@link rollInitialSleep} fired
    // during {@link load} before host callbacks were wired).
    this.setSleepingVisualVisible(this.cat.isSleeping())
  }

  // -------------------------------------------------------------------------
  // Private builders
  // -------------------------------------------------------------------------

  /**
   * Build the cabin shell: a half-cylinder glass canopy whose base sits exactly on the
   * deck floor, plus matching half-disc end-caps. The cylinder axis is at world Y=0
   * (the floor plane) so the visible geometry is a tunnel cross-section — flat deck
   * underfoot, glass arch overhead — instead of a full cylinder where the bottom curve
   * dips below the floor.
   */
  private buildCylinder(): void {
    // Half-cylinder canopy spanning the upper semicircle (Y >= 0).
    const glassGeo = new THREE.CylinderGeometry(
      CYLINDER_RADIUS,
      CYLINDER_RADIUS,
      CYLINDER_LENGTH,
      CYLINDER_RADIAL_SEGMENTS,
      1,
      true,
      Math.PI / 2,
      Math.PI,
    )
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: GLASS_COLOR,
      transparent: true,
      opacity: GLASS_OPACITY,
      roughness: 0.05,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const glass = new THREE.Mesh(glassGeo, glassMat)
    glass.rotation.x = Math.PI / 2
    glass.position.y = FLOOR_Y
    this.scene.add(glass)

    // Half-disc end caps (D-shape, flat side resting on the deck).
    const capShape = new THREE.Shape()
    capShape.moveTo(-CYLINDER_RADIUS, 0)
    capShape.absarc(0, 0, CYLINDER_RADIUS, Math.PI, 0, true)
    capShape.lineTo(-CYLINDER_RADIUS, 0)
    const capGeo = new THREE.ShapeGeometry(capShape, CYLINDER_RADIAL_SEGMENTS)
    const capMat = new THREE.MeshStandardMaterial({
      color: CAP_COLOR,
      metalness: HABITAT_PAINT_WALL_METALNESS,
      roughness: HABITAT_PAINT_ROUGHNESS,
      side: THREE.DoubleSide,
    })
    this.applyHabitatWallTextureMaps(capMat)
    this.habitatHatchWallMaterial = capMat
    const capBack = new THREE.Mesh(capGeo, capMat)
    capBack.position.set(0, FLOOR_Y, -CYLINDER_LENGTH / 2)
    this.scene.add(capBack)

    const capFrontMat = capMat.clone()
    this.habitatTableWallMaterial = capFrontMat
    const capFront = new THREE.Mesh(capGeo.clone(), capFrontMat)
    capFront.position.set(0, FLOOR_Y, CYLINDER_LENGTH / 2)
    capFront.rotation.y = Math.PI
    this.scene.add(capFront)

    this.buildGirders()
  }

  /**
   * Build wireframe girder rings inside the **upper** half of the cylinder only.
   *
   * The girders frame the glass canopy on top. Drawing them full-circle (the original
   * implementation) sweeps lines across the floor — visible as bright X marks on the
   * deck from any low camera angle (and from a wandering cat's eye view). Restricting
   * the radial range to the top semicircle (0…π) keeps the structural look without
   * crawling lines on the floor.
   */
  private buildGirders(): void {
    const verts: number[] = []
    // Slightly inside the glass shell
    const r = CYLINDER_RADIUS - GIRDER_INSET
    const halfLen = CYLINDER_LENGTH / 2

    // Horizontal half-circle arcs at each height step (top half only)
    for (let h = 0; h <= GIRDER_SEGMENTS_HEIGHT; h++) {
      // In pre-rotation coords CylinderGeometry Y runs along the axis
      // After rotation.x = PI/2 the cylinder axis maps to world Z.
      // We build verts in world space directly.
      const z = -halfLen + (h / GIRDER_SEGMENTS_HEIGHT) * CYLINDER_LENGTH
      for (let s = 0; s < GIRDER_SEGMENTS_RADIAL; s++) {
        const a1 = (s / GIRDER_SEGMENTS_RADIAL) * Math.PI
        const a2 = ((s + 1) / GIRDER_SEGMENTS_RADIAL) * Math.PI
        verts.push(
          Math.cos(a1) * r,
          FLOOR_Y + Math.sin(a1) * r,
          z,
          Math.cos(a2) * r,
          FLOOR_Y + Math.sin(a2) * r,
          z,
        )
      }
    }

    // Vertical bars along the length at each radial step (top half only)
    for (let s = 0; s <= GIRDER_SEGMENTS_RADIAL; s++) {
      const a = (s / GIRDER_SEGMENTS_RADIAL) * Math.PI
      const cx = Math.cos(a) * r
      const cy = FLOOR_Y + Math.sin(a) * r
      for (let h = 0; h < GIRDER_SEGMENTS_HEIGHT; h++) {
        const z1 = -halfLen + (h / GIRDER_SEGMENTS_HEIGHT) * CYLINDER_LENGTH
        const z2 = -halfLen + ((h + 1) / GIRDER_SEGMENTS_HEIGHT) * CYLINDER_LENGTH
        verts.push(cx, cy, z1, cx, cy, z2)
      }
    }

    const girderGeo = new THREE.BufferGeometry()
    girderGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    const girderMat = new THREE.LineBasicMaterial({ color: GIRDER_COLOR })
    const girder = new THREE.LineSegments(girderGeo, girderMat)
    this.scene.add(girder)
  }

  /**
   * Build a submarine-style pressure hatch on the **back** end-cap (−Z): grey metallic
   * frame ring, white circular door, yellow wheel-knob with crossed spokes. Geometry
   * only — no textures, no animation — purely a visual hint that the back wall is the
   * way to the cockpit.
   *
   * Everything is parented to a single group so XZ position is centralised. The group's
   * local +Z faces back into the cabin, matching the back cap which sits at z = −L/2.
   */
  private buildCockpitHatch(): void {
    const capZ = -CYLINDER_LENGTH / 2
    const hatch = new THREE.Group()
    hatch.name = 'habitatCockpitHatch'
    hatch.position.set(0, HATCH_CENTRE_Y, capZ + HATCH_DOOR_SURFACE_OFFSET)

    // Door — flat white disc made from a low cylinder (Y axis), rotated so its
    // circular faces look down ±Z.
    const doorMat = new THREE.MeshStandardMaterial({
      color: HATCH_DOOR_COLOR,
      metalness: 0.18,
      roughness: 0.55,
    })
    const doorGeo = new THREE.CylinderGeometry(
      HATCH_DOOR_RADIUS,
      HATCH_DOOR_RADIUS,
      HATCH_DOOR_THICKNESS,
      HATCH_DOOR_SEGMENTS,
    )
    const door = new THREE.Mesh(doorGeo, doorMat)
    door.name = 'habitatCockpitHatchDoor'
    door.rotation.x = Math.PI / 2
    hatch.add(door)

    // Frame — torus around the door. Default torus lies in the XY plane (axis
    // along Z), which is exactly the orientation we want against the back cap.
    // Color is retinted by the active habitat-interior theme so the ring reads as
    // wall trim, not stock grey.
    const frameMat = new THREE.MeshStandardMaterial({
      color: HATCH_FRAME_COLOR,
      metalness: 0.7,
      roughness: 0.4,
    })
    this.habitatHatchFrameMaterial = frameMat
    const frameGeo = new THREE.TorusGeometry(
      HATCH_FRAME_RING_RADIUS,
      HATCH_FRAME_TUBE_RADIUS,
      16,
      HATCH_DOOR_SEGMENTS,
    )
    const frame = new THREE.Mesh(frameGeo, frameMat)
    frame.name = 'habitatCockpitHatchFrame'
    hatch.add(frame)

    // Wheel-knob — small torus + two crossed spoke bars at the door centre.
    const knobMat = new THREE.MeshStandardMaterial({
      color: HATCH_KNOB_COLOR,
      metalness: 0.45,
      roughness: 0.45,
    })
    const knobRingGeo = new THREE.TorusGeometry(
      HATCH_KNOB_RING_RADIUS,
      HATCH_KNOB_TUBE_RADIUS,
      12,
      HATCH_DOOR_SEGMENTS,
    )
    const knobRing = new THREE.Mesh(knobRingGeo, knobMat)
    knobRing.position.z = HATCH_KNOB_Z_BIAS
    hatch.add(knobRing)

    const horizontalSpokeGeo = new THREE.BoxGeometry(
      HATCH_KNOB_SPOKE_LENGTH,
      HATCH_KNOB_SPOKE_THICKNESS,
      HATCH_KNOB_SPOKE_THICKNESS,
    )
    const verticalSpokeGeo = new THREE.BoxGeometry(
      HATCH_KNOB_SPOKE_THICKNESS,
      HATCH_KNOB_SPOKE_LENGTH,
      HATCH_KNOB_SPOKE_THICKNESS,
    )
    const horizontalSpoke = new THREE.Mesh(horizontalSpokeGeo, knobMat)
    const verticalSpoke = new THREE.Mesh(verticalSpokeGeo, knobMat)
    horizontalSpoke.position.z = HATCH_KNOB_Z_BIAS
    verticalSpoke.position.z = HATCH_KNOB_Z_BIAS

    // Wrap the ring + spokes in a pivot group so we can spin them around Z as one unit.
    const knobPivot = new THREE.Group()
    knobPivot.name = 'hatchKnobPivot'
    knobPivot.add(knobRing, horizontalSpoke, verticalSpoke)
    hatch.add(knobPivot)
    this.hatchKnobPivot = knobPivot

    this.scene.add(hatch)
  }

  /** Mount the fixed-order achievement poster wall above the cockpit hatch. */
  private buildPosterWall(): void {
    const capZ = -CYLINDER_LENGTH / 2
    this.posterWall.group.position.set(
      0,
      HATCH_CENTRE_Y + POSTER_WALL_ABOVE_HATCH_Y,
      capZ + POSTER_WALL_Z_OFFSET,
    )
    this.posterWall.group.scale.setScalar(POSTER_WALL_SCALE)
    this.scene.add(this.posterWall.group)
  }

  /**
   * Mount the solar completion poster (all planets) to starboard of the hatch grid on the −Z back
   * cap — mirrors Act I journey on the port side.
   */
  private buildCompletionPoster(): void {
    const capZ = -CYLINDER_LENGTH / 2
    this.completionPoster.group.position.set(
      HATCH_WALL_SIDE_LARGE_POSTER_OFFSET_X,
      HATCH_CENTRE_Y + COMPLETION_POSTER_ABOVE_HATCH_Y,
      capZ + COMPLETION_POSTER_Z_OFFSET,
    )
    this.scene.add(this.completionPoster.group)
  }

  /**
   * Mount Act I journey art on the −Z hatch wall (flat cap), port of the solar grid — same Y as
   * {@link buildCompletionPoster}.
   */
  private buildJourneyAct1HatchPoster(): void {
    const y = HATCH_CENTRE_Y + COMPLETION_POSTER_ABOVE_HATCH_Y
    const capZ = -CYLINDER_LENGTH / 2
    const z = capZ + COMPLETION_POSTER_Z_OFFSET

    this.journeyAct1Wall.group.position.set(-HATCH_WALL_PORT_ACT1_JOURNEY_POSTER_OFFSET_X, y, z)
    this.journeyAct1Wall.group.rotation.set(0, 0, 0)

    this.scene.add(this.journeyAct1Wall.group)
  }

  /**
   * Mount Act II and Act III journey art on the front (+Z) bulkhead, port and starboard of the
   * mess console. Same world {@link HATCH_CENTRE_Y} baseline and
   * {@link COMPLETION_POSTER_ABOVE_HATCH_Y} as hatch-wall large frames; uses the same cap inset and
   * inward yaw as {@link buildTablePosterRow}.
   */
  private buildJourneyAct2And3TableBulkheadPosters(): void {
    const y = HATCH_CENTRE_Y + COMPLETION_POSTER_ABOVE_HATCH_Y
    const capZ = CYLINDER_LENGTH / 2
    const z = capZ - TABLE_POSTER_ROW_Z_OFFSET
    const xMag = JOURNEY_LARGE_POSTER_BULKHEAD_OFFSET_X

    this.journeyAct2Wall.group.position.set(-xMag, y, z)
    this.journeyAct2Wall.group.rotation.y = Math.PI

    this.journeyAct3Wall.group.position.set(xMag, y, z)
    this.journeyAct3Wall.group.rotation.y = Math.PI

    this.scene.add(this.journeyAct2Wall.group)
    this.scene.add(this.journeyAct3Wall.group)
  }

  /**
   * Mount three framed mission posters on the front (+Z) bulkhead, centered above the mess table —
   * opposite the solar wall on the back hatch.
   */
  private buildTablePosterRow(): void {
    const capZ = CYLINDER_LENGTH / 2
    this.tablePosterRow.group.position.set(
      0,
      TABLE_POSTER_ROW_CENTER_Y,
      capZ - TABLE_POSTER_ROW_Z_OFFSET,
    )
    this.tablePosterRow.group.rotation.y = Math.PI
    this.tablePosterRow.group.scale.setScalar(TABLE_POSTER_ROW_SCALE)
    this.scene.add(this.tablePosterRow.group)
  }

  /** Set up interior lighting: warm point near bed, ambient fill, cool rim from cockpit end. */
  private buildLighting(): void {
    // Main light — centered over the bed area (+Z side)
    const point = new THREE.PointLight(
      HABITAT_DEFAULT_POINT_LIGHT_COLOR,
      INTERIOR_LIGHT_INTENSITY,
      INTERIOR_LIGHT_RANGE,
    )
    point.position.set(0, CYLINDER_RADIUS * 0.7, CYLINDER_LENGTH / 6)
    this.scene.add(point)
    this.habitatPointLight = point

    const ambient = new THREE.AmbientLight(HABITAT_DEFAULT_AMBIENT_COLOR, AMBIENT_INTENSITY)
    this.scene.add(ambient)
    this.habitatAmbientLight = ambient

    // Cool rim from the cockpit end — away from the table
    const directional = new THREE.DirectionalLight(
      HABITAT_DEFAULT_RIM_COLOR,
      EXTERIOR_LIGHT_INTENSITY,
    )
    directional.position.set(0, CYLINDER_RADIUS * 2, CYLINDER_LENGTH / 2)
    this.scene.add(directional)
    this.habitatRimLight = directional
  }

  /**
   * Mount the backdrop group on the scene. The body itself is set later via
   * {@link setBackdropPlanetId} (called by the map facade before {@link load}), so
   * the player sees whatever body the shuttle is actually orbiting.
   */
  private buildBackdrop(): void {
    this.scene.add(this.backdrop.group)
  }

  /** Scatter stars on a large sphere, rejecting any that fall inside the cylinder. */
  private buildStarfield(): void {
    const verts: number[] = []
    const minDist = CYLINDER_RADIUS * 3
    for (let i = 0; i < STAR_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const x = STAR_SPHERE_RADIUS * Math.sin(phi) * Math.cos(theta)
      const y = FLOOR_Y + STAR_SPHERE_RADIUS * Math.cos(phi)
      const z = STAR_SPHERE_RADIUS * Math.sin(phi) * Math.sin(theta)
      // Skip stars too close to the cabin centre (now at floor level).
      const distXY = Math.sqrt(x * x + (y - FLOOR_Y) * (y - FLOOR_Y))
      if (distXY < minDist && Math.abs(z) < CYLINDER_LENGTH) continue
      verts.push(x, y, z)
    }
    const positions = new Float32Array(verts)
    const starGeo = new THREE.BufferGeometry()
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: STAR_POINT_SIZE,
      sizeAttenuation: true,
    })
    this.scene.add(new THREE.Points(starGeo, starMat))
  }

  /**
   * Build Sushi's feeding corner: a ceramic food bowl with a small mound of kibble next to
   * a small chrome water fountain with a translucent water disc on top. Pure procedural
   * geometry — no GLB asset — so the tribute is self-contained. Returns the parent group
   * so the caller can compute its world bbox for the cat's obstacle list.
   *
   * @returns The feeding-area group, already positioned at floor level.
   */
  private buildCatFeedingArea(): THREE.Group {
    const group = new THREE.Group()
    group.name = 'sushiFeedingArea'

    // --- Food bowl: ceramic dish + brown kibble disc ------------------------
    const bowlMat = new THREE.MeshStandardMaterial({
      color: 0xeae3d2,
      roughness: 0.55,
      metalness: 0.05,
    })
    const bowl = new THREE.Mesh(
      // Slightly tapered cylinder so the rim is wider than the foot — reads as a dish.
      new THREE.CylinderGeometry(CAT_BOWL_RADIUS, CAT_BOWL_RADIUS * 0.85, CAT_BOWL_HEIGHT, 24),
      bowlMat,
    )
    bowl.position.set(CAT_BOWL_X, FLOOR_Y + CAT_BOWL_HEIGHT / 2, CAT_FEEDING_Z)
    group.add(bowl)
    this.bowlMesh = bowl
    this.bowlWorldPosition.set(CAT_BOWL_X, FLOOR_Y, CAT_FEEDING_Z)

    const kibbleMat = new THREE.MeshStandardMaterial({
      color: 0x8b5a2b,
      roughness: 0.95,
      metalness: 0,
    })
    const kibble = new THREE.Mesh(
      new THREE.CylinderGeometry(CAT_BOWL_RADIUS * 0.8, CAT_BOWL_RADIUS * 0.65, 0.018, 20),
      kibbleMat,
    )
    kibble.position.set(CAT_BOWL_X, FLOOR_Y + CAT_BOWL_HEIGHT + 0.005, CAT_FEEDING_Z)
    group.add(kibble)
    this.kibbleMesh = kibble

    // --- Water fountain: chrome base + dish + translucent water disc --------
    const fountainMat = new THREE.MeshStandardMaterial({
      color: 0xc9d2da,
      roughness: 0.35,
      metalness: 0.7,
    })
    const fountainBaseHeight = CAT_FOUNTAIN_HEIGHT * 0.85
    const fountainBase = new THREE.Mesh(
      new THREE.CylinderGeometry(CAT_FOUNTAIN_RADIUS, CAT_FOUNTAIN_RADIUS, fountainBaseHeight, 24),
      fountainMat,
    )
    fountainBase.position.set(CAT_FOUNTAIN_X, FLOOR_Y + fountainBaseHeight / 2, CAT_FEEDING_Z)
    group.add(fountainBase)

    // Lip at the top — torus reads as the rim of the drinking dish.
    const lip = new THREE.Mesh(
      new THREE.TorusGeometry(CAT_FOUNTAIN_RADIUS * 0.85, 0.018, 8, 24),
      fountainMat,
    )
    lip.rotation.x = Math.PI / 2
    lip.position.set(CAT_FOUNTAIN_X, FLOOR_Y + fountainBaseHeight, CAT_FEEDING_Z)
    group.add(lip)

    // Water surface — translucent blue disc just below the lip line.
    const waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x4a90c2,
      transparent: true,
      opacity: 0.7,
      roughness: 0.05,
      metalness: 0,
    })
    const water = new THREE.Mesh(new THREE.CircleGeometry(CAT_FOUNTAIN_RADIUS * 0.82, 24), waterMat)
    water.rotation.x = -Math.PI / 2
    water.position.set(CAT_FOUNTAIN_X, FLOOR_Y + fountainBaseHeight - 0.005, CAT_FEEDING_Z)
    group.add(water)

    return group
  }

  /**
   * Build Sushi's litterbox: a low rectangular tray with four short walls and a
   * sand-coloured disc inside. Sits on the +X side of the cabin, mirroring the
   * feeding corner. Returns the {@link THREE.Group} so the caller can add it to
   * the scene and harvest its world bbox for the cat's obstacle list.
   *
   * @returns Group containing the tray walls + sand surface, positioned in world space.
   */
  private buildCatLitterArea(): THREE.Group {
    const group = new THREE.Group()
    group.name = 'sushiLitterArea'

    const trayMat = new THREE.MeshStandardMaterial({
      color: 0x6a6f78,
      roughness: 0.7,
      metalness: 0.1,
    })
    const wallH = CAT_LITTER_WALL_HEIGHT
    const t = CAT_LITTER_WALL_THICKNESS
    const innerX = CAT_LITTER_HALF_X * 2 - t * 2
    const innerZ = CAT_LITTER_HALF_Z * 2 - t * 2

    // Floor of the tray (thin slab) sits flush with the cabin floor.
    const trayFloor = new THREE.Mesh(
      new THREE.BoxGeometry(CAT_LITTER_HALF_X * 2, t, CAT_LITTER_HALF_Z * 2),
      trayMat,
    )
    trayFloor.position.set(CAT_LITTER_X, FLOOR_Y + t / 2, CAT_LITTER_Z)
    group.add(trayFloor)

    // Four short walls.
    const wallNS = new THREE.BoxGeometry(CAT_LITTER_HALF_X * 2, wallH, t)
    const wallEW = new THREE.BoxGeometry(t, wallH, CAT_LITTER_HALF_Z * 2)
    const wallY = FLOOR_Y + wallH / 2
    const north = new THREE.Mesh(wallNS, trayMat)
    north.position.set(CAT_LITTER_X, wallY, CAT_LITTER_Z + CAT_LITTER_HALF_Z - t / 2)
    group.add(north)
    const south = new THREE.Mesh(wallNS, trayMat)
    south.position.set(CAT_LITTER_X, wallY, CAT_LITTER_Z - CAT_LITTER_HALF_Z + t / 2)
    group.add(south)
    const east = new THREE.Mesh(wallEW, trayMat)
    east.position.set(CAT_LITTER_X + CAT_LITTER_HALF_X - t / 2, wallY, CAT_LITTER_Z)
    group.add(east)
    const west = new THREE.Mesh(wallEW, trayMat)
    west.position.set(CAT_LITTER_X - CAT_LITTER_HALF_X + t / 2, wallY, CAT_LITTER_Z)
    group.add(west)

    // Sand surface — sits inside the walls so it reads as filled litter.
    const sandMat = new THREE.MeshStandardMaterial({
      color: 0xd9c79a,
      roughness: 1,
      metalness: 0,
    })
    const sand = new THREE.Mesh(
      new THREE.BoxGeometry(innerX, CAT_LITTER_SAND_HEIGHT, innerZ),
      sandMat,
    )
    sand.position.set(CAT_LITTER_X, FLOOR_Y + CAT_LITTER_SAND_HEIGHT / 2 + t, CAT_LITTER_Z)
    group.add(sand)

    this.litterWorldPosition.set(CAT_LITTER_X, FLOOR_Y, CAT_LITTER_Z)

    // Waste chunks — small dark pellets scattered across the sand. Hidden by default;
    // visibility is driven by `litterPollution` in `tickLitterChunkVisual`.
    const chunkMat = new THREE.MeshStandardMaterial({
      color: 0x4a3a2a,
      roughness: 0.95,
      metalness: 0,
    })
    const innerHalfX = innerX / 2 - LITTER_CHUNK_PAD
    const innerHalfZ = innerZ / 2 - LITTER_CHUNK_PAD
    const chunkY = FLOOR_Y + t + CAT_LITTER_SAND_HEIGHT + LITTER_CHUNK_RADIUS * 0.4
    for (let i = 0; i < LITTER_POLLUTION_MAX; i++) {
      const layout = LITTER_CHUNK_OFFSETS[i] ?? { x: 0, z: 0 }
      const chunk = new THREE.Mesh(new THREE.SphereGeometry(LITTER_CHUNK_RADIUS, 8, 6), chunkMat)
      chunk.position.set(
        CAT_LITTER_X + layout.x * innerHalfX,
        chunkY,
        CAT_LITTER_Z + layout.z * innerHalfZ,
      )
      chunk.scale.set(1, 0.55, 1)
      chunk.visible = false
      group.add(chunk)
      this.litterChunkMeshes.push(chunk)
    }
    return group
  }

  /**
   * Update waste-chunk visibility against the current pollution count. Chunk index
   * `i` is shown when `i < pollution` (from {@link SushiBridgeCallbacks.getLitterPollution}).
   */
  private tickLitterChunkVisual(): void {
    if (this.litterChunkMeshes.length === 0) return
    const count = this.sushiCallbacks?.getLitterPollution() ?? 0
    for (let i = 0; i < this.litterChunkMeshes.length; i++) {
      const mesh = this.litterChunkMeshes[i]
      if (mesh) mesh.visible = i < count
    }
  }

  /**
   * Build Sushi's wooden cat house. Three solid walls + floor + a front wall with
   * a circular entry hole carved out (via {@link THREE.Shape} + {@link THREE.Path.absellipse}
   * extruded) so the cat can slip inside. A pitched roof (two angled panels) sits on top.
   * Materials are dim and unlit-feeling so the interior reads as vignetted — the player
   * can barely see Sushi when he's curled up inside.
   *
   * Origin: house centre at (CAT_HOUSE_X, FLOOR_Y, CAT_HOUSE_Z); entry faces -Z.
   *
   * @returns Three.js group containing the assembled cat house.
   */
  private buildCatHouse(): THREE.Group {
    const group = new THREE.Group()
    group.name = 'sushiCatHouse'

    const woodMat = new THREE.MeshStandardMaterial({
      color: 0xd9b785,
      roughness: 0.85,
      metalness: 0,
    })
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0x6b5238,
      roughness: 1,
      metalness: 0,
    })
    const roofMat = new THREE.MeshStandardMaterial({
      color: 0xb87a4a,
      roughness: 0.9,
      metalness: 0,
    })

    const w = CAT_HOUSE_WIDTH
    const d = CAT_HOUSE_DEPTH
    const h = CAT_HOUSE_WALL_HEIGHT
    const t = CAT_HOUSE_THICKNESS
    const halfW = w / 2
    const halfD = d / 2

    // Floor slab — sits flush with the cabin floor (group is positioned later).
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, t, d), woodMat)
    floor.position.set(0, t / 2, 0)
    group.add(floor)

    // Back wall (+Z face).
    const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), woodMat)
    back.position.set(0, h / 2, halfD - t / 2)
    group.add(back)

    // Side walls.
    const sideGeo = new THREE.BoxGeometry(t, h, d)
    const left = new THREE.Mesh(sideGeo, woodMat)
    left.position.set(-halfW + t / 2, h / 2, 0)
    group.add(left)
    const right = new THREE.Mesh(sideGeo, woodMat)
    right.position.set(halfW - t / 2, h / 2, 0)
    group.add(right)

    // Front wall (-Z) with circular entry hole. Build a 2D rectangle Shape and
    // subtract a circular Path so ExtrudeGeometry produces a wall-with-hole.
    // The shape is authored in local XY (centred on the wall centre) then placed
    // at the front face with thickness running along Z.
    const frontShape = new THREE.Shape()
    frontShape.moveTo(-halfW, 0)
    frontShape.lineTo(halfW, 0)
    frontShape.lineTo(halfW, h)
    frontShape.lineTo(-halfW, h)
    frontShape.lineTo(-halfW, 0)
    const hole = new THREE.Path()
    hole.absellipse(
      0,
      CAT_HOUSE_ENTRY_CENTRE_Y,
      CAT_HOUSE_ENTRY_RADIUS,
      CAT_HOUSE_ENTRY_RADIUS,
      0,
      TWO_PI,
      false,
      0,
    )
    frontShape.holes.push(hole)
    const frontGeo = new THREE.ExtrudeGeometry(frontShape, {
      depth: t,
      bevelEnabled: false,
    })
    const front = new THREE.Mesh(frontGeo, woodMat)
    // Place at front face (–Z side); extrudes along +Z so push back by t to keep
    // outer face on -halfD line.
    front.position.set(0, 0, -halfD)
    group.add(front)

    // Inner shadow card — a dark plate just inside the entry to vignette the
    // interior so Sushi reads as silhouette/barely visible when sleeping.
    const shadowCard = new THREE.Mesh(new THREE.PlaneGeometry(w - t * 2, h - t), innerMat)
    shadowCard.position.set(0, (h - t) / 2 + t, halfD - t * 1.5)
    shadowCard.rotation.y = Math.PI
    group.add(shadowCard)

    // Pitched roof — two angled panels meeting at a peak running along X.
    // Each panel spans (halfD + overhang) × (panelWidth) and tilts so the high
    // edge sits at peak height and the low edge at the eaves.
    const overhang = CAT_HOUSE_ROOF_OVERHANG
    const peak = CAT_HOUSE_ROOF_PEAK
    const panelLen = w + overhang * 2
    const slopeRun = halfD + overhang
    const panelWidth = Math.sqrt(slopeRun * slopeRun + peak * peak)
    const tiltAngle = Math.atan2(peak, slopeRun)
    const panelGeo = new THREE.BoxGeometry(panelLen, t, panelWidth)
    const roofLocalY = h
    const peakLocalY = roofLocalY + peak

    const panelFront = new THREE.Mesh(panelGeo, roofMat)
    panelFront.position.set(0, (peakLocalY + roofLocalY) / 2, -slopeRun / 2)
    panelFront.rotation.x = -tiltAngle
    group.add(panelFront)

    const panelBack = new THREE.Mesh(panelGeo, roofMat)
    panelBack.position.set(0, (peakLocalY + roofLocalY) / 2, slopeRun / 2)
    panelBack.rotation.x = tiltAngle
    group.add(panelBack)

    // Place + orient the assembled house. Built with entry on local -Z; rotating by
    // CAT_HOUSE_YAW_RADIANS swings the entry to face -X (toward the cabin centre).
    group.position.set(CAT_HOUSE_X, FLOOR_Y, CAT_HOUSE_Z)
    group.rotation.y = CAT_HOUSE_YAW_RADIANS
    this.houseWorldPosition.set(CAT_HOUSE_X, FLOOR_Y, CAT_HOUSE_Z)
    // Entry-approach waypoint = house centre + outward entry normal *
    // CAT_HOUSE_APPROACH_DISTANCE. The house was authored with the entry on
    // local -Z; rotating the group by `CAT_HOUSE_YAW_RADIANS` around Y maps
    // that to a world-space outward normal of (-sin(yaw), 0, -cos(yaw)).
    const entryNx = -Math.sin(CAT_HOUSE_YAW_RADIANS)
    const entryNz = -Math.cos(CAT_HOUSE_YAW_RADIANS)
    this.houseApproachWorldPosition.set(
      CAT_HOUSE_X + entryNx * CAT_HOUSE_APPROACH_DISTANCE,
      FLOOR_Y,
      CAT_HOUSE_Z + entryNz * CAT_HOUSE_APPROACH_DISTANCE,
    )
    return group
  }

  /**
   * Add a flat deck floor running the length of the cylinder. Modelled as a thin box
   * (rather than a single-sided plane) so it reads as a solid surface from grazing
   * angles and props/NPCs cannot peek through the underside when their bbox dips a
   * few millimetres on an animation frame.
   */
  private buildFloor(): void {
    const floorWidth = CYLINDER_RADIUS * FLOOR_WIDTH_FACTOR
    const floorGeo = new THREE.BoxGeometry(floorWidth, FLOOR_THICKNESS, CYLINDER_LENGTH)
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xdadbd8,
      roughness: HABITAT_PAINT_ROUGHNESS,
      metalness: HABITAT_PAINT_FLOOR_METALNESS,
    })
    this.applyHabitatFloorTextureMaps(floorMat)
    this.habitatFloorMaterial = floorMat
    const floor = new THREE.Mesh(floorGeo, floorMat)
    // Top face flush with FLOOR_Y so all walking math (player + NPCs) stays unchanged.
    floor.position.y = FLOOR_Y - FLOOR_THICKNESS / 2
    this.scene.add(floor)
  }

  // -------------------------------------------------------------------------
  // Private tick helpers
  // -------------------------------------------------------------------------

  /**
   * Process WASD input and move the player, with cylindrical collision clamping.
   *
   * @param dt - Delta time in seconds.
   */
  private tickMovement(dt: number): void {
    const forward = this.inputManager.isActionActive('moveForward')
    const back = this.inputManager.isActionActive('moveBack')
    const left = this.inputManager.isActionActive('moveLeft')
    const right = this.inputManager.isActionActive('moveRight')

    const fwd = this.fpsCamera.getForwardXZ()
    const rgt = this.fpsCamera.getRightXZ()

    let dx = 0
    let dz = 0

    if (forward) {
      dx += fwd.x
      dz += fwd.y
    }
    if (back) {
      dx -= fwd.x
      dz -= fwd.y
    }
    if (left) {
      dx -= rgt.x
      dz -= rgt.y
    }
    if (right) {
      dx += rgt.x
      dz += rgt.y
    }

    // Normalize diagonal movement
    const len = Math.sqrt(dx * dx + dz * dz)
    if (len > 0) {
      dx = (dx / len) * MOVE_SPEED * dt
      dz = (dz / len) * MOVE_SPEED * dt
    }

    this.player.position.x += dx
    this.player.position.z += dz

    // Cylindrical wall collision — clamp to axis-aligned bounding box
    // (cheaper than true cylinder check, good enough for narrow tube)
    const maxX = CYLINDER_RADIUS - COLLISION_MARGIN
    const maxZ = CYLINDER_LENGTH / 2 - COLLISION_MARGIN
    this.player.position.x = Math.max(-maxX, Math.min(maxX, this.player.position.x))
    this.player.position.z = Math.max(-maxZ, Math.min(maxZ, this.player.position.z))

    // Furniture obstacle resolution — push the player out of any AABB they have
    // entered along the shorter penetration axis.
    this.resolvePlayerObstacles()

    // Keep player glued to floor
    this.player.position.y = FLOOR_Y

    // Footsteps — always grounded on the flat habitat floor
    this.footsteps.update(dt, len > 0, true)
  }

  /**
   * Push the player out of any registered furniture obstacle AABB along the
   * shortest penetration axis. AABBs in {@link playerObstacles} are inflated by
   * {@link PLAYER_OBSTACLE_RADIUS} so the resolver behaves like a small XZ-plane
   * capsule instead of a point. Y is ignored — the player is glued to the floor.
   */
  private resolvePlayerObstacles(): void {
    if (this.playerObstacles.length === 0) return
    const px = this.player.position.x
    const pz = this.player.position.z
    let nx = px
    let nz = pz
    for (const aabb of this.playerObstacles) {
      const minX = aabb.min.x - PLAYER_OBSTACLE_RADIUS
      const maxX = aabb.max.x + PLAYER_OBSTACLE_RADIUS
      const minZ = aabb.min.z - PLAYER_OBSTACLE_RADIUS
      const maxZ = aabb.max.z + PLAYER_OBSTACLE_RADIUS
      if (nx <= minX || nx >= maxX || nz <= minZ || nz >= maxZ) continue
      // Penetration depth on each axis — pick the smallest to minimise visual snap.
      const overlapLeft = nx - minX
      const overlapRight = maxX - nx
      const overlapBack = nz - minZ
      const overlapFront = maxZ - nz
      const minOverlap = Math.min(overlapLeft, overlapRight, overlapBack, overlapFront)
      if (minOverlap === overlapLeft) nx = minX
      else if (minOverlap === overlapRight) nx = maxX
      else if (minOverlap === overlapBack) nz = minZ
      else nz = maxZ
    }
    this.player.position.x = nx
    this.player.position.z = nz
  }

  /**
   * Check proximity to nearby interactables (cat, then table) and fire prompt /
   * interact callbacks. Cat takes priority when the player is in petting range so a
   * cat napping next to the table doesn't get hidden behind the Shuttle Control
   * prompt. Compares XZ distance only so the check works regardless of camera pitch.
   */
  /**
   * Begin a short scripted glide that takes the player into petting position —
   * standing just in front of Sushi, facing him. WASD input is ignored while the
   * sequence is active; both the body slide and the camera turn are handled by
   * {@link tickPetSequence}.
   *
   * The target XZ is `cat.position + APPROACH_DISTANCE * catForward`, where the
   * cat's forward vector matches the same `(sin(yaw), cos(yaw))` convention used
   * inside {@link CatController.tickWalk}. The point is clamped into the cabin
   * envelope so a cat sitting against a wall doesn't push the player through it.
   */
  private startPetSequence(): void {
    if (!this.cat) return
    const catYaw = this.cat.group.rotation.y
    const fx = Math.sin(catYaw)
    const fz = Math.cos(catYaw)
    let tx = this.cat.group.position.x + fx * PET_APPROACH_DISTANCE
    let tz = this.cat.group.position.z + fz * PET_APPROACH_DISTANCE
    const maxX = CYLINDER_RADIUS - COLLISION_MARGIN
    const maxZ = CYLINDER_LENGTH / 2 - COLLISION_MARGIN
    tx = Math.max(-maxX, Math.min(maxX, tx))
    tz = Math.max(-maxZ, Math.min(maxZ, tz))
    this._petStartXZ.set(this.player.position.x, this.player.position.z)
    this._petTargetXZ.set(tx, tz)
    this.petSequenceActive = true
    this.petSequenceTime = 0
    // Tell Sushi to swivel toward where the player will end up so they meet
    // eyes through the glide. Y is the player's eye height so the head-tilt
    // override actually angles his face upward at us, not at the floor.
    this._tmpWorldPos.set(tx, FLOOR_Y + HABITAT_EYE_HEIGHT, tz)
    this.cat.lookAt(this._tmpWorldPos)
  }

  /**
   * Advance the pet glide-to-front sequence. Eases the player from its starting
   * XZ to the target spot in front of Sushi, while the camera continually lerps
   * its yaw/pitch toward Sushi's head. Returns true while the sequence owns the
   * player, telling {@link tick} to skip the normal movement step.
   *
   * @param dt - Delta time in seconds.
   * @returns Whether the sequence consumed control this frame.
   */
  private tickPetSequence(dt: number): boolean {
    if (!this.petSequenceActive) return false
    if (!this.cat) {
      this.petSequenceActive = false
      return false
    }
    // Keep Sushi's face target locked on the petter's head throughout the sequence
    // so he tracks them rather than the static glide endpoint. Use the player body
    // + fixed eye height (NOT camera.position) — the camera Y wobbles with the
    // walk-bob, and feeding that into atan2 turns Sushi's head into a horror-movie
    // up-down jitter at this short range.
    this._tmpWorldPos.set(
      this.player.position.x,
      this.player.position.y + HABITAT_EYE_HEIGHT,
      this.player.position.z,
    )
    this.cat.lookAt(this._tmpWorldPos)
    this.petSequenceTime += dt
    const t = Math.min(1, this.petSequenceTime / PET_APPROACH_DURATION_S)
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
    this.player.position.x = this._petStartXZ.x + (this._petTargetXZ.x - this._petStartXZ.x) * e
    this.player.position.z = this._petStartXZ.y + (this._petTargetXZ.y - this._petStartXZ.y) * e
    this.player.position.y = FLOOR_Y

    // Camera tracks Sushi: lerp yaw/pitch toward the head point each frame.
    this.cat.getLookAtPoint(this._tmpWorldPos)
    const cam = this.fpsCamera.camera
    const dx = this._tmpWorldPos.x - cam.position.x
    const dy = this._tmpWorldPos.y - cam.position.y
    const dz = this._tmpWorldPos.z - cam.position.z
    const horiz = Math.hypot(dx, dz)
    if (horiz > 1e-4) {
      const desiredYaw = Math.atan2(-dx, -dz)
      const desiredPitch = Math.atan2(dy, horiz)
      const k = Math.min(1, PET_CAMERA_TURN_RATE * dt)
      let yawErr = desiredYaw - this.fpsCamera.yaw
      while (yawErr > Math.PI) yawErr -= Math.PI * 2
      while (yawErr < -Math.PI) yawErr += Math.PI * 2
      this.fpsCamera.yaw += yawErr * k
      this.fpsCamera.pitch += (desiredPitch - this.fpsCamera.pitch) * k
      const clamp = HABITAT_PITCH_CLAMP
      this.fpsCamera.pitch = Math.max(-clamp, Math.min(clamp, this.fpsCamera.pitch))
    }

    if (t >= 1) this.petSequenceActive = false
    return true
  }

  /**
   * Begin the shuttle-controls cinematic: smoothly turn the FPS camera to face the
   * mess table console over {@link TABLE_CAMERA_TURN_DURATION_S} seconds. Player
   * movement is suppressed while this sequence is active (same policy as the pet
   * glide) so a quick F-press doesn't leave the player walking away mid-turn.
   *
   * Called from {@link tickInteraction} immediately after `onInteract?.('table')` so
   * the camera punch plays in sync with whatever the host ViewController does on that
   * signal (e.g. opening the shuttle-control overlay).
   */
  private startTableLookSequence(): void {
    this.tableSequenceActive = true
    this.tableSequenceTime = 0
  }

  /**
   * Advance the shuttle-controls camera-turn sequence. Lerps the FPS camera yaw and
   * pitch toward the table's XZ position at a fixed Y offset above the floor
   * ({@link TABLE_LOOK_TARGET_Y_OFFSET}) — so the camera tilts down to the console
   * surface rather than landing flat on the deck. Returns true while the sequence is
   * active to let {@link tick} suppress normal WASD input.
   *
   * @param dt - Delta time in seconds.
   * @returns Whether the sequence consumed control this frame.
   */
  private tickTableLookSequence(dt: number): boolean {
    if (!this.tableSequenceActive) return false
    this.tableSequenceTime += dt

    const cam = this.fpsCamera.camera
    const dx = this.tablePosition.x - cam.position.x
    const dy = FLOOR_Y + TABLE_LOOK_TARGET_Y_OFFSET - cam.position.y
    const dz = this.tablePosition.z - cam.position.z
    const horiz = Math.hypot(dx, dz)
    if (horiz > 1e-4) {
      const desiredYaw = Math.atan2(-dx, -dz)
      const desiredPitch = Math.atan2(dy, horiz)
      const k = Math.min(1, TABLE_CAMERA_TURN_RATE * dt)
      let yawErr = desiredYaw - this.fpsCamera.yaw
      while (yawErr > Math.PI) yawErr -= Math.PI * 2
      while (yawErr < -Math.PI) yawErr += Math.PI * 2
      this.fpsCamera.yaw += yawErr * k
      this.fpsCamera.pitch += (desiredPitch - this.fpsCamera.pitch) * k
      const clamp = HABITAT_PITCH_CLAMP
      this.fpsCamera.pitch = Math.max(-clamp, Math.min(clamp, this.fpsCamera.pitch))
    }

    if (this.tableSequenceTime >= TABLE_CAMERA_TURN_DURATION_S) {
      this.tableSequenceActive = false
    }
    return true
  }

  /**
   * Begin the hatch exit sequence: start spinning the wheel-knob. Movement and
   * interaction are suppressed for the duration so the player can't walk away
   * mid-animation. {@link tickHatchKnob} fires {@link onInteract} with `'hatch'`
   * once the spin completes, signalling the facade to leave the habitat.
   */
  private startHatchExitSequence(): void {
    useAudio().play('sfx.hatch.open')
    this.hatchExitActive = true
    this.hatchExitTime = 0
  }

  /**
   * Advance the hatch wheel-knob spin animation. Uses a quadratic ease-in-out envelope
   * so the knob accelerates into the turn and decelerates to a stop rather than snapping.
   * Fires {@link onInteract} with `'hatch'` exactly once when the animation completes.
   *
   * @param dt - Delta time in seconds.
   */
  private tickHatchKnob(dt: number): void {
    if (!this.hatchExitActive || !this.hatchKnobPivot) return
    this.hatchExitTime += dt
    const t = Math.min(1, this.hatchExitTime / HATCH_KNOB_SPIN_DURATION_S)
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
    this.hatchKnobPivot.rotation.z = e * HATCH_KNOB_SPIN_RADIANS
    if (t >= 1) {
      this.hatchExitActive = false
      this.onInteract?.('hatch')
    }
  }

  private tickInteraction(): void {
    // Suppress all prompts + input while the hatch spin is playing.
    if (this.hatchExitActive) {
      this.onPrompt?.(null)
      return
    }

    if (this.tablePlacementGrabbed) {
      this.onPrompt?.('LMB place table → devtools console')
      return
    }

    // Distance to the shuttle-control table — used both to gate the cat/bowl prompts
    // (so a cat sitting near the table doesn't steal the F slot from Shuttle Control)
    // and below for the table prompt itself.
    const tableDx = this.player.position.x - this.tablePosition.x
    const tableDz = this.player.position.z - this.tablePosition.z
    const tableDistXZ = Math.hypot(tableDx, tableDz)
    const tableInRange = tableDistXZ < INTERACT_DISTANCE

    // --- Cat (pet) — takes priority when in range ---------------------------
    if (this.cat) {
      const cx = this.player.position.x - this.cat.group.position.x
      const cz = this.player.position.z - this.cat.group.position.z
      const distCat = Math.hypot(cx, cz)
      // If Sushi is sitting (post-pet) and the player has wandered off, end the
      // sit so he doesn't stay parked staring at empty air — he'll pick a new
      // waypoint and resume his normal roam.
      if (!this.petSequenceActive && this.cat.isSitting && distCat > PET_SIT_CANCEL_DISTANCE) {
        this.cat.endSit()
      }
      // Pet prompt is suppressed when Sushi is mid-errand (eating, going to the
      // bowl, following the player, etc.) — interrupting those reads as buggy.
      // Also suppressed when the player is in shuttle-control range so the table
      // prompt always wins at the cockpit (cat napping nearby doesn't hijack F).
      if (distCat < PET_PROMPT_DISTANCE && !this.cat.isBusyWithNeeds && !tableInRange) {
        if (this.petCooldownTimer > 0) {
          this.onPrompt?.('Sushi needs a moment...')
        } else {
          this.onPrompt?.('F  Pet Sushi')
          if (this.inputManager.wasActionPressed('interact')) {
            this.cat.pet()
            this.catAudio.playPet()
            this.startPetSequence()
            this.petCooldownTimer = PET_COOLDOWN_S
            this.onInteract?.('cat')
          }
        }
        return
      }
    }

    // --- Bowl (fill) -------------------------------------------------------
    const bowlDx = this.player.position.x - this.bowlWorldPosition.x
    const bowlDz = this.player.position.z - this.bowlWorldPosition.z
    const bowlDist = Math.hypot(bowlDx, bowlDz)
    if (bowlDist < BOWL_FILL_PROMPT_DISTANCE && !tableInRange && this.sushiCallbacks) {
      const servings = this.sushiCallbacks.getBowlServings()
      const canFill = this.sushiCallbacks.canFillBowl()
      const servingsLabel = `${servings}/${BOWL_SERVINGS_MAX} Servings`
      if (canFill) {
        this.onPrompt?.(`${servingsLabel}  ·  F  Fill Bowl`)
        if (this.inputManager.wasActionPressed('interact')) {
          this.sushiCallbacks.onFillBowl()
          this.bowlFillCueTimer = BOWL_FILL_CUE_DURATION_S
        }
        return
      }
      if (servings > 0) {
        this.onPrompt?.(servingsLabel)
        return
      }
      // Bowl needs food but the player has none — surface that explicitly so
      // they understand why the bowl is empty and the cat is harassing them.
      if (!this.sushiCallbacks.hasCatFood()) {
        this.onPrompt?.('No Cat Food In Bag')
        return
      }
    }

    // --- Litterbox (clean) -------------------------------------------------
    const litterDx = this.player.position.x - this.litterWorldPosition.x
    const litterDz = this.player.position.z - this.litterWorldPosition.z
    const litterDist = Math.hypot(litterDx, litterDz)
    if (litterDist < LITTER_PROMPT_DISTANCE && !tableInRange && this.sushiCallbacks) {
      const pollution = this.sushiCallbacks.getLitterPollution()
      if (pollution > 0) {
        this.onPrompt?.(`${pollution}/${LITTER_POLLUTION_MAX} Dirty  ·  F  Empty Litterbox`)
        if (this.inputManager.wasActionPressed('interact')) {
          this.sushiCallbacks.onEmptyLitter()
          this.catAudio.playLitterScoop()
        }
        return
      }
      this.onPrompt?.('Litterbox Clean')
      return
    }

    // --- Table -------------------------------------------------------------
    const distXZ = tableDistXZ
    const near = distXZ < INTERACT_DISTANCE * TABLE_DEBUG_GRAB_REACH_MULT

    if (tableInRange) {
      this.onPrompt?.(
        isTablePlacementDebugEnabled()
          ? 'LMB grab table (dev)  ·  F  Shuttle Control'
          : 'F  Shuttle Control',
      )
      if (this.inputManager.wasActionPressed('interact')) {
        this.startTableLookSequence()
        this.onInteract?.('table')
      }
    } else if (near && isTablePlacementDebugEnabled()) {
      this.onPrompt?.('LMB grab table (dev, closer)')
    } else {
      // --- Hatch (exit) -------------------------------------------------------
      const hatchDx = this.player.position.x
      const hatchDz = this.player.position.z - -CYLINDER_LENGTH / 2
      if (Math.hypot(hatchDx, hatchDz) < HATCH_INTERACT_DISTANCE) {
        this.onPrompt?.('F  Exit')
        if (this.inputManager.wasActionPressed('interact')) {
          this.startHatchExitSequence()
        }
      } else {
        this.onPrompt?.(null)
      }
    }
  }

  /**
   * While grabbed, write the table's **world** transform directly each frame, keeping it as a
   * direct child of {@link scene}. The FPS camera is intentionally **not** part of the scene
   * graph (only {@link FpsCamera.tick} sets its pose), so reparenting the table to the camera
   * removes it from the rendered hierarchy entirely — the previous attempt did exactly that
   * which is why the model "disappeared" the instant it was grabbed.
   *
   * Forward direction comes from {@link FpsCamera.yaw} (no pitch) so looking up/down does not
   * lift or sink the prop. Y is anchored to the camera eye minus a small offset and clamped
   * above the floor so it never clips when the player looks straight down.
   */
  private tickTablePlacementHold(): void {
    if (!this.tablePlacementGrabbed || !this.tableRoot) return
    const cam = this.fpsCamera.camera
    const yaw = this.fpsCamera.yaw
    const fwdX = -Math.sin(yaw)
    const fwdZ = -Math.cos(yaw)
    const eyeY = cam.position.y
    this.tableRoot.position.set(
      cam.position.x + fwdX * TABLE_DEBUG_HOLD_DISTANCE,
      Math.max(FLOOR_Y + TABLE_DEBUG_HOLD_MIN_ABOVE_FLOOR, eyeY - TABLE_DEBUG_HOLD_BELOW_EYE),
      cam.position.z + fwdZ * TABLE_DEBUG_HOLD_DISTANCE,
    )
    this.tableRoot.rotation.set(TABLE_LAYOUT_ROT_X, yaw, TABLE_LAYOUT_ROT_Z)
  }

  /**
   * Drop the table back onto the floor at its current XZ + yaw and log the resulting world
   * pose for pasting into {@link load}. We deliberately overwrite the held Y so the released
   * table never floats — `tickTablePlacementHold` parks it at eye-height while grabbed for
   * visibility, but the placement workflow always wants it sitting on the deck.
   */
  private commitTablePlacementFromDebug(): void {
    const root = this.tableRoot
    if (!root) return
    this.tablePlacementGrabbed = false

    // Snap to floor: keep XZ + rotation, then offset Y so the post-rotation bbox.min sits at
    // FLOOR_Y. Mirrors the `load()` defensive drop-to-floor step.
    root.position.y = FLOOR_Y
    root.updateMatrixWorld(true)
    const grounded = new THREE.Box3().setFromObject(root)
    if (grounded.min.y !== FLOOR_Y) {
      root.position.y -= grounded.min.y - FLOOR_Y
      root.updateMatrixWorld(true)
    }

    root.getWorldPosition(this._tmpWorldPos)
    root.getWorldQuaternion(this._tmpWorldQuat)
    this._tmpEuler.setFromQuaternion(this._tmpWorldQuat, 'YXZ')
    const wp = this._tmpWorldPos
    const wq = this._tmpWorldQuat
    const e = this._tmpEuler
    const payload = {
      position: { x: round4(wp.x), y: round4(wp.y), z: round4(wp.z) },
      rotationYXZ: {
        x: round4(e.x),
        y: round4(e.y),
        z: round4(e.z),
        order: e.order,
      },
      quaternion: {
        x: round4(wq.x),
        y: round4(wq.y),
        z: round4(wq.z),
        w: round4(wq.w),
      },
      snippet: `tableModel.position.set(${round4(wp.x)}, ${round4(wp.y)}, ${round4(wp.z)})\ntableModel.quaternion.set(${round4(wq.x)}, ${round4(wq.y)}, ${round4(wq.z)}, ${round4(wq.w)})`,
    }
    console.log('[HabitatInteriorScene] Table world pose (paste into load() after layout):')
    console.log(JSON.stringify(payload, null, 2))
    this.tablePosition.set(wp.x, FLOOR_Y, wp.z)
  }
}
