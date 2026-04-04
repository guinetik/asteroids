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
import type { SunData } from '@/lib/planets/types'
import { SPHERE_SEGMENTS, SIZE_SCALE } from '@/lib/planets/constants'

/** Intensity of the sun's point light. */
const SUN_LIGHT_INTENSITY = 22.0

/** Decay rate for the sun's point light. */
const SUN_LIGHT_DECAY = 1.2

/** Range of the sun's point light (0 = infinite). */
const SUN_LIGHT_RANGE = 0

/** Scale multiplier for the corona sprite relative to sun radius. */
const CORONA_SCALE = 6

/** Resolution of the corona gradient texture. */
const CORONA_TEXTURE_SIZE = 256

/** Return value from createSunMesh. */
export interface SunMeshResult {
  /** Group containing the star mesh, light, and corona sprite. */
  group: THREE.Group
  /** The star mesh (for rotation). */
  mesh: THREE.Mesh
  /** The point light (for reference by other controllers). */
  light: THREE.PointLight
  /** Shader uniforms for per-frame updates. */
  uniforms: Record<string, THREE.IUniform>
  /** Corona texture (for disposal). */
  coronaTexture: THREE.CanvasTexture
}

/** Create a radial gradient canvas texture for the corona sprite. */
function createCoronaTexture(): THREE.CanvasTexture {
  const size = CORONA_TEXTURE_SIZE
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const half = size / 2
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half)
  gradient.addColorStop(0, 'rgba(255, 240, 200, 0.6)')
  gradient.addColorStop(0.15, 'rgba(255, 200, 100, 0.3)')
  gradient.addColorStop(0.4, 'rgba(255, 160, 60, 0.08)')
  gradient.addColorStop(1, 'rgba(255, 120, 40, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
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

  // Corona glow sprite
  const coronaTexture = createCoronaTexture()
  const coronaMaterial = new THREE.SpriteMaterial({
    map: coronaTexture,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  })
  const corona = new THREE.Sprite(coronaMaterial)
  corona.scale.setScalar(radius * CORONA_SCALE)
  mesh.add(corona)

  const group = new THREE.Group()
  group.add(mesh)

  return { group, mesh, light, uniforms, coronaTexture }
}
