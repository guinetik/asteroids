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
  /** Coverage of loose boulders on the surface. Also scales the micro-breakup pass inside disturbed zones. */
  boulderDensity: number
  /** Frequency of ridge-pass features such as ridges, channels, and linear scarps. */
  ridgeFrequency: number
  /** Strength of the disturbance-mask weighting and medium-breakup pass. Higher values intensify broken patches instead of adding uniform waviness everywhere. */
  roughness: number
  /** How much loose dust/regolith blankets the surface. Higher values increase dust softening, damping sharp breakup detail before crater and ridge passes. */
  dustCoverage: number
  /**
   * Optional URL path to a GLB model used for the level surface. When omitted,
   * the level view falls back to `DEFAULT_ASTEROID_MODEL_PATH`.
   */
  modelPath?: string
  /**
   * Optional uniform scale applied to the GLB before baking the collision
   * heightmap. GLBs in `public/models/*.glb` are authored near unit scale
   * (~2 world units across), so a scale around 1200–1400 is needed to fill
   * the level's play area. Defaults to 1 when omitted.
   */
  modelScale?: number
  /**
   * Optional albedo texture URL applied to every mesh in the asteroid GLB,
   * overriding whatever baseColor map was embedded. The GLB's normal and
   * roughness maps are preserved so surface relief still reads. Lets each
   * asteroid JSON swap its look (e.g. `/texture.jpg`, `/textures/rocks/basalt.jpg`)
   * without touching the shared GLB.
   */
  texturePath?: string
  /**
   * How many times {@link texturePath} repeats across the GLB's UV range
   * (applied to both U and V). Higher = finer grain. Defaults to 1 (no tiling).
   * A tileable texture at 6–10 reads well on a ~2600 unit asteroid.
   */
  textureRepeat?: number
  /**
   * Optional URL to a tileable detail texture multiplied on top of
   * {@link texturePath} via the same triplanar projection. Lets a low-frequency
   * macro texture (e.g. a NASA "view from space" image at 1–2 repeats) get
   * grain and gravel detail when the player walks around in FPS without losing
   * the asteroid's distinct silhouette identity at lander altitude. Recommended
   * input: a seamless rocky-ground tile at 50–100 repeats.
   */
  detailTexturePath?: string
  /**
   * Repeat factor for {@link detailTexturePath} in cycles per object-space
   * unit. High values (50+) keep the detail tile invisible at distance via
   * mipmapping while showing crisp grain at FPS range. Defaults to 60.
   */
  detailRepeat?: number
  /**
   * Strength of the detail multiply blend, 0..1. `0` disables detail entirely
   * (macro only). `1` is full overlay where neutral-grey detail leaves macro
   * unchanged but light/dark spots brighten/darken the surface. Defaults to 0.7.
   */
  detailStrength?: number
  /**
   * Optional tangent-space normal map for the detail layer. Triplanar-applied
   * via whiteout blending in object space. The single biggest visual upgrade
   * for FPS close-ups: glancing sun light catches micro-relief that pure color
   * detail can't convey. OpenGL-convention normal maps (green up).
   */
  detailNormalPath?: string
  /** Detail normal-map strength scalar, 0..2. Defaults to 1. */
  detailNormalStrength?: number
  /**
   * Optional roughness map for the detail layer. Triplanar-multiplied into the
   * material roughness for spec variation across micro-terrain.
   */
  detailRoughnessPath?: string
  /**
   * When true, the runtime skips the material override entirely and lets the
   * asteroid GLB render with whatever textures and material it ships with.
   * Pair with running the normalization pipeline under
   * `ASTEROID_PRESERVE_TEXTURES=1` so the embedded textures survive into the
   * runtime model.
   */
  useEmbeddedTexture?: boolean
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
