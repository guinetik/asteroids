/**
 * Manifold highway spline renderer — ancient viroid infrastructure.
 *
 * Builds a CatmullRomCurve3 from orbital arc points at tunnel depth,
 * renders parallel wireframe rails with a dim Tron-style glow shader.
 *
 * @author guinetik
 * @date 2026-04-12
 * @spec docs/superpowers/specs/2026-04-12-orbital-surfing-manifold-highway-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { OrbitPoint2D } from '@/lib/map/orbitalSurfing'
import { MAP_VIEW_CONTROLLER_CONFIG as MAP_CONFIG } from '@/lib/map/mapViewControllerConfig'

/** Number of sample points along the spline for rendering. */
const RENDER_SEGMENTS = 128

/** Lateral offset for the twin rail lines flanking the spline center. */
const RAIL_HALF_WIDTH = 1.5

/**
 * Manifold highway spline visual — dormant Tron wireframe beneath the grid.
 *
 * @author guinetik
 * @date 2026-04-12
 * @spec docs/superpowers/specs/2026-04-12-orbital-surfing-manifold-highway-design.md
 */
export class ManifoldSpline implements Tickable {
  /** Root group added to the scene. */
  readonly group = new THREE.Group()

  private splineCurve: THREE.CatmullRomCurve3 | null = null
  private railMesh: THREE.LineSegments | null = null
  private material: THREE.ShaderMaterial | null = null
  private time = 0

  /**
   * Build and show the manifold spline from orbital arc points.
   *
   * @param arcPoints - XZ world-space orbit arc (from extractOrbitArc).
   * @param tunnelDepth - Negative Y depth below grid plane.
   */
  show(arcPoints: OrbitPoint2D[], tunnelDepth: number): void {
    this.dispose()

    // Build entry ramp → cruise → exit ramp
    const rampLength = 3
    const curvePoints: THREE.Vector3[] = []

    for (let i = 0; i < arcPoints.length; i++) {
      const p = arcPoints[i]!
      let y = tunnelDepth
      if (i < rampLength) {
        const rampT = i / rampLength
        y = THREE.MathUtils.lerp(0, tunnelDepth, rampT)
      } else if (i > arcPoints.length - 1 - rampLength) {
        const rampT = (arcPoints.length - 1 - i) / rampLength
        y = THREE.MathUtils.lerp(0, tunnelDepth, rampT)
      }
      curvePoints.push(new THREE.Vector3(p.x, y, p.z))
    }

    this.splineCurve = new THREE.CatmullRomCurve3(curvePoints, false, 'centripetal', 0.5)

    // Sample the spline into twin rail lines
    const vertices: number[] = []
    const sampledPoints = this.splineCurve.getSpacedPoints(RENDER_SEGMENTS)

    for (let i = 0; i < sampledPoints.length - 1; i++) {
      const p0 = sampledPoints[i]!
      const p1 = sampledPoints[i + 1]!

      // Tangent for lateral offset
      const tangent = new THREE.Vector3().subVectors(p1, p0).normalize()
      const up = new THREE.Vector3(0, 1, 0)
      const lateral = new THREE.Vector3().crossVectors(tangent, up).normalize().multiplyScalar(RAIL_HALF_WIDTH)

      // Center line segment
      vertices.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z)
      // Left rail
      vertices.push(
        p0.x + lateral.x, p0.y, p0.z + lateral.z,
        p1.x + lateral.x, p1.y, p1.z + lateral.z,
      )
      // Right rail
      vertices.push(
        p0.x - lateral.x, p0.y, p0.z - lateral.z,
        p1.x - lateral.x, p1.y, p1.z - lateral.z,
      )
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uBaseColor: { value: new THREE.Color(MAP_CONFIG.ORBITAL_SURF_SPLINE_COLOR) },
        uGlowColor: { value: new THREE.Color(MAP_CONFIG.ORBITAL_SURF_SPLINE_GLOW_COLOR) },
        uOpacity: { value: MAP_CONFIG.ORBITAL_SURF_SPLINE_OPACITY },
        uPulseSpeed: { value: MAP_CONFIG.ORBITAL_SURF_PULSE_SPEED },
      },
      vertexShader: /* glsl */ `
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uBaseColor;
        uniform vec3 uGlowColor;
        uniform float uOpacity;
        uniform float uPulseSpeed;

        void main() {
          float pulse = 0.7 + 0.3 * sin(uTime * uPulseSpeed * 6.2831);
          vec3 color = mix(uBaseColor, uGlowColor, pulse * 0.5);
          gl_FragColor = vec4(color, uOpacity * pulse);
        }
      `,
    })

    this.railMesh = new THREE.LineSegments(geometry, this.material)
    this.group.add(this.railMesh)
    this.group.visible = true
  }

  /** Get position along the spline at parametric t (0→1). */
  getPositionAt(t: number): THREE.Vector3 {
    if (!this.splineCurve) return new THREE.Vector3()
    return this.splineCurve.getPointAt(Math.max(0, Math.min(1, t)))
  }

  /** Hide and dispose geometry. */
  hide(): void {
    this.dispose()
    this.group.visible = false
  }

  /** Advance the shader time uniform. */
  tick(dt: number): void {
    this.time += dt
    if (this.material) {
      this.material.uniforms.uTime!.value = this.time
    }
  }

  /** Dispose geometry and material. */
  dispose(): void {
    if (this.railMesh) {
      this.railMesh.geometry.dispose()
      this.group.remove(this.railMesh)
      this.railMesh = null
    }
    if (this.material) {
      this.material.dispose()
      this.material = null
    }
    this.splineCurve = null
  }
}
