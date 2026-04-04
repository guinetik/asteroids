/**
 * Mineral visual property lookup.
 *
 * Maps real mineral names to PBR-friendly visual properties (color,
 * metalness, roughness, emissive). The procedural generator blends
 * these weighted by composition percentages to produce final surface
 * materials.
 *
 * @author guinetik
 * @date 2026-04-03
 * @spec docs/superpowers/specs/2026-04-03-asteroid-data-model-design.md
 */
import type { MineralVisual } from './types'

/** Visual properties for all known minerals across the 5 asteroid biomes. */
export const MINERAL_VISUALS: Record<string, MineralVisual> = {
  'Hydrated Silicates': {
    color: [0.25, 0.28, 0.22],
    metalness: 0.05,
    roughness: 0.9,
    emissive: false,
  },
  Magnetite: { color: [0.05, 0.05, 0.05], metalness: 0.4, roughness: 0.6, emissive: false },
  'Iron Sulfides': { color: [0.45, 0.35, 0.15], metalness: 0.3, roughness: 0.7, emissive: false },
  Carbonates: { color: [0.72, 0.68, 0.55], metalness: 0.05, roughness: 0.8, emissive: false },
  'Organic Compounds': {
    color: [0.1, 0.07, 0.04],
    metalness: 0.0,
    roughness: 0.95,
    emissive: false,
  },
  Olivine: { color: [0.35, 0.42, 0.18], metalness: 0.05, roughness: 0.7, emissive: false },
  Pyroxene: { color: [0.3, 0.25, 0.2], metalness: 0.1, roughness: 0.75, emissive: false },
  'Plagioclase Feldspar': {
    color: [0.7, 0.7, 0.68],
    metalness: 0.05,
    roughness: 0.65,
    emissive: false,
  },
  'Iron-Nickel Alloy': {
    color: [0.77, 0.78, 0.8],
    metalness: 0.85,
    roughness: 0.3,
    emissive: false,
  },
  Troilite: { color: [0.5, 0.38, 0.22], metalness: 0.35, roughness: 0.5, emissive: false },
  Enstatite: { color: [0.6, 0.6, 0.58], metalness: 0.1, roughness: 0.6, emissive: false },
  'Water Ice': { color: [0.85, 0.92, 0.98], metalness: 0.0, roughness: 0.15, emissive: false },
  'Carbon Dioxide Ice': {
    color: [0.95, 0.95, 0.97],
    metalness: 0.0,
    roughness: 0.2,
    emissive: false,
  },
  'Ammonia Hydrate': {
    color: [0.75, 0.82, 0.92],
    metalness: 0.0,
    roughness: 0.25,
    emissive: false,
  },
  'Silicate Dust': { color: [0.55, 0.5, 0.42], metalness: 0.05, roughness: 0.85, emissive: false },
  'Sodium Chloride': { color: [0.9, 0.88, 0.82], metalness: 0.0, roughness: 0.4, emissive: false },
  'Basaltic Lava': { color: [0.35, 0.08, 0.02], metalness: 0.1, roughness: 0.8, emissive: true },
  'Sulfur Deposits': { color: [0.85, 0.82, 0.1], metalness: 0.0, roughness: 0.6, emissive: false },
  'Iron Oxide': { color: [0.55, 0.15, 0.05], metalness: 0.2, roughness: 0.75, emissive: false },
  'Volcanic Glass': { color: [0.08, 0.07, 0.1], metalness: 0.15, roughness: 0.2, emissive: false },
}
