# Asteroid Data Model — Design Spec

**Date:** 2026-04-03
**Status:** Approved

## Overview

A data-driven asteroid composition model using real NASA mineralogy data. Five real/plausible asteroids defined as JSON files, imported statically by Vite (bundled, zero async overhead). The data serves two consumers: the Vue UI (mission briefing "spectral analysis" readouts) and the procedural generator (spec 2: mesh + material generation).

All code lives in `src/lib/asteroids/` (pure TypeScript, no framework deps). Asteroid definitions live in `src/data/asteroids/` as JSON files.

## The 5 Asteroids

| # | ID | Name | Designation | Type | Biome |
|---|-----|------|-------------|------|-------|
| 1 | `bennu` | Bennu | 101955 Bennu | Carbonaceous (C-type) | Rocky |
| 2 | `itokawa` | Itokawa | 25143 Itokawa | Siliceous (S-type) | Sandy/Rocky |
| 3 | `psyche` | Psyche | 16 Psyche | Metallic (M-type) | Metallic |
| 4 | `xg7` | 2019 XG₇ | 2019 XG₇ | Icy (cometary) | Icy |
| 5 | `kr3` | 2021 KR₃ | 2021 KR₃ | Volcanic (silicate-iron) | Volcanic |

Asteroids 1-3 use real NASA data. Asteroids 4-5 are fictional with designations following IAU provisional naming convention, compositions based on real planetary geology (Europa-like ice, Io-like volcanism).

## Data Model — Interfaces

All interfaces in `src/lib/asteroids/types.ts`.

### MineralEntry

```ts
interface MineralEntry {
  name: string           // e.g. "Hydrated Silicates"
  formula?: string       // e.g. "Mg3Si2O5(OH)4"
  percentage: number     // 0-100, all entries must sum to 100
}
```

### AsteroidShape

```ts
interface AsteroidShape {
  dimensions: [number, number, number]  // semi-axes in meters [x, y, z]
  elongation: number                     // ratio of longest to shortest axis (>= 1)
  lobeCount: number                      // 1 = potato, 2 = peanut (Itokawa)
  irregularity: number                   // 0-1, deviation from smooth ellipsoid
}
```

### SurfaceFeatures

```ts
interface SurfaceFeatures {
  craterDensity: number    // 0-1
  craterMaxScale: number   // largest crater as fraction of asteroid radius (0-1)
  boulderDensity: number   // 0-1
  ridgeFrequency: number   // 0-1
  roughness: number        // 0-1, micro-surface roughness
  dustCoverage: number     // 0-1
}
```

### VisualProperties

```ts
interface VisualProperties {
  albedo: number              // 0-1, overall surface reflectivity
  baseColor: [number, number, number]  // RGB normalized 0-1
  accentColor: [number, number, number] // RGB normalized 0-1
  emissive: boolean           // true for volcanic
  emissiveColor?: [number, number, number] // RGB normalized, required if emissive
  emissiveIntensity?: number  // 0-1, required if emissive
  metalness: number           // 0-1, PBR metalness
  roughnessMap: number        // 0-1, PBR roughness
}
```

### PhysicalProperties

```ts
interface PhysicalProperties {
  mass: number              // kg
  density: number           // kg/m³
  surfaceGravity: number    // m/s²
  rotationPeriod: number    // hours
  surfaceTemperature: number // Kelvin
}
```

### AsteroidDefinition (top-level)

```ts
interface AsteroidDefinition {
  id: string                        // unique key, e.g. "bennu"
  name: string                      // display name, e.g. "Bennu"
  designation: string               // official designation, e.g. "101955 Bennu"
  type: string                      // classification, e.g. "Carbonaceous (C-type)"
  biome: string                     // biome tag, e.g. "rocky"
  description: string               // flavor text for mission briefing
  composition: MineralEntry[]       // must sum to 100
  shape: AsteroidShape
  surface: SurfaceFeatures
  visual: VisualProperties
  physical: PhysicalProperties
}
```

## Mineral Visual Lookup

`src/lib/asteroids/minerals.ts` — maps mineral names to visual properties for the procedural generator (spec 2).

```ts
interface MineralVisual {
  color: [number, number, number]    // RGB normalized 0-1
  metalness: number                   // 0-1
  roughness: number                   // 0-1
  emissive: boolean
}
```

The lookup is a `Record<string, MineralVisual>` keyed by mineral name. Every mineral referenced in any asteroid's `composition` array must have an entry.

### Known minerals and approximate visual properties

| Mineral | Color | Metalness | Roughness | Emissive |
|---------|-------|-----------|-----------|----------|
| Hydrated Silicates | dark gray-green | 0.05 | 0.9 | no |
| Magnetite | black | 0.4 | 0.6 | no |
| Iron Sulfides | dark gold-brown | 0.3 | 0.7 | no |
| Carbonates | light tan | 0.05 | 0.8 | no |
| Organic Compounds | very dark brown | 0.0 | 0.95 | no |
| Olivine | olive green | 0.05 | 0.7 | no |
| Pyroxene | dark gray-brown | 0.1 | 0.75 | no |
| Plagioclase Feldspar | light gray | 0.05 | 0.65 | no |
| Iron-Nickel Alloy | silver | 0.85 | 0.3 | no |
| Troilite | bronze-brown | 0.35 | 0.5 | no |
| Enstatite | pale gray | 0.1 | 0.6 | no |
| Water Ice | blue-white | 0.0 | 0.15 | no |
| Carbon Dioxide Ice | white | 0.0 | 0.2 | no |
| Ammonia Hydrate | pale blue | 0.0 | 0.25 | no |
| Silicate Dust | warm gray | 0.05 | 0.85 | no |
| Sodium Chloride | off-white | 0.0 | 0.4 | no |
| Basaltic Lava | dark red-orange | 0.1 | 0.8 | yes |
| Sulfur Deposits | bright yellow | 0.0 | 0.6 | no |
| Iron Oxide | rust red | 0.2 | 0.75 | no |
| Volcanic Glass | dark obsidian | 0.15 | 0.2 | no |

Exact RGB values will be defined in implementation. The table above establishes the mapping intent.

## File Layout

```
src/lib/asteroids/
  types.ts                — all interfaces (exported)
  catalog.ts              — imports JSON, validates, exports typed AsteroidDefinition[]
  minerals.ts             — mineral name → MineralVisual lookup

src/data/asteroids/
  bennu.json
  itokawa.json
  psyche.json
  2019-xg7.json
  2021-kr3.json

src/lib/asteroids/__tests__/
  catalog.spec.ts
  minerals.spec.ts
```

### catalog.ts behavior

- Imports all 5 JSON files via Vite static import: `import bennuData from '@/data/asteroids/bennu.json'`
- Exports `ASTEROID_CATALOG: AsteroidDefinition[]` — all 5 asteroids
- Exports `getAsteroidById(id: string): AsteroidDefinition | undefined`
- Validates at module load that composition percentages sum to 100 for each asteroid (throws if invalid)

## Asteroid Composition Data

Based on real NASA/JAXA mission data and spectral analysis.

### Bennu (101955 Bennu)

Source: OSIRIS-REx mission sample return, NASA spectral analysis.

- Hydrated Silicates: 42%
- Magnetite: 18%
- Iron Sulfides: 10%
- Carbonates: 10%
- Organic Compounds: 12%
- Olivine: 8%

Shape: roughly spherical (spinning top), dimensions ~262.5 × 262.5 × 249.5 m, 1 lobe, moderate irregularity.
Surface: heavily cratered, very boulder-dense, high roughness, low dust.
Visual: very low albedo (0.044), dark gray-brown.
Physical: mass 7.329 × 10¹⁰ kg, density 1190 kg/m³, surface gravity ~6 × 10⁻⁶ m/s², rotation 4.3 hours, ~250 K.

### Itokawa (25143 Itokawa)

Source: JAXA Hayabusa mission, sample return.

- Olivine: 38%
- Pyroxene: 30%
- Plagioclase Feldspar: 14%
- Iron Sulfides: 8%
- Iron-Nickel Alloy: 6%
- Magnetite: 4%

Shape: peanut/contact binary, dimensions ~535 × 209 × 294 m, 2 lobes, high elongation (~2.56), high irregularity.
Surface: dual terrain — smooth "Muses Sea" region + rough boulder highlands. Low crater density, moderate boulders, low dust coverage.
Visual: moderate albedo (0.53), light olive-gray.
Physical: mass 3.51 × 10¹⁰ kg, density 1950 kg/m³, surface gravity ~1 × 10⁻⁵ m/s², rotation 12.13 hours, ~206 K.

### Psyche (16 Psyche)

Source: NASA Psyche mission (en route), radar/spectral analysis.

- Iron-Nickel Alloy: 55%
- Enstatite: 15%
- Troilite: 12%
- Olivine: 8%
- Pyroxene: 6%
- Magnetite: 4%

Shape: roughly ellipsoidal, dimensions ~279 × 232 × 189 km (scaled down for gameplay), 1 lobe, low irregularity.
Surface: heavily cratered, low boulders, prominent ridges, low roughness (metal is smoother), low dust.
Visual: moderate albedo (0.15), silver-gray with bronze accents. High metalness.
Physical: mass 2.29 × 10²² kg, density 3400 kg/m³, surface gravity ~0.14 m/s², rotation 4.196 hours, ~256 K.

### 2019 XG₇ (fictional, icy)

Inspired by: Europa surface composition, cometary bodies.

- Water Ice: 45%
- Carbon Dioxide Ice: 15%
- Silicate Dust: 15%
- Ammonia Hydrate: 10%
- Sodium Chloride: 8%
- Organic Compounds: 7%

Shape: roughly oblate, dimensions ~180 × 170 × 120 m, 1 lobe, low irregularity.
Surface: low crater density, no boulders, prominent ridges (ice cracks), low roughness, high dust (frost).
Visual: high albedo (0.67), blue-white with pale tan accents. Zero metalness.
Physical: mass ~2.5 × 10⁹ kg, density 1100 kg/m³, surface gravity ~3 × 10⁻⁶ m/s², rotation 8.5 hours, ~110 K.

### 2021 KR₃ (fictional, volcanic)

Inspired by: Io surface geology, volcanic asteroids.

- Basaltic Lava: 35%
- Sulfur Deposits: 20%
- Iron Oxide: 18%
- Pyroxene: 12%
- Volcanic Glass: 10%
- Magnetite: 5%

Shape: roughly spherical, dimensions ~310 × 290 × 275 m, 1 lobe, moderate irregularity.
Surface: moderate craters (calderas), low boulders, high ridge frequency (lava channels), high roughness, low dust.
Visual: low albedo (0.09), dark red-black with bright yellow-orange accents. Emissive (lava glow), emissive color orange-red, intensity 0.6. Low metalness.
Physical: mass ~6.1 × 10¹⁰ kg, density 2800 kg/m³, surface gravity ~8 × 10⁻⁶ m/s², rotation 6.2 hours, ~450 K (volcanic heating).

## Testing Plan

All tests in `src/lib/asteroids/__tests__/`.

### catalog.spec.ts

- **All 5 asteroids load** — catalog has exactly 5 entries, each with a unique `id`.
- **Composition sums to 100** — for each asteroid, `composition.reduce((sum, m) => sum + m.percentage, 0)` equals 100.
- **Required fields present** — each asteroid has non-empty `id`, `name`, `designation`, `type`, `biome`, `description`.
- **Shape ranges valid** — `elongation >= 1`, `lobeCount >= 1`, `irregularity` in 0-1, all `dimensions > 0`.
- **Surface ranges valid** — all fields in 0-1.
- **Visual ranges valid** — `albedo` in 0-1, colors in 0-1 per channel, `metalness` in 0-1, `roughnessMap` in 0-1. If `emissive` is true, `emissiveColor` and `emissiveIntensity` must be present.
- **Physical ranges valid** — `mass > 0`, `density > 0`, `surfaceGravity > 0`, `rotationPeriod > 0`, `surfaceTemperature > 0`.
- **getAsteroidById** — returns correct asteroid for known ID, returns `undefined` for unknown ID.
- **Mineral coverage** — every mineral name in every composition has a matching entry in the mineral visual lookup.

### minerals.spec.ts

- **All minerals have valid visuals** — color channels in 0-1, metalness in 0-1, roughness in 0-1.
- **Known mineral spot checks** — "Iron-Nickel Alloy" has metalness > 0.7. "Water Ice" has metalness === 0. "Basaltic Lava" has emissive === true.
