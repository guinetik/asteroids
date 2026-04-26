/**
 * Heightmap + analytic colliders for character and disc movement on the asteroid surface.
 *
 * @author guinetik
 * @date 2026-04-19
 * @spec docs/asteroid-lander-gdd.md
 */
import type { Heightmap, Vec3 } from '@/lib/terrain/heightmap'

/** Minimal 3D vector shape shared by physics helpers. */
export interface Vec3Like {
  x: number
  y: number
  z: number
}

/** Tunables for {@link CollisionWorld.moveCharacterXZ} stepping and slopes. */
export interface CharacterCollisionConfig {
  radius: number
  maxStepHeight: number
  maxClimbAngleRad: number
  substepDistance: number
  skinWidth: number
  airborneClearance: number
}

/** Vertical cylinder / sphere proxy used for props and hazards. */
export interface WorldSphereCollider {
  id?: string
  kind: 'sphere'
  center: Vec3Like | (() => Vec3Like)
  radius: number
  minY?: number
  maxY?: number
  enabled?: boolean | (() => boolean)
}

/** Axis-aligned block volume (buildings, pads) for support and blocking. */
export interface WorldAabbCollider {
  id?: string
  kind: 'aabb'
  min: Vec3Like | (() => Vec3Like)
  max: Vec3Like | (() => Vec3Like)
  enabled?: boolean | (() => boolean)
}

/** Discriminated union of analytic colliders registered on {@link CollisionWorld}. */
export type WorldCollider = WorldSphereCollider | WorldAabbCollider

/** Output of a horizontal move with ground probe and walkability flag. */
export interface CharacterMoveResult {
  x: number
  z: number
  blocked: boolean
  touchedCollider: boolean
  groundHeight: number
  groundNormal: Vec3
  groundAngleRad: number
  groundWalkable: boolean
}

/** Radius / skin / substep settings for {@link CollisionWorld.moveDiscXZ}. */
export interface DiscCollisionConfig {
  radius: number
  skinWidth: number
  substepDistance: number
}

/** Best support height under a disc query, from terrain or colliders. */
export interface SupportSurfaceResult {
  height: number
  normal: Vec3
  colliderId: string | null
}

const DEFAULT_GROUND_NORMAL: Vec3 = { x: 0, y: 1, z: 0 }

/** Clamps `value` to `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Reads a static vector or invokes a lazy callback. */
function resolveVec3(value: Vec3Like | (() => Vec3Like)): Vec3Like {
  return typeof value === 'function' ? value() : value
}

/** Resolves optional dynamic `enabled` flags on colliders. */
function isColliderEnabled(enabled: boolean | (() => boolean) | undefined): boolean {
  if (typeof enabled === 'function') return enabled()
  return enabled ?? true
}

/** Ground slope angle (radians) from an up-ish terrain normal. */
function groundAngleFromNormal(normal: Vec3): number {
  return Math.acos(clamp(normal.y, -1, 1))
}

/** Heightmap-backed ground plus optional analytic meshes for FPS / EVA motion. */
export class CollisionWorld {
  private readonly colliders: WorldCollider[] = []

  constructor(private heightmap: Heightmap | null = null) {}

  setHeightmap(heightmap: Heightmap | null): void {
    this.heightmap = heightmap
  }

  addCollider(collider: WorldCollider): () => void {
    this.colliders.push(collider)
    return () => {
      const index = this.colliders.indexOf(collider)
      if (index >= 0) this.colliders.splice(index, 1)
    }
  }

  getGroundHeight(x: number, z: number): number {
    return this.heightmap?.heightAt(x, z) ?? 0
  }

  getGroundHeightOrNull(x: number, z: number): number | null {
    return this.heightmap?.tryHeightAt(x, z) ?? null
  }

  getGroundNormal(x: number, z: number): Vec3 {
    return this.heightmap?.normalAt(x, z) ?? DEFAULT_GROUND_NORMAL
  }

  getHighestSupportUnderDisc(
    x: number,
    z: number,
    minY: number,
    maxY: number,
    radius: number,
    ignoreColliderId?: string,
  ): SupportSurfaceResult {
    let bestHeight = this.getGroundHeight(x, z)
    let bestNormal = this.getGroundNormal(x, z)
    let bestColliderId: string | null = null

    for (const collider of this.colliders) {
      if (!isColliderEnabled(collider.enabled)) continue
      if (ignoreColliderId && collider.id === ignoreColliderId) continue

      if (collider.kind === 'sphere') {
        const center = resolveVec3(collider.center)
        if (collider.maxY !== undefined && minY > collider.maxY) continue

        const combinedRadius = radius + collider.radius
        const dx = x - center.x
        const dz = z - center.z
        const distanceSq = dx * dx + dz * dz
        if (distanceSq > combinedRadius * combinedRadius) continue

        const supportHeight = center.y + collider.radius
        if (supportHeight < minY || supportHeight > maxY || supportHeight <= bestHeight) continue

        bestHeight = supportHeight
        bestNormal = DEFAULT_GROUND_NORMAL
        bestColliderId = collider.id ?? null
        continue
      }

      const min = resolveVec3(collider.min)
      const max = resolveVec3(collider.max)
      const expandedMinX = min.x - radius
      const expandedMaxX = max.x + radius
      const expandedMinZ = min.z - radius
      const expandedMaxZ = max.z + radius

      if (x < expandedMinX || x > expandedMaxX || z < expandedMinZ || z > expandedMaxZ) {
        continue
      }

      const supportHeight = max.y
      if (supportHeight < minY || supportHeight > maxY || supportHeight <= bestHeight) continue

      bestHeight = supportHeight
      bestNormal = DEFAULT_GROUND_NORMAL
      bestColliderId = collider.id ?? null
    }

    return {
      height: bestHeight,
      normal: bestNormal,
      colliderId: bestColliderId,
    }
  }

  moveCharacterXZ(
    current: Vec3Like,
    deltaX: number,
    deltaZ: number,
    bodyBottomY: number,
    bodyTopY: number,
    config: CharacterCollisionConfig,
  ): CharacterMoveResult {
    const moveLength = Math.hypot(deltaX, deltaZ)
    const steps = Math.max(1, Math.ceil(moveLength / Math.max(0.001, config.substepDistance)))
    const stepX = deltaX / steps
    const stepZ = deltaZ / steps

    let x = current.x
    let z = current.z
    let blocked = false
    let touchedCollider = false

    for (let i = 0; i < steps; i++) {
      const full = this.tryMoveStep(x, z, x + stepX, z + stepZ, bodyBottomY, bodyTopY, config)
      if (full.accepted) {
        x = full.x
        z = full.z
        touchedCollider = touchedCollider || full.touchedCollider
        continue
      }

      blocked = true

      const xOnly = this.tryMoveStep(x, z, x + stepX, z, bodyBottomY, bodyTopY, config)
      if (xOnly.accepted) {
        x = xOnly.x
        touchedCollider = touchedCollider || xOnly.touchedCollider
      }

      const zOnly = this.tryMoveStep(x, z, x, z + stepZ, bodyBottomY, bodyTopY, config)
      if (zOnly.accepted) {
        z = zOnly.z
        touchedCollider = touchedCollider || zOnly.touchedCollider
      }
    }

    const groundHeight = this.getGroundHeight(x, z)
    const groundNormal = this.getGroundNormal(x, z)
    const groundAngleRad = groundAngleFromNormal(groundNormal)

    return {
      x,
      z,
      blocked,
      touchedCollider,
      groundHeight,
      groundNormal,
      groundAngleRad,
      groundWalkable: groundAngleRad <= config.maxClimbAngleRad,
    }
  }

  moveDiscXZ(
    current: Vec3Like,
    deltaX: number,
    deltaZ: number,
    bodyBottomY: number,
    bodyTopY: number,
    config: DiscCollisionConfig,
    ignoreColliderId?: string,
  ): { x: number; z: number; blocked: boolean; touchedCollider: boolean } {
    const moveLength = Math.hypot(deltaX, deltaZ)
    const steps = Math.max(1, Math.ceil(moveLength / Math.max(0.001, config.substepDistance)))
    const stepX = deltaX / steps
    const stepZ = deltaZ / steps

    let x = current.x
    let z = current.z
    let blocked = false
    let touchedCollider = false

    for (let i = 0; i < steps; i++) {
      const resolved = this.resolveStaticColliders(
        x + stepX,
        z + stepZ,
        bodyBottomY,
        bodyTopY,
        config,
        ignoreColliderId,
      )

      const moved =
        Math.abs(resolved.x - (x + stepX)) > 1e-4 || Math.abs(resolved.z - (z + stepZ)) > 1e-4
      blocked = blocked || moved
      touchedCollider = touchedCollider || resolved.touchedCollider
      x = resolved.x
      z = resolved.z
    }

    return { x, z, blocked, touchedCollider }
  }

  private tryMoveStep(
    currentX: number,
    currentZ: number,
    targetX: number,
    targetZ: number,
    bodyBottomY: number,
    bodyTopY: number,
    config: CharacterCollisionConfig,
  ): { accepted: boolean; x: number; z: number; touchedCollider: boolean } {
    if (!this.canTraverseTerrain(currentX, currentZ, targetX, targetZ, bodyBottomY, config)) {
      return { accepted: false, x: currentX, z: currentZ, touchedCollider: false }
    }

    const resolved = this.resolveStaticColliders(targetX, targetZ, bodyBottomY, bodyTopY, config)
    if (!resolved.accepted) {
      return {
        accepted: false,
        x: currentX,
        z: currentZ,
        touchedCollider: resolved.touchedCollider,
      }
    }

    return resolved
  }

  private canTraverseTerrain(
    _currentX: number,
    _currentZ: number,
    _targetX: number,
    _targetZ: number,
    _bodyBottomY: number,
    _config: CharacterCollisionConfig,
  ): boolean {
    if (!this.heightmap) return true
    return true
  }

  private resolveStaticColliders(
    x: number,
    z: number,
    bodyBottomY: number,
    bodyTopY: number,
    config: Pick<CharacterCollisionConfig, 'radius' | 'skinWidth'>,
    ignoreColliderId?: string,
  ): { accepted: boolean; x: number; z: number; touchedCollider: boolean } {
    let resolvedX = x
    let resolvedZ = z
    let touchedCollider = false

    for (const collider of this.colliders) {
      if (!isColliderEnabled(collider.enabled)) continue
      if (ignoreColliderId && collider.id === ignoreColliderId) continue

      if (collider.kind === 'sphere') {
        const center = resolveVec3(collider.center)
        if (collider.minY !== undefined && bodyTopY < collider.minY) continue
        if (collider.maxY !== undefined && bodyBottomY > collider.maxY) continue

        const combinedRadius = config.radius + collider.radius + config.skinWidth
        const dx = resolvedX - center.x
        const dz = resolvedZ - center.z
        const distanceSq = dx * dx + dz * dz
        if (distanceSq >= combinedRadius * combinedRadius) continue

        touchedCollider = true
        const distance = Math.sqrt(distanceSq)
        if (distance < 1e-5) {
          resolvedX = center.x + combinedRadius
          continue
        }

        const push = combinedRadius - distance
        resolvedX += (dx / distance) * push
        resolvedZ += (dz / distance) * push
        continue
      }

      const min = resolveVec3(collider.min)
      const max = resolveVec3(collider.max)
      if (bodyTopY < min.y || bodyBottomY > max.y) continue

      const expandedMinX = min.x - config.radius - config.skinWidth
      const expandedMaxX = max.x + config.radius + config.skinWidth
      const expandedMinZ = min.z - config.radius - config.skinWidth
      const expandedMaxZ = max.z + config.radius + config.skinWidth

      if (
        resolvedX < expandedMinX ||
        resolvedX > expandedMaxX ||
        resolvedZ < expandedMinZ ||
        resolvedZ > expandedMaxZ
      ) {
        continue
      }

      touchedCollider = true
      const pushLeft = Math.abs(expandedMinX - resolvedX)
      const pushRight = Math.abs(expandedMaxX - resolvedX)
      const pushBack = Math.abs(expandedMinZ - resolvedZ)
      const pushForward = Math.abs(expandedMaxZ - resolvedZ)
      const minPush = Math.min(pushLeft, pushRight, pushBack, pushForward)

      if (minPush === pushLeft) resolvedX = expandedMinX
      else if (minPush === pushRight) resolvedX = expandedMaxX
      else if (minPush === pushBack) resolvedZ = expandedMinZ
      else resolvedZ = expandedMaxZ
    }

    return { accepted: true, x: resolvedX, z: resolvedZ, touchedCollider }
  }
}
