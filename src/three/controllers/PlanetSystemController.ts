/**
 * Controls a single planet system: the planet mesh, its moons, ring,
 * and orbit lines. Updates Keplerian positions each frame.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-map-view-design.md
 */
import * as THREE from 'three'
import type { Planet, OrbitalElements } from '@/lib/planets/types'
import type { GravitySource } from '@/lib/physics/gravity'
import { orbitalPosition3D, orbitPathPoints } from '@/lib/planets/orbit'
import {
  ORBIT_SCALE,
  SIZE_SCALE,
  ROTATION_SPEED_DIVISOR,
  MOON_ORBIT_SPEED_DIVISOR,
  ORBIT_PATH_SEGMENTS,
} from '@/lib/planets/constants'
import {
  PLANET_INDICATOR_APPARENT_SIZE,
  PLANET_INDICATOR_FADE_SCREEN_FRACTION,
} from '@/lib/map/mapViewControllerConfig'
import { createPlanetMesh, type PlanetMeshResult } from '@/three/meshes/createPlanetMesh'
import { createMoonMesh, type MoonMeshResult } from '@/three/meshes/createMoonMesh'
import { createRingMesh } from '@/three/meshes/createRingMesh'
import { createOrbitLine, MOON_ORBIT_OPACITY } from '@/three/meshes/createOrbitLine'
import { fixMaterials, loadGLB } from '@/three/loadGLB'

/** Simulation time to shader time divisor. */
const SHADER_TIME_DIVISOR = 365.25

/** Canvas width for the indicator sprite texture. */
const INDICATOR_CANVAS_WIDTH = 256

/** Canvas height for the indicator sprite texture. */
const INDICATOR_CANVAS_HEIGHT = 64

/** Radius of the indicator dot in canvas pixels. */
const INDICATOR_DOT_RADIUS = 8

/** Font size for the indicator label in canvas pixels. */
const INDICATOR_FONT_SIZE = 20

/** Font family for the indicator label — matches the site's UI font. */
const INDICATOR_FONT_FAMILY = "'Datatype', ui-monospace, monospace"

/** Left padding so the dot glow is not clipped by the canvas edge. */
const INDICATOR_LEFT_PAD = 14

/** Horizontal padding between dot and label text. */
const INDICATOR_TEXT_OFFSET_X = INDICATOR_LEFT_PAD + INDICATOR_DOT_RADIUS * 2 + 8

/** Fade-out band width as a fraction of the fade threshold. */
const INDICATOR_FADE_BAND = 0.5

/** Fallback dimension used to avoid divide-by-zero while scaling model-only bodies. */
const MODEL_SCALE_FALLBACK_SIZE = 1

/**
 * Draw a planet indicator sprite: colored dot + name label.
 *
 * @param name - Planet display name
 * @param accentColor - CSS color string for the dot and text
 * @returns Canvas texture and sprite material
 */
function createIndicatorSprite(
  name: string,
  accentColor: string,
): {
  sprite: THREE.Sprite
  texture: THREE.CanvasTexture
} {
  const canvas = document.createElement('canvas')
  canvas.width = INDICATOR_CANVAS_WIDTH
  canvas.height = INDICATOR_CANVAS_HEIGHT
  const ctx = canvas.getContext('2d')!

  const cy = INDICATOR_CANVAS_HEIGHT / 2
  const dotCx = INDICATOR_LEFT_PAD + INDICATOR_DOT_RADIUS

  // Dot
  ctx.beginPath()
  ctx.arc(dotCx, cy, INDICATOR_DOT_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = accentColor
  ctx.fill()

  // Glow around dot
  ctx.beginPath()
  ctx.arc(dotCx, cy, INDICATOR_DOT_RADIUS + 3, 0, Math.PI * 2)
  ctx.strokeStyle = accentColor
  ctx.globalAlpha = 0.35
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.globalAlpha = 1.0

  // Label text
  ctx.font = `bold ${INDICATOR_FONT_SIZE}px ${INDICATOR_FONT_FAMILY}`
  ctx.fillStyle = accentColor
  ctx.textBaseline = 'middle'
  ctx.fillText(name.toUpperCase(), INDICATOR_TEXT_OFFSET_X, cy)

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })

  const sprite = new THREE.Sprite(material)
  // Aspect ratio: wider than tall
  const aspect = INDICATOR_CANVAS_WIDTH / INDICATOR_CANVAS_HEIGHT
  sprite.scale.set(aspect, 1, 1)
  // Left-align: anchor at the left edge so the sprite extends rightward from the planet
  sprite.center.set(0, 0.5)
  sprite.visible = false

  return { sprite, texture }
}

/**
 * Moon orbit semi-major axis scale factor.
 * Formula: (semiMajorAxis × SIZE_SCALE) / MOON_ORBIT_SCALE_DIVISOR = world-space orbit radius.
 * Must be small enough that the innermost moon of each gas giant clears its parent's mesh.
 * Binding constraint: Saturn Mimas (semiMajorAxis=14, Saturn r≈5.8): D < 192.
 * At D=150 all moons orbit between 1.3–3× their parent's display radius.
 */
const MOON_ORBIT_SCALE_DIVISOR = 150

/** Internal moon tracking. */
interface MoonEntry {
  meshResult: MoonMeshResult
  orbit: OrbitalElements
}

/**
 * Manages a planet, its moons, optional ring, and orbit lines.
 */
export class PlanetSystemController implements GravitySource {
  /** The moving group (planet + moons + ring). */
  readonly group: THREE.Group

  /** Mass in solar masses (M☉). */
  readonly mass: number

  /**
   * Heliocentric orbit ring for this body (world space). Added to the scene root —
   * see {@link MapPlanetariumScene}. Moon rings live under {@link group}.
   */
  readonly orbitLines: THREE.LineLoop[]

  /** Satellite orbit rings parented to {@link group}; toggled with planet ring via {@link setOrbitLinesVisible}. */
  private readonly moonOrbitLines: THREE.LineLoop[] = []

  private readonly planetMesh: PlanetMeshResult
  private readonly planet: Planet
  private readonly scaledOrbit: OrbitalElements
  private readonly moonEntries: MoonEntry[] = []
  private readonly ringUniforms: Record<string, THREE.IUniform> | null = null
  private readonly indicatorSprite: THREE.Sprite
  private readonly indicatorTexture: THREE.CanvasTexture

  /**
   * @param planet - Planet definition from the catalog
   * @param initialPhase - Optional starting position as fraction of orbit (0-1).
   *   0 = periapsis, 0.5 = opposite side. If omitted, randomized.
   */
  constructor(planet: Planet, initialPhase?: number) {
    this.planet = planet
    this.mass = planet.mass
    this.group = new THREE.Group()
    this.orbitLines = []

    // Planet mesh
    this.planetMesh = createPlanetMesh(planet)
    this.group.add(this.planetMesh.mesh)
    if (planet.modelUrl) {
      void this.loadModelMesh(planet)
    }

    // Scale orbit for scene
    const phase = initialPhase ?? Math.random()
    const epoch = -phase * planet.orbit.period
    this.scaledOrbit = {
      ...planet.orbit,
      semiMajorAxis: planet.orbit.semiMajorAxis * ORBIT_SCALE,
      epoch,
    }

    // Planet orbit line
    const planetOrbitLine = createOrbitLine(this.scaledOrbit)
    this.orbitLines.push(planetOrbitLine)

    // Ring (attached to planet mesh so it tilts with axial tilt)
    if (planet.ring) {
      const ringMesh = createRingMesh(planet.ring, planet.displayRadius)
      this.planetMesh.mesh.add(ringMesh)
      this.ringUniforms = (ringMesh.material as THREE.ShaderMaterial).uniforms
    }

    // Moons
    for (const moon of planet.moons) {
      const meshResult = createMoonMesh(moon)
      this.group.add(meshResult.mesh)

      const moonEpoch = -Math.random() * moon.orbit.period
      const scaledMoonOrbit: OrbitalElements = {
        ...moon.orbit,
        semiMajorAxis: (moon.orbit.semiMajorAxis * SIZE_SCALE) / MOON_ORBIT_SCALE_DIVISOR,
        epoch: moonEpoch,
      }

      // Moon orbit line (relative to planet group)
      const moonOrbitLine = createOrbitLine(scaledMoonOrbit, MOON_ORBIT_OPACITY)
      this.group.add(moonOrbitLine)
      this.moonOrbitLines.push(moonOrbitLine)

      this.moonEntries.push({ meshResult, orbit: scaledMoonOrbit })
    }

    // Indicator sprite (dot + label, fades in when zoomed out)
    const indicator = createIndicatorSprite(planet.name, planet.accentColor)
    this.indicatorSprite = indicator.sprite
    this.indicatorTexture = indicator.texture
    this.group.add(this.indicatorSprite)

    // Set initial position
    const initialPos = orbitalPosition3D(this.scaledOrbit, 0)
    this.group.position.set(initialPos.x, initialPos.z, initialPos.y)
  }

  getWorldX(): number {
    return this.group.position.x
  }

  getWorldY(): number {
    return this.group.position.y
  }

  getWorldZ(): number {
    return this.group.position.z
  }

  /**
   * Predict the planet's world XZ position at a future `simTime` on its orbital path.
   * Used by missions that want to place a waypoint where the planet *will* be a few
   * seconds from now so the POI doesn't drift away as the player flies out to it.
   *
   * @param simTime - Simulation time (same clock used by {@link tick}).
   * @returns `{ x, z }` world-space coords on the Y=0 orbital plane.
   */
  predictWorldPosXZ(simTime: number): { x: number; z: number } {
    const pos = orbitalPosition3D(this.scaledOrbit, simTime)
    return { x: pos.x, z: pos.y }
  }

  /**
   * Returns the sampled orbit ellipse as XZ world-space points.
   * Used by orbital surfing to check proximity and build manifold splines.
   */
  getOrbitPointsXZ(): { x: number; z: number }[] {
    const rawPoints = orbitPathPoints(this.scaledOrbit, ORBIT_PATH_SEGMENTS)
    return rawPoints.map((p) => ({ x: p.x, z: p.y }))
  }

  /** The planet's catalog id. */
  get id(): string {
    return this.planet.id
  }

  /** The planet's display name from the catalog. */
  get name(): string {
    return this.planet.name
  }

  /** The planet's accent color from the catalog. */
  get accentColor(): string {
    return this.planet.accentColor
  }

  /**
   * Compute the world-space position of a moon by its index in the planet's moon array.
   *
   * @param moonIndex - Index into the planet definition's `moons` array
   * @param target - Vector3 to write into (avoids allocation per frame)
   * @returns The target vector, or null if the index is out of range
   *
   * @author guinetik
   * @date 2026-04-09
   */
  getMoonWorldPosition(moonIndex: number, target: THREE.Vector3): THREE.Vector3 | null {
    const entry = this.moonEntries[moonIndex]
    if (!entry) return null
    entry.meshResult.mesh.getWorldPosition(target)
    return target
  }

  /**
   * Directly set indicator sprite visibility (used to hide during map overlay).
   *
   * @param visible - Whether the indicator should be shown
   */
  setIndicatorVisible(visible: boolean): void {
    this.indicatorSprite.visible = visible
  }

  /**
   * Shows or hides heliocentric and moon orbit rings together (map "Orbits" toggle).
   *
   * @param visible - Whether orbit line meshes should render.
   */
  setOrbitLinesVisible(visible: boolean): void {
    for (const line of this.orbitLines) {
      line.visible = visible
    }
    for (const line of this.moonOrbitLines) {
      line.visible = visible
    }
  }

  tick(dt: number, simTime: number, camera?: THREE.PerspectiveCamera, labelsVisible = true): void {
    const shaderTime = simTime / SHADER_TIME_DIVISOR

    // Orbital position
    const pos = orbitalPosition3D(this.scaledOrbit, simTime)
    this.group.position.set(pos.x, pos.z, pos.y)

    // Self-rotation
    this.planetMesh.mesh.rotation.y = (simTime * this.planet.rotationSpeed) / ROTATION_SPEED_DIVISOR

    // Shader time
    if (this.planetMesh.uniforms.uTime) {
      this.planetMesh.uniforms.uTime.value = shaderTime
    }

    // Ring shader time
    if (this.ringUniforms?.uTime) {
      this.ringUniforms.uTime.value = shaderTime
    }

    // Moons
    for (const moon of this.moonEntries) {
      const moonPos = orbitalPosition3D(moon.orbit, simTime / MOON_ORBIT_SPEED_DIVISOR)
      moon.meshResult.mesh.position.set(moonPos.x, moonPos.z, moonPos.y)
      moon.meshResult.mesh.rotation.y = (simTime * 0.15) / ROTATION_SPEED_DIVISOR

      if (moon.meshResult.uniforms.uTime) {
        moon.meshResult.uniforms.uTime.value = shaderTime
      }
    }

    // Indicator sprite — fade in when planet is too small on screen
    if (!labelsVisible) {
      this.indicatorSprite.visible = false
    } else if (camera) {
      const dist = camera.position.distanceTo(this.group.position)
      const halfFovRad = (camera.fov * Math.PI) / 360
      const planetWorldSize = this.planet.displayRadius * SIZE_SCALE * 2
      const apparentFraction = planetWorldSize / (dist * 2 * Math.tan(halfFovRad))

      const fadeThreshold = PLANET_INDICATOR_FADE_SCREEN_FRACTION
      const fadeEnd = fadeThreshold * (1 - INDICATOR_FADE_BAND)

      if (apparentFraction < fadeThreshold) {
        // Hermite fade: 1 at fadeEnd, 0 at fadeThreshold
        const t = Math.min(
          1,
          Math.max(0, (fadeThreshold - apparentFraction) / (fadeThreshold - fadeEnd)),
        )
        const alpha = t * t * (3 - 2 * t)

        this.indicatorSprite.visible = true
        ;(this.indicatorSprite.material as THREE.SpriteMaterial).opacity = alpha

        // Constant screen-size scaling
        const worldScale = PLANET_INDICATOR_APPARENT_SIZE * 2 * dist * Math.tan(halfFovRad)
        const aspect = INDICATOR_CANVAS_WIDTH / INDICATOR_CANVAS_HEIGHT
        this.indicatorSprite.scale.set(worldScale * aspect, worldScale, 1)
      } else {
        this.indicatorSprite.visible = false
      }
    }
  }

  /**
   * Replace the procedural placeholder with the authored GLB model for model-backed bodies.
   *
   * @param planet - Body definition with a {@link Planet.modelUrl}.
   */
  private async loadModelMesh(planet: Planet): Promise<void> {
    if (!planet.modelUrl) return
    try {
      const model = await loadGLB(planet.modelUrl)
      fixMaterials(model)
      const box = new THREE.Box3().setFromObject(model)
      const size = box.getSize(new THREE.Vector3())
      const maxSize = Math.max(size.x, size.y, size.z, MODEL_SCALE_FALLBACK_SIZE)
      const targetDiameter = planet.displayRadius * SIZE_SCALE * 2
      model.scale.setScalar(targetDiameter / maxSize)
      const center = box.getCenter(new THREE.Vector3())
      model.position.set(
        -center.x * model.scale.x,
        -center.y * model.scale.y,
        -center.z * model.scale.z,
      )
      model.rotation.order = 'ZYX'
      model.rotation.z = planet.axialTilt
      this.group.remove(this.planetMesh.mesh)
      this.group.add(model)
      this.planetMesh.mesh = model
    } catch (error) {
      console.warn(`[PlanetSystemController] Failed to load model for ${planet.id}`, error)
    }
  }

  dispose(): void {
    this.indicatorTexture.dispose()
    ;(this.indicatorSprite.material as THREE.SpriteMaterial).dispose()
    this.planetMesh.dispose()
    const disposeMesh = (obj: THREE.Object3D) => {
      obj.traverse((child) => {
        if ('geometry' in child) {
          ;(child as THREE.Mesh).geometry?.dispose()
        }
        if ('material' in child) {
          const mat = (child as THREE.Mesh).material
          if (Array.isArray(mat)) {
            mat.forEach((m) => m.dispose())
          } else if (mat) {
            ;(mat as THREE.Material).dispose()
          }
        }
      })
    }
    disposeMesh(this.group)
    for (const line of this.orbitLines) {
      line.geometry.dispose()
      ;(line.material as THREE.Material).dispose()
    }
  }
}
