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
import { Hostage, HOSTAGE_DEFAULT_HIT_RADIUS, HOSTAGE_HIT_CENTER_Y } from '@/lib/fps/hostage'

import { HostageModel } from './HostageModel'
import { HostageWalker } from './HostageWalker'

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
const HOSTAGE_REVEAL_DURATION = 0.9
const HOSTAGE_REVEAL_START_SCALE = 0.18
const HOSTAGE_REVEAL_START_DEPTH = 2.6
/** Duration of the scale + opacity fade when a recruited hostage reaches the lander (s). */
const HOSTAGE_BOARD_FADE_DURATION = 0.4

/**
 * Radius (m) sampled around the spawn anchor when picking a ground Y.
 * The praying pose drops the hips below the feet, so on a slope the uphill
 * side of the model footprint can sit above the single-point heightAt and the
 * rig clips into the terrain. Anchoring at the *max* height under the
 * footprint keeps the visible mesh above ground at the cost of a tiny float on
 * the downhill side — acceptable cosmetic trade for not phasing through dirt.
 */
const HOSTAGE_GROUND_SAMPLE_RADIUS = 1.0

/** Cardinal samples around the spawn anchor — N/E/S/W is enough for slope detection. */
const HOSTAGE_GROUND_SAMPLE_COUNT = 4

/**
 * Oversample the heightmap in a ring around `(cx, cz)` and return the highest
 * ground Y under the model's footprint. See {@link HOSTAGE_GROUND_SAMPLE_RADIUS}
 * for why the max (not the center) is the right anchor for kneeling rigs.
 *
 * @param heightmap - Terrain to sample
 * @param cx        - Footprint center X
 * @param cz        - Footprint center Z
 * @returns Max ground Y across the center plus four cardinal offsets
 */
function sampleMaxGroundHeight(heightmap: Heightmap, cx: number, cz: number): number {
  let maxY = heightmap.heightAt(cx, cz)
  for (let i = 0; i < HOSTAGE_GROUND_SAMPLE_COUNT; i++) {
    const angle = (i / HOSTAGE_GROUND_SAMPLE_COUNT) * Math.PI * 2
    const sx = cx + Math.cos(angle) * HOSTAGE_GROUND_SAMPLE_RADIUS
    const sz = cz + Math.sin(angle) * HOSTAGE_GROUND_SAMPLE_RADIUS
    const y = heightmap.heightAt(sx, sz)
    if (y > maxY) maxY = y
  }
  return maxY
}

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
  _barTopScratch.set((box.min.x + box.max.x) * 0.5, box.max.y, (box.min.z + box.max.z) * 0.5)
  hostageRoot.worldToLocal(_barTopScratch)
  return _barTopScratch.y + HP_BAR_CLEARANCE_ABOVE_MESH + HP_BAR_SPRITE_H * 0.5
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
export class HostageInstance {
  readonly hostage: Hostage
  readonly model: HostageModel
  private readonly sprite: THREE.Sprite
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly texture: THREE.CanvasTexture
  private dead = false
  private boardFadeTimer = 0
  private revealTimer = HOSTAGE_REVEAL_DURATION
  private targetY = 0
  /** Rounded HP label — avoids redrawing when unchanged. */
  private lastRoundedHp = Number.NaN

  /**
   * @param hostage - Shared HP state
   * @param model - GLB instance
   * @param onIncapacitated - Controller-side cleanup when the hostage drops
   *                         (walker teardown + survivor-lost event). Does NOT
   *                         unregister the hostage from projectile systems —
   *                         the corpse stays registered so a SCI bolt can
   *                         revive it. Combat / enemy paths already skip
   *                         `!hostage.alive`.
   * @param onRevived - Controller-side cleanup when {@link revive} restores
   *                    the hostage. Re-arms walker eligibility and emits the
   *                    revive event so HUDs can refresh counts.
   */
  constructor(
    hostage: Hostage,
    model: HostageModel,
    private readonly onIncapacitated: (h: Hostage) => void,
    private readonly onRevived: (h: Hostage) => void,
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
    this.hostage.onRevive = () => {
      this.revive()
    }
  }

  /**
   * Begin the board fade. After {@link HOSTAGE_BOARD_FADE_DURATION} the
   * controller removes the instance entirely; until then the model scales
   * and fades out smoothly. Idempotent.
   */
  beginBoardFade(): void {
    if (this.boardFadeTimer > 0 || this.dead) return
    this.boardFadeTimer = HOSTAGE_BOARD_FADE_DURATION
    this.sprite.visible = false
  }

  /** True when the board fade has fully played out and the controller can remove this instance. */
  get isBoardFadeComplete(): boolean {
    return this.boardFadeTimer < 0
  }

  /** True if the board fade is active (used by tick to drive the visual). */
  get isBoarding(): boolean {
    return this.boardFadeTimer > 0
  }

  /**
   * Mark the instance as incapacitated: hide the HP bar, play the dying clip,
   * and notify the controller for walker teardown + survivor-lost event. The
   * corpse stays visible (the dying clip clamps on its last frame) and stays
   * registered with the projectile systems so a SCI bolt can revive it via
   * {@link revive} — combat paths already skip `!hostage.alive`.
   */
  markDead(): void {
    if (this.dead) return
    this.dead = true
    this.sprite.visible = false
    void this.model.playDying()
    this.onIncapacitated(this.hostage)
  }

  /**
   * Bring an incapacitated hostage back online: re-show the HP bar and notify
   * the controller so HUDs can refresh the alive count. The model stays in its
   * dying-clip clamped pose until the controller auto-recruits the survivor;
   * `recruit()` will then trigger `playStandUp` → `playWalking`, so the visual
   * goes straight from collapsed-on-ground to walking to the lander, skipping
   * the praying loop and the player [E] release prompt.
   */
  revive(): void {
    if (!this.dead) return
    this.dead = false
    this.sprite.visible = true
    this.syncHpBarIfNeeded(true)
    this.onRevived(this.hostage)
  }

  /** @returns Whether this instance is still an active rescue target (excludes mid-board fade) */
  isActive(): boolean {
    return !this.dead && this.hostage.alive && !this.isBoarding
  }

  syncAnchorToGroup(): void {
    this.hostage.position.copy(this.model.group.position)
  }

  beginReveal(targetY: number): void {
    this.targetY = targetY
    this.revealTimer = HOSTAGE_REVEAL_DURATION
    this.model.group.position.y = targetY - HOSTAGE_REVEAL_START_DEPTH
    this.model.group.scale.setScalar(HOSTAGE_REVEAL_START_SCALE)
    this.sprite.visible = false
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
    if (this.revealTimer > 0) {
      this.revealTimer = Math.max(0, this.revealTimer - dt)
      const t = 1 - this.revealTimer / HOSTAGE_REVEAL_DURATION
      const eased = 1 - Math.pow(1 - t, 3)
      this.model.group.position.y = this.targetY - (1 - eased) * HOSTAGE_REVEAL_START_DEPTH
      const scale = HOSTAGE_REVEAL_START_SCALE + eased * (1 - HOSTAGE_REVEAL_START_SCALE)
      this.model.group.scale.setScalar(scale)
      this.sprite.visible = eased >= 0.45 && !this.dead
    } else if (this.boardFadeTimer > 0) {
      this.boardFadeTimer -= dt
      const t = Math.max(0, 1 - this.boardFadeTimer / HOSTAGE_BOARD_FADE_DURATION)
      const scale = 1 - t
      this.model.group.scale.setScalar(Math.max(0.001, scale))
      // Walker drives Y/X/Z; sprite already hidden by beginBoardFade.
    } else {
      this.model.group.scale.setScalar(1)
      this.sprite.visible = !this.dead
    }
    if (!this.dead && this.hostage.alive) {
      this.model.tickFeedback(dt)
    }
    this.model.tickAnimation(dt)
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
  /**
   * Mirror of {@link instances} flattened to the underlying {@link Hostage}
   * domain entities. Maintained alongside `instances` mutations so
   * {@link getHostageEntitiesForDirector} can return a stable reference
   * without allocating a new array each frame.
   */
  private readonly hostageRefs: Hostage[] = []
  private readonly walkers = new Map<Hostage, HostageWalker>()
  private projectileSystem: ProjectileSystem | null = null
  private enemyProjectileSystem: EnemyProjectileSystem | null = null
  private _aboardCount = 0

  /**
   * Fired when a hostage dies (HP hits 0 from any source). Receives the count of
   * survivors still alive AND not yet aboard, so the level VC can route a toast
   * + counter refresh without recomputing.
   */
  onSurvivorLost: ((aliveRemaining: number) => void) | null = null

  /** Fired when a recruited walker boards the lander. */
  onSurvivorAboard: ((aboardCount: number) => void) | null = null

  /**
   * Fired when an incapacitated hostage is revived (e.g. SCI bolt heal).
   * Receives the revived domain entity plus the post-revive count of hostages
   * currently alive AND not yet aboard. The hostage handle lets the consuming
   * minigame auto-recruit the revived survivor (skipping the kneel-and-press-E
   * release flow) so the player isn't forced to round-trip through the heal
   * step a second time.
   */
  onSurvivorRevived: ((hostage: Hostage, aliveRemaining: number) => void) | null = null

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
   * Total hostages currently tracked by the controller (live + dead corpses).
   *
   * NOTE: this count decrements when boarded instances finish their fade and
   * get spliced out of `instances`. It is **not** a stable total-for-display.
   * For the persistent HUD `TOTAL` field, snapshot this value at release time
   * inside the consuming minigame (e.g. `RescueMinigame.totalSurvivors`).
   */
  getTotalCount(): number {
    return this.instances.length
  }

  /** Count of recruited hostages that have walked into the lander. Monotonic per mission. */
  get aboardCount(): number {
    return this._aboardCount
  }

  /**
   * Currently-alive hostages that have not yet boarded the lander. The "not
   * aboard" half is enforced inside {@link HostageInstance.isActive}, which
   * returns false during the board fade — so a plain `getAliveCount()` already
   * excludes boarders. This getter exists as a named alias to make the intent
   * explicit at call sites in `RescueMinigame`.
   */
  get aliveCountNotAboard(): number {
    return this.getAliveCount()
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
   * Whether every tracked hostage — alive AND incapacitated — has full HP.
   * Used by the rescue heal-step gate so the player must revive every downed
   * survivor (SCI heal bolt → revive at maxHp) before the step auto-completes,
   * instead of letting the gate clear on the living count alone and skipping
   * the dead. Walkers mid-board are excluded (they're already extracted).
   */
  areAllTrackedHostagesAtFullHealth(): boolean {
    let counted = 0
    for (const inst of this.instances) {
      if (inst.isBoarding) continue
      counted++
      if (inst.hostage.hp < inst.hostage.maxHp) return false
    }
    return counted > 0
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
   *
   * Returns the cached `hostageRefs` mirror so per-frame consumers
   * (e.g. `RescueMinigame.syncEnemySimulation`) get a stable reference without
   * allocating a fresh array each tick.
   */
  getHostageEntitiesForDirector(): readonly Hostage[] {
    return this.hostageRefs
  }

  /**
   * Look up a {@link HostageInstance} for a given {@link Hostage} (or undefined).
   * Used by `RescueMinigame.findExtractTarget` to filter kneeling hostages by
   * animation state — the state lives on the model, not the domain entity.
   */
  getInstanceFor(hostage: Hostage): HostageInstance | undefined {
    return this.instances.find((i) => i.hostage === hostage)
  }

  /**
   * Return the {@link Hostage} domain entity at spawn index `index`, or
   * `undefined` when the index is out of range. Hostages are appended to the
   * internal list in spawn order, so index 0 is the first operator spawned,
   * index 1 the second, etc. Used by the Yamada patient-rescue variant to
   * identify the VIP operator by their pre-rolled `vipOperatorIndex`.
   *
   * @param index - 0-based spawn order index.
   */
  getHostageByIndex(index: number): Hostage | undefined {
    return this.hostageRefs[index]
  }

  /**
   * World-space (X, Z) anchors for active (alive, not-aboard) hostages. Used by
   * the level HUD to mark survivors on the compass strip and tactical map so
   * the player can find them in rough terrain. Allocates a fresh array per
   * call — only call from low-rate UI polls, not the per-frame sim loop.
   */
  getHostageMarkers(): readonly { x: number; z: number }[] {
    const out: { x: number; z: number }[] = []
    for (const inst of this.instances) {
      if (!inst.isActive()) continue
      const p = inst.hostage.position
      out.push({ x: p.x, z: p.z })
    }
    return out
  }

  /**
   * Currently-walking hostages (mid-extraction). Used by `RescueMinigame` to
   * pick a target for chase-enemy spawns during step 3.
   */
  getWalkingHostages(): readonly Hostage[] {
    const result: Hostage[] = []
    for (const inst of this.instances) {
      if (inst.isActive() && inst.model.getState() === 'walking') {
        result.push(inst.hostage)
      }
    }
    return result
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
    this.hostageRefs.length = 0
    this.walkers.clear()
    this._aboardCount = 0
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
      await this.spawnAtPosition(x, z, Math.atan2(-x, -z), true)
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
      await this.spawnAtPosition(pos.x, pos.z, pos.yaw, true)
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

  /**
   * Recruit a hostage for extraction: kick off the stand-up animation and create
   * a walker that will steer the rig to the live lander position. The
   * `targetProvider` closure is called every tick so the walker tracks the
   * lander even if it moves (relevant once the liftoff lock auto-clears).
   *
   * @param hostage        - Domain entity to recruit
   * @param targetProvider - Live lander XZ provider (returns a fresh `Vector3`)
   */
  recruit(hostage: Hostage, targetProvider: () => THREE.Vector3): void {
    if (this.walkers.has(hostage)) return
    const inst = this.instances.find((i) => i.hostage === hostage)
    if (!inst || !inst.isActive()) return
    void inst.model.playStandUp()
    const walker = new HostageWalker(hostage, inst.model, targetProvider, (h) =>
      this.handleBoard(h),
    )
    this.walkers.set(hostage, walker)
  }

  private handleBoard(hostage: Hostage): void {
    const inst = this.instances.find((i) => i.hostage === hostage)
    if (!inst) return
    inst.beginBoardFade()
    this._aboardCount += 1
    // Remove from collision lists immediately so the dead virus / charges flow
    // doesn't see the boarded hostage as a target. The visual finishes its fade
    // over HOSTAGE_BOARD_FADE_DURATION; the controller removes the scene node
    // once isBoardFadeComplete is true.
    this.projectileSystem?.removeHostage(hostage)
    this.enemyProjectileSystem?.removeHostage(hostage)
    this.onSurvivorAboard?.(this._aboardCount)
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
    for (const walker of this.walkers.values()) {
      walker.tick(_dt, this.heightmap)
    }
    // Remove walkers + instances that finished boarding.
    for (const [hostage, walker] of this.walkers) {
      if (!walker.finished) continue
      const idx = this.instances.findIndex((i) => i.hostage === hostage)
      if (idx >= 0) {
        const inst = this.instances[idx]!
        if (inst.isBoardFadeComplete) {
          inst.dispose()
          this.scene.remove(inst.model.group)
          this.instances.splice(idx, 1)
          this.hostageRefs.splice(idx, 1)
          this.walkers.delete(hostage)
        }
      } else {
        this.walkers.delete(hostage)
      }
    }
  }

  /** Remove all instances from the scene and collision lists. */
  dispose(): void {
    this.clear()
  }

  private async spawnAtPosition(
    x: number,
    z: number,
    yaw?: number,
    animateReveal = false,
  ): Promise<void> {
    const y = sampleMaxGroundHeight(this.heightmap, x, z)
    const model = await HostageModel.create()
    model.placeAt(x, y, z)
    model.setYaw(yaw ?? 0)
    void model.playPraying()

    const { hitCenterOffsetY, hitRadius } = computeHostageHitFromMeshRoot(model)
    const hostage = new Hostage({ hitCenterOffsetY, hitRadius })
    const inst = new HostageInstance(
      hostage,
      model,
      (h) => {
        // Tear down any in-progress extraction so the corpse stops walking,
        // but keep the hostage registered with projectile systems so a SCI
        // heal bolt can still find and revive it. Combat paths skip
        // `!hostage.alive` already, so the corpse is safe from further damage.
        const walker = this.walkers.get(h)
        if (walker) {
          walker.finished = true
          this.walkers.delete(h)
        }
        this.onSurvivorLost?.(this.aliveCountNotAboard)
      },
      (h) => {
        this.onSurvivorRevived?.(h, this.aliveCountNotAboard)
      },
    )
    inst.syncAnchorToGroup()

    this.projectileSystem?.addHostage(hostage)
    this.enemyProjectileSystem?.addHostage(hostage)

    this.instances.push(inst)
    this.hostageRefs.push(hostage)
    this.scene.add(model.group)

    if (animateReveal) {
      inst.beginReveal(y)
    }
  }
}
