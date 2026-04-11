/**
 * Tuning constants for the Neptune solar panel maintenance minigame.
 *
 * @author guinetik
 * @date 2026-04-11
 * @spec docs/superpowers/specs/2026-04-10-orbital-minigame-design.md
 */

/** Logical canvas width in pixels. */
export const CANVAS_WIDTH = 800

/** Logical canvas height in pixels. */
export const CANVAS_HEIGHT = 500

// ─── Neptune ─────────────────────────────────────────────────────────────────

/** Neptune center X. */
export const NEPTUNE_X = CANVAS_WIDTH * 0.5

/** Neptune center Y. */
export const NEPTUNE_Y = CANVAS_HEIGHT * 0.48

/** Neptune visual radius in px. */
export const NEPTUNE_R = 145

/** Planet rotation speed in radians/s. */
export const PLANET_ROTATION_SPEED = 0.06

// ─── Sun ─────────────────────────────────────────────────────────────────────

/** Default sun distance from planet center (used for random placement). */
export const SUN_ORBIT_RADIUS = 380

// ─── Panel placement ─────────────────────────────────────────────────────────

/** Horizontal offset from planet center for all panels. */
const PANEL_OFFSET_X = NEPTUNE_R + 70

/** Vertical offset for pole panels — must exceed NEPTUNE_R so beams clear the planet. */
const PANEL_POLE_Y = 155

/**
 * Panel positions as [x, y] offsets from planet center.
 * Two symmetric columns — poles swing wide above/below the planet,
 * equator at the same X offset so all panels have mutual line-of-sight
 * (except cross-equator which routes through poles).
 */
export const PANEL_POSITIONS: [number, number][] = [
  // Left column: north pole, equator, south pole
  [-PANEL_OFFSET_X, -PANEL_POLE_Y],
  [-PANEL_OFFSET_X, 0],
  [-PANEL_OFFSET_X, PANEL_POLE_Y],
  // Right column: north pole, equator, south pole
  [PANEL_OFFSET_X, -PANEL_POLE_Y],
  [PANEL_OFFSET_X, 0],
  [PANEL_OFFSET_X, PANEL_POLE_Y],
]

// ─── Panels ──────────────────────────────────────────────────────────────────

/** Number of solar panels in the puzzle. */
export const PANEL_COUNT = 6

/** Visual half-size of a panel in px. */
export const PANEL_HALF_SIZE = 10

/** Click/tap hit radius for selecting a panel. */
export const PANEL_HIT_RADIUS = 18

/** Radius for a beam to "hit" a panel. */
export const PANEL_CAPTURE_RADIUS = 14

/** Rotation speed when dragging (radians per pixel of mouse movement). */
export const PANEL_DRAG_SENSITIVITY = 0.015

/** Maximum beam bounces to prevent infinite loops. */
export const MAX_BEAM_BOUNCES = 8

/** Beam intensity falloff per bounce (multiplied each hop). */
export const BEAM_INTENSITY_FALLOFF = 0.8

/** Maximum beam length in px before it fades out. */
export const BEAM_MAX_LENGTH = 900

// ─── Targets ─────────────────────────────────────────────────────────────────

/** Number of surface targets to illuminate. */
export const TARGET_COUNT = 4

/** Radius for a beam to "hit" a surface target. */
export const TARGET_HIT_RADIUS = 14

// ─── Timer ───────────────────────────────────────────────────────────────────

/** Time limit in seconds (0 = no limit). */
export const TIME_LIMIT = 60
