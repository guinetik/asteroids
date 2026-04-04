/**
 * Creates a procedural moon mesh with the rockyPlanet shader.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-map-view-design.md
 */
import * as THREE from 'three'
import vertSrc from '@/three/shaders/sphere.vert.glsl?raw'
import commonSrc from '@/three/shaders/common.glsl?raw'
import rockyFragSrc from '@/three/shaders/rockyPlanet.frag.glsl?raw'
import type { Moon } from '@/lib/planets/types'
import { MOON_SPHERE_SEGMENTS, SIZE_SCALE } from '@/lib/planets/constants'

/** Return value from createMoonMesh. */
export interface MoonMeshResult {
  /** The Three.js mesh. */
  mesh: THREE.Mesh
  /** Shader uniforms for per-frame updates. */
  uniforms: Record<string, THREE.IUniform>
}

/**
 * Create a procedural moon mesh.
 *
 * @param moon - Moon definition from the planet's moons array
 * @returns Mesh and uniforms handle
 */
export function createMoonMesh(moon: Moon): MoonMeshResult {
  const radius = moon.displayRadius * SIZE_SCALE
  const geometry = new THREE.SphereGeometry(radius, MOON_SPHERE_SEGMENTS, MOON_SPHERE_SEGMENTS)

  const uniforms: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
  }
  for (const [key, val] of Object.entries(moon.shader.uniforms)) {
    if (Array.isArray(val)) {
      uniforms[key] = { value: new THREE.Vector3(val[0], val[1], val[2]) }
    } else {
      uniforms[key] = { value: val }
    }
  }

  const material = new THREE.ShaderMaterial({
    vertexShader: vertSrc,
    fragmentShader: commonSrc + '\n' + rockyFragSrc,
    uniforms,
    transparent: true,
  })

  return { mesh: new THREE.Mesh(geometry, material), uniforms }
}
