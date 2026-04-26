import * as THREE from 'three'

/**
 * A `THREE.BufferGeometry` whose vertex layout matches `THREE.TubeGeometry`,
 * but whose positions and normals can be **rewritten in place** every frame
 * from a fresh curve, without ever reallocating buffers or uploading new
 * GPU vertex objects (other than the dirty range Three.js streams up).
 *
 * ## Why this exists
 *
 * The procedural enemies (`BacteriophageController`,
 * `ChimeraWalkerController`) animate dozens of limb tubes by replacing each
 * mesh's geometry every few frames:
 *
 * ```ts
 * mesh.geometry.dispose()
 * mesh.geometry = new THREE.TubeGeometry(curve, axial, radius, radial, false)
 * ```
 *
 * Per Chimera that's ~256 `TubeGeometry` constructions per second (10
 * tentacles × 4 segments × 5 Hz + 4 legs × 2 tubes × 7 Hz). Each
 * construction allocates fresh `Float32Array`s for `position`, `normal`,
 * `uv`, plus an index buffer; uploads them to a brand new GPU VBO; then
 * the previous `BufferGeometry` is torn down and its VBO recycled. With
 * 2-4 chimeras visible the steady-state cost is ~500-1000 rebuilds/sec —
 * which produced the lingering camera-turn clunk the user reported in v4.
 *
 * `MutableTubeGeometry` keeps a single set of typed-array buffers for the
 * lifetime of the mesh. Each `update(curve)` call:
 *
 * 1. Asks the curve for Frenet frames at `tubularSegments + 1` points
 *    (`THREE.Curve.computeFrenetFrames`).
 * 2. Walks the same loop `THREE.TubeGeometry` would, sampling
 *    `getPointAt(u)` and writing radial vertices into the existing
 *    `position` and `normal` arrays.
 * 3. Sets `needsUpdate = true` so the renderer streams only the dirty
 *    bytes up — no GC, no buffer reallocation, no fresh VBO.
 *
 * Indices and UVs are computed once in the constructor; they never change
 * because the topology of a tube of fixed `(tubularSegments, radialSegments,
 * closed)` is invariant.
 *
 * ## Compatibility with `THREE.TubeGeometry`
 *
 * The vertex ordering, index layout and UV mapping intentionally mirror
 * `THREE.TubeGeometry`'s reference implementation so `MutableTubeGeometry`
 * is a drop-in replacement for animated tubes whose `radius` is constant
 * over their lifetime — which is the case for every animated tube in the
 * project today (Phage legs, Chimera leg upper/lower, each Chimera tentacle
 * segment).
 *
 * If a future caller needs per-frame variable radius, prefer adding an
 * `update(curve, radius)` overload here over reverting to allocations.
 *
 * @see docs/superpowers/specs/2026-04-18-fps-perf-fixes-design.md (v5)
 */
export class MutableTubeGeometry extends THREE.BufferGeometry {
  /** Number of segments along the tube length (matches `THREE.TubeGeometry` arg). */
  public readonly tubularSegments: number
  /** Number of segments around the tube circumference. */
  public readonly radialSegments: number
  /** Constant radius applied at every cross-section. */
  public readonly radius: number
  /** Whether the curve is closed (loops back to its start). */
  public readonly closed: boolean

  /** Scratch vector used inside `update()` to avoid per-vertex allocations. */
  private readonly scratchPoint = new THREE.Vector3()
  /** Scratch vector used inside `update()` for the world-space ring normal. */
  private readonly scratchNormal = new THREE.Vector3()

  /**
   * @param tubularSegments Number of length-wise segments. Higher = smoother
   *   along the curve, more vertices.
   * @param radialSegments Number of cross-section segments. Higher =
   *   rounder cross-section, more vertices.
   * @param radius Tube radius in world units.
   * @param closed Whether the tube wraps; rarely used for limb animation.
   */
  constructor(tubularSegments: number, radialSegments: number, radius: number, closed = false) {
    super()
    this.tubularSegments = tubularSegments
    this.radialSegments = radialSegments
    this.radius = radius
    this.closed = closed

    const numVertices = (tubularSegments + 1) * (radialSegments + 1)
    const numIndices = tubularSegments * radialSegments * 6

    this.setAttribute('position', new THREE.BufferAttribute(new Float32Array(numVertices * 3), 3))
    this.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(numVertices * 3), 3))
    this.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(numVertices * 2), 2))

    const IndexArrayCtor = numVertices > 65535 ? Uint32Array : Uint16Array
    this.setIndex(new THREE.BufferAttribute(new IndexArrayCtor(numIndices), 1))

    this.fillIndexBuffer()
    this.fillUVBuffer()
  }

  /**
   * Build the static index buffer (triangulation pattern that mirrors
   * `THREE.TubeGeometry`).
   */
  private fillIndexBuffer(): void {
    const indexAttr = this.getIndex()
    if (!indexAttr) return
    const indices = indexAttr.array as Uint16Array | Uint32Array
    const ringStride = this.radialSegments + 1
    let p = 0
    for (let j = 1; j <= this.tubularSegments; j++) {
      for (let i = 1; i <= this.radialSegments; i++) {
        const a = ringStride * (j - 1) + (i - 1)
        const b = ringStride * j + (i - 1)
        const c = ringStride * j + i
        const d = ringStride * (j - 1) + i
        indices[p++] = a
        indices[p++] = b
        indices[p++] = d
        indices[p++] = b
        indices[p++] = c
        indices[p++] = d
      }
    }
    indexAttr.needsUpdate = true
  }

  /**
   * Build the static UV buffer (u along the tube length, v around the
   * cross-section).
   */
  private fillUVBuffer(): void {
    const uvAttr = this.getAttribute('uv') as THREE.BufferAttribute
    const uv = uvAttr.array as Float32Array
    let p = 0
    for (let i = 0; i <= this.tubularSegments; i++) {
      const u = i / this.tubularSegments
      for (let j = 0; j <= this.radialSegments; j++) {
        uv[p++] = u
        uv[p++] = j / this.radialSegments
      }
    }
    uvAttr.needsUpdate = true
  }

  /**
   * Re-evaluate the tube against `curve` and rewrite the existing position
   * and normal buffers in place. Marks both attributes dirty so Three.js
   * streams the new data up at the next draw.
   *
   * Intentionally does **not** call `computeVertexNormals` — the analytic
   * normals derived from the Frenet frame are correct for a circular
   * cross-section and avoid the per-frame triangle walk.
   *
   * @param curve The new curve to follow this frame.
   */
  update(curve: THREE.Curve<THREE.Vector3>): void {
    const positionAttr = this.getAttribute('position') as THREE.BufferAttribute
    const normalAttr = this.getAttribute('normal') as THREE.BufferAttribute
    const positions = positionAttr.array as Float32Array
    const normals = normalAttr.array as Float32Array

    const frames = curve.computeFrenetFrames(this.tubularSegments, this.closed)
    const frameNormals = frames.normals
    const frameBinormals = frames.binormals

    const point = this.scratchPoint
    const writeNormal = this.scratchNormal
    const ringStride = this.radialSegments + 1

    for (let i = 0; i <= this.tubularSegments; i++) {
      const u = this.tubularSegments === 0 ? 0 : i / this.tubularSegments
      curve.getPointAt(u, point)
      const N = frameNormals[i]
      const B = frameBinormals[i]
      if (!N || !B) continue

      for (let j = 0; j <= this.radialSegments; j++) {
        const v = (j / this.radialSegments) * Math.PI * 2
        const sinV = Math.sin(v)
        const cosV = -Math.cos(v)

        writeNormal.x = cosV * N.x + sinV * B.x
        writeNormal.y = cosV * N.y + sinV * B.y
        writeNormal.z = cosV * N.z + sinV * B.z
        writeNormal.normalize()

        const idx = (i * ringStride + j) * 3
        positions[idx + 0] = point.x + this.radius * writeNormal.x
        positions[idx + 1] = point.y + this.radius * writeNormal.y
        positions[idx + 2] = point.z + this.radius * writeNormal.z
        normals[idx + 0] = writeNormal.x
        normals[idx + 1] = writeNormal.y
        normals[idx + 2] = writeNormal.z
      }
    }

    positionAttr.needsUpdate = true
    normalAttr.needsUpdate = true

    if (this.boundingSphere) {
      this.computeBoundingSphere()
    }
  }
}
