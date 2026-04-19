/**
 * Manifold highway spline renderer — ancient viroid infrastructure.
 *
 * Builds a CatmullRomCurve3 from orbital arc points at tunnel depth,
 * renders a wireframe tube (longitudinal rails + cross-section rings)
 * with a dim Tron-style glow shader.
 *
 * @author guinetik
 * @date 2026-04-12
 * @spec docs/superpowers/specs/2026-04-12-orbital-surfing-manifold-highway-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { OrbitPoint2D } from '@/lib/map/orbitalSurfing'
import { MAP_VIEW_CONTROLLER_CONFIG as MAP_CONFIG } from '@/lib/map/mapViewControllerConfig'
import manifoldSplineVertexShader from '@/three/shaders/effects/manifoldSpline.vert.glsl?raw'
import manifoldSplineFragmentShader from '@/three/shaders/effects/manifoldSpline.frag.glsl?raw'

/** Number of sample points along the spline for rendering. */
const RENDER_SEGMENTS = 128

/** Number of vertices around each cross-section ring. */
const TUBE_RADIAL_SEGMENTS = 8

/** Radius of the tube cross-section. */
const TUBE_RADIUS = 3.5

/** How often to place a ring cross-section (every N spline samples). */
const RING_EVERY_N = 4

/** Number of longitudinal rails running along the tube. */
const RAIL_COUNT = 4

/**
 * Manifold highway spline visual — wireframe tube beneath the grid.
 *
 * @author guinetik
 * @date 2026-04-12
 * @spec docs/superpowers/specs/2026-04-12-orbital-surfing-manifold-highway-design.md
 */
export class ManifoldSpline implements Tickable {
  /** Root group added to the scene. */
  readonly group = new THREE.Group()

  private splineCurve: THREE.CatmullRomCurve3 | null = null
  private tubeMesh: THREE.LineSegments | null = null
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

    const vertices: number[] = []
    const sampledPoints = this.splineCurve.getSpacedPoints(RENDER_SEGMENTS)

    // Precompute Frenet-like frames along the spline
    const frames = this.computeFrames(sampledPoints)

    // --- Longitudinal rails (lines running the length of the tube) ---
    for (let rail = 0; rail < RAIL_COUNT; rail++) {
      const angle = (Math.PI * 2 * rail) / RAIL_COUNT
      const cosA = Math.cos(angle)
      const sinA = Math.sin(angle)

      for (let i = 0; i < sampledPoints.length - 1; i++) {
        const p0 = sampledPoints[i]!
        const p1 = sampledPoints[i + 1]!
        const f0 = frames[i]!
        const f1 = frames[i + 1]!

        const x0 = p0.x + (f0.normal.x * cosA + f0.binormal.x * sinA) * TUBE_RADIUS
        const y0 = p0.y + (f0.normal.y * cosA + f0.binormal.y * sinA) * TUBE_RADIUS
        const z0 = p0.z + (f0.normal.z * cosA + f0.binormal.z * sinA) * TUBE_RADIUS

        const x1 = p1.x + (f1.normal.x * cosA + f1.binormal.x * sinA) * TUBE_RADIUS
        const y1 = p1.y + (f1.normal.y * cosA + f1.binormal.y * sinA) * TUBE_RADIUS
        const z1 = p1.z + (f1.normal.z * cosA + f1.binormal.z * sinA) * TUBE_RADIUS

        vertices.push(x0, y0, z0, x1, y1, z1)
      }
    }

    // --- Cross-section rings (circles around the tube at intervals) ---
    for (let i = 0; i < sampledPoints.length; i += RING_EVERY_N) {
      const center = sampledPoints[i]!
      const frame = frames[i]!

      for (let j = 0; j < TUBE_RADIAL_SEGMENTS; j++) {
        const a0 = (Math.PI * 2 * j) / TUBE_RADIAL_SEGMENTS
        const a1 = (Math.PI * 2 * (j + 1)) / TUBE_RADIAL_SEGMENTS
        const cos0 = Math.cos(a0)
        const sin0 = Math.sin(a0)
        const cos1 = Math.cos(a1)
        const sin1 = Math.sin(a1)

        const x0 = center.x + (frame.normal.x * cos0 + frame.binormal.x * sin0) * TUBE_RADIUS
        const y0 = center.y + (frame.normal.y * cos0 + frame.binormal.y * sin0) * TUBE_RADIUS
        const z0 = center.z + (frame.normal.z * cos0 + frame.binormal.z * sin0) * TUBE_RADIUS

        const x1 = center.x + (frame.normal.x * cos1 + frame.binormal.x * sin1) * TUBE_RADIUS
        const y1 = center.y + (frame.normal.y * cos1 + frame.binormal.y * sin1) * TUBE_RADIUS
        const z1 = center.z + (frame.normal.z * cos1 + frame.binormal.z * sin1) * TUBE_RADIUS

        vertices.push(x0, y0, z0, x1, y1, z1)
      }
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
      vertexShader: manifoldSplineVertexShader,
      fragmentShader: manifoldSplineFragmentShader,
    })

    this.tubeMesh = new THREE.LineSegments(geometry, this.material)
    this.group.add(this.tubeMesh)
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
    if (this.tubeMesh) {
      this.tubeMesh.geometry.dispose()
      this.group.remove(this.tubeMesh)
      this.tubeMesh = null
    }
    if (this.material) {
      this.material.dispose()
      this.material = null
    }
    this.splineCurve = null
  }

  /**
   * Compute approximate Frenet frames (normal + binormal) along sampled points.
   * Uses finite differences for the tangent and a reference up vector.
   */
  private computeFrames(
    points: THREE.Vector3[],
  ): { normal: THREE.Vector3; binormal: THREE.Vector3 }[] {
    const frames: { normal: THREE.Vector3; binormal: THREE.Vector3 }[] = []
    const up = new THREE.Vector3(0, 1, 0)

    for (let i = 0; i < points.length; i++) {
      const prev = points[Math.max(0, i - 1)]!
      const next = points[Math.min(points.length - 1, i + 1)]!
      const tangent = new THREE.Vector3().subVectors(next, prev).normalize()

      // If tangent is nearly parallel to up, use a fallback
      let normal: THREE.Vector3
      if (Math.abs(tangent.dot(up)) > 0.99) {
        normal = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(1, 0, 0)).normalize()
      } else {
        normal = new THREE.Vector3().crossVectors(up, tangent).normalize()
      }
      const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize()

      frames.push({ normal, binormal })
    }

    return frames
  }
}
