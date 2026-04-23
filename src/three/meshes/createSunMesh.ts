/**
 * Creates the sun: a star-shader sphere, point light, and corona sprite.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-map-view-design.md
 */
import * as THREE from 'three'
import vertSrc from '@/three/shaders/sphere.vert.glsl?raw'
import commonSrc from '@/three/shaders/common.glsl?raw'
import starFragSrc from '@/three/shaders/star.frag.glsl?raw'
import coronaVertSrc from '@/three/shaders/corona.vert.glsl?raw'
import coronaFragSrc from '@/three/shaders/corona.frag.glsl?raw'
import type { SunData } from '@/lib/planets/types'
import { SPHERE_SEGMENTS, SIZE_SCALE } from '@/lib/planets/constants'

/** Intensity of the sun's point light. */
const SUN_LIGHT_INTENSITY = 22.0

/** Decay rate for the sun's point light. */
const SUN_LIGHT_DECAY = 1.2

/** Range of the sun's point light (0 = infinite). */
const SUN_LIGHT_RANGE = 0

/** Half-size (in sun radii) of the corona billboard quad. Diameter = 2 * this. */
const CORONA_HALF_EXTENT_RADII = 4

/** Inner (core) tint for the corona shader. */
const CORONA_CORE_COLOR: readonly [number, number, number] = [1.0, 0.94, 0.78]

/** Outer (edge) tint for the corona shader. */
const CORONA_EDGE_COLOR: readonly [number, number, number] = [1.0, 0.5, 0.2]

/** Overall corona brightness multiplier. */
const CORONA_INTENSITY = 0.55

/** Return value from createSunMesh. */
export interface SunMeshResult {
  /** Group containing the star mesh, light, and corona billboard. */
  group: THREE.Group
  /** The star mesh (for rotation). */
  mesh: THREE.Mesh
  /** The point light (for reference by other controllers). */
  light: THREE.PointLight
  /** Shader uniforms for per-frame updates on the star surface. */
  uniforms: Record<string, THREE.IUniform>
  /** Corona shader uniforms (for per-frame time updates). */
  coronaUniforms: Record<string, THREE.IUniform>
}

/**
 * Create the sun group: star mesh + point light + corona sprite.
 *
 * @param sunData - Sun definition from the catalog
 * @returns Group, mesh, light, uniforms, and corona texture for disposal
 */
export function createSunMesh(sunData: SunData): SunMeshResult {
  const radius = sunData.displayRadius * SIZE_SCALE
  const geometry = new THREE.SphereGeometry(radius, SPHERE_SEGMENTS, SPHERE_SEGMENTS)

  const u = sunData.shader.uniforms
  const uniforms: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
    uStarColor: { value: new THREE.Vector3(...(u.uStarColor as number[])) },
    uTemperature: { value: u.uTemperature as number },
    uActivityLevel: { value: u.uActivityLevel as number },
    uRotationSpeed: { value: u.uRotationSpeed as number },
  }

  const material = new THREE.ShaderMaterial({
    vertexShader: vertSrc,
    fragmentShader: commonSrc + '\n' + starFragSrc,
    uniforms,
  })

  const mesh = new THREE.Mesh(geometry, material)

  // Point light for illuminating planets
  const light = new THREE.PointLight(0xfff0d0, SUN_LIGHT_INTENSITY, SUN_LIGHT_RANGE)
  light.decay = SUN_LIGHT_DECAY
  mesh.add(light)

  // Procedural corona billboard — plane + shader, camera-facing via vertex shader.
  const coronaSize = radius * CORONA_HALF_EXTENT_RADII * 2
  const coronaGeometry = new THREE.PlaneGeometry(coronaSize, coronaSize)
  const coronaUniforms: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
    uCoreColor: { value: new THREE.Vector3(...CORONA_CORE_COLOR) },
    uEdgeColor: { value: new THREE.Vector3(...CORONA_EDGE_COLOR) },
    uActivity: { value: u.uActivityLevel as number },
    uIntensity: { value: CORONA_INTENSITY },
  }
  const coronaMaterial = new THREE.ShaderMaterial({
    vertexShader: coronaVertSrc,
    fragmentShader: commonSrc + '\n' + coronaFragSrc,
    uniforms: coronaUniforms,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  })
  const corona = new THREE.Mesh(coronaGeometry, coronaMaterial)
  // Render before the star so additive blend stacks behind it.
  corona.renderOrder = -1

  const group = new THREE.Group()
  group.add(corona)
  group.add(mesh)

  return { group, mesh, light, uniforms, coronaUniforms }
}
