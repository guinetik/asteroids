/**
 * Creates a procedural planet mesh with ShaderMaterial.
 *
 * Selects rockyPlanet or gasGiant fragment shader based on the planet's
 * shader config type. The shaders compute sun lighting internally
 * (sun at origin), so no onBeforeCompile patching is needed.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-map-view-design.md
 */
import * as THREE from 'three'
import vertSrc from '@/three/shaders/sphere.vert.glsl?raw'
import commonSrc from '@/three/shaders/common.glsl?raw'
import rockyFragSrc from '@/three/shaders/rockyPlanet.frag.glsl?raw'
import gasFragSrc from '@/three/shaders/gasGiant.frag.glsl?raw'
import type { Planet } from '@/lib/planets/types'
import { SPHERE_SEGMENTS, SIZE_SCALE } from '@/lib/planets/constants'

const textureLoader = new THREE.TextureLoader()

const PLANET_TEXTURES = new Set([
  'mercury',
  'venus',
  'earth',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
])

/** Return value from createPlanetMesh — the mesh and its shader uniforms. */
export interface PlanetMeshResult {
  /** The Three.js object, scaled and tilted. */
  mesh: THREE.Object3D
  /** Shader uniforms for per-frame updates (uTime, etc.). */
  uniforms: Record<string, THREE.IUniform>
  /** Release any textures created for the shader overlay. */
  dispose: () => void
}

/**
 * Create a procedural planet mesh.
 *
 * @param planet - Planet definition from the catalog
 * @returns Mesh and uniforms handle
 */
export function createPlanetMesh(planet: Planet): PlanetMeshResult {
  const radius = planet.displayRadius * SIZE_SCALE
  const geometry = new THREE.SphereGeometry(radius, SPHERE_SEGMENTS, SPHERE_SEGMENTS)
  const ownedTextures: THREE.Texture[] = []

  const uniforms: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
    uUseSurfaceTexture: { value: 0 },
    uTextureBlend: { value: planet.shader.type === 'gasGiant' ? 0.9 : 0.82 },
    uLightingExposure: { value: 1 },
  }
  for (const [key, val] of Object.entries(planet.shader.uniforms)) {
    if (Array.isArray(val)) {
      uniforms[key] = { value: new THREE.Vector3(val[0], val[1], val[2]) }
    } else {
      uniforms[key] = { value: val }
    }
  }

  if (PLANET_TEXTURES.has(planet.id)) {
    const surfaceTexture = textureLoader.load(`/textures/${planet.id}.webp`)
    surfaceTexture.colorSpace = THREE.SRGBColorSpace
    uniforms.uSurfaceTexture = { value: surfaceTexture }
    const useSurfaceTextureUniform = uniforms.uUseSurfaceTexture
    if (useSurfaceTextureUniform) {
      useSurfaceTextureUniform.value = 1
    }
    ownedTextures.push(surfaceTexture)
  }

  if (planet.id === 'earth') {
    const nightTexture = textureLoader.load('/textures/earth-night.webp')
    nightTexture.colorSpace = THREE.SRGBColorSpace
    uniforms.uNightTexture = { value: nightTexture }
    uniforms.uUseNightTexture = { value: 1 }
    ownedTextures.push(nightTexture)
  } else {
    uniforms.uUseNightTexture = { value: 0 }
  }

  const fragSrc = planet.shader.type === 'gasGiant' ? gasFragSrc : rockyFragSrc
  const material = new THREE.ShaderMaterial({
    vertexShader: vertSrc,
    fragmentShader: commonSrc + '\n' + fragSrc,
    uniforms,
    transparent: true,
  })

  const mesh = new THREE.Mesh(geometry, material)
  // Apply axial tilt around Z axis
  mesh.rotation.order = 'ZYX'
  mesh.rotation.z = planet.axialTilt

  return {
    mesh,
    uniforms,
    dispose: () => {
      for (const texture of ownedTextures) {
        texture.dispose()
      }
    },
  }
}
