/**
 * GLB-backed power-generator prop used inside the station interior.
 *
 * Loads `/models/powergen.glb` — a single `body` mesh plus six fuel
 * canisters (`fuel_1` … `fuel_6`). The model owns a science-bolt repair
 * minigame: every fuel cell starts broken (dim materials + red wireframe
 * overlay) and the player restores power by shooting each cell with the
 * SCI multitool mode until it accumulates {@link FUEL_CELL_REPAIR_HITS}
 * hits. Per-cell wireframe colour walks red → orange → lime → green hold
 * → removal, matching {@link SatelliteRepairController}. When every cell
 * is restored, the model fires {@link onPowerRestored} so the host view
 * can brighten the room and unlock the door to the rest of the station.
 *
 * Implements the {@link EvaSatelliteServicingScienceBoltTarget} contract
 * directly — the projectile system's existing slot is reused so we don't
 * have to fork a parallel hook for in-station repairs.
 *
 * @author guinetik
 * @date 2026-05-15
 * @spec docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md
 */
import * as THREE from 'three'
import type { WorldCollider } from '@/lib/physics/worldCollision'
import { loadGLB } from '@/three/loadGLB'
import { segmentIntersectsAabb3 } from '@/lib/physics/segmentAabb3'
import { Timer } from '@/lib/Timer'

/** Asset URL for the optimized power-generator GLB. */
const POWERGEN_MODEL_URL = '/models/powergen.glb'

/**
 * Native bbox half-extents at scale 1, read from the optimized GLB
 * (`bboxMin (-0.43, 0, -0.54)` / `bboxMax (0.43, 0.73, 0.54)`). The
 * builder folds in the placement scale + the prop's yaw + the room's
 * yaw to produce the world-space collision blocker.
 */
export const STATION_POWERGEN_BASE_HALF_X = 0.43
/** Native lateral half-depth on Z at scale 1. See {@link STATION_POWERGEN_BASE_HALF_X}. */
export const STATION_POWERGEN_BASE_HALF_Z = 0.54
/** Native vertical extent at scale 1 (`bboxMax.y - bboxMin.y`). */
export const STATION_POWERGEN_NATIVE_HEIGHT = 0.73

/** Authored node prefix for the six fuel canister meshes inside the GLB. */
const FUEL_NODE_PREFIX = 'fuel_'

/**
 * Sum of `emissive` RGB channels (each in [0, 1]) above which a material
 * is considered to have a meaningful glow contribution. Catches both
 * pure-black emissive with a bright `emissiveMap` (intensity > 0 carries
 * the glow) and tinted emissive without a map.
 */
const EMISSIVE_RGB_THRESHOLD = 0.05

/** Dark base colour applied to a broken fuel cell's cloned materials. */
const BROKEN_BASE_COLOR = 0x2a2a2e

/** Wireframe colour while the cell is still mostly damaged. */
const DAMAGE_WIREFRAME_COLOR = 0xf87171
/** Wireframe colour at mid-progress (more than 1/3 hits left). */
const AIM_ORANGE = 0xfb923c
/** Wireframe colour at near-completion (1/3 or fewer hits left). */
const ALMOST_REPAIRED_COLOR = 0x84cc16
/** Wireframe colour during the green celebration hold before removal. */
const REPAIR_COMPLETE_COLOR = 0x4ade80

/** Wireframe overlay opacity. Matches `SatelliteRepairController`. */
const WIREFRAME_OPACITY = 0.9

/** Successful SCI hits required to repair a single fuel cell. */
const FUEL_CELL_REPAIR_HITS = 10

/** Seconds the green celebration wireframe stays before removal. */
const REPAIR_HOLD_SECONDS = 1.4

/**
 * Inflate each fuel cell's AABB by this many world units before testing
 * SCI bolt sweeps. Kept tight (≈2 cm) so adjacent cells in the canister
 * pack don't share inflated AABBs — the "best hit" picker can only pick
 * one cell, and inflated overlap is exactly what makes the player feel
 * like the wrong cell got hit. A small epsilon stays to catch grazing
 * impacts on the corners.
 */
const FUEL_CELL_AABB_SLACK = 0.02

/** Treat segment-entry `t` values within this epsilon as ties. */
const SEGMENT_ENTRY_T_EPSILON = 1e-5
/** Bolt segments shorter than this (squared) are skipped. */
const MIN_BOLT_SEGMENT_LENGTH_SQ = 1e-14

/**
 * Captured author-time state for a glow material so the model can flip
 * a single fuel cell between "broken" (dark inert) and "restored" (PBR
 * glow) without re-instantiating materials.
 */
interface GlowMaterialState {
  /** Cloned material owned by this fuel cell; safe to mutate. */
  material: THREE.MeshStandardMaterial
  /** Author-time base colour. Restored on power. */
  originalColor: THREE.Color
  /** Author-time emissive tint. Restored on power. */
  originalEmissive: THREE.Color
  /** Author-time emissive intensity. Restored on power. */
  originalEmissiveIntensity: number
  /** Author-time albedo texture; cleared while broken so the dark colour reads. */
  originalMap: THREE.Texture | null
}

/** Per-cell repair state. */
interface FuelCell {
  /** 1-based index matching the GLB node name (`fuel_<index>`). */
  index: number
  /** Source node in the GLB subtree. */
  source: THREE.Object3D
  /** Wireframe overlay group parented to {@link source}. Hidden once repaired. */
  wireframe: THREE.Group
  /** Cloned glow materials owned by this cell. */
  glowMaterials: GlowMaterialState[]
  /** SCI hits left until the cell is fully repaired. */
  hitsRemaining: number
  /** World-space AABB used by the SCI swept test. */
  worldBounds: THREE.Box3
  /** True once the cell has hit zero hits and is in the green-hold phase. */
  fading: boolean
  /** True once the green hold expired and the wireframe was removed. */
  restored: boolean
}

/**
 * Three.js power-generator model backed by an authored GLB. Construct,
 * await {@link load} (or call {@link placeAt} — load is kicked off in
 * the constructor), then add {@link group} to the scene.
 */
export class StationPowerGenModel {
  /** Public scene-graph node — host scene parents this into its room. */
  readonly group: THREE.Group

  /** Fires once when a fuel cell finishes its green hold. */
  onFuelCellRepaired: ((index: number) => void) | null = null
  /** Fires once when every fuel cell is repaired. */
  onPowerRestored: (() => void) | null = null

  private inner: THREE.Group | null = null
  private readonly fuelCells: Map<number, FuelCell> = new Map()
  private loadStarted = false
  private loaded = false
  private powerRestoredFired = false
  /**
   * Multiplier on the per-shot "inverse damage" SCI bolts deal to a
   * fuel cell. Driven by the `multitoolScience` upgrade so investing in
   * SCI literally charges the generator faster: `×1` stock, `×1.25` /
   * `×1.5` / `×1.75` at levels 1–3. Stays fractional so the upgrade
   * curve reads as a smooth speed-up rather than threshold jumps.
   */
  private scienceHitMultiplier = 1

  /** Reused scratch — bolt segment delta. */
  private readonly _segDelta = new THREE.Vector3()
  /** Reused scratch — hit point in world space. */
  private readonly _hitScratch = new THREE.Vector3()
  /** Reused scratch — vector from segment start to hit point. */
  private readonly _towardHit = new THREE.Vector3()
  /** Reused scratch — AABB size for tie-breaking on equal `t`. */
  private readonly _boundsSize = new THREE.Vector3()

  /** Build an empty wrapper. {@link load} is kicked off automatically. */
  constructor() {
    this.group = new THREE.Group()
    this.group.name = 'stationPowerGen'
    void this.load()
  }

  /** World-space position helper. */
  get position(): THREE.Vector3 {
    return this.group.position
  }

  /**
   * Stream the GLB, build per-cell wireframe overlays, clone glow
   * materials into per-cell instances, and capture each cell's world
   * AABB. Idempotent.
   */
  async load(): Promise<void> {
    if (this.loadStarted) return
    this.loadStarted = true

    const inner = await loadGLB(POWERGEN_MODEL_URL)
    this.inner = inner
    this.group.add(inner)

    inner.traverse((child) => {
      if (!child.name.startsWith(FUEL_NODE_PREFIX)) return
      const idx = Number.parseInt(child.name.slice(FUEL_NODE_PREFIX.length), 10)
      if (!Number.isFinite(idx)) return
      if (this.fuelCells.has(idx)) return
      this.fuelCells.set(idx, this.buildFuelCell(idx, child))
    })

    this.loaded = true
  }

  /** Whether the GLB has finished loading. */
  isLoaded(): boolean {
    return this.loaded
  }

  /**
   * Place this generator at a world position. The GLB's base sits at
   * Y=0 in native space (centered by the optimize pipeline).
   *
   * @param x - World X.
   * @param groundY - Floor Y at (x, z); the GLB's base sits here.
   * @param z - World Z.
   */
  placeAt(x: number, groundY: number, z: number): void {
    this.group.position.set(x, groundY, z)
  }

  /**
   * Look up a fuel canister node by its 1-based index. Returns `null`
   * before the GLB loads or for out-of-range indices.
   *
   * @param index - 1-based canister index matching `fuel_<n>` in the GLB.
   * @returns Cached Three.js node, or `null` if unavailable.
   */
  getFuelNode(index: number): THREE.Object3D | null {
    return this.fuelCells.get(index)?.source ?? null
  }

  /**
   * Whether every fuel cell has finished its repair cycle and the model
   * has fired {@link onPowerRestored}. Useful for host views that mount
   * after the repair already completed (replay, save reload).
   */
  isPowerRestored(): boolean {
    return this.powerRestoredFired
  }

  /**
   * Override the per-shot science-bolt repair multiplier. Defaults to
   * `1` (one hit per bolt); host views read the `multitoolScience`
   * upgrade and pass the result here so SCI investment makes the
   * generator charge faster. Clamped to at least `1` so de-buffs can't
   * stall repair.
   *
   * @param multiplier - Per-shot inverse-damage scale, ≥ 1.
   */
  setScienceHitMultiplier(multiplier: number): void {
    this.scienceHitMultiplier = Math.max(1, multiplier)
  }

  /**
   * Read-only snapshot of every fuel cell's repair progress in `[0, 1]`,
   * sorted by cell index. Used by the diagnostics terminal to paint a
   * live status panel. Cheap — allocates one short array per call.
   *
   * @returns Per-cell `{index, progress}` records.
   */
  getCellProgress(): Array<{ index: number; progress: number }> {
    const entries = Array.from(this.fuelCells.values())
    entries.sort((a, b) => a.index - b.index)
    return entries.map((cell) => {
      let progress: number
      if (cell.restored || cell.fading) {
        progress = 1
      } else {
        progress = 1 - cell.hitsRemaining / FUEL_CELL_REPAIR_HITS
      }
      return { index: cell.index, progress }
    })
  }

  /**
   * One science-bolt sweep against the live fuel cells. Mirrors the
   * {@link EvaSatelliteServicingScienceBoltTarget.tryScienceRepairSegment}
   * contract so the projectile system's existing slot can dispatch
   * straight into this model.
   *
   * Refreshes each cell's world AABB before testing so the model's host
   * transform (room yaw, prop yaw, scale) is reflected on every shot.
   *
   * @param from - Previous bolt position, world space.
   * @param to - New bolt position, world space.
   * @param outEntry - Reused Vector3 written with the impact point on hit.
   * @returns `true` when a bolt was consumed by a fuel cell.
   */
  tryScienceRepairSegment(
    from: THREE.Vector3,
    to: THREE.Vector3,
    outEntry: THREE.Vector3,
  ): boolean {
    if (!this.loaded || this.fuelCells.size === 0) return false
    this._segDelta.subVectors(to, from)
    const segLenSq = this._segDelta.lengthSq()
    if (segLenSq < MIN_BOLT_SEGMENT_LENGTH_SQ) return false

    let bestCell: FuelCell | null = null
    let bestT = Number.POSITIVE_INFINITY
    let bestVol = Number.POSITIVE_INFINITY

    for (const cell of this.fuelCells.values()) {
      if (cell.fading || cell.restored) continue
      this.refreshCellBounds(cell)
      const b = cell.worldBounds
      if (b.isEmpty()) continue
      if (!segmentIntersectsAabb3(from, to, b.min, b.max, this._hitScratch)) continue

      this._towardHit.subVectors(this._hitScratch, from)
      let tAlong = this._towardHit.dot(this._segDelta) / segLenSq
      if (tAlong < 0) tAlong = 0
      if (tAlong > 1) tAlong = 1

      b.getSize(this._boundsSize)
      const vol = Math.max(
        1e-9,
        this._boundsSize.x * this._boundsSize.y * this._boundsSize.z,
      )
      const earlierAlongBolt = bestCell === null || tAlong < bestT - SEGMENT_ENTRY_T_EPSILON
      const tieBreakSmallerCell =
        bestCell !== null && Math.abs(tAlong - bestT) <= SEGMENT_ENTRY_T_EPSILON && vol < bestVol
      if (!(earlierAlongBolt || tieBreakSmallerCell)) continue

      bestT = tAlong
      bestVol = vol
      bestCell = cell
      outEntry.copy(this._hitScratch)
    }

    if (!bestCell) return false
    this.applyScienceHit(bestCell)
    return true
  }

  /**
   * Mirrors {@link StationTerminalModel.createWorldCollider} — exposed for
   * symmetry. The station prop pipeline uses `localFootprint` instead.
   *
   * @param id - Stable collider id.
   * @returns Lazy world-space AABB collider in native (scale=1) extents.
   */
  createWorldCollider(id: string): WorldCollider {
    return {
      id,
      kind: 'aabb',
      min: () => ({
        x: this.group.position.x - STATION_POWERGEN_BASE_HALF_X,
        y: this.group.position.y,
        z: this.group.position.z - STATION_POWERGEN_BASE_HALF_Z,
      }),
      max: () => ({
        x: this.group.position.x + STATION_POWERGEN_BASE_HALF_X,
        y: this.group.position.y + STATION_POWERGEN_NATIVE_HEIGHT,
        z: this.group.position.z + STATION_POWERGEN_BASE_HALF_Z,
      }),
      enabled: () => this.group.visible,
    }
  }

  /** Release GPU resources. */
  dispose(): void {
    for (const cell of this.fuelCells.values()) {
      if (cell.wireframe.parent) cell.wireframe.parent.remove(cell.wireframe)
      this.disposeObject(cell.wireframe)
      for (const entry of cell.glowMaterials) entry.material.dispose()
    }
    this.fuelCells.clear()
    if (this.inner) {
      this.inner.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose()
          const mats = Array.isArray(child.material) ? child.material : [child.material]
          for (const m of mats) if (m instanceof THREE.Material) m.dispose()
        }
      })
    }
  }

  /**
   * Build a fuel cell's broken-state setup: clone each glow material so
   * the cell owns its own mutation lane, dim those clones, and attach a
   * red wireframe overlay parented to the cell's source node so the
   * overlay follows transforms.
   */
  private buildFuelCell(index: number, source: THREE.Object3D): FuelCell {
    const glowMaterials: GlowMaterialState[] = []
    source.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      const sourceMats = Array.isArray(obj.material) ? obj.material : [obj.material]
      const cloned: THREE.Material[] = []
      for (const original of sourceMats) {
        if (!(original instanceof THREE.MeshStandardMaterial)) {
          cloned.push(original)
          continue
        }
        const emissiveSum =
          original.emissive.r + original.emissive.g + original.emissive.b
        const hasGlow = emissiveSum > EMISSIVE_RGB_THRESHOLD || original.emissiveIntensity > 0
        if (!hasGlow) {
          cloned.push(original)
          continue
        }
        const clone = original.clone()
        // Persist a known glow state for "restored" before we mutate
        // the clone into its dim-broken pose.
        const state: GlowMaterialState = {
          material: clone,
          originalColor: original.color.clone(),
          originalEmissive: original.emissive.clone(),
          originalEmissiveIntensity: original.emissiveIntensity,
          originalMap: original.map,
        }
        clone.color.setHex(BROKEN_BASE_COLOR)
        clone.emissive.setHex(0x000000)
        clone.emissiveIntensity = 0
        clone.map = null
        clone.needsUpdate = true
        glowMaterials.push(state)
        cloned.push(clone)
      }
      obj.material = Array.isArray(obj.material) ? cloned : (cloned[0] ?? obj.material)
    })

    const wireframe = this.buildWireframeOverlay(source)
    source.add(wireframe)

    const worldBounds = new THREE.Box3()
    return {
      index,
      source,
      wireframe,
      glowMaterials,
      hitsRemaining: FUEL_CELL_REPAIR_HITS,
      worldBounds,
      fading: false,
      restored: false,
    }
  }

  /**
   * Clone every mesh under `source`, swap in a transparent red
   * `MeshBasicMaterial` with `wireframe: true`, and return the group.
   * Matches the {@link SatelliteRepairController} overlay so progress
   * colours land the same red/orange/lime/green beats.
   */
  private buildWireframeOverlay(source: THREE.Object3D): THREE.Group {
    const group = new THREE.Group()
    group.name = `${source.name}_wireframe`
    source.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      const clone = new THREE.Mesh(
        obj.geometry,
        new THREE.MeshBasicMaterial({
          color: DAMAGE_WIREFRAME_COLOR,
          wireframe: true,
          transparent: true,
          opacity: WIREFRAME_OPACITY,
          depthTest: true,
          depthWrite: false,
        }),
      )
      clone.matrixAutoUpdate = false
      obj.updateWorldMatrix(true, false)
      source.updateWorldMatrix(true, false)
      const inv = new THREE.Matrix4().copy(source.matrixWorld).invert()
      clone.matrix.multiplyMatrices(inv, obj.matrixWorld)
      group.add(clone)
    })
    return group
  }

  /** Refresh `cell.worldBounds` from the current source transform. */
  private refreshCellBounds(cell: FuelCell): void {
    cell.source.updateWorldMatrix(true, true)
    cell.worldBounds.setFromObject(cell.source, true)
    if (!cell.worldBounds.isEmpty()) {
      cell.worldBounds.expandByScalar(FUEL_CELL_AABB_SLACK)
    }
  }

  /**
   * One SCI impact: decrement HP, walk wireframe colour, or start the
   * green-hold completion sequence.
   */
  private applyScienceHit(cell: FuelCell): void {
    if (cell.fading || cell.restored) return
    cell.hitsRemaining = Math.max(0, cell.hitsRemaining - this.scienceHitMultiplier)
    if (cell.hitsRemaining > 0) {
      this.setWireframeColor(cell.wireframe, this.progressColor(cell.hitsRemaining))
      return
    }
    cell.fading = true
    this.setWireframeColor(cell.wireframe, REPAIR_COMPLETE_COLOR)
    // Restore the glow now so the underlying cell already reads as
    // "powered" while the green wireframe celebrates above it.
    for (const entry of cell.glowMaterials) {
      const mat = entry.material
      mat.color.copy(entry.originalColor)
      mat.emissive.copy(entry.originalEmissive)
      mat.emissiveIntensity = entry.originalEmissiveIntensity
      mat.map = entry.originalMap
      mat.needsUpdate = true
    }
    const wireframeRef = cell.wireframe
    const index = cell.index
    Timer.after(REPAIR_HOLD_SECONDS, () => {
      if (wireframeRef.parent) wireframeRef.parent.remove(wireframeRef)
      this.disposeObject(wireframeRef)
      cell.restored = true
      cell.fading = false
      this.onFuelCellRepaired?.(index)
      this.maybeFirePowerRestored()
    })
  }

  /**
   * Choose the wireframe colour for the current `hitsRemaining` bucket.
   * Matches the satellite-repair red/orange/lime walk.
   */
  private progressColor(hitsRemaining: number): number {
    const frac = hitsRemaining / FUEL_CELL_REPAIR_HITS
    if (frac > 2 / 3) return DAMAGE_WIREFRAME_COLOR
    if (frac > 1 / 3) return AIM_ORANGE
    return ALMOST_REPAIRED_COLOR
  }

  /** Walk a wireframe group and recolour every mesh material in place. */
  private setWireframeColor(wireframe: THREE.Object3D, hex: number): void {
    wireframe.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      const mat = obj.material as THREE.MeshBasicMaterial
      mat.color.setHex(hex)
    })
  }

  /**
   * Fire {@link onPowerRestored} when every fuel cell is past its green
   * hold. Idempotent — the callback never fires twice for a given load.
   */
  private maybeFirePowerRestored(): void {
    if (this.powerRestoredFired) return
    for (const cell of this.fuelCells.values()) {
      if (!cell.restored) return
    }
    this.powerRestoredFired = true
    this.onPowerRestored?.()
  }

  /** Dispose geometry + material on every mesh under `obj`. */
  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      for (const m of mats) if (m instanceof THREE.Material) m.dispose()
    })
  }
}
