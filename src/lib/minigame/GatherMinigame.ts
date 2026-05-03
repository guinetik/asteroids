/**
 * Gather minigame.
 *
 * The gather objective asks the player to mine `N` distinct minerals
 * (count scales with difficulty) up to a per-mineral kg quota, then
 * load them into a delivery rocket at the flat zone. Mining is handled
 * by the universal {@link RockYieldSystem} — this minigame just tracks
 * the listed quotas and spawns the delivery rocket.
 *
 * The minigame never touches inventory directly: the rock yield system
 * already writes minerals into the shuttle inventory as soon as a
 * drill bolt extracts them. The rocket interaction is a soft "ship it"
 * gate, not a transactional moment.
 *
 * @author guinetik
 * @date 2026-04-18
 * @spec docs/superpowers/specs/2026-04-18-gather-mission-design.md
 */
import * as THREE from 'three'
import type {
  MiniGame,
  MiniGameContext,
  MiniGameEvents,
  MiniGameStatus,
  MiniGameStep,
} from './MiniGame'
import type { ConcreteObjective } from '@/lib/missions/types'
import type { Heightmap } from '@/lib/terrain/heightmap'
import type { MineralEntry } from '@/lib/asteroids/types'
import { TERMINAL_INTERACT_RANGE } from '@/three/TerminalModel'
import { DepositRocketModel } from '@/three/DepositRocketModel'
import { resolveCompositionItemId } from '@/lib/asteroids/mineralItemMap'
import { getItemDefinition } from '@/lib/inventory/catalog'
import type { RockYieldSystem } from '@/lib/mining/rockYieldSystem'

/**
 * Per-mineral quota tracked by the gather minigame.
 * `minedKg` is updated by `onMineralExtracted` each time the player
 * drills a matching rock; the step is complete once `minedKg ≥ targetKg`.
 */
export interface GatherMineralQuota {
  /** Inventory item id (e.g. `'olivine'`). */
  itemId: string
  /** Display label (item catalog label). */
  label: string
  /** Target kg required for this mineral. */
  targetKg: number
  /** Kilograms mined so far (clamped to `targetKg` for display). */
  minedKg: number
}

/** Maximum number of distinct required minerals at the highest difficulty. */
const MAX_REQUIRED_MINERALS = 3

/** Difficulty bands → required mineral count. */
function rollMineralCount(difficulty: number): number {
  if (difficulty <= 4) return 1
  if (difficulty <= 9) return 2
  return MAX_REQUIRED_MINERALS
}

/**
 * Pick `count` distinct minerals from the asteroid's composition,
 * weighted by `percentage`. Falls back to the full pool order when
 * `count` exceeds the number of available minerals.
 *
 * Deterministic given `seed + objectiveIndex` so two runs of the same
 * mission ask for the same minerals. When `obtainableItemIds` is
 * provided the pool is filtered to that set first — used to make sure
 * the player isn't asked to mine a mineral that no rolled rock on the
 * asteroid actually drops (e.g. low-percentage minerals on small maps).
 */
function pickRequiredMinerals(
  composition: readonly MineralEntry[],
  count: number,
  seed: number,
  objectiveIndex: number,
  obtainableItemIds?: ReadonlySet<string>,
): { itemId: string; label: string }[] {
  const pool: { itemId: string; label: string; weight: number }[] = []
  for (const entry of composition) {
    const itemId = resolveCompositionItemId(entry.name)
    if (itemId === null) continue
    if (obtainableItemIds && !obtainableItemIds.has(itemId)) continue
    const def = getItemDefinition(itemId)
    if (!def) continue
    pool.push({ itemId, label: def.label, weight: Math.max(1, entry.percentage) })
  }
  if (pool.length === 0) return []

  const rng = seededRng(seed ^ ((objectiveIndex + 1) * 0x9e3779b1))
  const picked: { itemId: string; label: string }[] = []
  const working = pool.slice()
  const target = Math.min(count, working.length)
  for (let i = 0; i < target; i++) {
    const totalWeight = working.reduce((sum, entry) => sum + entry.weight, 0)
    const roll = rng() * totalWeight
    let acc = 0
    let chosenIndex = working.length - 1
    for (let j = 0; j < working.length; j++) {
      acc += working[j]!.weight
      if (roll < acc) {
        chosenIndex = j
        break
      }
    }
    const chosen = working.splice(chosenIndex, 1)[0]!
    picked.push({ itemId: chosen.itemId, label: chosen.label })
  }
  return picked
}

/**
 * Absolute floor on rocks per required mineral. When topping up obtainable
 * rocks, the quota-to-rock conversion uses {@link APPROX_KG_PER_ROCK} so large
 * kg targets still expose enough miners on cramped maps.
 */
const MIN_ROCKS_PER_REQUIRED_MINERAL = 3
/**
 * Approximate kilograms a mid-sized rock yields. Used to convert a kg
 * quota into a rock-count floor — `ceil(perMineralKg / 30)` lands at 4
 * rocks for a 100kg quota and 7 rocks for a 200kg quota, both well
 * within the {@link RockYieldSystem.forceRockMineral} budget.
 */
const APPROX_KG_PER_ROCK = 30

/** Deterministic 0→1 PRNG for rock placement from a level seed. */
function seededRng(seed: number): () => number {
  let s = seed | 0 || 1
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Construction options for {@link GatherMinigame}. */
export interface GatherMinigameOptions {
  objectiveIndex: number
  objective: ConcreteObjective
  scene: THREE.Scene
  heightmap: Heightmap
  composition: readonly MineralEntry[]
  difficulty: number
  seed: number
  rockYieldSystem: RockYieldSystem
}

/** Mining quota minigame — surface rocks, yields, and delivery rocket hand-in. */
export class GatherMinigame implements MiniGame, MiniGameEvents {
  readonly objectiveIndex: number

  private _status: MiniGameStatus = 'active'
  private _isPlayerNear = false
  private _disposed = false

  private readonly scene: THREE.Scene
  private readonly rocket: DepositRocketModel
  private readonly objective: ConcreteObjective
  private readonly rockYieldSystem: RockYieldSystem
  private readonly quotas: GatherMineralQuota[]
  private readonly _steps: MiniGameStep[] = []
  private readonly listener: (itemId: string, kg: number) => void

  onPrompt: ((text: string | null) => void) | null = null
  onComplete: ((objectiveIndex: number) => void) | null = null
  onStepChange: ((objectiveIndex: number, steps: readonly MiniGameStep[]) => void) | null = null
  /**
   * Fired whenever any mineral quota changes (mining grant or
   * deposit). The rocket-survey facade subscribes to this so it
   * can refresh the state machine's quota snapshot.
   */
  onQuotaChange: ((quotas: readonly GatherMineralQuota[]) => void) | null = null

  get status(): MiniGameStatus {
    return this._status
  }

  get isPlayerNearInteraction(): boolean {
    return this._isPlayerNear
  }

  get timeRemaining(): number | null {
    return null
  }

  get progressCurrent(): number | null {
    let current = 0
    for (const quota of this.quotas) current += Math.min(quota.minedKg, quota.targetKg)
    return current
  }

  get progressTotal(): number | null {
    let total = 0
    for (const quota of this.quotas) total += quota.targetKg
    return total
  }

  get steps(): readonly MiniGameStep[] {
    return this._steps
  }

  /** Per-mineral quotas (snapshot — exposed for tests + UI). */
  get mineralQuotas(): readonly GatherMineralQuota[] {
    return this.quotas
  }

  /** The rocket Three.js group for the rocket-survey facade. */
  get rocketGroup(): THREE.Group {
    return this.rocket.group
  }

  constructor(options: GatherMinigameOptions) {
    this.objectiveIndex = options.objectiveIndex
    this.objective = options.objective
    this.scene = options.scene
    this.rockYieldSystem = options.rockYieldSystem

    const totalKg = Math.max(1, options.objective.resourceAmount ?? 1)
    const mineralCount = rollMineralCount(options.difficulty)
    // Restrict the picker to minerals that have actually been rolled
    // into rocks. Rare minerals (e.g. <5% Magnetite) can otherwise
    // appear on the quota board with zero rocks to mine — the
    // objective would be uncompletable. When the yield system has no
    // registered rocks (notably in unit tests) we fall back to the
    // raw composition pool so the picker still produces quotas.
    // After picking, top up rocks as needed so each required mineral
    // has at least `MIN_ROCKS_PER_REQUIRED_MINERAL` source rocks.
    const rolled = options.rockYieldSystem.rolledItemIds
    const obtainable = rolled.size > 0 ? rolled : undefined
    const required = pickRequiredMinerals(
      options.composition,
      mineralCount,
      options.seed,
      options.objectiveIndex,
      obtainable,
    )
    const perMineral =
      required.length > 0 ? Math.max(1, Math.ceil(totalKg / required.length)) : 1
    if (obtainable) {
      const minPerMineral = Math.max(
        MIN_ROCKS_PER_REQUIRED_MINERAL,
        Math.ceil(perMineral / APPROX_KG_PER_ROCK),
      )
      for (const entry of required) {
        const have = options.rockYieldSystem.countRolls(entry.itemId)
        if (have < minPerMineral) {
          options.rockYieldSystem.forceRockMineral(entry.itemId, minPerMineral - have)
        }
      }
    }

    if (required.length === 0) {
      this.quotas = []
      this._steps.push({
        label: 'No mineable minerals on this asteroid',
        complete: true,
        active: false,
      })
      this._steps.push({ label: 'Deposit at the delivery rocket', complete: false, active: true })
    } else {
      this.quotas = required.map((entry) => ({
        itemId: entry.itemId,
        label: entry.label,
        targetKg: perMineral,
        minedKg: 0,
      }))
      for (const quota of this.quotas) {
        this._steps.push({
          label: `Mine ${quota.label}`,
          complete: false,
          active: false,
          progress: { current: 0, target: quota.targetKg, unit: 'kg' },
        })
      }
      this._steps.push({ label: 'Deposit at the delivery rocket', complete: false, active: false })
      this._steps[0]!.active = true
    }

    this.rocket = new DepositRocketModel({ baseColor: 0xdddddd, trimColor: 0xff5500 })
    this.rocket.group.userData['__rocketModel'] = this.rocket
    const groundY = options.heightmap.heightAt(options.objective.x, options.objective.z)
    this.rocket.placeAt(options.objective.x, options.objective.z, groundY)
    this.scene.add(this.rocket.group)

    this.listener = (itemId, kg) => this.handleExtraction(itemId, kg)
    const previous = this.rockYieldSystem.onMineralExtracted
    this.rockYieldSystem.onMineralExtracted = (itemId, kg, idx) => {
      previous?.(itemId, kg, idx)
      this.listener(itemId, kg)
    }
  }

  private handleExtraction(itemId: string, kg: number): void {
    if (this._disposed) return
    if (this._status === 'completed') return
    let updated = false
    for (let i = 0; i < this.quotas.length; i++) {
      const quota = this.quotas[i]!
      if (quota.itemId !== itemId) continue
      if (quota.minedKg >= quota.targetKg) continue
      quota.minedKg = Math.min(quota.targetKg, quota.minedKg + kg)
      const step = this._steps[i]!
      if (step.progress) {
        step.progress.current = Math.round(quota.minedKg)
      }
      if (quota.minedKg >= quota.targetKg && !step.complete) {
        step.complete = true
        step.active = false
      }
      updated = true
    }
    if (!updated) return
    this.refreshActiveStep()
    this.onQuotaChange?.(this.quotas)
    this.onStepChange?.(this.objectiveIndex, this._steps)
  }

  private refreshActiveStep(): void {
    let activatedNext = false
    for (const step of this._steps) {
      if (step.complete) {
        step.active = false
        continue
      }
      if (!activatedNext) {
        step.active = true
        activatedNext = true
      } else {
        step.active = false
      }
    }
  }

  /** True once every required mineral has hit its kg target. */
  private allQuotasMet(): boolean {
    if (this.quotas.length === 0) return true
    for (const quota of this.quotas) {
      if (quota.minedKg < quota.targetKg) return false
    }
    return true
  }

  tick(dt: number, ctx: MiniGameContext): void {
    const launchDone = this.rocket.tick(dt)
    if (this._status === 'completed') {
      if (this.rocket.isTakingOff && launchDone) {
        this.rocket.completeTakeoff()
      }
      return
    }

    this._isPlayerNear = false
    if (ctx.levelState !== 'eva' || !ctx.playerPosition) return

    const dx = ctx.playerPosition.x - this.rocket.group.position.x
    const dz = ctx.playerPosition.z - this.rocket.group.position.z
    const dist = Math.sqrt(dx * dx + dz * dz)
    if (dist > TERMINAL_INTERACT_RANGE) return

    this._isPlayerNear = true
    const ready = this.allQuotasMet()
    if (!ready) {
      this.onPrompt?.('CONTINUE MINING — DRILL ROCKS TO MEET QUOTA')
      return
    }

    this.onPrompt?.(this.objective.interactionLabel ?? '[E] DEPOSIT MINERALS')
    if (!ctx.terminalInteractPressed) return

    const depositStep = this._steps[this._steps.length - 1]!
    depositStep.complete = true
    depositStep.active = false
    this._status = 'completed'
    this.onPrompt?.(null)
    this.rocket.takeOff()
    this.onQuotaChange?.(this.quotas)
    this.onStepChange?.(this.objectiveIndex, this._steps)
    this.onComplete?.(this.objectiveIndex)
  }

  dispose(): void {
    this._disposed = true
    this.scene.remove(this.rocket.group)
    this.rocket.dispose()
    this.onPrompt = null
    this.onComplete = null
    this.onStepChange = null
    this.onQuotaChange = null
  }
}

// Exposed for tests so they can exercise the difficulty → count rule
// without re-implementing it.
export { rollMineralCount, pickRequiredMinerals }
