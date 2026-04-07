/**
 * Reusable pool-based particle emitter for thruster VFX.
 *
 * Each emitter manages a fixed-size pool of particles with configurable
 * color, size, lifetime, and spread. Vehicle controllers call {@link emit}
 * to spawn particles at world-space positions with directional push.
 *
 * Per-particle lifetime drives smooth opacity fade-out and optional
 * size growth via a custom shader — no more blocky cutoff.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/asteroid-lander-gdd.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'

/** Hide dead particles far off-screen instead of branching in the shader. */
const FAR_AWAY = 99999

/** Configuration for a single particle emitter instance. */
export interface ParticleEmitterConfig {
  /** Maximum particles alive at once */
  poolSize: number
  /** Particle color */
  color: THREE.Color
  /** Base particle size (world units if sizeAttenuation, else pixels) */
  size: number
  /** Seconds before a particle dies */
  lifetime: number
  /** Random velocity jitter radius (units/s per axis) */
  spread: number
  /** Peak opacity at birth (0–1). Default 0.9. */
  opacity?: number
  /** Use world-space sizing (true) or screen-space pixels (false, default). */
  sizeAttenuation?: boolean
  /** Use a soft radial gradient texture instead of hard square points. */
  soft?: boolean
  /** Size multiplier at end of life (1.0 = no growth, 2.0 = doubles). Default 1.0. */
  sizeGrowth?: number
}

/** Cached soft particle texture — shared across all soft emitters. */
let _softTexture: THREE.Texture | null = null

/** Generate a 64x64 radial gradient texture for soft particles. */
function getSoftParticleTexture(): THREE.Texture {
  if (_softTexture) return _softTexture
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const center = size / 2
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.6)')
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.15)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  _softTexture = new THREE.CanvasTexture(canvas)
  return _softTexture
}

/** Custom shader for per-particle fade and size growth. */
const ParticleVertexShader = /* glsl */ `
  attribute float life;
  uniform float uBaseSize;
  uniform float uSizeGrowth;
  varying float vLife;

  void main() {
    vLife = life;
    // Size grows from 1.0 to uSizeGrowth over lifetime
    float sizeFactor = 1.0 + (uSizeGrowth - 1.0) * life;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uBaseSize * sizeFactor * (ATTENUATION_FACTOR);
    gl_Position = projectionMatrix * mvPosition;
  }
`

/** Fragment shader — fades opacity smoothly to zero at end of life. */
const ParticleFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform sampler2D uMap;
  uniform bool uUseMap;
  varying float vLife;

  void main() {
    // Smooth fade: full opacity at birth, zero at death
    float fade = 1.0 - smoothstep(0.0, 1.0, vLife);
    vec4 texColor = uUseMap ? texture2D(uMap, gl_PointCoord) : vec4(1.0);
    gl_FragColor = vec4(uColor, uOpacity * fade * texColor.a);
    if (gl_FragColor.a < 0.01) discard;
  }
`

/** Build vertex shader with correct attenuation factor. */
function buildVertexShader(sizeAttenuation: boolean): string {
  const factor = sizeAttenuation
    ? '(300.0 / -mvPosition.z)'
    : '1.0'
  return ParticleVertexShader.replace('ATTENUATION_FACTOR', factor)
}

/** Internal particle state for the pool. */
interface Particle {
  alive: boolean
  age: number
  position: THREE.Vector3
  velocity: THREE.Vector3
}

/**
 * Pool-based particle emitter rendered as {@link THREE.Points}.
 * Particles are spawned via {@link emit} and automatically aged out.
 * Per-particle lifetime attribute drives smooth opacity fade and size growth.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/asteroid-lander-gdd.md
 */
export class ParticleEmitter implements Tickable {
  /** Add this to the scene to render particles. */
  readonly points: THREE.Points

  private readonly pool: Particle[]
  private readonly lifetime: number
  private readonly spread: number
  private readonly lifeAttr: THREE.BufferAttribute

  constructor(config: ParticleEmitterConfig) {
    this.lifetime = config.lifetime
    this.spread = config.spread

    this.pool = Array.from({ length: config.poolSize }, () => ({
      alive: false,
      age: 0,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
    }))

    const positions = new Float32Array(config.poolSize * 3)
    const lifes = new Float32Array(config.poolSize)
    // Initialize all particles at the dead position so they don't render at origin
    for (let i = 0; i < positions.length; i++) {
      positions[i] = FAR_AWAY
    }
    // Life starts at 1.0 (fully faded) for dead particles
    for (let i = 0; i < lifes.length; i++) {
      lifes[i] = 1.0
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    this.lifeAttr = new THREE.BufferAttribute(lifes, 1)
    geometry.setAttribute('life', this.lifeAttr)

    const useSoft = config.soft ?? false
    const softTex = useSoft ? getSoftParticleTexture() : null

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uBaseSize: { value: config.size },
        uSizeGrowth: { value: config.sizeGrowth ?? 1.0 },
        uColor: { value: new THREE.Vector3(config.color.r, config.color.g, config.color.b) },
        uOpacity: { value: config.opacity ?? 0.9 },
        uMap: { value: softTex },
        uUseMap: { value: useSoft },
      },
      vertexShader: buildVertexShader(config.sizeAttenuation ?? false),
      fragmentShader: ParticleFragmentShader,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    })

    this.points = new THREE.Points(geometry, material)
    this.points.frustumCulled = false
  }

  /**
   * Spawn a single particle at a world-space position with a push velocity.
   *
   * @param worldPosition - Where the particle appears (world coords)
   * @param pushVelocity - Directional velocity added on top of random spread
   */
  emit(worldPosition: THREE.Vector3, pushVelocity: THREE.Vector3): void {
    const particle = this.pool.find((p) => !p.alive)
    if (!particle) return

    particle.alive = true
    particle.age = 0
    particle.position.copy(worldPosition)

    particle.velocity.set(
      (Math.random() - 0.5) * this.spread,
      (Math.random() - 0.5) * this.spread,
      (Math.random() - 0.5) * this.spread,
    )
    particle.velocity.add(pushVelocity)
  }

  tick(dt: number): void {
    const posAttr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute
    const positions = posAttr.array as Float32Array
    const lifes = this.lifeAttr.array as Float32Array

    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i]!
      const i3 = i * 3

      if (!p.alive) {
        positions[i3] = FAR_AWAY
        positions[i3 + 1] = FAR_AWAY
        positions[i3 + 2] = FAR_AWAY
        lifes[i] = 1.0
        continue
      }

      p.age += dt
      if (p.age >= this.lifetime) {
        p.alive = false
        positions[i3] = FAR_AWAY
        positions[i3 + 1] = FAR_AWAY
        positions[i3 + 2] = FAR_AWAY
        lifes[i] = 1.0
        continue
      }

      p.position.addScaledVector(p.velocity, dt)
      positions[i3] = p.position.x
      positions[i3 + 1] = p.position.y
      positions[i3 + 2] = p.position.z
      lifes[i] = p.age / this.lifetime
    }

    posAttr.needsUpdate = true
    this.lifeAttr.needsUpdate = true
  }

  /** Kill all live particles immediately — moves them off-screen. */
  reset(): void {
    const posAttr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute
    const positions = posAttr.array as Float32Array
    const lifes = this.lifeAttr.array as Float32Array
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i]!
      p.alive = false
      p.age = 0
      const i3 = i * 3
      positions[i3] = FAR_AWAY
      positions[i3 + 1] = FAR_AWAY
      positions[i3 + 2] = FAR_AWAY
      lifes[i] = 1.0
    }
    posAttr.needsUpdate = true
    this.lifeAttr.needsUpdate = true
  }

  dispose(): void {
    this.points.geometry.dispose()
    ;(this.points.material as THREE.ShaderMaterial).dispose()
  }
}
