# Planetarium Data Layer Design

> Port the pure math, data model, and system rules from the `planets` project into
> `asteroids/src/lib/planets/` — foundational layer for the map screen.

**Source:** `D:/Developer/planets/src/lib/` + `D:/Developer/planets/public/planetarium.json`
**Date:** 2026-04-04

---

## 1. Goal

Bring the entire planetarium system (Sun, 10 planets, 30+ moons, 2 asteroid belts,
Keplerian orbital mechanics, real-world telemetry) into the asteroids project as a
pure TypeScript data/math layer with zero view-layer dependencies. When the Three.js
map screen is built later, it will consume this layer directly.

### What ships

- Full solar system data (sans prose text) as a single JSON file
- Keplerian orbital mechanics (6 functions, all pure math)
- Real-world telemetry computation (mass, radius, velocity, distance, solar time)
- Type-safe catalog with build-time validation

### What does NOT ship

- `projection.ts`, `obstacles.ts` — screen-space text layout, view-layer concern
- Prose text arrays on planets
- `useModel` flag — everything will be procedural
- View-layer constants (bloom, typography, mobile breakpoints, camera, tone mapping)
- Any Three.js or Vue dependencies

---

## 2. Module Structure

```
src/lib/planets/
  types.ts          — All interfaces
  catalog.ts        — Static import, deg-to-rad conversion, exports
  kepler.ts         — Pure orbital mechanics (6 functions)
  telemetry.ts      — Real-world physics computation
  orbit.ts          — Public API re-export
  constants.ts      — Simulation/orbital constants only
  __tests__/
    kepler.spec.ts
    catalog.spec.ts
    telemetry.spec.ts

src/data/planets/
  planetarium.json  — Full system data, angles in degrees
```

---

## 3. Type Definitions (`types.ts`)

All types use `readonly` properties. Ported from `planets/src/lib/planets.ts` and
`planets/src/lib/kepler.ts`.

### OrbitalElements

```ts
interface OrbitalElements {
  readonly semiMajorAxis: number   // scene units (planets) or relative to parent (moons)
  readonly eccentricity: number    // 0 = circular, 0..1 = elliptical
  readonly inclination: number     // radians — tilt from ecliptic
  readonly longitudeOfAscendingNode: number  // radians
  readonly argumentOfPeriapsis: number       // radians
  readonly period: number          // Earth days
  readonly epoch?: number          // optional time offset
}
```

### Vec3

```ts
interface Vec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}
```

### ShaderConfig

Retained for procedural rendering. Tells the view layer which shader program and
uniforms to use.

```ts
type ShaderType = 'star' | 'rockyPlanet' | 'gasGiant'

interface ShaderConfig {
  readonly type: ShaderType
  readonly uniforms: Record<string, number | number[]>
}
```

### RingConfig

```ts
interface RingConfig {
  readonly innerRadius: number   // multiplier of planet display radius
  readonly outerRadius: number
  readonly opacity: number
  readonly color: readonly number[]  // [r, g, b] 0..1
}
```

### Moon

```ts
interface Moon {
  readonly name: string
  readonly orbit: OrbitalElements
  readonly displayRadius: number
  readonly shader: ShaderConfig
  readonly rotationSpeed: number
}
```

### Planet

No `prose` field. No `useModel` field.

```ts
type PlanetType = 'Terrestrial' | 'Gas Giant' | 'Ice Giant' | 'Dwarf Planet'

interface Planet {
  readonly id: string
  readonly name: string
  readonly order: number
  readonly type: PlanetType
  readonly accentColor: string       // hex color string
  readonly orbit: OrbitalElements
  readonly displayRadius: number
  readonly shader: ShaderConfig
  readonly ring?: RingConfig
  readonly moons: readonly Moon[]
  readonly rotationSpeed: number
  readonly axialTilt: number         // radians
}
```

### SunData

```ts
interface SunData {
  readonly name: string
  readonly displayRadius: number
  readonly shader: ShaderConfig
  readonly rotationSpeed: number
}
```

### AsteroidBelt & KirkwoodGap

```ts
interface KirkwoodGap {
  readonly position: number   // 0..1 normalized position within belt
  readonly width: number      // 0..1 normalized width
}

interface AsteroidBelt {
  readonly id: string
  readonly name: string
  readonly orbit: OrbitalElements
  readonly innerRadius: number
  readonly outerRadius: number
  readonly maxParticles: number
  readonly thickness: number
  readonly orbitalSpeed: number
  readonly tumbleSpeed: number
  readonly sizeRange: readonly [number, number]
  readonly sizeExponent: number
  readonly kirkwoodGaps: readonly KirkwoodGap[]
  readonly emissiveColor?: readonly [number, number, number]
}
```

Note: `glbFile` from the source AsteroidBelt type is dropped (no GLB assets).

---

## 4. Data File (`src/data/planets/planetarium.json`)

Single JSON file containing the full solar system. Copied from
`planets/public/planetarium.json` with these changes:

- All `prose` arrays removed from every planet entry
- All `useModel` fields removed
- All `glbFile` fields removed from asteroid belts
- Orbital angles remain in **degrees** in the JSON (converted to radians at load time
  by catalog.ts, same as the source project)

Structure:

```json
{
  "sun": { ... },
  "planets": [ ... ],
  "asteroidBelts": [ ... ]
}
```

### Bodies included

| Order | ID       | Type          | Moons                                                       | Ring |
|-------|----------|---------------|--------------------------------------------------------------|------|
| —     | sun      | Star          | —                                                            | —    |
| 1     | mercury  | Terrestrial   | —                                                            | —    |
| 2     | venus    | Terrestrial   | —                                                            | —    |
| 3     | earth    | Terrestrial   | Moon                                                         | —    |
| 4     | mars     | Terrestrial   | Phobos, Deimos                                               | —    |
| 5     | ceres    | Dwarf Planet  | —                                                            | —    |
| 6     | jupiter  | Gas Giant     | Io, Europa, Ganymede, Callisto                               | —    |
| 7     | saturn   | Gas Giant     | Mimas, Enceladus, Tethys, Dione, Rhea, Titan, Iapetus       | yes  |
| 8     | uranus   | Ice Giant     | Miranda, Ariel, Umbriel, Titania, Oberon                    | yes  |
| 9     | neptune  | Ice Giant     | Triton                                                       | —    |
| 10    | pluto    | Dwarf Planet  | Charon                                                       | —    |

Asteroid belts: Main Belt, Kuiper Belt.

---

## 5. Catalog Module (`catalog.ts`)

### Loading strategy

Vite static import — the JSON is bundled at build time, no async fetch.

```ts
import rawData from '@/data/planets/planetarium.json'
```

### Degree-to-radian conversion

The JSON stores orbital angles in degrees for human readability. The catalog
converts them to radians on module evaluation:

- `inclination`
- `longitudeOfAscendingNode`
- `argumentOfPeriapsis`
- `axialTilt` (on planets only)

Conversion constant: `DEG = Math.PI / 180`

### Exports

| Export            | Type                    | Description                    |
|-------------------|-------------------------|--------------------------------|
| `SUN`             | `SunData`               | Solar data                     |
| `PLANETS`         | `readonly Planet[]`     | All 10 planets, ordered        |
| `PLANET_IDS`      | `string[]`              | `['mercury', ..., 'pluto']`    |
| `ASTEROID_BELTS`  | `readonly AsteroidBelt[]` | Main Belt + Kuiper Belt      |
| `getPlanet(id)`   | `(string) => Planet`    | Lookup by id, throws if missing|

### Validation

On module load, assert that every planet has a unique `id` and `order`. No
composition-sum validation like the asteroids catalog (not applicable here).

---

## 6. Keplerian Orbital Mechanics (`kepler.ts`)

Direct port from `planets/src/lib/kepler.ts`. All 6 functions are pure math with
zero dependencies. No changes needed.

### Functions

| Function                    | Signature                                             | Purpose                                    |
|-----------------------------|-------------------------------------------------------|--------------------------------------------|
| `solveKeplerEquation`       | `(M, e, tol?, maxIter?) => E`                         | Newton-Raphson solve M = E - e sin(E)      |
| `meanAnomaly`               | `(period, time, epoch?) => M`                         | Linear mean anomaly from time              |
| `trueAnomalyFromEccentric`  | `(E, e) => nu`                                        | Eccentric to true anomaly (half-angle)     |
| `keplerRadius`              | `(a, e, nu) => r`                                     | Orbital radius from conic equation         |
| `orbitalPosition3D`         | `(elements, time) => Vec3`                            | Full 3D heliocentric position pipeline     |
| `orbitPathPoints`           | `(elements, numSegments?) => Vec3[]`                  | Sample full ellipse (default 128 points)   |

### Algorithm notes

- `solveKeplerEquation`: Initial guess E = M, Newton-Raphson with
  dE = (E - e sin(E) - M) / (1 - e cos(E)). Converges for e in [0, 0.9].
- `orbitalPosition3D`: Computes M -> E -> nu -> r -> (x_orb, y_orb) -> 3D rotation
  via three Euler angles (Omega, i, omega).
- `orbitPathPoints`: Uniform sampling in mean anomaly space.

---

## 7. Telemetry Module (`telemetry.ts`)

Direct port from `planets/src/lib/telemetry.ts`. Computes real-world physical data
from Keplerian state + simulation time. No Three.js dependencies.

### Real-world data tables

Hardcoded lookup tables for all 9 planets + Pluto:

- `REAL_AU` — semi-major axes in AU
- `REAL_PERIOD_DAYS` — orbital periods in Earth days
- `REAL_ROTATION_HOURS` — sidereal rotation periods (negative = retrograde)
- `REAL_MASS_EARTH` — mass in Earth masses
- `REAL_RADIUS_KM` — equatorial radius in km
- `SPEED_OF_LIGHT_AU_PER_MIN = 0.002004`

### `computeTelemetry(planetId, orbit, simTime) => TelemetryData`

Returns 13 fields:

| Field               | Unit/Format    | Source                                  |
|---------------------|----------------|-----------------------------------------|
| `massEarths`        | Earth masses   | lookup table                            |
| `radiusKm`          | km             | lookup table                            |
| `solarDistanceAU`   | AU             | Kepler radius scaled to real AU         |
| `orbitalVelocityKmS`| km/s          | vis-viva equation                       |
| `trueAnomalyDeg`    | degrees        | current true anomaly                    |
| `meanAnomalyDeg`    | degrees        | current mean anomaly                    |
| `localSolarTime`    | HH:MM:SS       | rotation + orbital position             |
| `lightTravelMin`    | minutes        | distance / speed of light               |
| `orbitalPeriodDays` | days           | lookup table                            |
| `phaseAngleDeg`     | degrees        | sun-planet-observer angle               |
| `orbitProgressPie`  | `{p:XX}`       | % through current orbit                 |
| `velocitySparkline` | `{l:v1,v2,...}`| 16-sample rolling buffer                |
| `distanceSparkline` | `{l:v1,v2,...}`| 16-sample rolling buffer                |

### `resetTelemetryHistory()`

Clears sparkline buffers. Call on planet/scene switch.

---

## 8. Constants (`constants.ts`)

Only simulation and orbital constants. View-layer constants (camera, bloom,
typography, mobile) are excluded — they belong to the future Three.js port.

### Included constants

| Constant                | Value   | Purpose                                   |
|-------------------------|---------|-------------------------------------------|
| `ORBIT_SCALE`           | `0.03`  | Scene units to Three.js world units       |
| `SIZE_SCALE`            | `50.0`  | Body display size multiplier              |
| `DEFAULT_TIME_SCALE`    | `5.0`   | Simulation speed multiplier               |
| `ROTATION_SPEED_DIVISOR`| `20.0`  | Dampens rotation animation                |
| `MOON_ORBIT_SPEED_DIVISOR`| `5.0` | Dampens moon orbital speed                |
| `ORBIT_PATH_SEGMENTS`   | `128`   | Points per orbit path                     |
| `SPHERE_SEGMENTS`       | `64`    | Planet geometry segments                  |
| `MOON_SPHERE_SEGMENTS`  | `32`    | Moon geometry segments                    |

### Excluded (deferred to view-layer port)

Camera, tone mapping, bloom, starfield, raycasting, typography, responsive
breakpoints, transition timings, orbit path colors/opacity, scene lighting.

---

## 9. Orbit Re-export (`orbit.ts`)

Thin public API surface — same as the source project:

```ts
export type { Vec3, OrbitalElements } from './kepler'
export { orbitalPosition3D, orbitPathPoints } from './kepler'
```

---

## 10. Tests

### `kepler.spec.ts`

Port all 46+ tests from `planets/src/lib/kepler.test.ts`. Covers:

- `solveKeplerEquation` across e in [0, 0.9] and M in [0, 2pi]
- `meanAnomaly` linear progression + epoch handling
- `trueAnomalyFromEccentric` half-angle formula endpoints
- `keplerRadius` periapsis/apoapsis/circular
- `orbitalPosition3D` ecliptic, circular, inclined, elliptical, epoch
- `orbitPathPoints` segment count, radius bounds, inclination

### `catalog.spec.ts`

- All 10 planets loaded with correct ids
- `getPlanet()` returns correct planet / throws on bad id
- Orbital angles are in radians (not degrees)
- Sun data loaded correctly
- Asteroid belts loaded (2 belts)
- No `prose` or `useModel` fields present

### `telemetry.spec.ts`

- `computeTelemetry` returns all 13 fields for a known planet
- Distance scales correctly relative to real AU
- Velocity via vis-viva produces reasonable km/s values
- `resetTelemetryHistory` clears sparkline buffers

---

## 11. Conventions

All files follow the asteroids project conventions:

- **TSDoc** on all exports with `@author guinetik`, `@date 2026-04-04`,
  `@spec docs/superpowers/specs/2026-04-04-planetarium-data-layer-design.md`
- **File headers** on all `src/lib/planets/` modules
- **No magic numbers** — all constants named in `constants.ts`
- **Readonly types** — all interface properties readonly
- **No semicolons**, single quotes, 2-space indent (Prettier)
- **Vitest** with co-located `__tests__/` directory
