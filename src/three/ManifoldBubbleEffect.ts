/**
 * Dark-sector matter bubble effect — encloses the shuttle during manifold travel.
 *
 * A wireframe icosphere with a pulsing cyan shader, added to the shuttle group
 * so it inherits position/rotation. Fades in when orbital surfing starts,
 * holds during diving, fades out when emerging.
 *
 * @author guinetik
 * @date 2026-04-12
 * @spec docs/superpowers/specs/2026-04-12-orbital-surfing-manifold-highway-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'

/** Bubble radius in shuttle local space. */
const BUBBLE_RADIUS = 8

/** Icosphere detail level (1 = 80 faces, 2 = 320 faces). */
const BUBBLE_DETAIL = 1

/** Seconds to fade in/out. */
const FADE_DURATION = 0.6

/** Base cyan color for the bubble wireframe. */
const BUBBLE_COLOR = 0x00ddff

/** Pulse frequency in Hz. */
const PULSE_FREQ = 1.2

/** Minimum opacity when fully active. */
const OPACITY_MIN = 0.15

/** Maximum opacity at pulse peak. */
const OPACITY_MAX = 0.4

/**
 * Dark-sector bubble effect rendered as a wireframe icosphere around the shuttle.
 *
 * @author guinetik
 * @date 2026-04-12
 * @spec docs/superpowers/specs/2026-04-12-orbital-surfing-manifold-highway-design.md
 */
export class ManifoldBubbleEffect implements Tickable {
  /** The wireframe mesh — add to shuttleController.group. */
  readonly mesh: THREE.LineSegments

  private readonly material: THREE.ShaderMaterial
  private time = 0
  private active = false
  private fadeProgress = 0

  constructor() {
    const ico = new THREE.IcosahedronGeometry(BUBBLE_RADIUS, BUBBLE_DETAIL)
    const wireframe = new THREE.WireframeGeometry(ico)
    ico.dispose()

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(BUBBLE_COLOR) },
        uOpacity: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec3 vPos;

        void main() {
          // Latitude-based shimmer — bands travel upward
          float bands = sin(vPos.y * 3.0 + uTime * 4.0) * 0.5 + 0.5;
          float edge = smoothstep(0.0, 0.3, bands);
          vec3 color = uColor * (0.6 + 0.4 * edge);
          gl_FragColor = vec4(color, uOpacity * (0.5 + 0.5 * edge));
        }
      `,
    })

    this.mesh = new THREE.LineSegments(wireframe, this.material)
    this.mesh.visible = false
    this.mesh.frustumCulled = false
  }

  /** Activate the bubble (fade in). */
  setActive(active: boolean): void {
    if (active === this.active) return
    this.active = active
    if (active) {
      this.mesh.visible = true
    }
  }

  tick(dt: number): void {
    this.time += dt

    // Fade
    const fadeTarget = this.active ? 1 : 0
    if (this.fadeProgress !== fadeTarget) {
      const fadeSpeed = 1 / FADE_DURATION
      if (this.active) {
        this.fadeProgress = Math.min(1, this.fadeProgress + fadeSpeed * dt)
      } else {
        this.fadeProgress = Math.max(0, this.fadeProgress - fadeSpeed * dt)
      }
      if (this.fadeProgress <= 0) {
        this.mesh.visible = false
      }
    }

    if (!this.mesh.visible) return

    // Pulsing opacity
    const pulse = Math.sin(this.time * PULSE_FREQ * Math.PI * 2) * 0.5 + 0.5
    const baseOpacity = THREE.MathUtils.lerp(OPACITY_MIN, OPACITY_MAX, pulse)
    this.material.uniforms.uOpacity!.value = baseOpacity * this.fadeProgress
    this.material.uniforms.uTime!.value = this.time

    // Gentle rotation so the wireframe shimmers
    this.mesh.rotation.y += dt * 0.3
    this.mesh.rotation.x += dt * 0.15
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}
