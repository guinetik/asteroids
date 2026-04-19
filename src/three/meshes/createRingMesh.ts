/**
 * Shader-based planetary ring mesh with procedural noise texture.
 * Renders Saturn-style ring structure (C ring, B ring, Cassini division,
 * A ring with Encke/Keeler gaps, F ring) using a GLSL fragment shader.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-map-view-design.md
 */
import * as THREE from 'three'
import type { RingConfig } from '@/lib/planets/types'
import { SIZE_SCALE } from '@/lib/planets/constants'
import ringVertexShader from '@/three/shaders/rings/ring.vert.glsl?raw'
import ringFragmentShader from '@/three/shaders/rings/ring.frag.glsl?raw'

/**
 * Creates a procedural canvas-based noise texture for ring variation.
 * Generates white noise (greyscale) and wraps it for tiling.
 *
 * @param size - Canvas dimensions in pixels (default 256)
 * @returns A {@link THREE.CanvasTexture} with RepeatWrapping set on both axes
 */
function createProceduralNoiseTexture(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.createImageData(size, size)
  for (let i = 0; i < imageData.data.length; i += 4) {
    const v = Math.random() * 255
    imageData.data[i] = v
    imageData.data[i + 1] = v
    imageData.data[i + 2] = v
    imageData.data[i + 3] = 255
  }
  ctx.putImageData(imageData, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
}

/**
 * Creates a shader-based ring mesh for a ringed planet.
 *
 * The mesh is a flat {@link THREE.PlaneGeometry} sized to the outer ring
 * diameter, rotated to lie in the XZ plane. The fragment shader renders the
 * Saturn-style band structure (C / B / Cassini gap / A / F rings) with
 * procedural per-particle noise variation.
 *
 * @param ring - Ring configuration (inner/outer radius multipliers, color, opacity)
 * @param planetDisplayRadius - The planet's display radius before {@link SIZE_SCALE} is applied
 * @returns A {@link THREE.Mesh} with a transparent additive {@link THREE.ShaderMaterial}
 */
export function createRingMesh(ring: RingConfig, planetDisplayRadius: number): THREE.Mesh {
  const planetRadius = planetDisplayRadius * SIZE_SCALE
  // Size the plane to cover the outer ring diameter
  const outerWorldRadius = planetRadius * ring.outerRadius
  const planeSize = outerWorldRadius * 2.0

  const geometry = new THREE.PlaneGeometry(planeSize, planeSize, 1, 1)

  // Normalise inner/outer to [0..1] range within the plane's UV space
  // The plane spans [-1, 1] in centered coords, so radius 1.0 = outerRadius
  const normalizedInner = ring.innerRadius / ring.outerRadius
  const normalizedOuter = 1.0

  const [r = 1, g = 1, b = 1] = ring.color
  const material = new THREE.ShaderMaterial({
    vertexShader: ringVertexShader,
    fragmentShader: ringFragmentShader,
    uniforms: {
      uNoise: { value: createProceduralNoiseTexture() },
      uTime: { value: 0 },
      uOpacity: { value: ring.opacity },
      uColor: { value: new THREE.Color(r, g, b) },
      uInnerRadius: { value: normalizedInner },
      uOuterRadius: { value: normalizedOuter },
      uBandSeed: { value: r * 13.7 }, // derive seed from color for variety
    },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })

  const mesh = new THREE.Mesh(geometry, material)
  // Rotate to lie flat in the XZ plane
  mesh.rotation.x = -Math.PI / 2

  return mesh
}
