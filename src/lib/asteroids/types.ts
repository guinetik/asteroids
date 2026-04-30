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
  /**
   * Optional per-axis constraint on the seeded rotation lottery applied
   * before the heightmap bake. Each axis is either a fixed Euler radian
   * value (axis stays locked across every mission) or omitted (axis spins
   * randomly per mission). Used for elongated bodies like Itokawa where a
   * vertical long axis collapses the playable surface to a tiny patch —
   * locking X and Z to 0 there keeps the long axis horizontal while still
   * letting Y rotate freely. Omit the whole field for full random rotation.
   */
  rotationLottery?: RotationLottery
}

/**
 * Per-axis rotation lottery override. Each present axis is locked to its
 * literal radian value; omitted axes are sampled from the seeded uniform
 * `[0, 2π)` distribution.
 */
export interface RotationLottery {
  /** Fixed X-axis Euler in radians. Omit for random per mission. */
  x?: number
  /** Fixed Y-axis Euler in radians. Omit for random per mission. */
  y?: number
  /** Fixed Z-axis Euler in radians. Omit for random per mission. */
  z?: number
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
   * Optional path to a folder containing a triplet of tileable surface
   * textures: `color.webp`, `normal.webp`, `roughness.webp`. The color sample
   * is desaturated and used as a brightness modulator over the painted
   * vertex colors (never tints, never blows out). The normal and roughness
   * maps drive PBR relief and spec variation. Triplanar-sampled in object
   * space because asteroid GLBs ship with degenerate UVs.
   *
   * @example "/textures/asteroids/default"
   */
  surfaceTextures?: string
  /**
   * When `true`, applies {@link surfaceTextures} via the GLB's authored
   * UV coordinates instead of triplanar tiling. Use for matched
   * model+texture packs (e.g. a paid asteroid model that ships with
   * uniquely-painted textures meant to land at specific spots on the
   * mesh). Implies no vertex-color paint and no triplanar — the artist's
   * authored look passes through directly. Triplanar-only fields
   * (`surfaceTextureRepeat`, `surfaceModulator*`) are ignored when this is
   * set.
   */
  surfaceUseEmbeddedUVs?: boolean
  /**
   * Optional detail-normal folder used only in UV mode. Adds high-frequency
   * triplanar bump grain on top of the artist's UV macro so FPS-range
   * close-ups don't read as low-resolution. Only `normal.webp` is consumed
   * from this folder; color/roughness stay UV-mapped.
   */
  surfaceDetailFolder?: string
  /** Triplanar repeat for {@link surfaceDetailFolder}. Defaults to 80. */
  surfaceDetailRepeat?: number
  /** Detail-normal blend strength, 0..1. Defaults to 0.6. */
  surfaceDetailNormalStrength?: number
  /**
   * Triplanar repeat factor for {@link surfaceTextures} — cycles per
   * object-space unit. Higher = finer grain. GLBs are unit-scale in their
   * own space, so a value around 60–100 reads well at FPS range while
   * mipmapping calmly at lander altitude. Defaults to 80.
   */
  surfaceTextureRepeat?: number
  /**
   * Strength of the color modulator overlay, 0..1. `0` = vertex colors
   * untouched. `1` = full multiply-overlay; bright pixels of the texture
   * brighten the vertex color, dark pixels dim it. Defaults to 0.45.
   */
  surfaceModulatorStrength?: number
  /**
   * Fraction of the modulator sample's chroma that bleeds through, 0..1.
   * `0` (default) desaturates the texture to grayscale before overlay so
   * the JSON `baseColor` controls the hue. `1` lets the texture's RGB tint
   * the surface — useful when you WANT the texture's hue (icy green, lava
   * red, sandy ochre).
   */
  surfaceModulatorColorBlend?: number
  /**
   * Optional ambient-occlusion blend strength, 0..1. The folder may include
   * an `ao.webp` (grayscale baked occlusion) — when present and this value
   * is greater than 0, dark pixels of the AO sample darken the diffuse to
   * give "free" crevice shadows. Missing `ao.webp` is silently treated as
   * fully white (no-op). Defaults to 1.
   */
  surfaceAOStrength?: number
  /**
   * Optional `emission.webp` strength multiplier. The folder may include an
   * emission map (e.g. lava cracks for volcanic biomes). When present and
   * this value is greater than 0, emission is added on top of the lit
   * color per-pixel — only the bright pixels of the emission map glow.
   * Defaults to 1.
   */
  surfaceEmissionStrength?: number
}

/**
 * Visual properties for the asteroid surface. Drives the runtime paint
 * gradient and atmosphere context. Material PBR (metalness/roughness/etc.)
 * is now embedded in the GLB or supplied by the surface texture pack —
 * not by JSON — so those fields no longer live here.
 */
export interface VisualProperties {
  /**
   * Overall surface reflectivity, used by the atmosphere context for sky
   * tint and dust scatter. Bennu is 0.044 (very dark), icy XG7 is 0.67
   * (bright).
   */
  albedo: number
  /**
   * Primary surface color as `[R, G, B]` normalized 0–1. Drives the
   * vertex-color paint gradient (modulator mode) or the per-pixel tint
   * multiplier (UV mode).
   */
  baseColor: [number, number, number]
  /**
   * Optional multiplier on {@link baseColor} at the darkest vertex of the
   * surface paint gradient. Defaults to 0.55 (rocky / asteroid-typical).
   * Bump toward 1.0 for uniformly-bright bodies like ice or fresh snow.
   * Ignored in UV mode.
   */
  valleyTone?: number
  /**
   * Optional multiplier on {@link baseColor} at the brightest vertex.
   * Defaults to 1.25. Ignored in UV mode.
   */
  peakTone?: number
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
  /**
   * Real-world mean diameter in kilometres as published by the IAU / NASA
   * small-body database. This is the astronomical figure and is intentionally
   * distinct from `shape.dimensions`, which encodes the in-game gameplay
   * geometry (typically scaled down ~10× relative to reality for the larger
   * bodies). Used for UI display — e.g. the Jovian Prospectus asset card.
   *
   * @example 230   // 624 Hektor
   * @example 0.33  // 25143 Itokawa (330 m)
   */
  meanDiameterKm: number
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
