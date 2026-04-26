/**
 * Sphere-vs-static collider 3D resolver used by the EVA player.
 *
 * The level-scene {@link CollisionWorld} is XZ-planar (gravity-up character movement
 * against a heightmap). Zero-g EVA is 6-DoF, so we need a separate, smaller resolver
 * that pushes a player sphere out of AABB/sphere obstacles in full 3D. Colliders are
 * snapshot at EVA enter — the shuttle is frozen and the POI is static, so static world
 * bounds are sufficient for the session lifetime.
 *
 * @author guinetik
 * @date 2026-04-19
 * @spec docs/superpowers/specs/2026-04-18-visit-relay-mission-design.md
 */
import * as THREE from 'three'

/** Static 3D collider primitive. Snapshot at EVA session start; world-space coordinates. */
export type EvaCollider =
  | {
      readonly kind: 'aabb'
      readonly min: THREE.Vector3
      readonly max: THREE.Vector3
    }
  | {
      readonly kind: 'sphere'
      readonly center: THREE.Vector3
      readonly radius: number
    }
  | {
      /**
       * Oriented bounding box. `min`/`max` are in the referenced object's *local* frame;
       * the resolver transforms the player sphere into that frame each check so
       * collision stays tight no matter how the object is rotated in world space.
       * Requires uniform scale on {@link object}; the shuttle satisfies this during EVA.
       */
      readonly kind: 'obb'
      readonly object: THREE.Object3D
      readonly min: THREE.Vector3
      readonly max: THREE.Vector3
    }
  | {
      /**
       * Oriented cylinder. `localCenter`, `localAxis`, `halfLength`, `radius` are all in
       * the referenced object's *local* frame; the resolver transforms the player sphere
       * into that frame each check so the cylinder rotates with the object. Chosen for
       * hulls where an AABB/OBB would give too many sharp corners to navigate around —
       * a cylinder presents a smooth curved surface in the radial direction. Requires
       * uniform scale on {@link object}.
       */
      readonly kind: 'cylinder'
      readonly object: THREE.Object3D
      readonly localCenter: THREE.Vector3
      readonly localAxis: THREE.Vector3
      readonly halfLength: number
      readonly radius: number
    }

/** Outcome of a single resolution pass. Used for debug/telemetry, not required by callers. */
export interface EvaResolveResult {
  touched: boolean
}

/**
 * Build a world-space AABB `EvaCollider` from a Three.js object's current bounds. Must
 * be called after any scale changes (e.g. EVA huge-scale) so the AABB reflects what the
 * player actually sees. Traverses all descendants — includes any auxiliary meshes like
 * flame emitters, particle systems, HUD sprites attached to the target.
 */
export function createAabbColliderFromObject(object: THREE.Object3D): EvaCollider {
  const box = new THREE.Box3().setFromObject(object)
  return {
    kind: 'aabb',
    min: box.min.clone(),
    max: box.max.clone(),
  }
}

/**
 * Build a world-space AABB `EvaCollider` by expanding a box over the given objects only.
 * Prefer this over {@link createAabbColliderFromObject} when the visible target has
 * sibling props (cargo contents, FX emitters) that would otherwise inflate the bounds.
 */
export function createAabbColliderFromObjects(objects: readonly THREE.Object3D[]): EvaCollider {
  const box = new THREE.Box3()
  box.makeEmpty()
  for (const obj of objects) {
    box.expandByObject(obj)
  }
  return {
    kind: 'aabb',
    min: box.min.clone(),
    max: box.max.clone(),
  }
}

/**
 * Build an oriented-bounding-box `EvaCollider` from hull nodes in the parent object's
 * local frame. Walks each mesh's geometry bounding box, transforms its 8 corners into
 * `parent.matrixWorld`-inverse space, and expands a tight local Box3. Keeping the bounds
 * in local space lets the resolver stay tight no matter how the parent is rotated —
 * world-axis AABBs balloon ~1.4× on a 45°-oriented shuttle, leaving dead-corner gaps in
 * front of the nose and behind the tail.
 */
export function createObbColliderFromHullNodes(
  parent: THREE.Object3D,
  hullNodes: readonly THREE.Object3D[],
): EvaCollider {
  parent.updateMatrixWorld(true)
  const parentInverse = new THREE.Matrix4().copy(parent.matrixWorld).invert()
  const min = new THREE.Vector3(Infinity, Infinity, Infinity)
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity)
  const corner = new THREE.Vector3()
  const meshLocal = new THREE.Matrix4()
  for (const node of hullNodes) {
    node.updateMatrixWorld(true)
    node.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      const geom = mesh.geometry
      if (!geom.boundingBox) geom.computeBoundingBox()
      const bb = geom.boundingBox
      if (!bb) return
      meshLocal.multiplyMatrices(parentInverse, mesh.matrixWorld)
      for (let i = 0; i < 8; i++) {
        corner
          .set(
            i & 1 ? bb.max.x : bb.min.x,
            i & 2 ? bb.max.y : bb.min.y,
            i & 4 ? bb.max.z : bb.min.z,
          )
          .applyMatrix4(meshLocal)
        min.min(corner)
        max.max(corner)
      }
    })
  }
  return { kind: 'obb', object: parent, min, max }
}

/** Options for {@link createCylinderColliderFromHullNodes}. */
export interface CylinderColliderOptions {
  /**
   * Fraction of hull vertices that must sit inside the radial cylinder wall, in
   * (0, 1]. Protrusion verts (wing tips, tail-fin spike) land in the outer
   * percentile band and get excluded, leaving a cylinder that hugs the fuselage.
   * Defaults to `0.9` — captures the fuselage body while letting wings/fins
   * clip through as passable volume. Lower (e.g. `0.8`) for an even tighter fit
   * around a narrow fuselage; raise toward `1.0` to fully envelop everything
   * (back to the old bounding-cylinder behavior).
   */
  radialPercentile?: number
  /**
   * Lower axial quantile to keep, in [0, 1). The cylinder's "low" end sits at the
   * axis coordinate of the vertex at this quantile after sorting along the
   * cylinder axis. Defaults to `0` (extend fully to the hull's low-end tip —
   * typically the nose). Raise to trim a protrusion off the low end.
   */
  axialKeepLow?: number
  /**
   * Upper axial quantile to keep, in (0, 1]. The cylinder's "high" end sits at
   * the axis coordinate of the vertex at this quantile. Defaults to `1.0`
   * (extend fully to the hull's high-end tip). Lower (e.g. `0.9`) to trim
   * engine nacelles / thruster bells sticking past the fuselage tail.
   */
  axialKeepHigh?: number
}

/** Default fraction of hull verts enclosed by the cylinder's radial wall. */
const DEFAULT_RADIAL_PERCENTILE = 0.9

/** Default lower axial quantile kept — `0` means "extend all the way to the low end tip". */
const DEFAULT_AXIAL_KEEP_LOW = 0

/** Default upper axial quantile kept — `1` means "extend all the way to the high end tip". */
const DEFAULT_AXIAL_KEEP_HIGH = 1

/**
 * Build an oriented cylinder `EvaCollider` from hull nodes, aligned with the longest
 * local-axis of the hull's AABB. Prefer this over {@link createObbColliderFromHullNodes}
 * for long, narrow hulls (like the shuttle) — a cylinder has no corners in the radial
 * direction, so the EVA player can slide smoothly along the hull without snagging on the
 * OBB's eight sharp edges.
 *
 * The cylinder is centered on the per-axis **median** of the hull's vertex positions
 * (not the AABB midpoint), and the radius is a **percentile** of per-vertex radial
 * distances (default: 90th). Both choices are robust to thin protrusions like wings
 * and tail fins — those contribute a small fraction of the hull's verts, so they land
 * in the outer percentile band and get excluded from the fit. Protrusions poke out
 * through the cylinder wall and are passable by the EVA player, while the main
 * fuselage is snugly enclosed. Requires uniform scale on `parent`.
 */
export function createCylinderColliderFromHullNodes(
  parent: THREE.Object3D,
  hullNodes: readonly THREE.Object3D[],
  options: CylinderColliderOptions = {},
): EvaCollider {
  const radialPercentile = clampUnit(options.radialPercentile ?? DEFAULT_RADIAL_PERCENTILE)
  const axialKeepLowRaw = clampUnit(options.axialKeepLow ?? DEFAULT_AXIAL_KEEP_LOW)
  const axialKeepHighRaw = clampUnit(options.axialKeepHigh ?? DEFAULT_AXIAL_KEEP_HIGH)
  // Guarantee a valid half-open range regardless of caller input.
  const axialKeepLow = Math.min(axialKeepLowRaw, axialKeepHighRaw)
  const axialKeepHigh = Math.max(axialKeepLowRaw, axialKeepHighRaw)

  parent.updateMatrixWorld(true)
  const parentInverse = new THREE.Matrix4().copy(parent.matrixWorld).invert()
  const xs: number[] = []
  const ys: number[] = []
  const zs: number[] = []
  const meshLocal = new THREE.Matrix4()
  const v = new THREE.Vector3()
  for (const node of hullNodes) {
    node.updateMatrixWorld(true)
    node.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      const pos = mesh.geometry.attributes.position as THREE.BufferAttribute | undefined
      if (!pos) return
      meshLocal.multiplyMatrices(parentInverse, mesh.matrixWorld)
      for (let i = 0; i < pos.count; i++) {
        v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(meshLocal)
        xs.push(v.x)
        ys.push(v.y)
        zs.push(v.z)
      }
    })
  }
  const vertCount = xs.length
  if (vertCount === 0) {
    return {
      kind: 'cylinder',
      object: parent,
      localCenter: new THREE.Vector3(),
      localAxis: new THREE.Vector3(1, 0, 0),
      halfLength: 0,
      radius: 0,
    }
  }

  // Build sorted per-axis copies for median + percentile span queries. The original
  // xs/ys/zs arrays keep their per-vertex ordering so we can compute consistent
  // radii against the derived axis line below.
  const sortedXs = [...xs].sort((a, b) => a - b)
  const sortedYs = [...ys].sort((a, b) => a - b)
  const sortedZs = [...zs].sort((a, b) => a - b)
  const medianX = sortedXs[Math.floor(vertCount / 2)] ?? 0
  const medianY = sortedYs[Math.floor(vertCount / 2)] ?? 0
  const medianZ = sortedZs[Math.floor(vertCount / 2)] ?? 0

  // Decide the cylinder axis from the widest full AABB span — protrusions on a
  // non-length axis rarely out-length the hull body, so the full span is a safe
  // pick and avoids coupling axis selection to the axial-keep trim settings.
  const fullSpanX = (sortedXs[vertCount - 1] ?? 0) - (sortedXs[0] ?? 0)
  const fullSpanY = (sortedYs[vertCount - 1] ?? 0) - (sortedYs[0] ?? 0)
  const fullSpanZ = (sortedZs[vertCount - 1] ?? 0) - (sortedZs[0] ?? 0)
  const localAxis = new THREE.Vector3()
  let axisIdx: 0 | 1 | 2
  let sortedAxis: readonly number[]
  if (fullSpanX >= fullSpanY && fullSpanX >= fullSpanZ) {
    localAxis.set(1, 0, 0)
    axisIdx = 0
    sortedAxis = sortedXs
  } else if (fullSpanY >= fullSpanX && fullSpanY >= fullSpanZ) {
    localAxis.set(0, 1, 0)
    axisIdx = 1
    sortedAxis = sortedYs
  } else {
    localAxis.set(0, 0, 1)
    axisIdx = 2
    sortedAxis = sortedZs
  }

  // Axial extents use the caller's asymmetric keep range so protrusions at one
  // end (e.g. engine bells past the tail) can be trimmed without also shortening
  // the opposite end (the nose).
  const loIdx = Math.min(vertCount - 1, Math.max(0, Math.floor(axialKeepLow * (vertCount - 1))))
  const hiIdx = Math.min(vertCount - 1, Math.max(0, Math.floor(axialKeepHigh * (vertCount - 1))))
  const axialMin = sortedAxis[loIdx] ?? 0
  const axialMax = sortedAxis[hiIdx] ?? 0
  const axialCenter = (axialMin + axialMax) * 0.5
  const halfLength = (axialMax - axialMin) * 0.5
  // Cylinder center: median on non-axial axes (outlier-robust), trimmed midpoint on axial.
  const localCenter = new THREE.Vector3(medianX, medianY, medianZ)
  if (axisIdx === 0) localCenter.x = axialCenter
  else if (axisIdx === 1) localCenter.y = axialCenter
  else localCenter.z = axialCenter

  // Radial distance from the axis line (through localCenter along localAxis) per vert.
  const radiiSquared: number[] = Array.from({ length: vertCount })
  for (let i = 0; i < vertCount; i++) {
    const dx = (xs[i] ?? 0) - medianX
    const dy = (ys[i] ?? 0) - medianY
    const dz = (zs[i] ?? 0) - medianZ
    let rSq: number
    if (axisIdx === 0) rSq = dy * dy + dz * dz
    else if (axisIdx === 1) rSq = dx * dx + dz * dz
    else rSq = dx * dx + dy * dy
    radiiSquared[i] = rSq
  }
  radiiSquared.sort((a, b) => a - b)
  const radialIdx = Math.min(vertCount - 1, Math.floor(radialPercentile * (vertCount - 1)))
  const radius = Math.sqrt(radiiSquared[radialIdx] ?? 0)

  return { kind: 'cylinder', object: parent, localCenter, localAxis, halfLength, radius }
}

/** Clamp a number into `[0, 1]`. Used to sanitize percentile options. */
function clampUnit(x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  return x
}

/**
 * Build a world-space AABB `EvaCollider` from hand-tuned local-space bounds, transformed
 * by the object's current world matrix. Prefer this over {@link createAabbColliderFromObject}
 * for hulls that carry auxiliary FX (flames, particle emitters, gauges) — those inflate
 * the `setFromObject` bounds far past the visible hull.
 */
export function createAabbColliderFromLocalBounds(
  object: THREE.Object3D,
  localMin: THREE.Vector3,
  localMax: THREE.Vector3,
): EvaCollider {
  object.updateMatrixWorld(true)
  const corners = [
    new THREE.Vector3(localMin.x, localMin.y, localMin.z),
    new THREE.Vector3(localMin.x, localMin.y, localMax.z),
    new THREE.Vector3(localMin.x, localMax.y, localMin.z),
    new THREE.Vector3(localMin.x, localMax.y, localMax.z),
    new THREE.Vector3(localMax.x, localMin.y, localMin.z),
    new THREE.Vector3(localMax.x, localMin.y, localMax.z),
    new THREE.Vector3(localMax.x, localMax.y, localMin.z),
    new THREE.Vector3(localMax.x, localMax.y, localMax.z),
  ]
  const min = new THREE.Vector3(Infinity, Infinity, Infinity)
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity)
  for (const corner of corners) {
    corner.applyMatrix4(object.matrixWorld)
    min.min(corner)
    max.max(corner)
  }
  return { kind: 'aabb', min, max }
}

/**
 * Accumulates EVA colliders and resolves 3D sphere overlap by pushing the sphere along
 * the shortest separation axis, zeroing velocity components pointing into contact so
 * the player doesn't smear along the surface with stored momentum.
 */
export class EvaCollisionResolver {
  private readonly colliders: EvaCollider[] = []
  private readonly tmpClosest = new THREE.Vector3()
  private readonly tmpNormal = new THREE.Vector3()
  private readonly tmpLocalPos = new THREE.Vector3()
  private readonly tmpWorldPos = new THREE.Vector3()
  private readonly tmpQuat = new THREE.Quaternion()
  private readonly tmpQuatInv = new THREE.Quaternion()
  private readonly tmpScale = new THREE.Vector3()

  /** Register a collider. Returned callback removes it (idempotent). */
  add(collider: EvaCollider): () => void {
    this.colliders.push(collider)
    return () => {
      const i = this.colliders.indexOf(collider)
      if (i >= 0) this.colliders.splice(i, 1)
    }
  }

  /** Drop every collider. Called on EVA session teardown. */
  clear(): void {
    this.colliders.length = 0
  }

  /**
   * Push the sphere out of all overlapping colliders in 3D. Mutates `position`; if
   * `velocity` is supplied, zeros the component along each contact normal so the
   * player stops rather than skating.
   */
  resolveSphere(
    position: THREE.Vector3,
    radius: number,
    velocity?: THREE.Vector3,
  ): EvaResolveResult {
    let touched = false
    for (const c of this.colliders) {
      if (c.kind === 'aabb') {
        this.tmpClosest.set(
          Math.max(c.min.x, Math.min(position.x, c.max.x)),
          Math.max(c.min.y, Math.min(position.y, c.max.y)),
          Math.max(c.min.z, Math.min(position.z, c.max.z)),
        )
        this.tmpNormal.subVectors(position, this.tmpClosest)
        const distSq = this.tmpNormal.lengthSq()
        const inside = distSq < 1e-10
        if (inside) {
          // Sphere center inside AABB → push along shallowest face normal.
          const dxMin = position.x - c.min.x
          const dxMax = c.max.x - position.x
          const dyMin = position.y - c.min.y
          const dyMax = c.max.y - position.y
          const dzMin = position.z - c.min.z
          const dzMax = c.max.z - position.z
          const minDepth = Math.min(dxMin, dxMax, dyMin, dyMax, dzMin, dzMax)
          this.tmpNormal.set(0, 0, 0)
          if (minDepth === dxMin) this.tmpNormal.x = -1
          else if (minDepth === dxMax) this.tmpNormal.x = 1
          else if (minDepth === dyMin) this.tmpNormal.y = -1
          else if (minDepth === dyMax) this.tmpNormal.y = 1
          else if (minDepth === dzMin) this.tmpNormal.z = -1
          else this.tmpNormal.z = 1
          position.addScaledVector(this.tmpNormal, minDepth + radius)
          this.killVelocityAlong(velocity, this.tmpNormal)
          touched = true
          continue
        }
        if (distSq >= radius * radius) continue
        const dist = Math.sqrt(distSq)
        this.tmpNormal.multiplyScalar(1 / dist)
        position.addScaledVector(this.tmpNormal, radius - dist)
        this.killVelocityAlong(velocity, this.tmpNormal)
        touched = true
        continue
      }

      if (c.kind === 'sphere') {
        this.tmpNormal.subVectors(position, c.center)
        const combined = radius + c.radius
        const distSq = this.tmpNormal.lengthSq()
        if (distSq >= combined * combined) continue
        const dist = Math.sqrt(distSq)
        if (dist < 1e-5) {
          this.tmpNormal.set(1, 0, 0)
        } else {
          this.tmpNormal.multiplyScalar(1 / dist)
        }
        position.addScaledVector(this.tmpNormal, combined - dist)
        this.killVelocityAlong(velocity, this.tmpNormal)
        touched = true
        continue
      }

      if (c.kind === 'obb') {
        // OBB: transform sphere center into the object's local frame, do sphere-vs-AABB
        // there, transform the push-out back to world. Assumes uniform scale.
        c.object.updateMatrixWorld()
        c.object.matrixWorld.decompose(this.tmpWorldPos, this.tmpQuat, this.tmpScale)
        const uniformScale = this.tmpScale.x
        if (uniformScale < 1e-6) continue
        this.tmpQuatInv.copy(this.tmpQuat).invert()
        this.tmpLocalPos
          .copy(position)
          .sub(this.tmpWorldPos)
          .applyQuaternion(this.tmpQuatInv)
          .multiplyScalar(1 / uniformScale)
        const localRadius = radius / uniformScale
        this.tmpClosest.set(
          Math.max(c.min.x, Math.min(this.tmpLocalPos.x, c.max.x)),
          Math.max(c.min.y, Math.min(this.tmpLocalPos.y, c.max.y)),
          Math.max(c.min.z, Math.min(this.tmpLocalPos.z, c.max.z)),
        )
        this.tmpNormal.subVectors(this.tmpLocalPos, this.tmpClosest)
        const obbDistSq = this.tmpNormal.lengthSq()
        const insideObb = obbDistSq < 1e-10
        let pushLocal: number
        if (insideObb) {
          const dxMin = this.tmpLocalPos.x - c.min.x
          const dxMax = c.max.x - this.tmpLocalPos.x
          const dyMin = this.tmpLocalPos.y - c.min.y
          const dyMax = c.max.y - this.tmpLocalPos.y
          const dzMin = this.tmpLocalPos.z - c.min.z
          const dzMax = c.max.z - this.tmpLocalPos.z
          const minDepth = Math.min(dxMin, dxMax, dyMin, dyMax, dzMin, dzMax)
          this.tmpNormal.set(0, 0, 0)
          if (minDepth === dxMin) this.tmpNormal.x = -1
          else if (minDepth === dxMax) this.tmpNormal.x = 1
          else if (minDepth === dyMin) this.tmpNormal.y = -1
          else if (minDepth === dyMax) this.tmpNormal.y = 1
          else if (minDepth === dzMin) this.tmpNormal.z = -1
          else this.tmpNormal.z = 1
          pushLocal = minDepth + localRadius
        } else {
          if (obbDistSq >= localRadius * localRadius) continue
          const obbDist = Math.sqrt(obbDistSq)
          this.tmpNormal.multiplyScalar(1 / obbDist)
          pushLocal = localRadius - obbDist
        }
        // Rotate the local push-normal back to world (unit vectors ignore scale), scale the
        // push magnitude by uniformScale so the world-space displacement matches.
        this.tmpNormal.applyQuaternion(this.tmpQuat)
        position.addScaledVector(this.tmpNormal, pushLocal * uniformScale)
        this.killVelocityAlong(velocity, this.tmpNormal)
        touched = true
        continue
      }

      // Cylinder: transform sphere center into the object's local frame, resolve against
      // a capped cylinder whose axis = c.localAxis. Push-out is either radial (if the
      // player is beside the hull) or axial (if they're hovering over the caps), whichever
      // requires less displacement. Rotation-aware; assumes uniform scale.
      c.object.updateMatrixWorld()
      c.object.matrixWorld.decompose(this.tmpWorldPos, this.tmpQuat, this.tmpScale)
      const cylScale = this.tmpScale.x
      if (cylScale < 1e-6) continue
      this.tmpQuatInv.copy(this.tmpQuat).invert()
      this.tmpLocalPos
        .copy(position)
        .sub(this.tmpWorldPos)
        .applyQuaternion(this.tmpQuatInv)
        .multiplyScalar(1 / cylScale)
      const cylLocalRadius = radius / cylScale
      // Vector from cylinder center to sphere center in cylinder local space.
      this.tmpLocalPos.sub(c.localCenter)
      const axial =
        this.tmpLocalPos.x * c.localAxis.x +
        this.tmpLocalPos.y * c.localAxis.y +
        this.tmpLocalPos.z * c.localAxis.z
      // Radial component = local offset minus axial projection along the cylinder axis.
      const radialX = this.tmpLocalPos.x - c.localAxis.x * axial
      const radialY = this.tmpLocalPos.y - c.localAxis.y * axial
      const radialZ = this.tmpLocalPos.z - c.localAxis.z * axial
      const radialLen = Math.sqrt(radialX * radialX + radialY * radialY + radialZ * radialZ)
      // Signed overlap along each axis (positive = penetrating past the cap/side).
      const radialGap = c.radius + cylLocalRadius - radialLen
      const axialGap = c.halfLength + cylLocalRadius - Math.abs(axial)
      if (radialGap <= 0 || axialGap <= 0) continue
      // Pick shallower axis for push — natural "slide around" feel.
      if (radialGap < axialGap) {
        if (radialLen < 1e-5) {
          // Degenerate: sphere center on the axis line. Push along an arbitrary perpendicular.
          this.tmpNormal.set(1, 0, 0)
          if (Math.abs(c.localAxis.x) > 0.9) this.tmpNormal.set(0, 1, 0)
        } else {
          this.tmpNormal.set(radialX / radialLen, radialY / radialLen, radialZ / radialLen)
        }
        this.tmpNormal.applyQuaternion(this.tmpQuat)
        position.addScaledVector(this.tmpNormal, radialGap * cylScale)
      } else {
        const sign = axial >= 0 ? 1 : -1
        this.tmpNormal
          .copy(c.localAxis as THREE.Vector3)
          .multiplyScalar(sign)
          .applyQuaternion(this.tmpQuat)
        position.addScaledVector(this.tmpNormal, axialGap * cylScale)
      }
      this.killVelocityAlong(velocity, this.tmpNormal)
      touched = true
    }
    return { touched }
  }

  private killVelocityAlong(velocity: THREE.Vector3 | undefined, normal: THREE.Vector3): void {
    if (!velocity) return
    const into = velocity.x * normal.x + velocity.y * normal.y + velocity.z * normal.z
    if (into >= 0) return
    velocity.x -= normal.x * into
    velocity.y -= normal.y * into
    velocity.z -= normal.z * into
  }
}
