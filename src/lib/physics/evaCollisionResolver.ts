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
export function createAabbColliderFromObjects(
  objects: readonly THREE.Object3D[],
): EvaCollider {
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

      // Sphere-vs-sphere.
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
