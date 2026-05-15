/**
 * Pooled wall-impact decals for the multitool projectile system.
 *
 * Each decal is a small flat plane oriented to the surface normal at the
 * impact point, tinted by the firing mode's bolt color, and faded over
 * {@link WallImpactDecalPool.DECAL_LIFETIME} seconds. Modeled after the
 * scorch-disc pattern in `ThrusterWashController` but generalized into a
 * fixed-capacity spawn pool with per-instance lifetime + colour.
 *
 * Used by station-interior projectile hits to leave a visible mark on
 * walls / doors / floor / ceiling so the player sees where their shots
 * landed without spawning permanent geometry.
 *
 * @author guinetik
 * @date 2026-05-15
 * @spec docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md
 */
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
  type Scene,
} from 'three'
import type { Tickable } from '@/lib/Tickable'

/** Pool capacity — enough to overlap several seconds of rapid drill bursts. */
const POOL_SIZE = 24
/** World-space radius of each decal plane (the plane is `2 * radius` wide). */
const DECAL_RADIUS = 0.35
/** Seconds each decal stays visible before fading out. */
const DECAL_LIFETIME = 0.35
/**
 * Fade curve exponent. Opacity = `(life/lifetime) ^ exponent`. Values
 * above 1 hold full brightness briefly then drop off fast — a quick
 * flash-and-fade rather than a slow linear dim.
 */
const DECAL_FADE_EXPONENT = 2.5
/** Resolution of the generated radial-gradient texture. */
const TEXTURE_RESOLUTION = 128
/**
 * Tiny world-space lift along the surface normal — combined with
 * polygon offset on the material, this keeps the decal from z-fighting
 * without making it visibly float in front of the wall.
 */
const SURFACE_LIFT = 0.003

/** One pooled decal mesh + its remaining lifetime. */
interface DecalSlot {
  /** Mesh kept in the scene the whole time; visibility toggled per use. */
  mesh: Mesh<PlaneGeometry, MeshBasicMaterial>
  /** Seconds of life left; `0` means the slot is free. */
  life: number
}

/**
 * Generate a soft white radial gradient on an offscreen canvas. The
 * result is reused across every pooled decal — colour comes from the
 * per-mesh material tint, additive blending blows it out into a glow.
 *
 * @returns Canvas texture suitable for `MeshBasicMaterial.map`.
 */
function buildRadialTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = TEXTURE_RESOLUTION
  canvas.height = TEXTURE_RESOLUTION
  const ctx = canvas.getContext('2d')!
  const cx = TEXTURE_RESOLUTION / 2
  const cy = TEXTURE_RESOLUTION / 2
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
  gradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.55)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, TEXTURE_RESOLUTION, TEXTURE_RESOLUTION)
  const texture = new CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

/**
 * Fixed-capacity pool of wall-aligned impact decals.
 */
export class WallImpactDecalPool implements Tickable {
  private readonly scene: Scene
  private readonly slots: DecalSlot[] = []
  private readonly texture: CanvasTexture
  private nextSlot = 0
  /** Reused scratch — world up reference used to disambiguate decal roll. */
  private readonly _worldUp = new Vector3(0, 1, 0)
  /** Reused scratch — secondary up reference for floor/ceiling decals. */
  private readonly _worldForward = new Vector3(0, 0, 1)
  /** Reused scratch — tangent vector inside the wall plane. */
  private readonly _tangent = new Vector3()
  /** Reused scratch — bitangent vector inside the wall plane. */
  private readonly _bitangent = new Vector3()
  /** Reused scratch — final orientation matrix. */
  private readonly _basis = new Matrix4()

  constructor(scene: Scene) {
    this.scene = scene
    this.texture = buildRadialTexture()
    const geometry = new PlaneGeometry(DECAL_RADIUS * 2, DECAL_RADIUS * 2)
    for (let i = 0; i < POOL_SIZE; i++) {
      const material = new MeshBasicMaterial({
        map: this.texture,
        color: new Color(0xffffff),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
      const mesh = new Mesh(geometry, material)
      mesh.visible = false
      mesh.renderOrder = 10
      this.scene.add(mesh)
      this.slots.push({ mesh, life: 0 })
    }
  }

  /**
   * Stamp a decal at the given world-space point, oriented so its
   * normal matches `surfaceNormal`. Uses a round-robin slot so very
   * rapid fire cycles through the pool instead of overlapping at the
   * same XYZ.
   *
   * @param point - World-space impact position.
   * @param surfaceNormal - Unit vector pointing away from the struck surface.
   * @param colorHex - 24-bit RGB tint (matches the bolt colour for the mode).
   */
  spawn(point: Vector3, surfaceNormal: Vector3, colorHex: number): void {
    const slot = this.slots[this.nextSlot]
    if (!slot) return
    this.nextSlot = (this.nextSlot + 1) % POOL_SIZE
    slot.mesh.position.set(
      point.x + surfaceNormal.x * SURFACE_LIFT,
      point.y + surfaceNormal.y * SURFACE_LIFT,
      point.z + surfaceNormal.z * SURFACE_LIFT,
    )
    // Build an explicit orthonormal basis so the plane lies flat on
    // the wall with a deterministic roll: local +Z = surfaceNormal,
    // local +Y = world up (or world +Z when the surface IS world up,
    // i.e. floor / ceiling decals). `setFromUnitVectors` alone would
    // pick an arbitrary roll around the normal and tilt the decal off
    // axis when the bolt's incidence vector wasn't perpendicular.
    const upRef =
      Math.abs(surfaceNormal.y) > 0.99 ? this._worldForward : this._worldUp
    this._tangent.crossVectors(upRef, surfaceNormal).normalize()
    if (this._tangent.lengthSq() < 1e-6) {
      this._tangent.set(1, 0, 0)
    }
    this._bitangent.crossVectors(surfaceNormal, this._tangent).normalize()
    this._basis.makeBasis(this._tangent, this._bitangent, surfaceNormal)
    slot.mesh.quaternion.setFromRotationMatrix(this._basis)
    slot.mesh.material.color.setHex(colorHex)
    slot.mesh.material.opacity = 1
    slot.mesh.visible = true
    slot.life = DECAL_LIFETIME
  }

  tick(dt: number): void {
    for (const slot of this.slots) {
      if (slot.life <= 0) continue
      slot.life -= dt
      if (slot.life <= 0) {
        slot.life = 0
        slot.mesh.visible = false
        slot.mesh.material.opacity = 0
      } else {
        const k = slot.life / DECAL_LIFETIME
        slot.mesh.material.opacity = Math.pow(k, DECAL_FADE_EXPONENT)
      }
    }
  }

  /** Detach + free GPU resources. Safe to call multiple times. */
  dispose(): void {
    for (const slot of this.slots) {
      this.scene.remove(slot.mesh)
      slot.mesh.material.dispose()
    }
    // All slots share one geometry — dispose via the first slot.
    const first = this.slots[0]
    if (first) first.mesh.geometry.dispose()
    this.slots.length = 0
    this.texture.dispose()
  }
}
