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
import { ParticleEmitter } from '@/three/ParticleEmitter'
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

/**
 * Hit-flash duration. Short pulse so the player reads "shot landed" but
 * the wireframe quickly settles back to the progress colour.
 */
const HIT_FLASH_DURATION = 0.18
/** Target colour the wireframe lerps toward on each landed hit. */
const HIT_FLASH_COLOR = 0x4ade80

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

/**
 * Total duration in seconds of the power-on shake. Short enough to read
 * as a startup kick rather than an ongoing rumble.
 */
const POWER_ON_SHAKE_DURATION = 0.75
/** Peak lateral shake amplitude (metres) at t=0 of the shake. */
const POWER_ON_SHAKE_AMPLITUDE_XZ = 0.005
/** Peak vertical shake amplitude (metres). Lower than lateral. */
const POWER_ON_SHAKE_AMPLITUDE_Y = 0.005
/** Shake oscillation frequency (Hz) — fast enough to read as a jolt. */
const POWER_ON_SHAKE_FREQUENCY = 32
/** Bolt segments shorter than this (squared) are skipped. */
const MIN_BOLT_SEGMENT_LENGTH_SQ = 1e-14

// ── Per-cell activation VFX (electrical discharge) ─────────────────────

/**
 * Total duration of the per-cell shake kicked off on activation. Longer
 * than the green hit-flash so the body keeps trembling while the
 * lightning fades.
 */
const CELL_ACTIVATION_SHAKE_DURATION = 0.45
/** Peak per-axis jitter (cell-local metres) applied during the shake. */
const CELL_ACTIVATION_SHAKE_AMPLITUDE = 0.02
/** Shake oscillation frequency (Hz) — high enough to read as electrical. */
const CELL_ACTIVATION_SHAKE_FREQUENCY = 55
/** Number of jagged lightning arcs spawned per cell activation. */
const CELL_ACTIVATION_ARC_COUNT = 8
/** Pool size for the shared lightning-arc objects (capacity ceiling). */
const LIGHTNING_ARC_POOL_SIZE = 64
/** Number of vertices per jagged arc polyline (more = more jitter). */
const LIGHTNING_ARC_SEGMENTS = 14
/** Arc length range (cell-local metres) — picked uniformly per spawn. */
const LIGHTNING_ARC_LENGTH_MIN = 0.18
/** Arc length range (cell-local metres) — picked uniformly per spawn. */
const LIGHTNING_ARC_LENGTH_MAX = 0.42
/** Peak perpendicular jitter on the polyline mid-vertices. */
const LIGHTNING_ARC_JITTER = 0.07
/** Seconds an arc lives before fully fading. */
const LIGHTNING_ARC_LIFETIME = 0.22
/** Bright cyan-white tint for the discharge arcs + sparks. */
const LIGHTNING_COLOR = 0x9be4ff
/** Number of cyan spark particles spawned per cell activation. */
const CELL_ACTIVATION_SPARK_COUNT = 80
/** Number of bright white core flash particles spawned per activation. */
const CELL_ACTIVATION_FLASH_COUNT = 18

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

/**
 * Which side of the generator a fuel cell sits on. `numbers` is the row
 * closest to the door (player approach), `letters` is the far row. The
 * puzzle UI shows the letter row on top, numbers on bottom — flipping
 * spatial near/far into top/bottom on the diagnostic console.
 */
type FuelCellSide = 'numbers' | 'letters'

/** Pixel size of the per-cell label canvas — drives perceived sharpness. */
const LABEL_CANVAS_SIZE = 128
/** Font used for the symbol on the label canvas. */
const LABEL_FONT = 'bold 88px "Space Grotesk", "Segoe UI", monospace'
/** Translucent dark fill behind the symbol so it reads against bright meshes. */
const LABEL_BG_COLOR = 'rgba(8, 38, 32, 0.78)'
/** Stroke colour around the label background. */
const LABEL_STROKE_COLOR = '#fde68a'
/** Symbol fill colour. */
const LABEL_TEXT_COLOR = '#fde68a'
/** Sprite scale applied at the cell's local space — multiplied by prop scale. */
const LABEL_SPRITE_SCALE = 0.05
/** Local-Y offset above the cell origin where the sprite floats. */
const LABEL_HEIGHT_OFFSET = 0.05

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
  /** Which side of the generator this cell sits on (filled at load). */
  side: FuelCellSide
  /**
   * Slot index `0..2` along that side, left-to-right when the player
   * faces the generator from the door. Maps to the symbol on the UI:
   * numbers row uses `slot + 1`, letters row uses `'ABC'[slot]`.
   */
  slot: number
  /**
   * Seconds left on the hit-flash pulse. Decayed each tick; while > 0
   * the wireframe colour lerps from its progress colour toward
   * {@link HIT_FLASH_COLOR}, matching the turret hit-flash pattern.
   */
  hitFlashRemaining: number
  /**
   * Captured baseline local position of {@link source}, snapped at load
   * time. The per-cell activation shake jitters around this point and
   * restores to it cleanly when the timer expires.
   */
  baseX: number
  /** See {@link baseX}. */
  baseY: number
  /** See {@link baseX}. */
  baseZ: number
  /**
   * Seconds remaining in the per-cell activation shake. While > 0 the
   * cell's local position is jittered around its baseline so the
   * canister itself reads as "buzzing with current" during the
   * electrical discharge.
   */
  shakeRemaining: number
  /** Phase accumulator (radians) for the per-cell shake oscillators. */
  shakePhase: number
}

/** Symbols rendered on the letters row of the puzzle UI, by slot index. */
export const LETTER_SYMBOLS: ReadonlyArray<string> = ['A', 'B', 'C']

/**
 * Read-only puzzle-state snapshot used by the diagnostics terminal to
 * paint the puzzle canvas. Slot indices are `0..2` and run left-to-right
 * along each side; the canvas decodes them via {@link LETTER_SYMBOLS} or
 * `slot + 1` for numbers.
 */
export interface PowerGenPuzzleState {
  /** Ignition order for the letters row, in slot indices (perm of 0/1/2). */
  letterOrder: ReadonlyArray<number>
  /** Ignition order for the numbers row, in slot indices (perm of 0/1/2). */
  numberOrder: ReadonlyArray<number>
  /** Target diamond colour `#RRGGBB` derived from the letter/number pairs. */
  hexColor: string
  /** How many letters have been successfully charged in order (`0..3`). */
  lettersCharged: number
  /** How many numbers have been successfully charged in order (`0..3`). */
  numbersCharged: number
  /** True while the minigame is accepting SCI bolts. */
  active: boolean
  /** True after a wrong-shot purge — player must re-interact to redraft. */
  resetPending: boolean
  /** True once every cell is repaired and power is online. */
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
  /** Fires when a fuel cell reaches full charge and begins its activation hold. */
  onFuelCellActivated: ((index: number) => void) | null = null
  /** Fires once when every fuel cell is repaired. */
  onPowerRestored: (() => void) | null = null
  /**
   * Fires whenever the puzzle state changes: minigame start (sequence
   * drafted), cell progress advances, or a wrong-shot triggers a purge
   * reset. The host view repaints the diagnostics terminal on each
   * notification.
   */
  onPuzzleStateChanged: (() => void) | null = null

  private inner: THREE.Group | null = null
  private readonly fuelCells: Map<number, FuelCell> = new Map()
  private loadStarted = false
  private loaded = false
  private powerRestoredFired = false
  /**
   * False until the diagnostics terminal hands control to the puzzle
   * screen. While inactive, every fuel cell stays dim (no wireframe
   * overlay) and SCI bolt sweeps short-circuit so the player can't
   * stumble into the repair without ever reading the tutorial.
   */
  private minigameActive = false
  /**
   * True after a wrong-shot purge until the player re-interacts with
   * the diagnostics terminal. Used by the UI to swap the puzzle screen
   * into a "REINITIATE" prompt without losing the cell→symbol mapping.
   */
  private resetPending = false
  /**
   * Ignition order for the numbers row, in slot indices `0..2`. Drafted
   * fresh on each {@link startMinigame} so a wrong shot forces a new
   * puzzle without changing the cell→slot mapping.
   */
  private numberOrder: number[] = [0, 1, 2]
  /** Ignition order for the letters row, in slot indices. */
  private letterOrder: number[] = [0, 1, 2]
  /** How many letters have been successfully charged in order. */
  private lettersCharged = 0
  /** How many numbers have been successfully charged in order. */
  private numbersCharged = 0
  /** `true` once the cell→side/slot mapping has been computed. */
  private sidesAssigned = false
  /**
   * Reference-label sprites keyed by their host cell's `index`. Each
   * minigame start picks a random slot on each side and rebuilds these
   * — players see one symbol per row to anchor the puzzle UI to the
   * physical cells without the generator looking like a chalkboard.
   */
  private readonly referenceLabels: Map<number, THREE.Sprite> = new Map()
  /**
   * Monotonic counter bumped on every {@link resetMinigame}. Each green
   * hold captures the value at the moment it was scheduled; if the
   * counter has advanced by the time the timer fires, the callback is a
   * no-op so an in-flight cell completion can't strip a freshly rebuilt
   * wireframe.
   */
  private minigameEpoch = 0
  /**
   * Multiplier on the per-shot "inverse damage" SCI bolts deal to a
   * fuel cell. Driven by the `multitoolScience` upgrade so investing in
   * SCI literally charges the generator faster: `×1` stock, `×1.25` /
   * `×1.5` / `×1.75` at levels 1–3. Stays fractional so the upgrade
   * curve reads as a smooth speed-up rather than threshold jumps.
   */
  private scienceHitMultiplier = 1

  /** Seconds remaining in the power-on shake. Zero when idle. */
  private shakeRemaining = 0
  /** Phase accumulator (radians) for the shake oscillators. */
  private shakePhase = 0

  /** Pool of jagged THREE.Line arcs reused for cell-activation discharges. */
  private arcPool: LightningArcPool | null = null
  /** Cyan-white spark burst spawned on each cell activation. */
  private sparkEmitter: ParticleEmitter | null = null
  /** Bright white core flash spawned on each cell activation. */
  private flashEmitter: ParticleEmitter | null = null
  /** Reused scratch — cell world position for VFX spawn. */
  private readonly _cellWorldPos = new THREE.Vector3()
  /** Reused scratch — particle velocity on emit. */
  private readonly _vfxVel = new THREE.Vector3()

  /** Reused scratch — bolt segment delta. */
  private readonly _segDelta = new THREE.Vector3()
  /** Reused scratch — hit point in world space. */
  private readonly _hitScratch = new THREE.Vector3()
  /** Reused scratch — vector from segment start to hit point. */
  private readonly _towardHit = new THREE.Vector3()
  /** Reused scratch — AABB size for tie-breaking on equal `t`. */
  private readonly _boundsSize = new THREE.Vector3()
  /** Reused scratch — wireframe base colour (pre-flash). */
  private readonly _flashBase = new THREE.Color()
  /** Reused scratch — blended wireframe colour during the hit-flash. */
  private readonly _flashOut = new THREE.Color()
  /** Constant green tint the wireframe lerps toward on each landed hit. */
  private readonly _flashTarget = new THREE.Color(HIT_FLASH_COLOR)

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

    // Discharge VFX shared across all six cells. Parented to the prop
    // group so positions are emitted in world space (ParticleEmitter
    // works in world coords) and the arc pool inherits the group's
    // transform — arcs draw in local space anchored to the cell.
    this.arcPool = new LightningArcPool(LIGHTNING_ARC_POOL_SIZE)
    this.group.add(this.arcPool.group)
    this.flashEmitter = new ParticleEmitter({
      poolSize: 48,
      color: new THREE.Color(0xffffff),
      size: 14,
      lifetime: 0.2,
      spread: 6,
      opacity: 1,
      soft: true,
      sizeGrowth: 2.6,
    })
    this.sparkEmitter = new ParticleEmitter({
      poolSize: 192,
      color: new THREE.Color(LIGHTNING_COLOR),
      size: 6,
      lifetime: 0.55,
      spread: 10,
      opacity: 1,
      soft: true,
      sizeGrowth: 0.9,
    })
    this.group.add(this.flashEmitter.points)
    this.group.add(this.sparkEmitter.points)

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
   * Whether the puzzle screen has handed control to the live repair
   * flow. While `false`, wireframes are hidden and SCI bolt sweeps
   * short-circuit. Flipped by {@link startMinigame}.
   */
  isMinigameActive(): boolean {
    return this.minigameActive
  }

  /**
   * Reveal the per-cell wireframe overlays, draft a fresh ignition
   * sequence, and start accepting SCI bolt hits. Called by the host
   * view when the player confirms the diagnostics terminal. Idempotent
   * while already active; after a {@link resetPending} purge it redrafts
   * the sequence and clears the reset flag.
   */
  startMinigame(): void {
    if (this.minigameActive) return
    this.assignCellSides()
    this.draftIgnitionSequence()
    this.refreshReferenceLabels()
    this.minigameActive = true
    this.resetPending = false
    this.lettersCharged = 0
    this.numbersCharged = 0
    for (const cell of this.fuelCells.values()) {
      if (cell.restored) continue
      cell.wireframe.visible = true
    }
    this.onPuzzleStateChanged?.()
  }

  /**
   * Read-only snapshot of the puzzle state for the diagnostics terminal.
   * Cheap — allocates only the wrapping object; the inner arrays are
   * shared references.
   */
  getPuzzleState(): PowerGenPuzzleState {
    return {
      letterOrder: this.letterOrder,
      numberOrder: this.numberOrder,
      hexColor: this.computePuzzleColor(),
      lettersCharged: this.lettersCharged,
      numbersCharged: this.numbersCharged,
      active: this.minigameActive,
      resetPending: this.resetPending,
      restored: this.powerRestoredFired,
    }
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
    if (!this.loaded || !this.minigameActive || this.fuelCells.size === 0) return false
    this._segDelta.subVectors(to, from)
    const segLenSq = this._segDelta.lengthSq()
    if (segLenSq < MIN_BOLT_SEGMENT_LENGTH_SQ) return false

    // Bolt-origin offset from the prop centre in the horizontal plane.
    // Used to reject candidate cells that sit on the opposite side of
    // the reactor body so a bolt aimed at an already-charged near cell
    // can't punch through and trip the puzzle by hitting a far cell.
    const propX = this.group.position.x
    const propZ = this.group.position.z
    const boltSideX = from.x - propX
    const boltSideZ = from.z - propZ

    let bestCell: FuelCell | null = null
    let bestT = Number.POSITIVE_INFINITY
    let bestVol = Number.POSITIVE_INFINITY

    for (const cell of this.fuelCells.values()) {
      if (cell.fading || cell.restored) continue
      this.refreshCellBounds(cell)
      const b = cell.worldBounds
      if (b.isEmpty()) continue
      // Horizontal sign test: if the cell centre sits on the opposite
      // side of the prop centre from the bolt origin (negative dot in
      // XZ), the reactor body blocks the line of sight even though the
      // bolt segment's AABB test would otherwise succeed.
      b.getCenter(this._hitScratch)
      const cellSideX = this._hitScratch.x - propX
      const cellSideZ = this._hitScratch.z - propZ
      if (boltSideX * cellSideX + boltSideZ * cellSideZ < 0) continue
      if (!segmentIntersectsAabb3(from, to, b.min, b.max, this._hitScratch)) continue

      this._towardHit.subVectors(this._hitScratch, from)
      let tAlong = this._towardHit.dot(this._segDelta) / segLenSq
      if (tAlong < 0) tAlong = 0
      if (tAlong > 1) tAlong = 1

      b.getSize(this._boundsSize)
      const vol = Math.max(1e-9, this._boundsSize.x * this._boundsSize.y * this._boundsSize.z)
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
    this.disposeReferenceLabels()
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
        const emissiveSum = original.emissive.r + original.emissive.g + original.emissive.b
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
    // Built up-front so the geometry is ready, but hidden until the
    // diagnostics terminal starts the minigame.
    wireframe.visible = false
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
      // Filled by {@link assignCellSides} on the first {@link startMinigame}.
      side: 'numbers',
      slot: 0,
      hitFlashRemaining: 0,
      baseX: source.position.x,
      baseY: source.position.y,
      baseZ: source.position.z,
      shakeRemaining: 0,
      shakePhase: 0,
    }
  }

  /**
   * Build the canvas-backed billboard sprite for a reference cell. The
   * sprite paints {@link symbol} (e.g. `"2"` or `"B"`) inside a small
   * translucent panel so it reads cleanly against the cell's PBR glow.
   * `depthTest` is off so the sprite isn't occluded by the cell mesh
   * itself when the label sits close to the cell's silhouette — these
   * are tutorial overlays, readability beats correctness.
   */
  private buildReferenceLabel(symbol: string): THREE.Sprite {
    const canvas = document.createElement('canvas')
    canvas.width = LABEL_CANVAS_SIZE
    canvas.height = LABEL_CANVAS_SIZE
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.clearRect(0, 0, LABEL_CANVAS_SIZE, LABEL_CANVAS_SIZE)
      const pad = 10
      ctx.fillStyle = LABEL_BG_COLOR
      ctx.beginPath()
      const r = 22
      ctx.moveTo(pad + r, pad)
      ctx.arcTo(LABEL_CANVAS_SIZE - pad, pad, LABEL_CANVAS_SIZE - pad, pad + r, r)
      ctx.arcTo(
        LABEL_CANVAS_SIZE - pad,
        LABEL_CANVAS_SIZE - pad,
        LABEL_CANVAS_SIZE - pad - r,
        LABEL_CANVAS_SIZE - pad,
        r,
      )
      ctx.arcTo(pad, LABEL_CANVAS_SIZE - pad, pad, LABEL_CANVAS_SIZE - pad - r, r)
      ctx.arcTo(pad, pad, pad + r, pad, r)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = LABEL_STROKE_COLOR
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.fillStyle = LABEL_TEXT_COLOR
      ctx.font = LABEL_FONT
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(symbol, LABEL_CANVAS_SIZE / 2, LABEL_CANVAS_SIZE / 2 + 4)
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.anisotropy = 4
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    const sprite = new THREE.Sprite(material)
    sprite.scale.set(LABEL_SPRITE_SCALE, LABEL_SPRITE_SCALE, 1)
    sprite.renderOrder = 999
    return sprite
  }

  /**
   * Pick exactly one random cell across both sides, build a symbol
   * sprite for it, and park the sprite above the cell in prop-group
   * local space (world-up regardless of cell tilt). One hint is enough
   * — the player infers the rest from the puzzle UI's tile positions.
   * Disposes any prior label so each minigame draft picks fresh.
   */
  private refreshReferenceLabels(): void {
    this.disposeReferenceLabels()
    const candidates = Array.from(this.fuelCells.values()).filter((c) => !c.restored)
    if (candidates.length === 0) return
    const pick = candidates[Math.floor(Math.random() * candidates.length)]
    if (!pick) return
    const symbol =
      pick.side === 'numbers' ? String(pick.slot + 1) : (LETTER_SYMBOLS[pick.slot] ?? '?')
    const sprite = this.buildReferenceLabel(symbol)
    const scratch = new THREE.Vector3()
    pick.source.updateWorldMatrix(true, false)
    pick.source.getWorldPosition(scratch)
    this.group.worldToLocal(scratch)
    sprite.position.set(scratch.x, scratch.y + LABEL_HEIGHT_OFFSET, scratch.z)
    this.group.add(sprite)
    this.referenceLabels.set(pick.index, sprite)
  }

  /** Dispose all active reference-label sprites. */
  private disposeReferenceLabels(): void {
    for (const sprite of this.referenceLabels.values()) {
      if (sprite.parent) sprite.parent.remove(sprite)
      const mat = sprite.material as THREE.SpriteMaterial
      mat.map?.dispose()
      mat.dispose()
    }
    this.referenceLabels.clear()
  }

  /**
   * Assign each cell to a row (`numbers`/`letters`) and a slot index by
   * inspecting their local-space positions. The row with the lower mean
   * Z is treated as door-facing (numbers); within each row cells are
   * sorted by X for left-to-right slots. Idempotent — runs once on the
   * first {@link startMinigame}.
   */
  private assignCellSides(): void {
    if (this.sidesAssigned) return
    const cells = Array.from(this.fuelCells.values())
    if (cells.length !== 6) {
      // Unexpected layout — keep defaults so we don't mislabel cells.
      // The minigame would still run but validation would always fail.
      this.sidesAssigned = true
      return
    }
    const entries = cells.map((cell) => {
      const v = new THREE.Vector3()
      cell.source.updateWorldMatrix(true, false)
      cell.source.getWorldPosition(v)
      if (this.inner) this.inner.worldToLocal(v)
      return { cell, pos: v }
    })
    // Pick the side axis: whichever of X/Z has the largest gap between
    // the 3rd and 4th entry after sorting. That gap is the boundary
    // between the two rows of three; the other axis becomes the slot
    // axis (left-to-right ordering within each row). Robust to the
    // generator being authored with rows along either world axis.
    const byX = [...entries].sort((a, b) => a.pos.x - b.pos.x)
    const byZ = [...entries].sort((a, b) => a.pos.z - b.pos.z)
    const xGap = Math.abs((byX[3]?.pos.x ?? 0) - (byX[2]?.pos.x ?? 0))
    const zGap = Math.abs((byZ[3]?.pos.z ?? 0) - (byZ[2]?.pos.z ?? 0))
    const sideAxis: 'x' | 'z' = zGap >= xGap ? 'z' : 'x'
    const slotAxis: 'x' | 'z' = sideAxis === 'z' ? 'x' : 'z'
    const sortedBySide = sideAxis === 'z' ? byZ : byX
    const frontGroup = sortedBySide.slice(0, 3)
    const backGroup = sortedBySide.slice(3, 6)
    frontGroup.sort((a, b) => a.pos[slotAxis] - b.pos[slotAxis])
    backGroup.sort((a, b) => a.pos[slotAxis] - b.pos[slotAxis])
    // Lower-axis row → letters (near-door); higher-axis row → numbers
    // (far-from-door). Matches the puzzle UI's letters-bottom /
    // numbers-top layout.
    for (let i = 0; i < frontGroup.length; i++) {
      const entry = frontGroup[i]
      if (!entry) continue
      entry.cell.side = 'letters'
      entry.cell.slot = i
    }
    // The opposite face must mirror the sort so 1 stays analogous to A
    // after the generator is rotated toward the player.
    for (let i = 0; i < backGroup.length; i++) {
      const entry = backGroup[i]
      if (!entry) continue
      entry.cell.side = 'numbers'
      entry.cell.slot = backGroup.length - 1 - i
    }
    this.sidesAssigned = true
  }

  /** Fisher-Yates shuffle in place. */
  private shuffleSlots(out: number[]): void {
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const a = out[i] ?? 0
      const b = out[j] ?? 0
      out[i] = b
      out[j] = a
    }
  }

  /** Redraft the ignition sequences for both rows. */
  private draftIgnitionSequence(): void {
    this.numberOrder = [0, 1, 2]
    this.letterOrder = [0, 1, 2]
    this.shuffleSlots(this.numberOrder)
    this.shuffleSlots(this.letterOrder)
  }

  /**
   * Compute the diamond colour `#RRGGBB` from the current ignition
   * sequences. Each channel byte is `letter+number` packed nibble-wise
   * (letters as hex digits A/B/C, numbers as 1/2/3) so colours land in
   * the muted-pastel range 161–195 per channel — readable and varied
   * without leaving the engineering-readout palette.
   */
  private computePuzzleColor(): string {
    const channels: string[] = []
    for (let i = 0; i < 3; i++) {
      const letterSlot = this.letterOrder[i] ?? 0
      const numberSlot = this.numberOrder[i] ?? 0
      const letterDigit = LETTER_SYMBOLS[letterSlot] ?? 'A'
      const numberDigit = String(numberSlot + 1)
      channels.push(letterDigit + numberDigit)
    }
    return `#${channels.join('')}`
  }

  /**
   * Wrong-shot purge: hide every wireframe, refill every cell's hit
   * budget, lock the minigame, and flag the diagnostics terminal that
   * the player needs to re-interact to redraft the sequence.
   */
  private resetMinigame(): void {
    this.minigameActive = false
    this.resetPending = true
    this.lettersCharged = 0
    this.numbersCharged = 0
    // Bump the epoch so any in-flight green-hold Timer callbacks
    // (fading cells) no-op when they fire — otherwise they'd remove the
    // wireframe we're about to rebuild.
    this.minigameEpoch += 1
    for (const cell of this.fuelCells.values()) {
      this.rebuildCellAsBroken(cell)
    }
    // Drop reference labels too — the next `startMinigame` will roll a
    // fresh random pair of slots and rebuild from scratch.
    this.disposeReferenceLabels()
    this.onPuzzleStateChanged?.()
  }

  /**
   * Force a fuel cell back to its broken state: re-dim the cloned glow
   * materials, refill the hit budget, and re-attach a fresh wireframe
   * overlay (rebuilt from scratch if a prior green-hold already disposed
   * the previous one). Used by {@link resetMinigame} so a wrong shot
   * truly wipes the slate, even for cells the player had already
   * finished charging.
   */
  private rebuildCellAsBroken(cell: FuelCell): void {
    for (const entry of cell.glowMaterials) {
      const mat = entry.material
      mat.color.setHex(BROKEN_BASE_COLOR)
      mat.emissive.setHex(0x000000)
      mat.emissiveIntensity = 0
      mat.map = null
      mat.needsUpdate = true
    }
    // If the wireframe was disposed by a prior completion, rebuild it.
    if (cell.restored || cell.wireframe.parent !== cell.source) {
      this.disposeObject(cell.wireframe)
      cell.wireframe = this.buildWireframeOverlay(cell.source)
      cell.source.add(cell.wireframe)
    }
    cell.wireframe.visible = false
    this.setWireframeColor(cell.wireframe, DAMAGE_WIREFRAME_COLOR)
    cell.hitsRemaining = FUEL_CELL_REPAIR_HITS
    cell.fading = false
    cell.restored = false
    cell.hitFlashRemaining = 0
  }

  /**
   * Validate a candidate cell against the current next-expected slot on
   * its side. Returns `true` when the cell is the live ignition target
   * (and the player may charge it); `false` triggers a purge.
   */
  private isExpectedCell(cell: FuelCell): boolean {
    if (cell.side === 'numbers') {
      const expected = this.numberOrder[this.numbersCharged]
      return expected !== undefined && cell.slot === expected
    }
    const expected = this.letterOrder[this.lettersCharged]
    return expected !== undefined && cell.slot === expected
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
    if (!this.isExpectedCell(cell)) {
      // Wrong cell — purge the lattice and force the player back to the
      // diagnostics terminal for a fresh sequence draft.
      this.resetMinigame()
      return
    }
    cell.hitsRemaining = Math.max(0, cell.hitsRemaining - this.scienceHitMultiplier)
    if (cell.hitsRemaining > 0) {
      this.setWireframeColor(cell.wireframe, this.progressColor(cell.hitsRemaining))
      // Kick the per-cell flash so {@link tickHitFlashes} pulses the
      // wireframe green for a beat before settling back to the new
      // progress colour.
      cell.hitFlashRemaining = HIT_FLASH_DURATION
      return
    }
    cell.fading = true
    if (cell.side === 'numbers') this.numbersCharged += 1
    else this.lettersCharged += 1
    this.triggerCellActivationVfx(cell)
    this.onPuzzleStateChanged?.()
    this.onFuelCellActivated?.(cell.index)
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
    const scheduledEpoch = this.minigameEpoch
    Timer.after(REPAIR_HOLD_SECONDS, () => {
      // A purge reset bumped the epoch — drop this completion so the
      // freshly rebuilt wireframe stays attached.
      if (this.minigameEpoch !== scheduledEpoch) return
      if (wireframeRef.parent) wireframeRef.parent.remove(wireframeRef)
      this.disposeObject(wireframeRef)
      // Drop the reference label for this cell if it was the one wearing
      // a symbol — the host is now powered, no need to keep the hint.
      const label = this.referenceLabels.get(index)
      if (label) {
        if (label.parent) label.parent.remove(label)
        const mat = label.material as THREE.SpriteMaterial
        mat.map?.dispose()
        mat.dispose()
        this.referenceLabels.delete(index)
      }
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
    this.shakeRemaining = POWER_ON_SHAKE_DURATION
    this.shakePhase = 0
    this.onPowerRestored?.()
  }

  /**
   * Per-frame update. Drives the brief decaying shake of the inner mesh
   * group after power restoration. No-op while idle or before the GLB
   * has loaded.
   *
   * @param dt - Frame delta in seconds.
   */
  tick(dt: number): void {
    this.tickHitFlashes(dt)
    this.tickCellShakes(dt)
    this.arcPool?.tick(dt)
    this.flashEmitter?.tick(dt)
    this.sparkEmitter?.tick(dt)
    if (this.shakeRemaining <= 0 || !this.inner) return
    this.shakeRemaining = Math.max(0, this.shakeRemaining - dt)
    const lifeFrac = this.shakeRemaining / POWER_ON_SHAKE_DURATION
    const decay = lifeFrac * lifeFrac
    this.shakePhase += dt * POWER_ON_SHAKE_FREQUENCY
    const phase = this.shakePhase
    const ox = Math.sin(phase * 2.0) * POWER_ON_SHAKE_AMPLITUDE_XZ * decay
    const oy = Math.sin(phase * 3.1 + 1.3) * POWER_ON_SHAKE_AMPLITUDE_Y * decay
    const oz = Math.cos(phase * 2.4 + 0.7) * POWER_ON_SHAKE_AMPLITUDE_XZ * decay
    this.inner.position.set(ox, oy, oz)
    if (this.shakeRemaining <= 0) this.inner.position.set(0, 0, 0)
  }

  /**
   * Fire the electrical discharge VFX on a freshly-activated cell:
   * jagged cyan arcs radiate outward from the canister, a bright white
   * flash pops at the centre, cyan sparks burst, and the cell itself
   * starts a brief decaying shake so it reads as electrified rather
   * than gently completed.
   */
  private triggerCellActivationVfx(cell: FuelCell): void {
    cell.shakeRemaining = CELL_ACTIVATION_SHAKE_DURATION
    cell.shakePhase = Math.random() * Math.PI * 2
    cell.source.updateWorldMatrix(true, false)
    cell.source.getWorldPosition(this._cellWorldPos)
    if (this.flashEmitter) {
      for (let i = 0; i < CELL_ACTIVATION_FLASH_COUNT; i++) {
        this._vfxVel.set(
          (Math.random() - 0.5) * 3,
          (Math.random() - 0.5) * 3,
          (Math.random() - 0.5) * 3,
        )
        this.flashEmitter.emit(this._cellWorldPos, this._vfxVel)
      }
    }
    if (this.sparkEmitter) {
      for (let i = 0; i < CELL_ACTIVATION_SPARK_COUNT; i++) {
        // Radial-omni burst with an upward bias — sparks should leap
        // off the canister rather than collapse into the model.
        const theta = Math.random() * Math.PI * 2
        const phi = Math.random() * Math.PI
        const speed = 4 + Math.random() * 8
        this._vfxVel.set(
          Math.sin(phi) * Math.cos(theta) * speed,
          Math.abs(Math.cos(phi)) * speed * 0.8 + 1.5,
          Math.sin(phi) * Math.sin(theta) * speed,
        )
        this.sparkEmitter.emit(this._cellWorldPos, this._vfxVel)
      }
    }
    if (this.arcPool) {
      // Arc pool draws in the model-group's local frame, so convert the
      // cell origin into group-local coordinates once and reuse it.
      const localOrigin = this._cellWorldPos.clone()
      this.group.worldToLocal(localOrigin)
      for (let i = 0; i < CELL_ACTIVATION_ARC_COUNT; i++) {
        const length =
          LIGHTNING_ARC_LENGTH_MIN +
          Math.random() * (LIGHTNING_ARC_LENGTH_MAX - LIGHTNING_ARC_LENGTH_MIN)
        this.arcPool.spawn(localOrigin, length)
      }
    }
  }

  /**
   * Per-frame per-cell shake update. Decays each active cell's local
   * jitter back to its captured baseline; when the timer hits zero,
   * snaps cleanly so the cell never drifts.
   */
  private tickCellShakes(dt: number): void {
    for (const cell of this.fuelCells.values()) {
      if (cell.shakeRemaining <= 0) continue
      cell.shakeRemaining = Math.max(0, cell.shakeRemaining - dt)
      const lifeFrac = cell.shakeRemaining / CELL_ACTIVATION_SHAKE_DURATION
      const decay = lifeFrac * lifeFrac
      cell.shakePhase += dt * CELL_ACTIVATION_SHAKE_FREQUENCY
      if (cell.shakeRemaining <= 0) {
        cell.source.position.set(cell.baseX, cell.baseY, cell.baseZ)
        continue
      }
      const phase = cell.shakePhase
      const amp = CELL_ACTIVATION_SHAKE_AMPLITUDE * decay
      cell.source.position.set(
        cell.baseX + Math.sin(phase * 2.1) * amp,
        cell.baseY + Math.sin(phase * 3.3 + 0.9) * amp,
        cell.baseZ + Math.cos(phase * 2.7 + 1.7) * amp,
      )
    }
  }

  /**
   * Decay every cell's hit-flash timer and repaint its wireframe as a
   * lerp from the cell's current progress colour toward
   * {@link HIT_FLASH_COLOR}. Mirrors {@link TurretModel}'s flash pattern
   * so on-hit feedback reads consistently across station props.
   */
  private tickHitFlashes(dt: number): void {
    for (const cell of this.fuelCells.values()) {
      if (cell.hitFlashRemaining <= 0) continue
      if (cell.fading || cell.restored) {
        cell.hitFlashRemaining = 0
        continue
      }
      cell.hitFlashRemaining = Math.max(0, cell.hitFlashRemaining - dt)
      const t = cell.hitFlashRemaining / HIT_FLASH_DURATION
      this._flashBase.setHex(this.progressColor(cell.hitsRemaining))
      this._flashOut.copy(this._flashBase).lerp(this._flashTarget, t)
      this.setWireframeColor(cell.wireframe, this._flashOut.getHex())
    }
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

/**
 * Per-arc slot state inside {@link LightningArcPool}. `remaining > 0`
 * means the arc is alive and drawing; `<= 0` means free and reusable.
 */
interface LightningArcSlot {
  /** The Three.js Line object whose vertices we rewrite on spawn. */
  line: THREE.Line
  /** Material reference — we drive `opacity` to fade. */
  material: THREE.LineBasicMaterial
  /** Seconds left before the arc fully fades. */
  remaining: number
}

/**
 * Tiny pool of jagged additive-blended polylines that read as
 * electrical arcs. Each arc is built once with a Float32 position
 * buffer of {@link LIGHTNING_ARC_SEGMENTS} vertices; {@link spawn}
 * rewrites them as a randomly-jittered polyline radiating from an
 * origin in a random direction. {@link tick} decays opacity linearly
 * to zero so the arc reads as a brief flash, then the slot is reusable.
 *
 * The pool's {@link group} should be parented somewhere with the same
 * transform as the origin coordinates passed to {@link spawn}.
 */
class LightningArcPool {
  /** Public scene-graph node — host parents this into the prop group. */
  readonly group: THREE.Group
  private readonly arcs: LightningArcSlot[] = []
  /** Reused scratch — perpendicular basis vector for polyline jitter. */
  private readonly _perpA = new THREE.Vector3()
  /** Reused scratch — second perpendicular basis vector. */
  private readonly _perpB = new THREE.Vector3()
  /** Reused scratch — outward direction picked per spawn. */
  private readonly _dir = new THREE.Vector3()
  /** Reused scratch — world-up reference for perpendicular construction. */
  private static readonly _UP = new THREE.Vector3(0, 1, 0)
  /** Reused scratch — fallback axis when dir is parallel to up. */
  private static readonly _RIGHT = new THREE.Vector3(1, 0, 0)

  /**
   * @param poolSize - Maximum simultaneous arcs. The constructor
   *   allocates one Line + material per slot up front; spawns over the
   *   cap silently drop.
   */
  constructor(poolSize: number) {
    this.group = new THREE.Group()
    this.group.name = 'lightningArcPool'
    for (let i = 0; i < poolSize; i++) {
      const geom = new THREE.BufferGeometry()
      const positions = new Float32Array(LIGHTNING_ARC_SEGMENTS * 3)
      geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      const material = new THREE.LineBasicMaterial({
        color: LIGHTNING_COLOR,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      const line = new THREE.Line(geom, material)
      line.frustumCulled = false
      line.visible = false
      this.group.add(line)
      this.arcs.push({ line, material, remaining: 0 })
    }
  }

  /**
   * Claim a free slot and build a jagged polyline radiating from
   * `origin` in a random outward direction of length `length`. Silently
   * drops when every slot is alive.
   *
   * @param origin - Start point in the same local frame as {@link group}.
   * @param length - Polyline tip distance from origin.
   */
  spawn(origin: THREE.Vector3, length: number): void {
    const slot = this.arcs.find((a) => a.remaining <= 0)
    if (!slot) return
    // Random outward direction on the unit sphere with a slight upward
    // bias — arcs rooted in the canister read better when they flare up
    // and out rather than sinking straight down.
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(1 - Math.random() * 1.4)
    this._dir.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta))
    // Build two perpendicular basis vectors to dir for the polyline jitter.
    const dot = this._dir.dot(LightningArcPool._UP)
    const reference = Math.abs(dot) > 0.95 ? LightningArcPool._RIGHT : LightningArcPool._UP
    this._perpA.copy(reference).cross(this._dir).normalize()
    this._perpB.copy(this._dir).cross(this._perpA).normalize()
    const positions = slot.line.geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < LIGHTNING_ARC_SEGMENTS; i++) {
      const t = i / (LIGHTNING_ARC_SEGMENTS - 1)
      // Zero jitter at endpoints, peak in the middle — keeps the arc
      // pinned to the canister and to its tip while wobbling between.
      const jitterScale = LIGHTNING_ARC_JITTER * Math.sin(t * Math.PI)
      const jitterA = (Math.random() - 0.5) * 2 * jitterScale
      const jitterB = (Math.random() - 0.5) * 2 * jitterScale
      const x =
        origin.x + this._dir.x * length * t + this._perpA.x * jitterA + this._perpB.x * jitterB
      const y =
        origin.y + this._dir.y * length * t + this._perpA.y * jitterA + this._perpB.y * jitterB
      const z =
        origin.z + this._dir.z * length * t + this._perpA.z * jitterA + this._perpB.z * jitterB
      positions.setXYZ(i, x, y, z)
    }
    positions.needsUpdate = true
    slot.line.geometry.computeBoundingSphere()
    slot.material.opacity = 1
    slot.line.visible = true
    slot.remaining = LIGHTNING_ARC_LIFETIME
  }

  /**
   * Decay every live arc's opacity to zero across
   * {@link LIGHTNING_ARC_LIFETIME}. When a slot expires, the Line is
   * hidden so it doesn't draw a stale frame, and the slot returns to
   * the free pool.
   *
   * @param dt - Frame delta in seconds.
   */
  tick(dt: number): void {
    for (const slot of this.arcs) {
      if (slot.remaining <= 0) continue
      slot.remaining = Math.max(0, slot.remaining - dt)
      slot.material.opacity = slot.remaining / LIGHTNING_ARC_LIFETIME
      if (slot.remaining <= 0) slot.line.visible = false
    }
  }

  /** Release the GPU resources owned by every slot. */
  dispose(): void {
    for (const slot of this.arcs) {
      slot.line.geometry.dispose()
      slot.material.dispose()
    }
    this.arcs.length = 0
  }
}
