# Planetarium Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the planets project's pure math, data model, and orbital mechanics into `src/lib/planets/` as the foundational layer for the game's map screen.

**Architecture:** Single JSON data file statically imported by Vite, converted from degrees to radians by a catalog module. Keplerian orbital mechanics and real-world telemetry as pure functions with zero framework dependencies. Follows the existing asteroids catalog pattern.

**Tech Stack:** TypeScript (strict mode), Vitest, Vite static JSON imports

**Spec:** `docs/superpowers/specs/2026-04-04-planetarium-data-layer-design.md`

---

### Task 1: Create planetarium.json data file

**Files:**
- Create: `src/data/planets/planetarium.json`

This is the single source of truth for the entire solar system. Copied from `D:/Developer/planets/public/planetarium.json` with `prose`, `useModel`, and `glbFile` fields removed.

- [ ] **Step 1: Create the data file**

Create `src/data/planets/planetarium.json`. The file is large (~600 lines after stripping prose). Copy the full contents of `D:/Developer/planets/public/planetarium.json` and:
1. Remove every `"prose": [...]` array from every planet entry
2. Remove every `"useModel": true` field (Ceres and Pluto have these)
3. Remove every `"glbFile": "..."` field from asteroid belt entries
4. Keep everything else exactly as-is (orbital elements in degrees, shader configs, rings, moons, asteroid belts)

The JSON structure is:
```json
{
  "sun": { "name", "displayRadius", "rotationSpeed", "shader" },
  "planets": [ { "id", "name", "order", "type", "accentColor", "orbit", "displayRadius", "axialTilt", "rotationSpeed", "shader", "ring?", "moons" } ],
  "asteroidBelts": [ { "id", "name", "orbit", "innerRadius", "outerRadius", "maxParticles", "thickness", "orbitalSpeed", "tumbleSpeed", "sizeRange", "sizeExponent", "kirkwoodGaps", "emissiveColor?" } ]
}
```

All 10 planets (mercury through pluto), their moons (30+ total), Saturn/Uranus rings, and 2 asteroid belts (main belt + Kuiper belt) must be included.

- [ ] **Step 2: Verify JSON is valid**

Run: `cd D:/Developer/asteroids && node -e "JSON.parse(require('fs').readFileSync('src/data/planets/planetarium.json','utf8')); console.log('Valid JSON')"`
Expected: `Valid JSON`

- [ ] **Step 3: Commit**

```bash
git add src/data/planets/planetarium.json
git commit -m "data: add planetarium.json with solar system definitions"
```

---

### Task 2: Create type definitions

**Files:**
- Create: `src/lib/planets/types.ts`

All interfaces for the planetarium system. No runtime code — types only.

- [ ] **Step 1: Write `types.ts`**

```ts
/**
 * Planetarium type definitions.
 *
 * Data model for the solar system: planets, moons, orbital elements,
 * shader configs, rings, and asteroid belts. All properties readonly.
 * No prose text — this is the game data layer.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-planetarium-data-layer-design.md
 */

/** 3D cartesian coordinate. */
export interface Vec3 {
  /** X component. */
  readonly x: number
  /** Y component. */
  readonly y: number
  /** Z component. */
  readonly z: number
}

/**
 * Classical Keplerian orbital elements.
 *
 * Angles are in radians after catalog conversion (stored as degrees in JSON).
 */
export interface OrbitalElements {
  /** Semi-major axis in scene units (planets) or relative to parent (moons). */
  readonly semiMajorAxis: number
  /** Eccentricity: 0 = circular, 0..1 = elliptical. */
  readonly eccentricity: number
  /** Inclination from the ecliptic plane, in radians. */
  readonly inclination: number
  /** Longitude of ascending node, in radians. */
  readonly longitudeOfAscendingNode: number
  /** Argument of periapsis, in radians. */
  readonly argumentOfPeriapsis: number
  /** Orbital period in Earth days. */
  readonly period: number
  /** Optional time offset for mean anomaly calculation. */
  readonly epoch?: number
}

/** Shader program selector for procedural rendering. */
export type ShaderType = 'star' | 'rockyPlanet' | 'gasGiant'

/** Shader program type and uniform values for procedural body rendering. */
export interface ShaderConfig {
  /** Which shader program to use. */
  readonly type: ShaderType
  /** Uniform name-value pairs passed to the shader. */
  readonly uniforms: Record<string, number | number[]>
}

/** Planetary ring geometry and appearance. */
export interface RingConfig {
  /** Inner edge as a multiplier of planet display radius. */
  readonly innerRadius: number
  /** Outer edge as a multiplier of planet display radius. */
  readonly outerRadius: number
  /** Ring opacity (0..1). */
  readonly opacity: number
  /** Ring color as [r, g, b] normalized 0..1. */
  readonly color: readonly number[]
}

/** A natural satellite orbiting a planet. */
export interface Moon {
  /** Display name, e.g. "Europa", "Titan". */
  readonly name: string
  /** Orbital elements relative to parent planet. */
  readonly orbit: OrbitalElements
  /** Visual radius in scene units. */
  readonly displayRadius: number
  /** Shader program and uniforms for procedural rendering. */
  readonly shader: ShaderConfig
  /** Rotation speed factor for self-rotation animation. */
  readonly rotationSpeed: number
}

/** Planetary classification. */
export type PlanetType = 'Terrestrial' | 'Gas Giant' | 'Ice Giant' | 'Dwarf Planet'

/** A planet or dwarf planet in the solar system. */
export interface Planet {
  /** Unique key, e.g. "earth", "jupiter". */
  readonly id: string
  /** Display name, e.g. "Earth", "Jupiter". */
  readonly name: string
  /** Sort order from the sun (1 = Mercury, 10 = Pluto). */
  readonly order: number
  /** Planetary classification. */
  readonly type: PlanetType
  /** Accent color as a CSS hex string, e.g. "#6AA4D4". */
  readonly accentColor: string
  /** Heliocentric orbital elements. */
  readonly orbit: OrbitalElements
  /** Visual radius in scene units. */
  readonly displayRadius: number
  /** Shader program and uniforms for procedural rendering. */
  readonly shader: ShaderConfig
  /** Optional ring system (Saturn, Uranus). */
  readonly ring?: RingConfig
  /** Natural satellites. Empty array if none. */
  readonly moons: readonly Moon[]
  /** Rotation speed factor for self-rotation animation. */
  readonly rotationSpeed: number
  /** Axial tilt in radians (converted from degrees by catalog). */
  readonly axialTilt: number
}

/** Solar data — the central star. */
export interface SunData {
  /** Display name. */
  readonly name: string
  /** Visual radius in scene units. */
  readonly displayRadius: number
  /** Shader program and uniforms for star rendering. */
  readonly shader: ShaderConfig
  /** Rotation speed factor for animation. */
  readonly rotationSpeed: number
}

/** A resonance gap in an asteroid belt caused by Jupiter's gravity. */
export interface KirkwoodGap {
  /** Normalized position within the belt (0..1). */
  readonly position: number
  /** Normalized width of the gap (0..1). */
  readonly width: number
}

/** A belt of asteroids (Main Belt or Kuiper Belt). */
export interface AsteroidBelt {
  /** Unique key, e.g. "main-belt", "kuiper-belt". */
  readonly id: string
  /** Display name, e.g. "Asteroid Belt". */
  readonly name: string
  /** Center-line orbital elements. */
  readonly orbit: OrbitalElements
  /** Inner edge in scene units. */
  readonly innerRadius: number
  /** Outer edge in scene units. */
  readonly outerRadius: number
  /** Maximum particle count for rendering. */
  readonly maxParticles: number
  /** Vertical spread of the belt in scene units. */
  readonly thickness: number
  /** Base orbital speed factor. */
  readonly orbitalSpeed: number
  /** Tumble speed for individual asteroid rotation. */
  readonly tumbleSpeed: number
  /** Min/max particle size range. */
  readonly sizeRange: readonly [number, number]
  /** Exponent for size distribution (higher = more small particles). */
  readonly sizeExponent: number
  /** Kirkwood resonance gaps. */
  readonly kirkwoodGaps: readonly KirkwoodGap[]
  /** Optional emissive tint as [r, g, b] normalized 0..1. */
  readonly emissiveColor?: readonly [number, number, number]
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd D:/Developer/asteroids && bunx tsc --noEmit src/lib/planets/types.ts`
Expected: No errors (types-only file, no imports to resolve beyond TS lib)

- [ ] **Step 3: Commit**

```bash
git add src/lib/planets/types.ts
git commit -m "feat(planets): add type definitions for solar system data model"
```

---

### Task 3: Create simulation constants

**Files:**
- Create: `src/lib/planets/constants.ts`

Only simulation/orbital constants. No view-layer constants (camera, bloom, typography, etc.).

- [ ] **Step 1: Write `constants.ts`**

```ts
/**
 * Planetarium simulation constants.
 *
 * Only includes orbital mechanics and simulation parameters.
 * View-layer constants (camera, bloom, typography) are deferred
 * to the Three.js port.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-planetarium-data-layer-design.md
 */

/** Scale factor: scene orbit units to Three.js world units. */
export const ORBIT_SCALE = 0.03

/** Scale factor: body display sizes. Sun radius ~1.375, Earth ~0.385. */
export const SIZE_SCALE = 50.0

/** Default simulation speed multiplier. */
export const DEFAULT_TIME_SCALE = 5.0

/** Divisor applied to rotation speed for animation damping. */
export const ROTATION_SPEED_DIVISOR = 20.0

/** Divisor applied to moon orbital speed for animation damping. */
export const MOON_ORBIT_SPEED_DIVISOR = 5.0

/** Number of sample points when generating orbit path geometry. */
export const ORBIT_PATH_SEGMENTS = 128

/** Geometry subdivision level for planet spheres. */
export const SPHERE_SEGMENTS = 64

/** Geometry subdivision level for moon spheres. */
export const MOON_SPHERE_SEGMENTS = 32
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/planets/constants.ts
git commit -m "feat(planets): add simulation constants"
```

---

### Task 4: Create Keplerian orbital mechanics with tests

**Files:**
- Create: `src/lib/planets/kepler.ts`
- Create: `src/lib/planets/__tests__/kepler.spec.ts`

Pure math — direct port from `planets/src/lib/kepler.ts`. All 6 functions, all tests.

- [ ] **Step 1: Write the test file**

Create `src/lib/planets/__tests__/kepler.spec.ts` with the full test suite. This is a direct port from the planets project, adapted to the asteroids project conventions (`.spec.ts` suffix, no semicolons, single quotes).

```ts
import { describe, it, expect } from 'vitest'
import {
  solveKeplerEquation,
  meanAnomaly,
  trueAnomalyFromEccentric,
  keplerRadius,
  orbitalPosition3D,
  orbitPathPoints,
} from '../kepler'
import type { OrbitalElements } from '../types'

const TWO_PI = 2 * Math.PI

// ---------------------------------------------------------------------------
// solveKeplerEquation
// ---------------------------------------------------------------------------
describe('solveKeplerEquation', () => {
  it('circular orbit (e=0) returns M unchanged', () => {
    const M = 1.23
    expect(solveKeplerEquation(M, 0)).toBe(M)
  })

  it('M=0 always returns E=0', () => {
    expect(solveKeplerEquation(0, 0.5)).toBeCloseTo(0, 10)
  })

  it('satisfies M = E - e*sin(E) for Mercury eccentricity (e=0.2056)', () => {
    const e = 0.2056
    const M = 1.0
    const E = solveKeplerEquation(M, e)
    expect(E - e * Math.sin(E)).toBeCloseTo(M, 8)
  })

  it('satisfies Kepler equation for moderate eccentricity (e=0.5)', () => {
    const e = 0.5
    const M = 2.5
    const E = solveKeplerEquation(M, e)
    expect(E - e * Math.sin(E)).toBeCloseTo(M, 8)
  })

  it('satisfies Kepler equation for high eccentricity (e=0.9)', () => {
    const e = 0.9
    const M = 0.5
    const E = solveKeplerEquation(M, e)
    expect(E - e * Math.sin(E)).toBeCloseTo(M, 8)
  })

  it('converges across the full [0, 2pi] range for high eccentricity', () => {
    const e = 0.9
    for (let k = 0; k <= 8; k++) {
      const M = (k / 8) * TWO_PI
      const E = solveKeplerEquation(M, e)
      expect(E - e * Math.sin(E)).toBeCloseTo(M, 8)
    }
  })
})

// ---------------------------------------------------------------------------
// meanAnomaly
// ---------------------------------------------------------------------------
describe('meanAnomaly', () => {
  it('returns 0 at epoch (t = epoch)', () => {
    expect(meanAnomaly(365, 100, 100)).toBeCloseTo(0, 10)
  })

  it('returns 2pi after one full period', () => {
    expect(meanAnomaly(365, 365, 0)).toBeCloseTo(TWO_PI, 10)
  })

  it('uses epoch=0 by default', () => {
    expect(meanAnomaly(365, 365)).toBeCloseTo(TWO_PI, 10)
  })

  it('returns pi at half period', () => {
    expect(meanAnomaly(100, 50, 0)).toBeCloseTo(Math.PI, 10)
  })

  it('handles non-zero epoch offset correctly', () => {
    expect(meanAnomaly(100, 200, 100)).toBeCloseTo(TWO_PI, 10)
  })
})

// ---------------------------------------------------------------------------
// trueAnomalyFromEccentric
// ---------------------------------------------------------------------------
describe('trueAnomalyFromEccentric', () => {
  it('circular orbit (e=0) returns E unchanged', () => {
    const E = 1.5
    expect(trueAnomalyFromEccentric(E, 0)).toBe(E)
  })

  it('E=0 returns nu=0 for any eccentricity', () => {
    expect(trueAnomalyFromEccentric(0, 0.5)).toBeCloseTo(0, 10)
  })

  it('E=pi returns nu=pi (apoapsis is symmetric)', () => {
    expect(trueAnomalyFromEccentric(Math.PI, 0.5)).toBeCloseTo(Math.PI, 10)
  })

  it('true anomaly exceeds eccentric anomaly for 0 < E < pi when e > 0', () => {
    const E = 1.0
    const nu = trueAnomalyFromEccentric(E, 0.5)
    expect(nu).toBeGreaterThan(E)
  })

  it('round-trips: E=pi/4 with e=0.2056 satisfies the half-angle formula', () => {
    const E = Math.PI / 4
    const e = 0.2056
    const nu = trueAnomalyFromEccentric(E, e)
    const expected = 2 * Math.atan2(
      Math.sqrt(1 + e) * Math.sin(E / 2),
      Math.sqrt(1 - e) * Math.cos(E / 2),
    )
    expect(nu).toBeCloseTo(expected, 12)
  })
})

// ---------------------------------------------------------------------------
// keplerRadius
// ---------------------------------------------------------------------------
describe('keplerRadius', () => {
  it('circular orbit (e=0) always returns a', () => {
    expect(keplerRadius(1.0, 0, 0)).toBe(1.0)
    expect(keplerRadius(1.0, 0, Math.PI)).toBe(1.0)
    expect(keplerRadius(1.0, 0, 1.234)).toBe(1.0)
  })

  it('periapsis (nu=0) = a(1-e)', () => {
    const a = 1.0
    const e = 0.5
    expect(keplerRadius(a, e, 0)).toBeCloseTo(a * (1 - e), 10)
  })

  it('apoapsis (nu=pi) = a(1+e)', () => {
    const a = 1.0
    const e = 0.5
    expect(keplerRadius(a, e, Math.PI)).toBeCloseTo(a * (1 + e), 10)
  })

  it('periapsis < apoapsis for e > 0', () => {
    const a = 1.5
    const e = 0.3
    const rPeri = keplerRadius(a, e, 0)
    const rApo = keplerRadius(a, e, Math.PI)
    expect(rPeri).toBeLessThan(rApo)
  })

  it('satisfies conic section equation r = a(1-e^2)/(1+e*cos(nu))', () => {
    const a = 2.0
    const e = 0.4
    const nu = 1.2
    const expected = (a * (1 - e * e)) / (1 + e * Math.cos(nu))
    expect(keplerRadius(a, e, nu)).toBeCloseTo(expected, 10)
  })
})

// ---------------------------------------------------------------------------
// orbitalPosition3D
// ---------------------------------------------------------------------------
describe('orbitalPosition3D', () => {
  const circularEcliptic: OrbitalElements = {
    semiMajorAxis: 1,
    eccentricity: 0,
    inclination: 0,
    longitudeOfAscendingNode: 0,
    argumentOfPeriapsis: 0,
    period: 1,
    epoch: 0,
  }

  it('zero inclination at t=0 (periapsis): position on +x axis, z=0', () => {
    const pos = orbitalPosition3D(circularEcliptic, 0)
    expect(pos.x).toBeCloseTo(1, 8)
    expect(pos.y).toBeCloseTo(0, 8)
    expect(pos.z).toBeCloseTo(0, 8)
  })

  it('zero inclination at t=period/4: position on +y axis, z=0', () => {
    const pos = orbitalPosition3D(circularEcliptic, 0.25)
    expect(pos.x).toBeCloseTo(0, 8)
    expect(pos.y).toBeCloseTo(1, 8)
    expect(pos.z).toBeCloseTo(0, 8)
  })

  it('circular ecliptic orbit: radius equals semiMajorAxis at all times', () => {
    for (let k = 0; k < 8; k++) {
      const t = k / 8
      const p = orbitalPosition3D(circularEcliptic, t)
      const r = Math.sqrt(p.x ** 2 + p.y ** 2 + p.z ** 2)
      expect(r).toBeCloseTo(1, 8)
    }
  })

  it('inclined orbit (i=pi/2) produces non-zero z-component away from nodes', () => {
    const inclined: OrbitalElements = {
      semiMajorAxis: 1,
      eccentricity: 0,
      inclination: Math.PI / 2,
      longitudeOfAscendingNode: 0,
      argumentOfPeriapsis: 0,
      period: 1,
      epoch: 0,
    }
    const pos = orbitalPosition3D(inclined, 0.25)
    expect(Math.abs(pos.z)).toBeGreaterThan(0.5)
  })

  it('respects epoch: same position at t=epoch as at t=0 with epoch=0', () => {
    const withEpoch: OrbitalElements = { ...circularEcliptic, epoch: 42 }
    const p1 = orbitalPosition3D(circularEcliptic, 0)
    const p2 = orbitalPosition3D(withEpoch, 42)
    expect(p1.x).toBeCloseTo(p2.x, 8)
    expect(p1.y).toBeCloseTo(p2.y, 8)
    expect(p1.z).toBeCloseTo(p2.z, 8)
  })

  it('elliptical orbit radius at periapsis equals a(1-e)', () => {
    const elliptic: OrbitalElements = {
      semiMajorAxis: 2,
      eccentricity: 0.5,
      inclination: 0,
      longitudeOfAscendingNode: 0,
      argumentOfPeriapsis: 0,
      period: 1,
      epoch: 0,
    }
    const pos = orbitalPosition3D(elliptic, 0)
    const r = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2)
    expect(r).toBeCloseTo(2 * (1 - 0.5), 8)
  })
})

// ---------------------------------------------------------------------------
// orbitPathPoints
// ---------------------------------------------------------------------------
describe('orbitPathPoints', () => {
  const circularEcliptic: OrbitalElements = {
    semiMajorAxis: 1,
    eccentricity: 0,
    inclination: 0,
    longitudeOfAscendingNode: 0,
    argumentOfPeriapsis: 0,
    period: 1,
  }

  it('returns the requested number of points (default 128)', () => {
    const pts = orbitPathPoints(circularEcliptic)
    expect(pts).toHaveLength(128)
  })

  it('returns the requested number of points when overridden', () => {
    const pts = orbitPathPoints(circularEcliptic, 64)
    expect(pts).toHaveLength(64)
  })

  it('circular ecliptic orbit: all points at radius = semiMajorAxis', () => {
    const pts = orbitPathPoints(circularEcliptic, 64)
    for (const p of pts) {
      const r = Math.sqrt(p.x ** 2 + p.y ** 2 + p.z ** 2)
      expect(r).toBeCloseTo(1, 8)
    }
  })

  it('circular ecliptic orbit: all z-components are zero', () => {
    const pts = orbitPathPoints(circularEcliptic, 32)
    for (const p of pts) {
      expect(p.z).toBeCloseTo(0, 10)
    }
  })

  it('elliptical orbit: min radius = a(1-e), max radius = a(1+e)', () => {
    const a = 2
    const e = 0.5
    const elliptic: OrbitalElements = {
      semiMajorAxis: a,
      eccentricity: e,
      inclination: 0,
      longitudeOfAscendingNode: 0,
      argumentOfPeriapsis: 0,
      period: 1,
    }
    const pts = orbitPathPoints(elliptic, 256)
    const radii = pts.map(p => Math.sqrt(p.x ** 2 + p.y ** 2 + p.z ** 2))
    const rMin = Math.min(...radii)
    const rMax = Math.max(...radii)
    expect(rMin).toBeCloseTo(a * (1 - e), 4)
    expect(rMax).toBeCloseTo(a * (1 + e), 4)
  })

  it('each point has x, y, z properties', () => {
    const pts = orbitPathPoints(circularEcliptic, 4)
    for (const p of pts) {
      expect(typeof p.x).toBe('number')
      expect(typeof p.y).toBe('number')
      expect(typeof p.z).toBe('number')
    }
  })

  it('inclined orbit (i=pi/2): points span non-zero z range', () => {
    const inclined: OrbitalElements = {
      semiMajorAxis: 1,
      eccentricity: 0,
      inclination: Math.PI / 2,
      longitudeOfAscendingNode: 0,
      argumentOfPeriapsis: 0,
      period: 1,
    }
    const pts = orbitPathPoints(inclined, 64)
    const zMax = Math.max(...pts.map(p => Math.abs(p.z)))
    expect(zMax).toBeGreaterThan(0.9)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd D:/Developer/asteroids && bun test:unit src/lib/planets/__tests__/kepler.spec.ts`
Expected: FAIL — `Cannot find module '../kepler'`

- [ ] **Step 3: Write `kepler.ts`**

Create `src/lib/planets/kepler.ts`:

```ts
/**
 * Keplerian orbital mechanics — pure functions.
 *
 * Solves the two-body problem for elliptical orbits using classical
 * orbital elements. No visualization dependencies.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-planetarium-data-layer-design.md
 */
import type { OrbitalElements, Vec3 } from './types'

const TWO_PI = 2 * Math.PI

/**
 * Solve Kepler's equation M = E - e*sin(E) for eccentric anomaly E.
 * Uses Newton-Raphson iteration with initial guess E0 = M.
 *
 * @param M - Mean anomaly in radians
 * @param e - Orbital eccentricity (0..1)
 * @param tolerance - Convergence threshold (default 1e-10)
 * @param maxIter - Maximum iterations (default 50)
 * @returns Eccentric anomaly E in radians
 */
export function solveKeplerEquation(
  M: number,
  e: number,
  tolerance = 1e-10,
  maxIter = 50,
): number {
  if (e === 0) return M
  let E = M
  for (let i = 0; i < maxIter; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    E -= dE
    if (Math.abs(dE) < tolerance) break
  }
  return E
}

/**
 * Compute mean anomaly at a given time.
 * M = 2pi * (t - epoch) / period
 *
 * @param period - Orbital period in days
 * @param time - Current simulation time
 * @param epoch - Time offset (default 0)
 * @returns Mean anomaly in radians
 */
export function meanAnomaly(period: number, time: number, epoch = 0): number {
  return TWO_PI * ((time - epoch) / period)
}

/**
 * Convert eccentric anomaly to true anomaly.
 * tan(nu/2) = sqrt((1+e)/(1-e)) * tan(E/2)
 *
 * @param E - Eccentric anomaly in radians
 * @param e - Orbital eccentricity
 * @returns True anomaly in radians
 */
export function trueAnomalyFromEccentric(E: number, e: number): number {
  if (e === 0) return E
  return 2 * Math.atan2(
    Math.sqrt(1 + e) * Math.sin(E / 2),
    Math.sqrt(1 - e) * Math.cos(E / 2),
  )
}

/**
 * Orbital radius from true anomaly (conic section equation).
 * r = a(1 - e^2) / (1 + e*cos(nu))
 *
 * @param semiMajorAxis - Semi-major axis
 * @param eccentricity - Orbital eccentricity
 * @param trueAnomaly - True anomaly in radians
 * @returns Orbital radius
 */
export function keplerRadius(
  semiMajorAxis: number,
  eccentricity: number,
  trueAnomaly: number,
): number {
  if (eccentricity === 0) return semiMajorAxis
  const p = semiMajorAxis * (1 - eccentricity * eccentricity)
  return p / (1 + eccentricity * Math.cos(trueAnomaly))
}

/**
 * Compute 3D heliocentric cartesian position from orbital elements.
 *
 * Pipeline: time -> mean anomaly -> Kepler solve -> true anomaly -> radius -> 3D rotation
 *
 * The orbital plane is rotated into 3D space using three Euler angles:
 * - Omega (longitude of ascending node): rotates around Z
 * - i (inclination): tilts the orbital plane
 * - omega (argument of periapsis): rotates within the orbital plane
 *
 * @param elements - Keplerian orbital elements
 * @param time - Current simulation time
 * @returns 3D heliocentric position
 */
export function orbitalPosition3D(elements: OrbitalElements, time: number): Vec3 {
  const {
    semiMajorAxis: a,
    eccentricity: e,
    inclination: i,
    longitudeOfAscendingNode: Omega,
    argumentOfPeriapsis: omega,
    period,
    epoch = 0,
  } = elements

  const M = meanAnomaly(period, time, epoch)
  const E = solveKeplerEquation(M, e)
  const nu = trueAnomalyFromEccentric(E, e)
  const r = keplerRadius(a, e, nu)

  const xOrbital = r * Math.cos(nu)
  const yOrbital = r * Math.sin(nu)

  const cosOmega = Math.cos(Omega)
  const sinOmega = Math.sin(Omega)
  const cosI = Math.cos(i)
  const sinI = Math.sin(i)
  const cosW = Math.cos(omega)
  const sinW = Math.sin(omega)

  const x =
    (cosOmega * cosW - sinOmega * sinW * cosI) * xOrbital +
    (-cosOmega * sinW - sinOmega * cosW * cosI) * yOrbital
  const y =
    (sinOmega * cosW + cosOmega * sinW * cosI) * xOrbital +
    (-sinOmega * sinW + cosOmega * cosW * cosI) * yOrbital
  const z =
    (sinW * sinI) * xOrbital +
    (cosW * sinI) * yOrbital

  return { x, y, z }
}

/**
 * Generate array of 3D points tracing the full orbit ellipse.
 * Samples uniformly in mean anomaly for even visual spacing.
 *
 * @param elements - Keplerian orbital elements
 * @param numSegments - Number of sample points (default 128)
 * @returns Array of 3D positions along the orbit
 */
export function orbitPathPoints(elements: OrbitalElements, numSegments = 128): Vec3[] {
  const {
    semiMajorAxis: a,
    eccentricity: e,
    inclination: i,
    longitudeOfAscendingNode: Omega,
    argumentOfPeriapsis: omega,
  } = elements

  const cosOmega = Math.cos(Omega)
  const sinOmega = Math.sin(Omega)
  const cosI = Math.cos(i)
  const sinI = Math.sin(i)
  const cosW = Math.cos(omega)
  const sinW = Math.sin(omega)

  const points: Vec3[] = new Array(numSegments)
  for (let j = 0; j < numSegments; j++) {
    const M = TWO_PI * (j / numSegments)
    const E = solveKeplerEquation(M, e)
    const nu = trueAnomalyFromEccentric(E, e)
    const r = keplerRadius(a, e, nu)

    const xOrb = r * Math.cos(nu)
    const yOrb = r * Math.sin(nu)

    points[j] = {
      x: (cosOmega * cosW - sinOmega * sinW * cosI) * xOrb +
         (-cosOmega * sinW - sinOmega * cosW * cosI) * yOrb,
      y: (sinOmega * cosW + cosOmega * sinW * cosI) * xOrb +
         (-sinOmega * sinW + cosOmega * cosW * cosI) * yOrb,
      z: (sinW * sinI) * xOrb + (cosW * sinI) * yOrb,
    }
  }
  return points
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd D:/Developer/asteroids && bun test:unit src/lib/planets/__tests__/kepler.spec.ts`
Expected: All 28 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/planets/kepler.ts src/lib/planets/__tests__/kepler.spec.ts
git commit -m "feat(planets): add Keplerian orbital mechanics with full test suite"
```

---

### Task 5: Create catalog module with tests

**Files:**
- Create: `src/lib/planets/catalog.ts`
- Create: `src/lib/planets/__tests__/catalog.spec.ts`

Static import of `planetarium.json`, degree-to-radian conversion, typed exports.

- [ ] **Step 1: Write the test file**

Create `src/lib/planets/__tests__/catalog.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { SUN, PLANETS, PLANET_IDS, ASTEROID_BELTS, getPlanet } from '../catalog'

describe('catalog', () => {
  describe('SUN', () => {
    it('has the correct name', () => {
      expect(SUN.name).toBe('Sun')
    })

    it('has a star shader type', () => {
      expect(SUN.shader.type).toBe('star')
    })

    it('has a positive display radius', () => {
      expect(SUN.displayRadius).toBeGreaterThan(0)
    })
  })

  describe('PLANETS', () => {
    it('contains 10 planets', () => {
      expect(PLANETS).toHaveLength(10)
    })

    it('planets are ordered by order field', () => {
      for (let i = 1; i < PLANETS.length; i++) {
        expect(PLANETS[i]!.order).toBeGreaterThan(PLANETS[i - 1]!.order)
      }
    })

    it('all planet ids are unique', () => {
      const ids = PLANETS.map(p => p.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('includes Mercury through Pluto in order', () => {
      const ids = PLANETS.map(p => p.id)
      expect(ids).toEqual([
        'mercury', 'venus', 'earth', 'mars', 'ceres',
        'jupiter', 'saturn', 'uranus', 'neptune', 'pluto',
      ])
    })

    it('orbital angles are in radians (not degrees)', () => {
      const earth = getPlanet('earth')
      // Earth's argument of periapsis is 102.937 degrees = ~1.797 radians
      // If it were still in degrees it would be > 100
      expect(earth.orbit.argumentOfPeriapsis).toBeLessThan(Math.PI * 2)
      expect(earth.orbit.argumentOfPeriapsis).toBeGreaterThan(0)
    })

    it('axial tilt is in radians', () => {
      const earth = getPlanet('earth')
      // Earth axial tilt is 23.44 degrees = ~0.409 radians
      // If still in degrees it would be > 20
      expect(earth.axialTilt).toBeCloseTo(23.44 * Math.PI / 180, 4)
    })

    it('no planet has a prose field', () => {
      for (const planet of PLANETS) {
        expect(planet).not.toHaveProperty('prose')
      }
    })

    it('no planet has a useModel field', () => {
      for (const planet of PLANETS) {
        expect(planet).not.toHaveProperty('useModel')
      }
    })

    it('Saturn has a ring', () => {
      const saturn = getPlanet('saturn')
      expect(saturn.ring).toBeDefined()
      expect(saturn.ring!.innerRadius).toBeGreaterThan(0)
    })

    it('Earth has one moon', () => {
      const earth = getPlanet('earth')
      expect(earth.moons).toHaveLength(1)
      expect(earth.moons[0]!.name).toBe('Moon')
    })

    it('Jupiter has 4 Galilean moons', () => {
      const jupiter = getPlanet('jupiter')
      expect(jupiter.moons).toHaveLength(4)
      const names = jupiter.moons.map(m => m.name)
      expect(names).toEqual(['Io', 'Europa', 'Ganymede', 'Callisto'])
    })
  })

  describe('PLANET_IDS', () => {
    it('contains 10 string ids', () => {
      expect(PLANET_IDS).toHaveLength(10)
      for (const id of PLANET_IDS) {
        expect(typeof id).toBe('string')
      }
    })
  })

  describe('ASTEROID_BELTS', () => {
    it('contains 2 asteroid belts', () => {
      expect(ASTEROID_BELTS).toHaveLength(2)
    })

    it('includes main belt and kuiper belt', () => {
      const ids = ASTEROID_BELTS.map(b => b.id)
      expect(ids).toContain('main-belt')
      expect(ids).toContain('kuiper-belt')
    })

    it('belt orbital angles are in radians', () => {
      const mainBelt = ASTEROID_BELTS.find(b => b.id === 'main-belt')!
      // inclination 1.5 degrees = ~0.026 radians
      expect(mainBelt.orbit.inclination).toBeLessThan(1)
    })

    it('no belt has a glbFile field', () => {
      for (const belt of ASTEROID_BELTS) {
        expect(belt).not.toHaveProperty('glbFile')
      }
    })
  })

  describe('getPlanet', () => {
    it('returns the correct planet by id', () => {
      const mars = getPlanet('mars')
      expect(mars.name).toBe('Mars')
      expect(mars.order).toBe(4)
    })

    it('throws for unknown id', () => {
      expect(() => getPlanet('tatooine')).toThrow('Unknown planet id: tatooine')
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd D:/Developer/asteroids && bun test:unit src/lib/planets/__tests__/catalog.spec.ts`
Expected: FAIL — `Cannot find module '../catalog'`

- [ ] **Step 3: Write `catalog.ts`**

Create `src/lib/planets/catalog.ts`:

```ts
/**
 * Planetarium catalog loader.
 *
 * Statically imports the solar system JSON data via Vite, converts
 * orbital angles from degrees to radians, and exports typed,
 * validated data for consumption by the game.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-planetarium-data-layer-design.md
 */
import type {
  OrbitalElements,
  ShaderConfig,
  Moon,
  Planet,
  PlanetType,
  SunData,
  RingConfig,
  KirkwoodGap,
  AsteroidBelt,
} from './types'

import rawData from '@/data/planets/planetarium.json'

const DEG = Math.PI / 180

// --- JSON shape (angles in degrees) ---

interface OrbitJSON {
  semiMajorAxis: number
  eccentricity: number
  inclination: number
  longitudeOfAscendingNode: number
  argumentOfPeriapsis: number
  period: number
}

interface MoonJSON {
  name: string
  orbit: OrbitJSON
  displayRadius: number
  rotationSpeed: number
  shader: ShaderConfig
}

interface PlanetJSON {
  id: string
  name: string
  order: number
  type: PlanetType
  accentColor: string
  orbit: OrbitJSON
  displayRadius: number
  axialTilt: number
  rotationSpeed: number
  shader: ShaderConfig
  ring?: RingConfig
  moons: MoonJSON[]
}

interface AsteroidBeltJSON {
  id: string
  name: string
  orbit: OrbitJSON
  innerRadius: number
  outerRadius: number
  maxParticles: number
  thickness: number
  orbitalSpeed: number
  tumbleSpeed: number
  sizeRange: [number, number]
  sizeExponent: number
  kirkwoodGaps: KirkwoodGap[]
  emissiveColor?: [number, number, number]
}

interface PlanetariumJSON {
  sun: SunData
  planets: PlanetJSON[]
  asteroidBelts?: AsteroidBeltJSON[]
}

// --- Conversion helpers ---

/** Convert orbital angles from degrees to radians. */
function convertOrbit(o: OrbitJSON): OrbitalElements {
  return {
    semiMajorAxis: o.semiMajorAxis,
    eccentricity: o.eccentricity,
    inclination: o.inclination * DEG,
    longitudeOfAscendingNode: o.longitudeOfAscendingNode * DEG,
    argumentOfPeriapsis: o.argumentOfPeriapsis * DEG,
    period: o.period,
  }
}

/** Convert a moon JSON entry to the typed Moon interface. */
function convertMoon(m: MoonJSON): Moon {
  return {
    name: m.name,
    orbit: convertOrbit(m.orbit),
    displayRadius: m.displayRadius,
    rotationSpeed: m.rotationSpeed,
    shader: m.shader,
  }
}

/** Convert a planet JSON entry to the typed Planet interface. */
function convertPlanet(p: PlanetJSON): Planet {
  return {
    id: p.id,
    name: p.name,
    order: p.order,
    type: p.type,
    accentColor: p.accentColor,
    orbit: convertOrbit(p.orbit),
    displayRadius: p.displayRadius,
    axialTilt: p.axialTilt * DEG,
    rotationSpeed: p.rotationSpeed,
    shader: p.shader,
    ring: p.ring,
    moons: p.moons.map(convertMoon),
  }
}

/** Convert an asteroid belt JSON entry to the typed AsteroidBelt interface. */
function convertAsteroidBelt(b: AsteroidBeltJSON): AsteroidBelt {
  return {
    id: b.id,
    name: b.name,
    orbit: convertOrbit(b.orbit),
    innerRadius: b.innerRadius,
    outerRadius: b.outerRadius,
    maxParticles: b.maxParticles,
    thickness: b.thickness,
    orbitalSpeed: b.orbitalSpeed,
    tumbleSpeed: b.tumbleSpeed,
    sizeRange: b.sizeRange,
    sizeExponent: b.sizeExponent,
    kirkwoodGaps: b.kirkwoodGaps,
    emissiveColor: b.emissiveColor,
  }
}

// --- Build the catalog ---

const data = rawData as unknown as PlanetariumJSON

/** The Sun. */
export const SUN: SunData = data.sun

/** All 10 planets, ordered by distance from the sun. */
export const PLANETS: readonly Planet[] = data.planets.map(convertPlanet)

/** Planet IDs in order, e.g. ['mercury', 'venus', ...]. */
export const PLANET_IDS: string[] = PLANETS.map(p => p.id)

/** Asteroid belts (Main Belt and Kuiper Belt). */
export const ASTEROID_BELTS: readonly AsteroidBelt[] = (data.asteroidBelts ?? []).map(convertAsteroidBelt)

// --- Validation ---

const ids = PLANETS.map(p => p.id)
if (new Set(ids).size !== ids.length) {
  throw new Error('Duplicate planet ids detected in planetarium data')
}

const orders = PLANETS.map(p => p.order)
if (new Set(orders).size !== orders.length) {
  throw new Error('Duplicate planet orders detected in planetarium data')
}

/**
 * Look up a planet by its unique ID.
 *
 * @param id - Planet identifier, e.g. "earth"
 * @returns The planet definition
 * @throws If the planet ID is not found
 */
export function getPlanet(id: string): Planet {
  const planet = PLANETS.find(p => p.id === id)
  if (!planet) throw new Error(`Unknown planet id: ${id}`)
  return planet
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd D:/Developer/asteroids && bun test:unit src/lib/planets/__tests__/catalog.spec.ts`
Expected: All 16 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/planets/catalog.ts src/lib/planets/__tests__/catalog.spec.ts
git commit -m "feat(planets): add catalog module with static JSON import and validation"
```

---

### Task 6: Create telemetry module with tests

**Files:**
- Create: `src/lib/planets/telemetry.ts`
- Create: `src/lib/planets/__tests__/telemetry.spec.ts`

Real-world physics computation from Keplerian state. Direct port from the planets project.

- [ ] **Step 1: Write the test file**

Create `src/lib/planets/__tests__/telemetry.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { computeTelemetry, resetTelemetryHistory } from '../telemetry'
import type { OrbitalElements } from '../types'

const earthOrbit: OrbitalElements = {
  semiMajorAxis: 300,
  eccentricity: 0.0167,
  inclination: 0,
  longitudeOfAscendingNode: 0,
  argumentOfPeriapsis: 102.937 * (Math.PI / 180),
  period: 365.25,
}

const marsOrbit: OrbitalElements = {
  semiMajorAxis: 370,
  eccentricity: 0.0934,
  inclination: 1.85 * (Math.PI / 180),
  longitudeOfAscendingNode: 49.558 * (Math.PI / 180),
  argumentOfPeriapsis: 286.502 * (Math.PI / 180),
  period: 686.97,
}

describe('computeTelemetry', () => {
  beforeEach(() => {
    resetTelemetryHistory()
  })

  it('returns all 13 fields', () => {
    const t = computeTelemetry('earth', earthOrbit, 100)
    expect(t).toHaveProperty('massEarths')
    expect(t).toHaveProperty('radiusKm')
    expect(t).toHaveProperty('solarDistanceAU')
    expect(t).toHaveProperty('orbitalVelocityKmS')
    expect(t).toHaveProperty('trueAnomalyDeg')
    expect(t).toHaveProperty('meanAnomalyDeg')
    expect(t).toHaveProperty('localSolarTime')
    expect(t).toHaveProperty('lightTravelMin')
    expect(t).toHaveProperty('orbitalPeriodDays')
    expect(t).toHaveProperty('phaseAngleDeg')
    expect(t).toHaveProperty('orbitProgressPie')
    expect(t).toHaveProperty('velocitySparkline')
    expect(t).toHaveProperty('distanceSparkline')
  })

  it('returns correct mass for Earth', () => {
    const t = computeTelemetry('earth', earthOrbit, 0)
    expect(t.massEarths).toBe(1.0)
  })

  it('returns correct radius for Earth', () => {
    const t = computeTelemetry('earth', earthOrbit, 0)
    expect(t.radiusKm).toBe(6371.0)
  })

  it('returns correct orbital period for Mars', () => {
    const t = computeTelemetry('mars', marsOrbit, 0)
    expect(t.orbitalPeriodDays).toBe(686.97)
  })

  it('solar distance is near 1 AU for Earth', () => {
    const t = computeTelemetry('earth', earthOrbit, 0)
    // Earth's nearly circular orbit means distance is close to 1 AU
    expect(t.solarDistanceAU).toBeGreaterThan(0.95)
    expect(t.solarDistanceAU).toBeLessThan(1.05)
  })

  it('orbital velocity for Earth is roughly 29-30 km/s', () => {
    const t = computeTelemetry('earth', earthOrbit, 0)
    expect(t.orbitalVelocityKmS).toBeGreaterThan(28)
    expect(t.orbitalVelocityKmS).toBeLessThan(31)
  })

  it('true anomaly is in [0, 360) degrees', () => {
    const t = computeTelemetry('earth', earthOrbit, 150)
    expect(t.trueAnomalyDeg).toBeGreaterThanOrEqual(0)
    expect(t.trueAnomalyDeg).toBeLessThan(360)
  })

  it('local solar time is in HH:MM:SS format', () => {
    const t = computeTelemetry('earth', earthOrbit, 100)
    expect(t.localSolarTime).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })

  it('orbit progress pie format is {p:NN}', () => {
    const t = computeTelemetry('earth', earthOrbit, 100)
    expect(t.orbitProgressPie).toMatch(/^\{p:\d+\}$/)
  })

  it('light travel time is roughly 8 minutes for Earth', () => {
    const t = computeTelemetry('earth', earthOrbit, 0)
    expect(t.lightTravelMin).toBeGreaterThan(7)
    expect(t.lightTravelMin).toBeLessThan(9)
  })
})

describe('resetTelemetryHistory', () => {
  it('clears sparkline buffers without error', () => {
    computeTelemetry('earth', earthOrbit, 0)
    expect(() => resetTelemetryHistory()).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd D:/Developer/asteroids && bun test:unit src/lib/planets/__tests__/telemetry.spec.ts`
Expected: FAIL — `Cannot find module '../telemetry'`

- [ ] **Step 3: Write `telemetry.ts`**

Create `src/lib/planets/telemetry.ts`:

```ts
/**
 * Real-world telemetry derived from Keplerian orbital elements.
 *
 * Computes physical data (distance, velocity, solar time, etc.) from
 * simulation state. No Three.js or Vue dependencies.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-planetarium-data-layer-design.md
 */
import type { OrbitalElements } from './types'
import {
  meanAnomaly,
  solveKeplerEquation,
  trueAnomalyFromEccentric,
  keplerRadius,
} from './kepler'

const TWO_PI = 2 * Math.PI
const DEG = 180 / Math.PI

/** Semi-major axes in AU. */
const REAL_AU: Record<string, number> = {
  mercury: 0.387,
  venus: 0.723,
  earth: 1.0,
  mars: 1.524,
  jupiter: 5.203,
  saturn: 9.537,
  uranus: 19.191,
  neptune: 30.069,
  pluto: 39.482,
}

/** Orbital periods in Earth days. */
const REAL_PERIOD_DAYS: Record<string, number> = {
  mercury: 87.97,
  venus: 224.7,
  earth: 365.25,
  mars: 686.97,
  jupiter: 4332.59,
  saturn: 10759.22,
  uranus: 30688.5,
  neptune: 60182.0,
  pluto: 90560.0,
}

/** Rotation periods in Earth hours (negative = retrograde). */
const REAL_ROTATION_HOURS: Record<string, number> = {
  mercury: 1407.6,
  venus: -5832.5,
  earth: 23.934,
  mars: 24.623,
  jupiter: 9.925,
  saturn: 10.656,
  uranus: -17.24,
  neptune: 16.11,
  pluto: -153.29,
}

/** Mass in Earth masses. */
const REAL_MASS_EARTH: Record<string, number> = {
  mercury: 0.0553,
  venus: 0.815,
  earth: 1.0,
  mars: 0.107,
  jupiter: 317.8,
  saturn: 95.16,
  uranus: 14.54,
  neptune: 17.15,
  pluto: 0.0022,
}

/** Equatorial radius in km. */
const REAL_RADIUS_KM: Record<string, number> = {
  mercury: 2439.7,
  venus: 6051.8,
  earth: 6371.0,
  mars: 3389.5,
  jupiter: 69911,
  saturn: 58232,
  uranus: 25362,
  neptune: 24622,
  pluto: 1188.3,
}

/** Speed of light: ~1 AU in 8.317 minutes. */
const SPEED_OF_LIGHT_AU_PER_MIN = 0.002004

/** Real-world telemetry computed from orbital state. */
export interface TelemetryData {
  /** Planetary mass in Earth masses. */
  massEarths: number
  /** Equatorial radius in km. */
  radiusKm: number
  /** Current distance from the sun in AU. */
  solarDistanceAU: number
  /** Current orbital velocity in km/s (vis-viva equation). */
  orbitalVelocityKmS: number
  /** Current true anomaly in degrees (0-360). */
  trueAnomalyDeg: number
  /** Current mean anomaly in degrees (0-360). */
  meanAnomalyDeg: number
  /** Local solar time as HH:MM:SS. */
  localSolarTime: string
  /** Light travel time from the sun in minutes. */
  lightTravelMin: number
  /** Real orbital period in Earth days. */
  orbitalPeriodDays: number
  /** Phase angle (sun-planet-observer) in degrees. */
  phaseAngleDeg: number
  /** Orbit progress as pie chart string: {p:XX}. */
  orbitProgressPie: string
  /** Recent velocity history as sparkline: {l:v1,v2,...}. */
  velocitySparkline: string
  /** Recent distance history as sparkline: {l:v1,v2,...}. */
  distanceSparkline: string
}

// --- Sparkline history ---

const SPARKLINE_LENGTH = 16
const SAMPLE_INTERVAL = 30
const velocityHistory: Record<string, number[]> = {}
const distanceHistory: Record<string, number[]> = {}
let _lastPlanetId = ''
let _sampleCounter = 0

function pushHistory(buf: Record<string, number[]>, planetId: string, value: number): number[] {
  if (!buf[planetId]) buf[planetId] = []
  const arr = buf[planetId]!
  arr.push(value)
  if (arr.length > SPARKLINE_LENGTH) arr.shift()
  return arr
}

function toSparkline(values: number[]): string {
  if (values.length < 2) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min
  const mean = (max + min) / 2
  const effectiveRange = Math.max(range, mean * 0.05) || 1
  const center = mean
  const scaled = values.map(v =>
    Math.round(Math.min(100, Math.max(0, ((v - center) / effectiveRange + 0.5) * 100))),
  )
  return `{l:${scaled.join(',')}}`
}

/** Clear all sparkline history buffers. Call on planet/scene switch. */
export function resetTelemetryHistory(): void {
  for (const key of Object.keys(velocityHistory)) delete velocityHistory[key]
  for (const key of Object.keys(distanceHistory)) delete distanceHistory[key]
  _lastPlanetId = ''
}

/**
 * Compute real-world telemetry from orbital state.
 *
 * @param planetId - Planet identifier, e.g. "earth"
 * @param orbit - Keplerian orbital elements (radians)
 * @param simTime - Current simulation time
 * @returns Telemetry data with 13 fields
 */
export function computeTelemetry(
  planetId: string,
  orbit: OrbitalElements,
  simTime: number,
): TelemetryData {
  const M = meanAnomaly(orbit.period, simTime, orbit.epoch ?? 0)
  const E = solveKeplerEquation(M, orbit.eccentricity)
  const nu = trueAnomalyFromEccentric(E, orbit.eccentricity)

  const realAU = REAL_AU[planetId] ?? 1.0
  const sceneR = keplerRadius(orbit.semiMajorAxis, orbit.eccentricity, nu)
  const sceneA = orbit.semiMajorAxis
  const currentAU = (sceneR / sceneA) * realAU

  const realPeriod = REAL_PERIOD_DAYS[planetId] ?? orbit.period
  const GM = (4 * Math.PI * Math.PI * realAU * realAU * realAU) / (realPeriod * realPeriod)
  const vAuPerDay = Math.sqrt(GM * (2 / currentAU - 1 / realAU))
  const AU_TO_KM = 149597870.7
  const SECONDS_PER_DAY = 86400
  const vKmS = vAuPerDay * AU_TO_KM / SECONDS_PER_DAY

  const lightTravelMin = currentAU / SPEED_OF_LIGHT_AU_PER_MIN

  const rotHours = REAL_ROTATION_HOURS[planetId] ?? 24
  const rotPeriodDays = Math.abs(rotHours) / 24
  const retrograde = rotHours < 0
  const rotAngle = (simTime / rotPeriodDays) * TWO_PI
  const solarAngle = retrograde ? -rotAngle - nu : rotAngle - nu
  const normalizedAngle = ((solarAngle % TWO_PI) + TWO_PI) % TWO_PI
  const solarHours = (normalizedAngle / TWO_PI) * 24
  const h = Math.floor(solarHours)
  const m = Math.floor((solarHours - h) * 60)
  const s = Math.floor(((solarHours - h) * 60 - m) * 60)
  const localSolarTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`

  const phaseAngleDeg = ((nu * DEG) % 360 + 360) % 360
  const meanAnomalyDeg = (((M % TWO_PI) + TWO_PI) % TWO_PI) * DEG
  const orbitPercent = Math.round((meanAnomalyDeg / 360) * 100)
  const orbitProgressPie = `{p:${orbitPercent}}`

  if (planetId !== _lastPlanetId) {
    delete velocityHistory[planetId]
    delete distanceHistory[planetId]
    _lastPlanetId = planetId
    _sampleCounter = 0
  }

  _sampleCounter++
  if (_sampleCounter >= SAMPLE_INTERVAL) {
    _sampleCounter = 0
    pushHistory(velocityHistory, planetId, vKmS)
    pushHistory(distanceHistory, planetId, currentAU)
  }

  const velHist = velocityHistory[planetId] ?? []
  const distHist = distanceHistory[planetId] ?? []
  const velocitySparkline = toSparkline(velHist)
  const distanceSparkline = toSparkline(distHist)

  return {
    massEarths: REAL_MASS_EARTH[planetId] ?? 1.0,
    radiusKm: REAL_RADIUS_KM[planetId] ?? 6371,
    solarDistanceAU: currentAU,
    orbitalVelocityKmS: vKmS,
    trueAnomalyDeg: ((nu * DEG) % 360 + 360) % 360,
    meanAnomalyDeg,
    localSolarTime,
    lightTravelMin,
    orbitalPeriodDays: realPeriod,
    phaseAngleDeg,
    orbitProgressPie,
    velocitySparkline,
    distanceSparkline,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd D:/Developer/asteroids && bun test:unit src/lib/planets/__tests__/telemetry.spec.ts`
Expected: All 11 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/planets/telemetry.ts src/lib/planets/__tests__/telemetry.spec.ts
git commit -m "feat(planets): add real-world telemetry computation with tests"
```

---

### Task 7: Create orbit re-export module

**Files:**
- Create: `src/lib/planets/orbit.ts`

Thin public API surface — re-exports the essential orbital mechanics functions and types.

- [ ] **Step 1: Write `orbit.ts`**

Create `src/lib/planets/orbit.ts`:

```ts
/**
 * Orbital mechanics public API.
 *
 * Re-exports the essential types and functions from kepler.ts
 * for convenient consumption by the view layer.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-planetarium-data-layer-design.md
 */
export type { Vec3, OrbitalElements } from './types'
export { orbitalPosition3D, orbitPathPoints } from './kepler'
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/planets/orbit.ts
git commit -m "feat(planets): add orbit public API re-export module"
```

---

### Task 8: Run full test suite and lint

**Files:** None (verification only)

- [ ] **Step 1: Run all planet tests**

Run: `cd D:/Developer/asteroids && bun test:unit src/lib/planets/`
Expected: All tests pass (kepler: 28, catalog: 16, telemetry: 11 = 55 total)

- [ ] **Step 2: Run lint**

Run: `cd D:/Developer/asteroids && bun lint`
Expected: No errors. Warnings for missing TSDoc are acceptable only on internal (non-exported) functions.

- [ ] **Step 3: Run type-check**

Run: `cd D:/Developer/asteroids && bun run type-check`
Expected: No type errors.

- [ ] **Step 4: Fix any issues found in steps 1-3, then commit**

Only commit if fixes were needed:
```bash
git add -A
git commit -m "fix(planets): address lint and type-check issues"
```
