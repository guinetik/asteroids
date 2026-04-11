/**
 * Types for the Neptune solar panel maintenance minigame.
 *
 * @author guinetik
 * @date 2026-04-11
 * @spec docs/superpowers/specs/2026-04-10-orbital-minigame-design.md
 */

/** A solar panel orbiting the planet that can redirect sunlight. */
export interface SolarPanel {
  /** Index in the panels array. */
  id: number
  /** Orbital ring index (0, 1, or 2). */
  ring: number
  /** Angle on the orbital ring in radians. */
  orbitAngle: number
  /** World X position (computed from ring + orbitAngle). */
  x: number
  /** World Y position (computed from ring + orbitAngle). */
  y: number
  /** Facing direction in radians — the direction this panel aims its reflected beam. */
  aimAngle: number
  /** Whether this panel is currently receiving light (from sun or another panel). */
  lit: boolean
}

/** A surface target on Neptune that needs to be illuminated. */
export interface SurfaceTarget {
  /** Latitude on planet (-1 to 1). */
  lat: number
  /** Longitude on planet (-PI to PI). */
  lon: number
  /** World X (computed from planet rotation). */
  x: number
  /** World Y (computed from planet rotation). */
  y: number
  /** Visual radius in px. */
  radius: number
  /** Whether this target is currently illuminated by a light beam. */
  lit: boolean
  /** Pulse animation offset. */
  pulseOffset: number
}

/** A traced light beam segment for rendering. */
export interface LightBeam {
  /** Start X. */
  x1: number
  /** Start Y. */
  y1: number
  /** End X. */
  x2: number
  /** End Y. */
  y2: number
  /** Intensity (0–1) — dims with each bounce. */
  intensity: number
}
