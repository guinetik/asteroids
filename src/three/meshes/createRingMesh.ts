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

const ringVertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const ringFragmentShader = /* glsl */ `
uniform sampler2D uNoise;
uniform float uTime;
uniform float uOpacity;
uniform vec3 uColor;
uniform float uInnerRadius;
uniform float uOuterRadius;
uniform float uBandSeed;

varying vec2 vUv;

// Discrete band structure — returns opacity for a given radial position
float bandDensity(float t) {
  // Major bands inspired by Saturn's ring structure:
  //   C ring (inner, faint), B ring (bright, wide), Cassini division (gap),
  //   A ring (bright), Encke gap, outer A ring
  float bands = 0.0;

  // C ring — faint inner ring
  bands += 0.3 * smoothstep(0.0, 0.03, t) * smoothstep(0.18, 0.15, t);

  // B ring — brightest and widest
  bands += 1.0 * smoothstep(0.20, 0.23, t) * smoothstep(0.52, 0.49, t);

  // Cassini division — wide gap (0.52 – 0.57)

  // A ring — outer bright ring with Encke gap
  float aRing = smoothstep(0.57, 0.60, t) * smoothstep(0.82, 0.79, t);
  // Encke gap
  float enckeGap = 1.0 - (1.0 - smoothstep(0.695, 0.70, t)) * smoothstep(0.71, 0.705, t);
  // Keeler gap
  float keelerGap = 1.0 - (1.0 - smoothstep(0.775, 0.78, t)) * smoothstep(0.79, 0.785, t);
  bands += 0.8 * aRing * enckeGap * keelerGap;

  // F ring — thin faint outer ring
  bands += 0.25 * smoothstep(0.88, 0.89, t) * smoothstep(0.93, 0.92, t);

  return bands;
}

void main() {
  // Map UV to centered [-1, 1] space
  vec2 centered = (vUv - 0.5) * 2.0;
  float r = length(centered);

  // Normalized radial position within the ring band
  float ringWidth = uOuterRadius - uInnerRadius;
  float vlength = (r - uInnerRadius) / ringWidth;

  // Discard outside ring band
  if (vlength < 0.0 || vlength > 1.0) discard;

  // Discrete band structure
  float band = bandDensity(vlength);
  if (band < 0.01) discard;

  // Angle for texture sampling (slow rotation)
  float angle = atan(centered.y, centered.x) + uTime * 0.05;

  // Sample noise texture — use band seed to offset so each planet looks different
  vec2 texCoord = vec2((sin(angle) + 1.0) * 0.5 + uBandSeed, vlength * 3.0);
  vec4 noise = texture2D(uNoise, texCoord);

  // Mix noise into the band density for per-particle variation
  float detail = mix(0.7, 1.0, noise.r);

  vec3 color = uColor * detail * 1.4;
  float alpha = band * uOpacity * detail;

  gl_FragColor = vec4(color, alpha);
}
`

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
