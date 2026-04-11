/**
 * Thruster wash ground effects — visual interaction when the lander
 * fires engines near the surface.
 *
 * Three layers:
 * 1. Radial dust particles spraying outward from ground point
 * 2. SpotLight wash cone illuminating terrain below engines
 * 3. Ground scorch glow — radial heat shader on a flat disc
 *
 * All layers scale with thrust power and inversely with altitude.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-atmosphere-effects-design.md
 */
import * as THREE from 'three'
import { ParticleEmitter } from '@/three/ParticleEmitter'
import type { AtmosphereContext } from './AtmosphereContext'
import { useAudio } from '@/audio/useAudio'

// ── Altitude thresholds ──
/** Maximum altitude (meters) at which wash effects appear. */
const WASH_MAX_ALTITUDE = 50
/** Altitude below which scorch glow appears. */
const SCORCH_ALTITUDE = 20
/** Altitude at which effects reach maximum intensity. */
const WASH_FULL_ALTITUDE = 5

// ── Dust particles ──
const DUST_POOL_SIZE = 320
const DUST_PARTICLE_SIZE = 1.8
const DUST_LIFETIME = 0.8
const DUST_SPREAD = 1.5
const DUST_OPACITY = 0.5
/** Max spawn rate (particles/sec) at closest altitude. */
const DUST_MAX_SPAWN_RATE = 120
/** Minimum spawn rate at WASH_MAX_ALTITUDE. */
const DUST_MIN_SPAWN_RATE = 20
/** Radial speed multiplier for outward push. */
const DUST_RADIAL_SPEED = 35

// ── Wash light ──
const WASH_LIGHT_COLOR = 0xffaa66
const WASH_LIGHT_MAX_INTENSITY = 3
const WASH_LIGHT_ANGLE = Math.PI / 8
const WASH_LIGHT_PENUMBRA = 0.7
const WASH_LIGHT_DISTANCE = 60

// ── Scorch glow ──
const SCORCH_RADIUS = 12
const SCORCH_SEGMENTS = 32
/** Seconds for scorch to fade out after engines cut. */
const SCORCH_FADE_DURATION = 1.0

// ── Ground wash audio ──
/** intensity threshold above which the ground-wash sound starts. */
const WASH_AUDIO_THRESHOLD = 0.01
/** Minimum volume when the effect just becomes active (low-intensity approach). */
const WASH_AUDIO_MIN_VOL = 0.15
/** Maximum volume at full intensity (thrusting at close range). */
const WASH_AUDIO_MAX_VOL = 0.75

/**
 * Custom shader for the ground scorch glow — radial gradient with pulsing.
 */
const ScorchShader = {
  uniforms: {
    intensity: { value: 0 },
    time: { value: 0 },
    baseColor: { value: new THREE.Vector3(1.0, 0.6, 0.2) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float intensity;
    uniform float time;
    uniform vec3 baseColor;
    varying vec2 vUv;

    // Simple noise for organic pulsing
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      vec2 centered = vUv * 2.0 - 1.0;
      float dist = length(centered);

      // Radial falloff — hot center fading to nothing at edges
      float glow = 1.0 - smoothstep(0.0, 1.0, dist);
      glow = pow(glow, 2.0);

      // Subtle noise pulse
      float pulse = 0.9 + 0.1 * sin(time * 6.0 + hash(centered) * 6.28);

      // Hot center (white-orange) to cooler edges (dim orange)
      vec3 hotColor = vec3(1.0, 0.9, 0.7);
      vec3 color = mix(baseColor, hotColor, glow * 0.6);

      float alpha = glow * intensity * pulse;
      gl_FragColor = vec4(color, alpha);
    }
  `,
}

/**
 * Manages thruster wash visual effects beneath the lander.
 */
export class ThrusterWashController {
  /** Dust particle emitter — radial spray from ground point. */
  readonly dustEmitter: ParticleEmitter
  /** Downward-facing spotlight beneath lander. */
  readonly washLight: THREE.SpotLight
  /** Flat disc mesh with scorch glow shader. */
  readonly scorchMesh: THREE.Mesh<THREE.CircleGeometry, THREE.ShaderMaterial>

  private scorchIntensity = 0
  private dustSpawnAccumulator = 0
  private elapsedTime = 0
  private readonly _zFace = new THREE.Vector3(0, 0, 1)
  /** Looping ground-wash audio handle — alive only while wash is active. */
  private _groundWashHandle: ReturnType<ReturnType<typeof useAudio>['play']> | null = null

  constructor(baseColor: [number, number, number]) {
    // ── Dust emitter ──
    const dustColor = new THREE.Color(baseColor[0], baseColor[1], baseColor[2])
      .lerp(new THREE.Color(0.62, 0.62, 0.62), 0.7)
    this.dustEmitter = new ParticleEmitter({
      poolSize: DUST_POOL_SIZE,
      color: dustColor,
      size: DUST_PARTICLE_SIZE,
      lifetime: DUST_LIFETIME,
      spread: DUST_SPREAD,
      opacity: DUST_OPACITY,
      sizeAttenuation: true,
      sizeGrowth: 1.3,
    })

    // ── Wash spotlight ──
    this.washLight = new THREE.SpotLight(
      WASH_LIGHT_COLOR,
      0, // starts off
      WASH_LIGHT_DISTANCE,
      WASH_LIGHT_ANGLE,
      WASH_LIGHT_PENUMBRA,
    )
    this.washLight.castShadow = false
    this.washLight.visible = false

    // ── Scorch disc ──
    const scorchGeo = new THREE.CircleGeometry(SCORCH_RADIUS, SCORCH_SEGMENTS)
    const scorchMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(ScorchShader.uniforms),
      vertexShader: ScorchShader.vertexShader,
      fragmentShader: ScorchShader.fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    scorchMat.uniforms['baseColor']!.value = new THREE.Vector3(
      baseColor[0] * 2,
      baseColor[1],
      baseColor[2] * 0.5,
    )
    this.scorchMesh = new THREE.Mesh(scorchGeo, scorchMat)
    this.scorchMesh.visible = false
  }

  /** Add all three layers to the scene. */
  addToScene(scene: THREE.Scene): void {
    scene.add(this.dustEmitter.points)
    scene.add(this.washLight)
    scene.add(this.washLight.target)
    scene.add(this.scorchMesh)
  }

  /** Per-frame update. Reads altitude, thrust, and position from context. */
  update(ctx: AtmosphereContext, dt: number): void {
    this.elapsedTime += dt
    const { landerAltitude, landerThrust, landerPosition, landerGrounded } = ctx
    const active = landerThrust > 0 && landerAltitude < WASH_MAX_ALTITUDE && !landerGrounded

    // ── Intensity factor: thrust * altitude falloff (0-1) ──
    const altFactor = active
      ? 1 -
        Math.max(
          0,
          Math.min(1, (landerAltitude - WASH_FULL_ALTITUDE) / (WASH_MAX_ALTITUDE - WASH_FULL_ALTITUDE)),
        )
      : 0
    const intensity = landerThrust * altFactor

    // Ground point directly below lander
    const groundY = landerPosition.y - landerAltitude

    // ── Dust particles ──
    this.dustEmitter.tick(dt)
    if (active && intensity > 0) {
      const spawnRate = DUST_MIN_SPAWN_RATE + (DUST_MAX_SPAWN_RATE - DUST_MIN_SPAWN_RATE) * intensity
      this.dustSpawnAccumulator += spawnRate * dt
      while (this.dustSpawnAccumulator >= 1) {
        this.dustSpawnAccumulator -= 1
        // Random radial direction on XZ plane
        const angle = Math.random() * Math.PI * 2
        const speed = DUST_RADIAL_SPEED * (0.5 + Math.random() * 0.5) * intensity
        const spawnPos = new THREE.Vector3(
          landerPosition.x + (Math.random() - 0.5) * 4,
          groundY + 0.5,
          landerPosition.z + (Math.random() - 0.5) * 4,
        )
        const pushVel = new THREE.Vector3(
          Math.cos(angle) * speed,
          speed * 0.15, // slight upward lift
          Math.sin(angle) * speed,
        )
        this.dustEmitter.emit(spawnPos, pushVel)
      }
    } else {
      this.dustSpawnAccumulator = 0
    }

    // ── Wash light ──
    this.washLight.visible = intensity > 0.01
    this.washLight.intensity = intensity * WASH_LIGHT_MAX_INTENSITY
    if (this.washLight.visible) {
      this.washLight.position.set(landerPosition.x, landerPosition.y, landerPosition.z)
      this.washLight.target.position.set(landerPosition.x, groundY, landerPosition.z)
    }

    // ── Scorch glow ──
    const scorchActive = active && landerAltitude < SCORCH_ALTITUDE
    if (scorchActive) {
      this.scorchIntensity = Math.min(1, this.scorchIntensity + dt * 3)
    } else {
      this.scorchIntensity = Math.max(0, this.scorchIntensity - dt / SCORCH_FADE_DURATION)
    }
    this.scorchMesh.visible = this.scorchIntensity > 0.01
    if (this.scorchMesh.visible) {
      this.scorchMesh.position.set(landerPosition.x, groundY + 0.15, landerPosition.z)
      // Orient disc to terrain slope
      this.scorchMesh.quaternion.setFromUnitVectors(this._zFace, ctx.groundNormal)
      const mat = this.scorchMesh.material
      mat.uniforms['intensity']!.value = this.scorchIntensity * intensity
      mat.uniforms['time']!.value = this.elapsedTime
    }

    // ── Ground wash audio — volume tracks intensity ──
    if (intensity > WASH_AUDIO_THRESHOLD) {
      if (this._groundWashHandle === null) {
        this._groundWashHandle = useAudio().play('sfx.lander.thruster.ground', { loop: true })
      }
      const vol = WASH_AUDIO_MIN_VOL + (WASH_AUDIO_MAX_VOL - WASH_AUDIO_MIN_VOL) * intensity
      this._groundWashHandle.setVolume(vol)
    } else if (this._groundWashHandle !== null) {
      this._groundWashHandle.stop()
      this._groundWashHandle = null
    }
  }

  /** Release GPU resources. */
  dispose(): void {
    this._groundWashHandle?.stop()
    this._groundWashHandle = null
    this.dustEmitter.dispose()
    this.washLight.dispose()
    this.scorchMesh.geometry.dispose()
    this.scorchMesh.material.dispose()
  }
}
