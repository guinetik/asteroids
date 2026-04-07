/**
 * Asteroid composition and surface data model.
 *
 * Defines the structure for data-driven asteroid definitions loaded
 * from JSON. Used by the Vue UI for mission briefings and by the
 * procedural generator for mesh/material creation.
 *
 * @author guinetik
 * @date 2026-04-03
 * @spec docs/superpowers/specs/2026-04-03-asteroid-data-model-design.md
 */

import type { AsteroidLighting } from '@/three/atmosphere/AtmosphereContext'

/** A single mineral in an asteroid's composition breakdown. */
export interface MineralEntry {
  /** Display name shown in mission briefing, e.g. "Hydrated Silicates" */
  name: string
  /** Chemical formula, e.g. "Mg3Si2O5(OH)4". Optional for complex organics. */
  formula?: string
  /** Weight percentage of total composition (0–100). All entries must sum to 100. */
  percentage: number
}

/** Macro geometry parameters that define the asteroid's overall silhouette. */
export interface AsteroidShape {
  /** Semi-axes in meters [x, y, z]. Defines the bounding ellipsoid before deformation. */
  dimensions: [number, number, number]
  /** Ratio of longest to shortest axis. 1.0 = sphere, 2.56 = Itokawa's peanut. */
  elongation: number
  /** Number of distinct mass lobes. 1 = potato, 2 = contact binary like Itokawa. */
  lobeCount: number
  /** How far the shape deviates from a smooth ellipsoid (0 = smooth, 1 = very lumpy). */
  irregularity: number
}

/** Surface detail parameters that drive procedural terrain generation. All values 0–1. */
export interface SurfaceFeatures {
  /** How densely packed impact craters are across the surface. */
  craterDensity: number
  /** Largest crater as a fraction of asteroid radius. 0.3 = a crater 30% of the radius. */
  craterMaxScale: number
  /** Coverage of loose boulders on the surface. Bennu is 0.85, Psyche is 0.15. */
  boulderDensity: number
  /** Frequency of ridges, channels, and linear features. High on icy (cracks) and volcanic (lava channels). */
  ridgeFrequency: number
  /** Micro-surface roughness that affects how "gritty" the terrain feels up close. */
  roughness: number
  /** How much loose dust/regolith covers the underlying rock. High on icy (frost). */
  dustCoverage: number
}

/** PBR material properties derived from real spectral data. Colors are RGB normalized 0–1. */
export interface VisualProperties {
  /** Overall surface reflectivity. Bennu is 0.044 (very dark), icy XG7 is 0.67 (bright). */
  albedo: number
  /** Primary surface color as [R, G, B] normalized 0–1. Dominates the material. */
  baseColor: [number, number, number]
  /** Secondary color for variation/detail as [R, G, B] normalized 0–1. Used for noise blending. */
  accentColor: [number, number, number]
  /** Whether the surface glows (true only for volcanic — lava flows emit light). */
  emissive: boolean
  /** Glow color as [R, G, B] normalized 0–1. Required when {@link emissive} is true. */
  emissiveColor?: [number, number, number]
  /** Glow brightness (0–1). 0.6 for KR3's lava. Required when {@link emissive} is true. */
  emissiveIntensity?: number
  /** PBR metalness. 0 = dielectric (rock, ice), 0.85 = polished metal (Iron-Nickel). */
  metalness: number
  /** PBR roughness for the material shader. 0 = mirror, 1 = fully diffuse. */
  roughnessMap: number
}

/** Real-world physical constants used for gameplay physics and UI display. */
export interface PhysicalProperties {
  /** Total mass in kilograms. */
  mass: number
  /** Average density in kg/m³. Ranges from 1100 (icy) to 3400 (metallic). */
  density: number
  /** Surface gravitational acceleration in m/s². Micro-gravity: typically 10⁻⁶ to 10⁻¹. */
  surfaceGravity: number
  /** Sidereal rotation period in hours. Affects day/night cycle in gameplay. */
  rotationPeriod: number
  /** Average surface temperature in Kelvin. 110K (icy) to 450K (volcanic). */
  surfaceTemperature: number
}

/** Complete asteroid definition as loaded from a JSON data file. */
export interface AsteroidDefinition {
  /** Unique key used for lookups, e.g. "bennu", "kr3". */
  id: string
  /** Display name for UI, e.g. "Bennu", "2019 XG₇". */
  name: string
  /** Official IAU designation, e.g. "101955 Bennu", "2019 XG₇". */
  designation: string
  /** Taxonomic classification, e.g. "Carbonaceous (C-type)", "Metallic (M-type)". */
  type: string
  /** Biome tag for gameplay/visual theming: "rocky", "sandy", "metallic", "icy", "volcanic". */
  biome: string
  /** Flavor text shown in mission briefing screen. */
  description: string
  /** Mineral breakdown. Percentages must sum to 100. */
  composition: MineralEntry[]
  /** Macro geometry for procedural mesh generation. */
  shape: AsteroidShape
  /** Surface detail params for terrain features. */
  surface: SurfaceFeatures
  /** PBR material params for the Three.js shader. */
  visual: VisualProperties
  /** Real-world physics constants. */
  physical: PhysicalProperties
  /** Per-asteroid lighting direction, color, and intensity for the level scene. */
  lighting: AsteroidLighting
}

/** Visual properties for a mineral, used to blend surface materials from composition data. */
export interface MineralVisual {
  /** Base color of this mineral as [R, G, B] normalized 0–1. */
  color: [number, number, number]
  /** PBR metalness. Iron-Nickel is 0.85, rock and ice are near 0. */
  metalness: number
  /** PBR roughness. Ice is 0.15 (smooth/glossy), rock is 0.7+ (rough/matte). */
  roughness: number
  /** Whether this mineral glows. Only true for Basaltic Lava. */
  emissive: boolean
}
