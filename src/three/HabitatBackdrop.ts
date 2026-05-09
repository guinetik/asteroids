/**
 * Backdrop celestial bodies visible through the habitat canopy.
 *
 * Reuses the same procedural planet/sun shaders the solar map renders, parented to
 * fixed offsets outside the cylinder. The sun is always rendered (the player always
 * has a star to see); the orbited planet is added on the opposite side when the ship
 * is captured around one. Both meshes scale from real ship-to-body distance × an
 * artistic boost. The sun boost also falls off past Mercury reference distance so
 * Mars-class orbits read smaller than inner-planet disks instead of sharing one cap.
 * Out at Neptune-class distances the sun still resolves as a small bright disk (angular floor).
 * Gas giants in frame render visibly larger than rocky planets.
 *
 * Lighting trick: the rocky/gas-giant fragment shaders bake "sun at world origin"
 * into their lighting math. Placing the sun mesh on the **opposite** side of origin
 * from the planet means the planet's lit hemisphere lines up with where the sun
 * actually appears — no shader modification needed.
 *
 * @author guinetik
 * @date 2026-05-08
 * @spec docs/superpowers/specs/2026-04-06-habitat-interior-design.md
 */
import * as THREE from 'three'
import type { Planet, SunData } from '@/lib/planets/types'
import { ORBIT_SCALE, SIZE_SCALE, ROTATION_SPEED_DIVISOR } from '@/lib/planets/constants'
import {
  computeSunDistanceWeightedAngularBoost,
  computeSunYOffsetForDeckHorizon,
  HABITAT_BACKDROP_DEFAULT_FOOTPRINT,
  HABITAT_BACKDROP_SUN_ALIGNMENT_EYE_HEIGHT,
  HABITAT_BACKDROP_SUN_ALIGNMENT_EYE_XZ,
  HABITAT_BACKDROP_SUN_EXTRA_UP_BIAS_WORLD_UNITS,
} from '@/lib/habitat/habitatBackdropSunHorizon'
import { createPlanetMesh, type PlanetMeshResult } from '@/three/meshes/createPlanetMesh'
import { createSunMesh, type SunMeshResult } from '@/three/meshes/createSunMesh'

/** Scene-space distance from cabin centre at which both backdrop bodies sit. */
const PLACEMENT_DISTANCE = 90
/**
 * Direction vector from cabin centre to the planet body, normalised. Framing note: the
 * sun sits on the opposite vector, so **larger +X here moves the sun toward world −X**
 * (not +X). If the disk reads too far screen-right / +X, increase
 * {@link BACKDROP_PLANET_DIR_X}; decreasing it shifts the sun the other way.
 *
 * Mounting the sun opposite the planet keeps the cabin centre on the sun–planet line so
 * planet shaders stay consistent with “sun at origin” lighting.
 */
const BACKDROP_PLANET_DIR_X = 0.88
const BACKDROP_PLANET_DIR_Y = 0.4
const BACKDROP_PLANET_DIR_Z = 0.36
const PLANET_DIRECTION = new THREE.Vector3(
  BACKDROP_PLANET_DIR_X,
  BACKDROP_PLANET_DIR_Y,
  BACKDROP_PLANET_DIR_Z,
).normalize()
/** Direction from cabin centre to the sun mesh — antiparallel to {@link PLANET_DIRECTION}. */
const SUN_DIRECTION = PLANET_DIRECTION.clone().multiplyScalar(-1)

/**
 * Multiplier applied to the planet's true angular diameter at ship distance. The
 * orrery places the camera close to bodies at orbit radius, so the *real* angular
 * size already feels reasonable; the boost gives an extra dramatic-cabin-window feel.
 */
const PLANET_ANGULAR_BOOST = 6
/**
 * Multiplier applied to the sun's true angular diameter. Higher than the planet
 * boost because at outer planets the sun's real angular size is tiny — without a
 * boost it would render as a faint dot at Saturn / Neptune.
 */
const SUN_ANGULAR_BOOST = 3
/** Hard cap on sun angular diameter (rad) — keeps the inner-planet sun from filling the canopy. */
const SUN_MAX_ANGULAR_DIAMETER = (80 * Math.PI) / 180
/** Hard cap on planet angular diameter (rad) — gas giants can read large but not engulf the canopy. */
const PLANET_MAX_ANGULAR_DIAMETER = (60 * Math.PI) / 180
/** Floor on angular diameter (rad) so distant bodies stay a recognisable disk. */
const MIN_ANGULAR_DIAMETER = (1.5 * Math.PI) / 180

/**
 * Snapshot describing what the habitat backdrop should currently render. Captured at
 * habitat-entry time; gameplay is paused inside the cabin so this never changes
 * mid-stay.
 */
export interface HabitatBackdropContext {
  /** Sun catalog data — the sun is always rendered. */
  readonly sun: SunData
  /** World-space distance from ship to the sun (origin in the orrery). */
  readonly shipToSunDistance: number
  /**
   * Planet the ship is captured around, or `null` when drifting / parked at the sun.
   * Sun-as-orbit-target falls under `null` here — the sun already gets first-class
   * rendering as the always-on backdrop element.
   */
  readonly planet: Planet | null
  /** World-space distance from ship to the orbited planet; ignored when {@link planet} is null. */
  readonly shipToPlanetDistance: number
}

/**
 * Internal entry tracking one mounted body (sun or planet) and its self-rotation rate.
 */
interface MountedBody {
  /** Object added under {@link HabitatBackdrop.group}; removed during teardown. */
  readonly object: THREE.Object3D
  /** uTime + body uniforms ticked each frame. */
  readonly uniforms: Record<string, THREE.IUniform>
  /** Optional secondary uniform set (corona). */
  readonly secondaryUniforms?: Record<string, THREE.IUniform>
  /** Mesh whose Y rotation should advance for self-rotation. */
  readonly spinMesh: THREE.Object3D
  /** Catalog rotationSpeed value forwarded to the shared `simTime / divisor` formula. */
  readonly rotationSpeed: number
  /** Disposer for any owned textures created by the factory. */
  readonly dispose: () => void
}

/**
 * Maps catalog body radius and live ship-to-body distance to uniform mesh scale at
 * {@link PLACEMENT_DISTANCE}. Distance enters via `2 * atan(radius / shipDistance)` (true angular
 * diameter), then `boost` stretches that before clamping.
 *
 * - **Sun:** {@link shipDistance} is shuttle→sun (orrery XZ, i.e. heliocentric parking radius).
 *   Pass a distance-shaped boost from {@link computeSunDistanceWeightedAngularBoost}.
 * - **Orbited planet:** {@link shipDistance} is shuttle→planet; {@link boost} is a fixed constant
 *   (no extra distance curve on the multiplier today).
 *
 * @param bodyRadius - True visual radius of the body in scene units.
 * @param shipDistance - Ship-to-body distance for this body (sun vs planet — see above).
 * @param boost - Artistic multiplier applied to the true angular size (may already include sun-only distance shaping).
 * @param maxAngularDiameter - Ceiling on boosted angular diameter (radians).
 * @returns Uniform scale to assign to the mesh.
 */
function computeBackdropScale(
  bodyRadius: number,
  shipDistance: number,
  boost: number,
  maxAngularDiameter: number,
): number {
  if (bodyRadius <= 0 || shipDistance <= 0) return 1
  const trueAngular = 2 * Math.atan(bodyRadius / shipDistance)
  const boosted = THREE.MathUtils.clamp(
    trueAngular * boost,
    MIN_ANGULAR_DIAMETER,
    maxAngularDiameter,
  )
  const targetRadius = PLACEMENT_DISTANCE * Math.tan(boosted / 2)
  return targetRadius / bodyRadius
}

/**
 * Backdrop manager — owns at most one sun and at most one planet at a time.
 */
export class HabitatBackdrop {
  /** Root object — add to the habitat scene once. */
  readonly group = new THREE.Group()

  private sunBody: MountedBody | null = null
  private planetBody: MountedBody | null = null
  private simTime = 0

  /**
   * Construct an empty backdrop. Call {@link setContext} to mount bodies.
   */
  constructor() {
    this.group.name = 'habitatBackdrop'
  }

  /**
   * Mount sun + (optional) planet from a frozen snapshot of the docked state.
   * Replaces any previously mounted bodies. Resets simulation time so freshly
   * mounted bodies start from a clean rotation phase rather than skipping ahead.
   *
   * @param ctx - Snapshot computed at habitat-entry time.
   */
  setContext(ctx: HabitatBackdropContext): void {
    this.clear()
    this.simTime = 0
    this.mountSun(ctx.sun, ctx.shipToSunDistance)
    if (ctx.planet) {
      this.mountPlanet(ctx.planet, ctx.shipToPlanetDistance)
    }
  }

  /**
   * Tick shader uniforms and self-rotation by one frame. Safe to call when no body
   * is mounted (no-op).
   *
   * @param dt - Delta time in seconds since the last frame.
   */
  tick(dt: number): void {
    this.simTime += dt
    for (const body of [this.sunBody, this.planetBody]) {
      if (!body) continue
      const uTime = body.uniforms.uTime
      if (uTime) uTime.value = this.simTime
      const sUTime = body.secondaryUniforms?.uTime
      if (sUTime) sUTime.value = this.simTime
      body.spinMesh.rotation.y = (this.simTime * body.rotationSpeed) / ROTATION_SPEED_DIVISOR
    }
  }

  /**
   * Remove both bodies without disposing the backdrop itself.
   */
  clear(): void {
    this.unmount(this.sunBody)
    this.sunBody = null
    this.unmount(this.planetBody)
    this.planetBody = null
  }

  /**
   * Release GPU resources. Safe to call multiple times.
   */
  dispose(): void {
    this.clear()
  }

  private mountSun(sun: SunData, shipToSunDistance: number): void {
    const result = createSunMesh(sun)
    const baseRadius = sun.displayRadius * SIZE_SCALE
    const effectiveSunBoost = computeSunDistanceWeightedAngularBoost({
      shipToSunDistance,
      orbitScale: ORBIT_SCALE,
      baseAngularBoost: SUN_ANGULAR_BOOST,
    })
    const scale = computeBackdropScale(
      baseRadius,
      shipToSunDistance,
      effectiveSunBoost,
      SUN_MAX_ANGULAR_DIAMETER,
    )
    result.group.scale.setScalar(scale)
    result.group.position.copy(SUN_DIRECTION).multiplyScalar(PLACEMENT_DISTANCE)
    const horizonBias = computeSunYOffsetForDeckHorizon({
      sunPosition: result.group.position,
      referenceEye: {
        x: HABITAT_BACKDROP_SUN_ALIGNMENT_EYE_XZ.x,
        y: HABITAT_BACKDROP_SUN_ALIGNMENT_EYE_HEIGHT,
        z: HABITAT_BACKDROP_SUN_ALIGNMENT_EYE_XZ.z,
      },
      footprint: HABITAT_BACKDROP_DEFAULT_FOOTPRINT,
    })
    result.group.position.y += horizonBias + HABITAT_BACKDROP_SUN_EXTRA_UP_BIAS_WORLD_UNITS
    // The factory's bundled point light would wash the cabin out — we keep cabin
    // lighting from the original interior fixtures.
    result.light.intensity = 0
    this.group.add(result.group)
    this.sunBody = mountedFromSun(result)
  }

  private mountPlanet(planet: Planet, shipToPlanetDistance: number): void {
    const result = createPlanetMesh(planet)
    const baseRadius = planet.displayRadius * SIZE_SCALE
    const scale = computeBackdropScale(
      baseRadius,
      shipToPlanetDistance,
      PLANET_ANGULAR_BOOST,
      PLANET_MAX_ANGULAR_DIAMETER,
    )
    result.mesh.scale.setScalar(scale)
    result.mesh.position.copy(PLANET_DIRECTION).multiplyScalar(PLACEMENT_DISTANCE)
    this.group.add(result.mesh)
    this.planetBody = mountedFromPlanet(result, planet.rotationSpeed)
  }

  private unmount(body: MountedBody | null): void {
    if (!body) return
    this.group.remove(body.object)
    body.object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        const material = child.material as THREE.Material | THREE.Material[]
        if (Array.isArray(material)) {
          for (const m of material) m.dispose()
        } else {
          material.dispose()
        }
      }
    })
    body.dispose()
  }
}

/**
 * Wrap a {@link SunMeshResult} in the {@link MountedBody} shape used internally.
 *
 * @param result - Factory output for a sun.
 * @returns Mounted-body record ready to be tracked.
 */
function mountedFromSun(result: SunMeshResult): MountedBody {
  return {
    object: result.group,
    uniforms: result.uniforms,
    secondaryUniforms: result.coronaUniforms,
    spinMesh: result.mesh,
    rotationSpeed: (result.uniforms.uRotationSpeed?.value as number | undefined) ?? 0,
    dispose: () => {
      // Sun factory does not return a dispose callback — owned textures (none here)
      // would need future cleanup if the sun shader gains overlays.
    },
  }
}

/**
 * Wrap a {@link PlanetMeshResult} in the {@link MountedBody} shape used internally.
 *
 * @param result - Factory output for a planet.
 * @param rotationSpeed - Catalog `rotationSpeed` value used for self-spin.
 * @returns Mounted-body record ready to be tracked.
 */
function mountedFromPlanet(result: PlanetMeshResult, rotationSpeed: number): MountedBody {
  return {
    object: result.mesh,
    uniforms: result.uniforms,
    spinMesh: result.mesh,
    rotationSpeed,
    dispose: result.dispose,
  }
}
