/**
 * FPS level helper — spawns hostages with HP, world HP bars, and system registration.
 *
 * Keeps {@link Hostage} domain state, {@link HostageModel} visuals, and hooks into
 * {@link ProjectileSystem} / {@link EnemyProjectileSystem} so the view only wires
 * counts and queries `getHostages()` for {@link EnemyDirector}.
 *
 * @author guinetik
 * @date 2026-04-08
 * @spec docs/asteroid-lander-gdd.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { Heightmap } from '@/lib/terrain/heightmap'
import type { ProjectileSystem } from '@/lib/fps/projectileSystem'
import type { EnemyProjectileSystem } from '@/lib/fps/enemyProjectileSystem'
import {
  Hostage,
  HOSTAGE_DEFAULT_HIT_RADIUS,
  HOSTAGE_HIT_CENTER_Y,
} from '@/lib/fps/hostage'

import { HostageModel } from './HostageModel'

/** Canvas width for generated HP bar texture (pixels). */
const HP_BAR_CANVAS_W = 128
/** Canvas height for generated HP bar texture (pixels). */
const HP_BAR_CANVAS_H = 20
/** World-space width of the HP bar sprite. */
const HP_BAR_SPRITE_W = 0.95
/** World-space height of the HP bar sprite. */
const HP_BAR_SPRITE_H = 0.16
/** Gap between mesh top and bottom of the bar (group local space). */
const HP_BAR_CLEARANCE_ABOVE_MESH = 0.15
/**
 * Local Y for the bar center when bounding-box read fails (should match ~head height
 * for default {@link HostageModel} scale).
 */
const HP_BAR_FALLBACK_LOCAL_Y = 2.15

/** HP ratio above this uses the “healthy” bar color. */
const HP_PCT_HIGH = 0.55
/** HP ratio above this uses the mid warning color. */
const HP_PCT_MID = 0.25

const HP_COLOR_HIGH = '#22c55e'
const HP_COLOR_MID = '#eab308'
const HP_COLOR_LOW = '#ef4444'
const HP_BAR_BG = 'rgba(20,20,24,0.75)'

const _barTopScratch = new THREE.Vector3()

/**
 * Local-space Y for the HP sprite center: above the rig AABB top (handles GLB pivot offset).
 *
 * @param hostageRoot - {@link HostageModel.group} (mesh only; sprite not parented yet)
 */
function computeHostageHpBarLocalY(hostageRoot: THREE.Group): number {
  hostageRoot.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(hostageRoot)
  if (box.isEmpty()) {
    return HP_BAR_FALLBACK_LOCAL_Y
  }
  _barTopScratch.set(
    (box.min.x + box.max.x) * 0.5,
    box.max.y,
    (box.min.z + box.max.z) * 0.5,
  )
  hostageRoot.worldToLocal(_barTopScratch)
  return (
    _barTopScratch.y + HP_BAR_CLEARANCE_ABOVE_MESH + HP_BAR_SPRITE_H * 0.5
  )
}

/** Fallback when the rig has no mesh child or empty bounds. */
const HOSTAGE_HIT_MESH_BOUNDS_FALLBACK_OFFSET_Y = HOSTAGE_HIT_CENTER_Y
const HOSTAGE_HIT_MESH_BOUNDS_FALLBACK_RADIUS = HOSTAGE_DEFAULT_HIT_RADIUS
/** Blend mesh half-width into hit radius so LAS can connect with the visible silhouette. */
const HOSTAGE_HIT_RADIUS_FROM_HALF_WIDTH = 0.58
const HOSTAGE_HIT_RADIUS_MIN = 1.35
const HOSTAGE_HIT_RADIUS_MAX = 2.75

const _hostageHitBboxCenter = new THREE.Vector3()
const _hostageHitBboxSize = new THREE.Vector3()

/**
 * Derive projectile hit sphere from the skinned mesh AABB (not the group feet pivot).
 *
 * @param model - Placed hostage visual (HP sprite not parented yet)
 */
function computeHostageHitFromMeshRoot(model: HostageModel): {
  hitCenterOffsetY: number
  hitRadius: number
} {
  const meshRoot = model.group.children[0] as THREE.Object3D | undefined
  if (!meshRoot) {
    return {
      hitCenterOffsetY: HOSTAGE_HIT_MESH_BOUNDS_FALLBACK_OFFSET_Y,
      hitRadius: HOSTAGE_HIT_MESH_BOUNDS_FALLBACK_RADIUS,
    }
  }
  meshRoot.updateMatrixWorld(true)
  model.group.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(meshRoot)
  if (box.isEmpty()) {
    return {
      hitCenterOffsetY: HOSTAGE_HIT_MESH_BOUNDS_FALLBACK_OFFSET_Y,
      hitRadius: HOSTAGE_HIT_MESH_BOUNDS_FALLBACK_RADIUS,
    }
  }
  box.getCenter(_hostageHitBboxCenter)
  box.getSize(_hostageHitBboxSize)
  const hitCenterOffsetY = _hostageHitBboxCenter.y - model.group.position.y
  const halfW = 0.5 * Math.max(_hostageHitBboxSize.x, _hostageHitBboxSize.z)
  const hitRadius = THREE.MathUtils.clamp(
    Math.max(HOSTAGE_DEFAULT_HIT_RADIUS, halfW * HOSTAGE_HIT_RADIUS_FROM_HALF_WIDTH),
    HOSTAGE_HIT_RADIUS_MIN,
    HOSTAGE_HIT_RADIUS_MAX,
  )
  return { hitCenterOffsetY, hitRadius }
}

/**
 * One hostage instance — domain entity, model, and billboard HP bar.
 */
class HostageInstance {
  readonly hostage: Hostage
  readonly model: HostageModel
  private readonly sprite: THREE.Sprite
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly texture: THREE.CanvasTexture
  private dead = false
  /** Rounded HP label — avoids redrawing when unchanged. */
  private lastRoundedHp = Number.NaN

  /**
   * @param hostage - Shared HP state
   * @param model - GLB instance
   * @param onRemoveFromSystems - Unregister from projectile systems
   */
  constructor(
    hostage: Hostage,
    model: HostageModel,
    private readonly onRemoveFromSystems: (h: Hostage) => void,
  ) {
    this.hostage = hostage
    this.model = model

    this.canvas = document.createElement('canvas')
    this.canvas.width = HP_BAR_CANVAS_W
    this.canvas.height = HP_BAR_CANVAS_H
    const ctx = this.canvas.getContext('2d')
    if (!ctx) {
      throw new Error('FpsHostageController: 2D context unavailable for HP bar')
    }
    this.ctx = ctx
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    const mat = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    })
    this.sprite = new THREE.Sprite(mat)
    const barY = computeHostageHpBarLocalY(this.model.group)
    this.sprite.position.set(0, barY, 0)
    this.sprite.scale.set(HP_BAR_SPRITE_W, HP_BAR_SPRITE_H, 1)
    this.model.group.add(this.sprite)

    this.syncHpBarIfNeeded(true)
    this.hostage.onDeath = () => {
      this.markDead()
    }
  }

  /** Hide visuals and unregister from projectile collision. */
  markDead(): void {
    if (this.dead) return
    this.dead = true
    this.onRemoveFromSystems(this.hostage)
    this.model.group.visible = false
  }

  /** @returns Whether this instance is still an active rescue target */
  isActive(): boolean {
    return !this.dead && this.hostage.alive
  }

  syncAnchorToGroup(): void {
    this.hostage.position.copy(this.model.group.position)
  }

  /** Redraw the canvas texture from current {@link Hostage.hp}. */
  redrawHpBar(): void {
    const w = HP_BAR_CANVAS_W
    const h = HP_BAR_CANVAS_H
    const pad = 2
    const ratio = this.hostage.maxHp > 0 ? this.hostage.hp / this.hostage.maxHp : 0
    const fillW = Math.max(0, (w - pad * 2) * ratio)

    this.ctx.fillStyle = HP_BAR_BG
    this.ctx.fillRect(0, 0, w, h)

    let col = HP_COLOR_LOW
    if (ratio > HP_PCT_HIGH) col = HP_COLOR_HIGH
    else if (ratio > HP_PCT_MID) col = HP_COLOR_MID

    this.ctx.fillStyle = col
    this.ctx.fillRect(pad, pad, fillW, h - pad * 2)
    this.texture.needsUpdate = true
  }

  /**
   * Update the bar texture only when displayed HP changes.
   *
   * @param force - When true, always redraw
   */
  syncHpBarIfNeeded(force = false): void {
    const r = Math.ceil(this.hostage.hp)
    if (force || r !== this.lastRoundedHp) {
      this.lastRoundedHp = r
      this.redrawHpBar()
    }
  }

  tick(dt: number): void {
    if (!this.dead && this.hostage.alive) {
      this.model.tickFeedback(dt)
    }
  }

  pulseHeal(): void {
    this.model.pulseHealFeedback()
  }

  pulseDamage(): void {
    this.model.pulseDamageFeedback()
  }

  dispose(): void {
    this.sprite.material.map?.dispose()
    ;(this.sprite.material as THREE.SpriteMaterial).dispose()
    this.texture.dispose()
    this.model.dispose()
  }
}

/**
 * Spawns and ticks all hostages for an FPS demo / level slice.
 *
 * @author guinetik
 * @date 2026-04-08
 * @spec docs/asteroid-lander-gdd.md
 */
export class FpsHostageController implements Tickable {
  private readonly scene: THREE.Scene
  private readonly heightmap: Heightmap
  private readonly instances: HostageInstance[] = []
  private projectileSystem: ProjectileSystem | null = null
  private enemyProjectileSystem: EnemyProjectileSystem | null = null

  /**
   * @param scene - Scene the hostage groups are added to
   * @param heightmap - Ground height for placement
   */
  constructor(scene: THREE.Scene, heightmap: Heightmap) {
    this.scene = scene
    this.heightmap = heightmap
  }

  /** Wire player bolt collisions (optional until systems exist). */
  setProjectileSystem(ps: ProjectileSystem | null): void {
    this.projectileSystem = ps
  }

  /** Wire enemy bolt collisions (optional). */
  setEnemyProjectileSystem(eps: EnemyProjectileSystem | null): void {
    this.enemyProjectileSystem = eps
  }

  /**
   * Total spawned hostages, including dead/inactive ones.
   */
  getTotalCount(): number {
    return this.instances.length
  }

  /**
   * Number of currently alive rescue targets.
   */
  getAliveCount(): number {
    let count = 0
    for (const inst of this.instances) {
      if (inst.isActive()) count++
    }
    return count
  }

  /**
   * Whether every currently alive hostage is fully healed.
   */
  areAllLivingHostagesAtFullHealth(): boolean {
    let living = 0
    for (const inst of this.instances) {
      if (!inst.isActive()) continue
      living++
      if (inst.hostage.hp < inst.hostage.maxHp) return false
    }
    return living > 0
  }

  /**
   * Alive {@link Hostage} entities for {@link EnemyDirector.setHostageTargets}.
   */
  getHostages(): readonly Hostage[] {
    return this.instances.filter((i) => i.isActive()).map((i) => i.hostage)
  }

  /**
   * All hostage entities (including dead) for {@link EnemyDirector} — the director
   * skips `!alive` each tick while positions are still updated from visuals.
   */
  getHostageEntitiesForDirector(): readonly Hostage[] {
    return this.instances.map((i) => i.hostage)
  }

  /**
   * Remove every hostage from the scene and combat systems, but keep the controller alive.
   */
  clear(): void {
    for (const inst of this.instances) {
      this.projectileSystem?.removeHostage(inst.hostage)
      this.enemyProjectileSystem?.removeHostage(inst.hostage)
      inst.dispose()
      this.scene.remove(inst.model.group)
    }
    this.instances.length = 0
  }

  /**
   * Spawn hostages in a horizontal ring on the terrain.
   *
   * @param count - Number of instances
   * @param radius - Ring radius (world units)
   */
  async spawnRing(count: number, radius: number): Promise<void> {
    await HostageModel.preload()
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      await this.spawnAtPosition(x, z, Math.atan2(-x, -z))
    }
  }

  /**
   * Spawn hostages at explicit world positions on the terrain.
   *
   * @param positions - World-space X/Z anchors and optional yaw
   */
  async spawnAtPositions(
    positions: ReadonlyArray<{ x: number; z: number; yaw?: number }>,
  ): Promise<void> {
    await HostageModel.preload()
    for (const pos of positions) {
      await this.spawnAtPosition(pos.x, pos.z, pos.yaw)
    }
  }

  /**
   * Apply heal feedback to the instance that owns this hostage (if any).
   *
   * @param hostage - Domain entity that was healed
   */
  notifyHealed(hostage: Hostage): void {
    const inst = this.instances.find((i) => i.hostage === hostage)
    inst?.pulseHeal()
    inst?.syncHpBarIfNeeded(true)
  }

  /**
   * Apply damage feedback to the instance that owns this hostage (if any).
   *
   * @param hostage - Domain entity that was damaged
   */
  notifyDamaged(hostage: Hostage): void {
    const inst = this.instances.find((i) => i.hostage === hostage)
    inst?.pulseDamage()
    inst?.syncHpBarIfNeeded(true)
  }

  /** @inheritdoc */
  tick(_dt: number): void {
    for (const inst of this.instances) {
      inst.syncAnchorToGroup()
      inst.tick(_dt)
      if (inst.isActive()) {
        inst.syncHpBarIfNeeded()
      }
    }
  }

  /** Remove all instances from the scene and collision lists. */
  dispose(): void {
    this.clear()
  }

  private async spawnAtPosition(x: number, z: number, yaw?: number): Promise<void> {
    const y = this.heightmap.heightAt(x, z)
    const model = await HostageModel.create()
    model.placeAt(x, y, z)
    model.setYaw(yaw ?? 0)

    const { hitCenterOffsetY, hitRadius } = computeHostageHitFromMeshRoot(model)
    const hostage = new Hostage({ hitCenterOffsetY, hitRadius })
    const inst = new HostageInstance(hostage, model, (h) => {
      this.projectileSystem?.removeHostage(h)
      this.enemyProjectileSystem?.removeHostage(h)
    })
    inst.syncAnchorToGroup()

    this.projectileSystem?.addHostage(hostage)
    this.enemyProjectileSystem?.addHostage(hostage)

    this.instances.push(inst)
    this.scene.add(model.group)
  }
}
