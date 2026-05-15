/**
 * Visual mesh for a single turret laser-dart projectile.
 *
 * Modeled after `EnemyProjectileMesh` but uses an elongated, additive-red
 * cylinder so turret bursts read as Star-Wars-style blaster bolts rather
 * than the soft orange spheres the existing enemies fire. Pool-friendly:
 * geometry + materials are module-level singletons, every instance just
 * owns a `THREE.Group` wrapper that re-uses them.
 *
 * The cylinder is authored along the local Z axis (length = `DART_LENGTH`)
 * so the controller can orient an instance with `lookAt` to align the dart
 * with its travel direction.
 *
 * @author guinetik
 * @date 2026-05-15
 * @spec docs/space-station-update-gdd.md
 */
import * as THREE from 'three'

/** Length of the bolt along its travel axis (world metres). */
const DART_LENGTH = 0.7
/** Radius of the bolt cylinder. */
const DART_RADIUS = 0.06
/** Halo billboard half-extent. */
const HALO_RADIUS = 0.35
/** Halo billboard opacity. */
const HALO_OPACITY = 0.55
/** Tessellation for the dart cylinder — radial segments. */
const DART_RADIAL_SEGMENTS = 6

/**
 * Shared cylinder oriented along +Z. Three.js' default cylinder is
 * Y-aligned, so we rotate the geometry once at module load and let every
 * instance reuse the rotated buffer — saves a per-instance rotation.
 */
const dartGeo = (() => {
  const geo = new THREE.CylinderGeometry(
    DART_RADIUS,
    DART_RADIUS,
    DART_LENGTH,
    DART_RADIAL_SEGMENTS,
  )
  geo.rotateX(Math.PI / 2)
  return geo
})()

/** Shared core material — bright additive red, no depth-write. */
const dartCoreMat = new THREE.MeshBasicMaterial({
  color: 0xff2233,
  transparent: true,
  opacity: 1,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
})

/**
 * Shared radial-gradient halo texture. A flat-coloured `SpriteMaterial`
 * paints the whole unit quad and reads as a solid red square; we need
 * a circular falloff so the halo looks like a soft bloom around the
 * dart core. The texture is generated once at module load and reused
 * by every dart instance.
 */
const haloTexture = (() => {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
  gradient.addColorStop(0.4, 'rgba(255, 200, 200, 0.55)')
  gradient.addColorStop(1, 'rgba(255, 100, 100, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  return tex
})()

/**
 * Shared halo material — soft red glow billboard around the dart core.
 * The radial-gradient {@link haloTexture} carries the falloff so the
 * additive blend reads as a bloom instead of a solid square.
 */
const haloMat = new THREE.SpriteMaterial({
  map: haloTexture,
  color: 0xff5566,
  transparent: true,
  opacity: HALO_OPACITY,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
})

/**
 * Pool-managed single-shot visual for a turret laser-dart projectile.
 *
 * Owns no per-instance disposable resources — the geometry and materials
 * are shared module-level singletons. Disposing the wrapper just removes
 * the group from its parent.
 */
export class TurretLaserDartMesh {
  /** Root group — pooled, parented under the scene at construction. */
  readonly group = new THREE.Group()
  /** Reused scratch for the lookAt target so we don't allocate per shot. */
  private readonly _lookTarget = new THREE.Vector3()

  constructor() {
    const core = new THREE.Mesh(dartGeo, dartCoreMat)
    this.group.add(core)
    const halo = new THREE.Sprite(haloMat)
    halo.scale.set(HALO_RADIUS * 2, HALO_RADIUS * 2, 1)
    halo.renderOrder = 1
    this.group.add(halo)
  }

  /**
   * Place the dart at a world position and aim its long axis along the
   * given direction. The dart's geometry is +Z aligned, so we use the
   * built-in `lookAt` helper after offsetting the target by the
   * direction vector.
   *
   * @param x - World X.
   * @param y - World Y.
   * @param z - World Z.
   * @param dirX - Travel direction X (need not be normalized).
   * @param dirY - Travel direction Y.
   * @param dirZ - Travel direction Z.
   */
  setPositionAndDirection(
    x: number,
    y: number,
    z: number,
    dirX: number,
    dirY: number,
    dirZ: number,
  ): void {
    this.group.position.set(x, y, z)
    this._lookTarget.set(x + dirX, y + dirY, z + dirZ)
    this.group.lookAt(this._lookTarget)
  }

  /** Show or hide the dart wrapper. Used by the pool on acquire / release. */
  setVisible(visible: boolean): void {
    this.group.visible = visible
  }

  /** Reset to a clean state ready for re-acquisition. */
  reset(): void {
    this.group.visible = true
    this.group.position.set(0, 0, 0)
    this.group.rotation.set(0, 0, 0)
  }

  /** Hard teardown — removes the group from its parent. */
  dispose(): void {
    this.group.removeFromParent()
  }
}
