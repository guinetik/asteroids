# Asteroid Data Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement data-driven asteroid composition model with 5 real/plausible asteroids defined as JSON, backed by typed interfaces and a mineral visual lookup.

**Architecture:** Interfaces in `src/lib/asteroids/types.ts`, JSON data in `src/data/asteroids/`, catalog loader in `src/lib/asteroids/catalog.ts`, mineral visual lookup in `src/lib/asteroids/minerals.ts`. All pure TypeScript, no framework deps. TDD.

**Tech Stack:** TypeScript, Vitest, Vite static JSON imports.

---

### File Map

- Create: `src/lib/asteroids/types.ts` — all interfaces
- Create: `src/lib/asteroids/minerals.ts` — mineral visual lookup
- Create: `src/lib/asteroids/catalog.ts` — loads JSON, validates, exports catalog
- Create: `src/data/asteroids/bennu.json`
- Create: `src/data/asteroids/itokawa.json`
- Create: `src/data/asteroids/psyche.json`
- Create: `src/data/asteroids/2019-xg7.json`
- Create: `src/data/asteroids/2021-kr3.json`
- Create: `src/lib/asteroids/__tests__/minerals.spec.ts`
- Create: `src/lib/asteroids/__tests__/catalog.spec.ts`

---

### Task 1: Types

**Files:**
- Create: `src/lib/asteroids/types.ts`

- [ ] **Step 1: Create types file with all interfaces**

```ts
export interface MineralEntry {
  name: string
  formula?: string
  percentage: number
}

export interface AsteroidShape {
  dimensions: [number, number, number]
  elongation: number
  lobeCount: number
  irregularity: number
}

export interface SurfaceFeatures {
  craterDensity: number
  craterMaxScale: number
  boulderDensity: number
  ridgeFrequency: number
  roughness: number
  dustCoverage: number
}

export interface VisualProperties {
  albedo: number
  baseColor: [number, number, number]
  accentColor: [number, number, number]
  emissive: boolean
  emissiveColor?: [number, number, number]
  emissiveIntensity?: number
  metalness: number
  roughnessMap: number
}

export interface PhysicalProperties {
  mass: number
  density: number
  surfaceGravity: number
  rotationPeriod: number
  surfaceTemperature: number
}

export interface AsteroidDefinition {
  id: string
  name: string
  designation: string
  type: string
  biome: string
  description: string
  composition: MineralEntry[]
  shape: AsteroidShape
  surface: SurfaceFeatures
  visual: VisualProperties
  physical: PhysicalProperties
}

export interface MineralVisual {
  color: [number, number, number]
  metalness: number
  roughness: number
  emissive: boolean
}
```

- [ ] **Step 2: Verify it compiles**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/asteroids/types.ts
git commit -m "feat(asteroids): add data model interfaces"
```

---

### Task 2: Mineral Visual Lookup — Tests First

**Files:**
- Create: `src/lib/asteroids/__tests__/minerals.spec.ts`
- Create: `src/lib/asteroids/minerals.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { MINERAL_VISUALS } from '../minerals'

describe('MINERAL_VISUALS', () => {
  it('has valid visual properties for all minerals', () => {
    for (const [name, visual] of Object.entries(MINERAL_VISUALS)) {
      expect(visual.color).toHaveLength(3)
      for (const channel of visual.color) {
        expect(channel, `${name} color channel`).toBeGreaterThanOrEqual(0)
        expect(channel, `${name} color channel`).toBeLessThanOrEqual(1)
      }
      expect(visual.metalness, `${name} metalness`).toBeGreaterThanOrEqual(0)
      expect(visual.metalness, `${name} metalness`).toBeLessThanOrEqual(1)
      expect(visual.roughness, `${name} roughness`).toBeGreaterThanOrEqual(0)
      expect(visual.roughness, `${name} roughness`).toBeLessThanOrEqual(1)
      expect(typeof visual.emissive, `${name} emissive`).toBe('boolean')
    }
  })

  it('Iron-Nickel Alloy has high metalness', () => {
    const ironNickel = MINERAL_VISUALS['Iron-Nickel Alloy']
    expect(ironNickel).toBeDefined()
    expect(ironNickel!.metalness).toBeGreaterThan(0.7)
  })

  it('Water Ice has zero metalness', () => {
    const waterIce = MINERAL_VISUALS['Water Ice']
    expect(waterIce).toBeDefined()
    expect(waterIce!.metalness).toBe(0)
  })

  it('Basaltic Lava is emissive', () => {
    const lava = MINERAL_VISUALS['Basaltic Lava']
    expect(lava).toBeDefined()
    expect(lava!.emissive).toBe(true)
  })

  it('non-emissive minerals have emissive === false', () => {
    const nonEmissive = Object.entries(MINERAL_VISUALS).filter(
      ([name]) => name !== 'Basaltic Lava',
    )
    for (const [name, visual] of nonEmissive) {
      expect(visual.emissive, `${name} should not be emissive`).toBe(false)
    }
  })

  it('contains all 20 required minerals', () => {
    const requiredMinerals = [
      'Hydrated Silicates',
      'Magnetite',
      'Iron Sulfides',
      'Carbonates',
      'Organic Compounds',
      'Olivine',
      'Pyroxene',
      'Plagioclase Feldspar',
      'Iron-Nickel Alloy',
      'Troilite',
      'Enstatite',
      'Water Ice',
      'Carbon Dioxide Ice',
      'Ammonia Hydrate',
      'Silicate Dust',
      'Sodium Chloride',
      'Basaltic Lava',
      'Sulfur Deposits',
      'Iron Oxide',
      'Volcanic Glass',
    ]
    for (const mineral of requiredMinerals) {
      expect(MINERAL_VISUALS[mineral], `missing mineral: ${mineral}`).toBeDefined()
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/asteroids/__tests__/minerals.spec.ts`
Expected: FAIL — cannot import `MINERAL_VISUALS`

- [ ] **Step 3: Implement mineral visual lookup**

```ts
import type { MineralVisual } from './types'

export const MINERAL_VISUALS: Record<string, MineralVisual> = {
  'Hydrated Silicates': {
    color: [0.25, 0.28, 0.22],
    metalness: 0.05,
    roughness: 0.9,
    emissive: false,
  },
  Magnetite: {
    color: [0.05, 0.05, 0.05],
    metalness: 0.4,
    roughness: 0.6,
    emissive: false,
  },
  'Iron Sulfides': {
    color: [0.45, 0.35, 0.15],
    metalness: 0.3,
    roughness: 0.7,
    emissive: false,
  },
  Carbonates: {
    color: [0.72, 0.68, 0.55],
    metalness: 0.05,
    roughness: 0.8,
    emissive: false,
  },
  'Organic Compounds': {
    color: [0.1, 0.07, 0.04],
    metalness: 0.0,
    roughness: 0.95,
    emissive: false,
  },
  Olivine: {
    color: [0.35, 0.42, 0.18],
    metalness: 0.05,
    roughness: 0.7,
    emissive: false,
  },
  Pyroxene: {
    color: [0.3, 0.25, 0.2],
    metalness: 0.1,
    roughness: 0.75,
    emissive: false,
  },
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
  Troilite: {
    color: [0.5, 0.38, 0.22],
    metalness: 0.35,
    roughness: 0.5,
    emissive: false,
  },
  Enstatite: {
    color: [0.6, 0.6, 0.58],
    metalness: 0.1,
    roughness: 0.6,
    emissive: false,
  },
  'Water Ice': {
    color: [0.85, 0.92, 0.98],
    metalness: 0.0,
    roughness: 0.15,
    emissive: false,
  },
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
  'Silicate Dust': {
    color: [0.55, 0.5, 0.42],
    metalness: 0.05,
    roughness: 0.85,
    emissive: false,
  },
  'Sodium Chloride': {
    color: [0.9, 0.88, 0.82],
    metalness: 0.0,
    roughness: 0.4,
    emissive: false,
  },
  'Basaltic Lava': {
    color: [0.35, 0.08, 0.02],
    metalness: 0.1,
    roughness: 0.8,
    emissive: true,
  },
  'Sulfur Deposits': {
    color: [0.85, 0.82, 0.1],
    metalness: 0.0,
    roughness: 0.6,
    emissive: false,
  },
  'Iron Oxide': {
    color: [0.55, 0.15, 0.05],
    metalness: 0.2,
    roughness: 0.75,
    emissive: false,
  },
  'Volcanic Glass': {
    color: [0.08, 0.07, 0.1],
    metalness: 0.15,
    roughness: 0.2,
    emissive: false,
  },
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/asteroids/__tests__/minerals.spec.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/asteroids/minerals.ts src/lib/asteroids/__tests__/minerals.spec.ts
git commit -m "feat(asteroids): add mineral visual lookup with tests"
```

---

### Task 3: JSON Data Files — Bennu, Itokawa, Psyche

**Files:**
- Create: `src/data/asteroids/bennu.json`
- Create: `src/data/asteroids/itokawa.json`
- Create: `src/data/asteroids/psyche.json`

- [ ] **Step 1: Create bennu.json**

```json
{
  "id": "bennu",
  "name": "Bennu",
  "designation": "101955 Bennu",
  "type": "Carbonaceous (C-type)",
  "biome": "rocky",
  "description": "A near-Earth carbonaceous asteroid studied by NASA's OSIRIS-REx mission. Its surface is an ancient rubble pile covered in boulders, with minerals dating back to the early solar system.",
  "composition": [
    { "name": "Hydrated Silicates", "formula": "Mg3Si2O5(OH)4", "percentage": 42 },
    { "name": "Magnetite", "formula": "Fe3O4", "percentage": 18 },
    { "name": "Organic Compounds", "percentage": 12 },
    { "name": "Iron Sulfides", "formula": "FeS", "percentage": 10 },
    { "name": "Carbonates", "formula": "CaCO3", "percentage": 10 },
    { "name": "Olivine", "formula": "(Mg,Fe)2SiO4", "percentage": 8 }
  ],
  "shape": {
    "dimensions": [262.5, 262.5, 249.5],
    "elongation": 1.05,
    "lobeCount": 1,
    "irregularity": 0.4
  },
  "surface": {
    "craterDensity": 0.7,
    "craterMaxScale": 0.3,
    "boulderDensity": 0.85,
    "ridgeFrequency": 0.3,
    "roughness": 0.8,
    "dustCoverage": 0.2
  },
  "visual": {
    "albedo": 0.044,
    "baseColor": [0.15, 0.13, 0.1],
    "accentColor": [0.2, 0.18, 0.12],
    "emissive": false,
    "metalness": 0.15,
    "roughnessMap": 0.9
  },
  "physical": {
    "mass": 7.329e10,
    "density": 1190,
    "surfaceGravity": 6e-6,
    "rotationPeriod": 4.3,
    "surfaceTemperature": 250
  }
}
```

- [ ] **Step 2: Create itokawa.json**

```json
{
  "id": "itokawa",
  "name": "Itokawa",
  "designation": "25143 Itokawa",
  "type": "Siliceous (S-type)",
  "biome": "sandy",
  "description": "A peanut-shaped near-Earth asteroid visited by JAXA's Hayabusa mission. Its surface features two distinct terrains: the smooth Muses Sea lowland and rugged boulder-strewn highlands.",
  "composition": [
    { "name": "Olivine", "formula": "(Mg,Fe)2SiO4", "percentage": 38 },
    { "name": "Pyroxene", "formula": "(Mg,Fe)SiO3", "percentage": 30 },
    { "name": "Plagioclase Feldspar", "formula": "(Na,Ca)(Al,Si)4O8", "percentage": 14 },
    { "name": "Iron Sulfides", "formula": "FeS", "percentage": 8 },
    { "name": "Iron-Nickel Alloy", "formula": "Fe-Ni", "percentage": 6 },
    { "name": "Magnetite", "formula": "Fe3O4", "percentage": 4 }
  ],
  "shape": {
    "dimensions": [535, 209, 294],
    "elongation": 2.56,
    "lobeCount": 2,
    "irregularity": 0.75
  },
  "surface": {
    "craterDensity": 0.2,
    "craterMaxScale": 0.15,
    "boulderDensity": 0.5,
    "ridgeFrequency": 0.2,
    "roughness": 0.5,
    "dustCoverage": 0.3
  },
  "visual": {
    "albedo": 0.53,
    "baseColor": [0.5, 0.48, 0.38],
    "accentColor": [0.6, 0.55, 0.4],
    "emissive": false,
    "metalness": 0.1,
    "roughnessMap": 0.65
  },
  "physical": {
    "mass": 3.51e10,
    "density": 1950,
    "surfaceGravity": 1e-5,
    "rotationPeriod": 12.13,
    "surfaceTemperature": 206
  }
}
```

- [ ] **Step 3: Create psyche.json**

```json
{
  "id": "psyche",
  "name": "Psyche",
  "designation": "16 Psyche",
  "type": "Metallic (M-type)",
  "biome": "metallic",
  "description": "One of the most massive objects in the asteroid belt, believed to be the exposed iron-nickel core of a protoplanet. Its metallic surface gleams with a silvery luster scarred by ancient impacts.",
  "composition": [
    { "name": "Iron-Nickel Alloy", "formula": "Fe-Ni", "percentage": 55 },
    { "name": "Enstatite", "formula": "MgSiO3", "percentage": 15 },
    { "name": "Troilite", "formula": "FeS", "percentage": 12 },
    { "name": "Olivine", "formula": "(Mg,Fe)2SiO4", "percentage": 8 },
    { "name": "Pyroxene", "formula": "(Mg,Fe)SiO3", "percentage": 6 },
    { "name": "Magnetite", "formula": "Fe3O4", "percentage": 4 }
  ],
  "shape": {
    "dimensions": [279000, 232000, 189000],
    "elongation": 1.48,
    "lobeCount": 1,
    "irregularity": 0.3
  },
  "surface": {
    "craterDensity": 0.75,
    "craterMaxScale": 0.25,
    "boulderDensity": 0.15,
    "ridgeFrequency": 0.6,
    "roughness": 0.35,
    "dustCoverage": 0.1
  },
  "visual": {
    "albedo": 0.15,
    "baseColor": [0.6, 0.6, 0.62],
    "accentColor": [0.5, 0.4, 0.25],
    "emissive": false,
    "metalness": 0.75,
    "roughnessMap": 0.35
  },
  "physical": {
    "mass": 2.29e22,
    "density": 3400,
    "surfaceGravity": 0.14,
    "rotationPeriod": 4.196,
    "surfaceTemperature": 256
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/data/asteroids/bennu.json src/data/asteroids/itokawa.json src/data/asteroids/psyche.json
git commit -m "feat(asteroids): add Bennu, Itokawa, Psyche data files"
```

---

### Task 4: JSON Data Files — 2019 XG₇ and 2021 KR₃

**Files:**
- Create: `src/data/asteroids/2019-xg7.json`
- Create: `src/data/asteroids/2021-kr3.json`

- [ ] **Step 1: Create 2019-xg7.json**

```json
{
  "id": "xg7",
  "name": "2019 XG\u2087",
  "designation": "2019 XG\u2087",
  "type": "Icy (cometary)",
  "biome": "icy",
  "description": "An anomalous icy body in a highly eccentric orbit, likely a captured cometary fragment. Its surface is a fractured shell of water ice laced with salt deposits and organic residue, resembling a miniature Europa.",
  "composition": [
    { "name": "Water Ice", "formula": "H2O", "percentage": 45 },
    { "name": "Carbon Dioxide Ice", "formula": "CO2", "percentage": 15 },
    { "name": "Silicate Dust", "percentage": 15 },
    { "name": "Ammonia Hydrate", "formula": "NH3·H2O", "percentage": 10 },
    { "name": "Sodium Chloride", "formula": "NaCl", "percentage": 8 },
    { "name": "Organic Compounds", "percentage": 7 }
  ],
  "shape": {
    "dimensions": [180, 170, 120],
    "elongation": 1.5,
    "lobeCount": 1,
    "irregularity": 0.25
  },
  "surface": {
    "craterDensity": 0.15,
    "craterMaxScale": 0.1,
    "boulderDensity": 0.0,
    "ridgeFrequency": 0.8,
    "roughness": 0.25,
    "dustCoverage": 0.85
  },
  "visual": {
    "albedo": 0.67,
    "baseColor": [0.8, 0.88, 0.95],
    "accentColor": [0.65, 0.6, 0.5],
    "emissive": false,
    "metalness": 0.0,
    "roughnessMap": 0.2
  },
  "physical": {
    "mass": 2.5e9,
    "density": 1100,
    "surfaceGravity": 3e-6,
    "rotationPeriod": 8.5,
    "surfaceTemperature": 110
  }
}
```

- [ ] **Step 2: Create 2021-kr3.json**

```json
{
  "id": "kr3",
  "name": "2021 KR\u2083",
  "designation": "2021 KR\u2083",
  "type": "Volcanic (silicate-iron)",
  "biome": "volcanic",
  "description": "A geologically active body with ongoing volcanic outgassing, likely heated by tidal interactions or residual radioactive decay. Its surface is a hellscape of basaltic lava flows, sulfur deposits, and glowing calderas.",
  "composition": [
    { "name": "Basaltic Lava", "percentage": 35 },
    { "name": "Sulfur Deposits", "formula": "S", "percentage": 20 },
    { "name": "Iron Oxide", "formula": "Fe2O3", "percentage": 18 },
    { "name": "Pyroxene", "formula": "(Mg,Fe)SiO3", "percentage": 12 },
    { "name": "Volcanic Glass", "percentage": 10 },
    { "name": "Magnetite", "formula": "Fe3O4", "percentage": 5 }
  ],
  "shape": {
    "dimensions": [310, 290, 275],
    "elongation": 1.13,
    "lobeCount": 1,
    "irregularity": 0.45
  },
  "surface": {
    "craterDensity": 0.45,
    "craterMaxScale": 0.35,
    "boulderDensity": 0.1,
    "ridgeFrequency": 0.85,
    "roughness": 0.8,
    "dustCoverage": 0.1
  },
  "visual": {
    "albedo": 0.09,
    "baseColor": [0.12, 0.04, 0.02],
    "accentColor": [0.9, 0.6, 0.05],
    "emissive": true,
    "emissiveColor": [0.95, 0.3, 0.02],
    "emissiveIntensity": 0.6,
    "metalness": 0.12,
    "roughnessMap": 0.85
  },
  "physical": {
    "mass": 6.1e10,
    "density": 2800,
    "surfaceGravity": 8e-6,
    "rotationPeriod": 6.2,
    "surfaceTemperature": 450
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/data/asteroids/2019-xg7.json src/data/asteroids/2021-kr3.json
git commit -m "feat(asteroids): add 2019 XG7 (icy) and 2021 KR3 (volcanic) data files"
```

---

### Task 5: Catalog Loader — Tests First

**Files:**
- Create: `src/lib/asteroids/__tests__/catalog.spec.ts`
- Create: `src/lib/asteroids/catalog.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { ASTEROID_CATALOG, getAsteroidById } from '../catalog'
import { MINERAL_VISUALS } from '../minerals'

describe('ASTEROID_CATALOG', () => {
  it('contains exactly 5 asteroids', () => {
    expect(ASTEROID_CATALOG).toHaveLength(5)
  })

  it('has unique IDs', () => {
    const ids = ASTEROID_CATALOG.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each([
    ['bennu'],
    ['itokawa'],
    ['psyche'],
    ['xg7'],
    ['kr3'],
  ])('asteroid "%s" has all required string fields', (id) => {
    const asteroid = ASTEROID_CATALOG.find((a) => a.id === id)
    expect(asteroid).toBeDefined()
    expect(asteroid!.name).toBeTruthy()
    expect(asteroid!.designation).toBeTruthy()
    expect(asteroid!.type).toBeTruthy()
    expect(asteroid!.biome).toBeTruthy()
    expect(asteroid!.description).toBeTruthy()
  })

  it.each([
    ['bennu'],
    ['itokawa'],
    ['psyche'],
    ['xg7'],
    ['kr3'],
  ])('asteroid "%s" composition sums to 100', (id) => {
    const asteroid = ASTEROID_CATALOG.find((a) => a.id === id)!
    const sum = asteroid.composition.reduce((acc, m) => acc + m.percentage, 0)
    expect(sum).toBe(100)
  })

  it.each([
    ['bennu'],
    ['itokawa'],
    ['psyche'],
    ['xg7'],
    ['kr3'],
  ])('asteroid "%s" has valid shape ranges', (id) => {
    const s = ASTEROID_CATALOG.find((a) => a.id === id)!.shape
    expect(s.elongation).toBeGreaterThanOrEqual(1)
    expect(s.lobeCount).toBeGreaterThanOrEqual(1)
    expect(s.irregularity).toBeGreaterThanOrEqual(0)
    expect(s.irregularity).toBeLessThanOrEqual(1)
    for (const d of s.dimensions) {
      expect(d).toBeGreaterThan(0)
    }
  })

  it.each([
    ['bennu'],
    ['itokawa'],
    ['psyche'],
    ['xg7'],
    ['kr3'],
  ])('asteroid "%s" has valid surface ranges', (id) => {
    const s = ASTEROID_CATALOG.find((a) => a.id === id)!.surface
    const fields = [
      s.craterDensity,
      s.craterMaxScale,
      s.boulderDensity,
      s.ridgeFrequency,
      s.roughness,
      s.dustCoverage,
    ]
    for (const f of fields) {
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThanOrEqual(1)
    }
  })

  it.each([
    ['bennu'],
    ['itokawa'],
    ['psyche'],
    ['xg7'],
    ['kr3'],
  ])('asteroid "%s" has valid visual ranges', (id) => {
    const v = ASTEROID_CATALOG.find((a) => a.id === id)!.visual
    expect(v.albedo).toBeGreaterThanOrEqual(0)
    expect(v.albedo).toBeLessThanOrEqual(1)
    expect(v.metalness).toBeGreaterThanOrEqual(0)
    expect(v.metalness).toBeLessThanOrEqual(1)
    expect(v.roughnessMap).toBeGreaterThanOrEqual(0)
    expect(v.roughnessMap).toBeLessThanOrEqual(1)
    for (const ch of v.baseColor) {
      expect(ch).toBeGreaterThanOrEqual(0)
      expect(ch).toBeLessThanOrEqual(1)
    }
    for (const ch of v.accentColor) {
      expect(ch).toBeGreaterThanOrEqual(0)
      expect(ch).toBeLessThanOrEqual(1)
    }
    if (v.emissive) {
      expect(v.emissiveColor).toBeDefined()
      expect(v.emissiveIntensity).toBeDefined()
      for (const ch of v.emissiveColor!) {
        expect(ch).toBeGreaterThanOrEqual(0)
        expect(ch).toBeLessThanOrEqual(1)
      }
    }
  })

  it.each([
    ['bennu'],
    ['itokawa'],
    ['psyche'],
    ['xg7'],
    ['kr3'],
  ])('asteroid "%s" has valid physical ranges', (id) => {
    const p = ASTEROID_CATALOG.find((a) => a.id === id)!.physical
    expect(p.mass).toBeGreaterThan(0)
    expect(p.density).toBeGreaterThan(0)
    expect(p.surfaceGravity).toBeGreaterThan(0)
    expect(p.rotationPeriod).toBeGreaterThan(0)
    expect(p.surfaceTemperature).toBeGreaterThan(0)
  })

  it.each([
    ['bennu'],
    ['itokawa'],
    ['psyche'],
    ['xg7'],
    ['kr3'],
  ])('asteroid "%s" minerals all exist in MINERAL_VISUALS', (id) => {
    const asteroid = ASTEROID_CATALOG.find((a) => a.id === id)!
    for (const mineral of asteroid.composition) {
      expect(
        MINERAL_VISUALS[mineral.name],
        `mineral "${mineral.name}" missing from MINERAL_VISUALS`,
      ).toBeDefined()
    }
  })
})

describe('getAsteroidById', () => {
  it('returns the correct asteroid for a known ID', () => {
    const bennu = getAsteroidById('bennu')
    expect(bennu).toBeDefined()
    expect(bennu!.name).toBe('Bennu')
  })

  it('returns undefined for an unknown ID', () => {
    expect(getAsteroidById('nonexistent')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/asteroids/__tests__/catalog.spec.ts`
Expected: FAIL — cannot import from `../catalog`

- [ ] **Step 3: Implement catalog loader**

```ts
import type { AsteroidDefinition } from './types'

import bennuData from '@/data/asteroids/bennu.json'
import itokawaData from '@/data/asteroids/itokawa.json'
import psycheData from '@/data/asteroids/psyche.json'
import xg7Data from '@/data/asteroids/2019-xg7.json'
import kr3Data from '@/data/asteroids/2021-kr3.json'

const COMPOSITION_SUM = 100

function validateAsteroid(data: AsteroidDefinition): AsteroidDefinition {
  const sum = data.composition.reduce((acc, m) => acc + m.percentage, 0)
  if (sum !== COMPOSITION_SUM) {
    throw new Error(
      `Asteroid "${data.id}" composition sums to ${sum}, expected ${COMPOSITION_SUM}`,
    )
  }
  return data
}

export const ASTEROID_CATALOG: AsteroidDefinition[] = [
  bennuData,
  itokawaData,
  psycheData,
  xg7Data,
  kr3Data,
].map((data) => validateAsteroid(data as unknown as AsteroidDefinition))

export function getAsteroidById(id: string): AsteroidDefinition | undefined {
  return ASTEROID_CATALOG.find((a) => a.id === id)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/asteroids/__tests__/catalog.spec.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/asteroids/catalog.ts src/lib/asteroids/__tests__/catalog.spec.ts
git commit -m "feat(asteroids): add catalog loader with validation and tests"
```

---

### Task 6: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `bun test:unit --run`
Expected: All tests PASS (portal tests + minerals tests + catalog tests + App.spec.ts)

- [ ] **Step 2: Run lint**

Run: `bun run lint:oxlint && bun run lint:eslint`
Expected: PASS (or auto-fixed)

- [ ] **Step 3: Run build**

Run: `bun run build`
Expected: PASS

- [ ] **Step 4: Commit any lint fixes**

If lint auto-fixed anything:
```bash
git add src/lib/asteroids/ src/data/asteroids/
git commit -m "style(asteroids): apply lint fixes"
```
