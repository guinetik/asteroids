# Level Disturbance System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a hidden, difficulty-scaled asteroid surface disturbance system that escalates ambient viroid responses from EVA actions and resets only when the lander lifts off.

**Architecture:** Add a pure disturbance model in `src/lib/level/levelDisturbance.ts` and a scene-facing `LevelDisturbanceDirector` that owns ambient viroid spawning, visual controllers, and projectile registration. `LevelViewController` emits action events and lift-off reset signals, while mining/projectile facades provide rock and combat hooks.

**Tech Stack:** TypeScript, Vue 3 level view orchestration, Three.js controllers, Vitest, Bun.

---

## File Structure

- Create `src/lib/level/levelDisturbance.ts`: pure hidden-meter logic, difficulty scaling, response ladder, event weights, reset behavior.
- Create `src/lib/level/LevelDisturbanceDirector.ts`: runtime adapter around `levelDisturbance`, `EnemyDirector`, `BacteriophageController`, `ProjectileSystem`, `Heightmap`, and `THREE.Scene`.
- Create `src/lib/level/__tests__/levelDisturbance.spec.ts`: deterministic unit tests for scaling, thresholds, patrol cooldown, and reset.
- Modify `src/lib/level/LevelCombatMiningFacade.ts`: optional disturbance callbacks for mining hit and rock break.
- Modify `src/views/LevelViewController.ts`: construct/tick/dispose runtime director, emit action events, reset on lift-off, route damage and enemy-hit notifications.
- Modify `docs/superpowers/specs/2026-05-02-level-disturbance-system-design.md` only if implementation uncovers a spec correction.

Do not add a visible HUD meter. Short prompt/marquee/audio hooks are allowed, but the first implementation can spawn enemies without exposing disturbance telemetry.

---

### Task 1: Pure Disturbance Model

**Files:**
- Create: `src/lib/level/levelDisturbance.ts`
- Test: `src/lib/level/__tests__/levelDisturbance.spec.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/lib/level/__tests__/levelDisturbance.spec.ts`:

```ts
/**
 * Tests for hidden level disturbance escalation.
 *
 * @author guinetik
 * @date 2026-05-02
 * @spec docs/superpowers/specs/2026-05-02-level-disturbance-system-design.md
 */
import { describe, expect, it } from 'vitest'
import {
  createLevelDisturbanceState,
  getLevelDisturbanceDifficultyFactor,
  recordLevelDisturbance,
  resetLevelDisturbance,
  tickLevelDisturbance,
} from '@/lib/level/levelDisturbance'

describe('levelDisturbance', () => {
  it('scales action gain by mission difficulty', () => {
    const easy = createLevelDisturbanceState({ missionDifficulty: 1 })
    const hard = createLevelDisturbanceState({ missionDifficulty: 10 })

    recordLevelDisturbance(easy, { type: 'jump' })
    recordLevelDisturbance(hard, { type: 'jump' })

    expect(getLevelDisturbanceDifficultyFactor(1)).toBeCloseTo(0.75)
    expect(getLevelDisturbanceDifficultyFactor(10)).toBeCloseTo(1.25)
    expect(hard.disturbance).toBeGreaterThan(easy.disturbance)
  })

  it('emits response events once as thresholds are crossed', () => {
    const state = createLevelDisturbanceState({ missionDifficulty: 5 })

    recordLevelDisturbance(state, { type: 'jump', amount: 11 })
    const first = tickLevelDisturbance(state, 0)
    const second = tickLevelDisturbance(state, 0)

    expect(first.map((event) => event.tier)).toEqual(['scout'])
    expect(first[0]?.enemyCount).toBe(1)
    expect(second).toEqual([])
  })

  it('can trigger repeated patrol reinforcements while disturbance remains high', () => {
    const state = createLevelDisturbanceState({ missionDifficulty: 10 })

    recordLevelDisturbance(state, { type: 'explosion', amount: 100 })
    const thresholdEvents = tickLevelDisturbance(state, 0)
    const earlyPatrol = tickLevelDisturbance(state, 1)
    const laterPatrol = tickLevelDisturbance(state, 8)

    expect(thresholdEvents.at(-1)?.tier).toBe('patrol')
    expect(earlyPatrol).toEqual([])
    expect(laterPatrol).toEqual([{ tier: 'patrol', enemyCount: 4, alert: 'VIROID SIGNAL CLOSING' }])
  })

  it('reset clears disturbance and response history', () => {
    const state = createLevelDisturbanceState({ missionDifficulty: 6 })

    recordLevelDisturbance(state, { type: 'jump', amount: 30 })
    expect(tickLevelDisturbance(state, 0).length).toBeGreaterThan(0)

    resetLevelDisturbance(state)
    recordLevelDisturbance(state, { type: 'jump', amount: 11 })

    expect(state.disturbance).toBeGreaterThan(0)
    expect(tickLevelDisturbance(state, 0).map((event) => event.tier)).toEqual(['scout'])
  })
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
bun test:unit src/lib/level/__tests__/levelDisturbance.spec.ts
```

Expected: fail because `@/lib/level/levelDisturbance` does not exist.

- [ ] **Step 3: Add the pure implementation**

Create `src/lib/level/levelDisturbance.ts`:

```ts
/**
 * Hidden asteroid-level disturbance model.
 *
 * Surface EVA actions add hidden viroid attention. Threshold crossings emit
 * response events that the scene-facing director turns into ambient enemies.
 *
 * @author guinetik
 * @date 2026-05-02
 * @spec docs/superpowers/specs/2026-05-02-level-disturbance-system-design.md
 */

/** Disturbance action categories emitted by level systems. */
export type LevelDisturbanceEventType =
  | 'movement'
  | 'sprint'
  | 'jump'
  | 'hard-landing'
  | 'tool-fire'
  | 'mining-hit'
  | 'rock-break'
  | 'combat-hit'
  | 'explosion'

/** Response tier identifiers. Ordered from least to most severe. */
export type LevelDisturbanceResponseTier = 'scout' | 'second-contact' | 'pair' | 'cluster' | 'patrol'

/** One action contribution to the hidden disturbance meter. */
export interface LevelDisturbanceEvent {
  /** Kind of noisy action that occurred. */
  type: LevelDisturbanceEventType
  /** Optional raw amount before difficulty scaling. Primarily used by tests and continuous movement. */
  amount?: number
}

/** Event emitted when hidden disturbance crosses a response threshold. */
export interface LevelDisturbanceResponseEvent {
  /** Response tier that should be spawned. */
  tier: LevelDisturbanceResponseTier
  /** Number of ambient viroids requested for this response. */
  enemyCount: number
  /** Hidden-system alert text that may be surfaced as a diegetic prompt. */
  alert: string
}

/** Mutable state for one level's hidden disturbance cycle. */
export interface LevelDisturbanceState {
  /** Mission difficulty in `[1, 10]`, clamped at construction. */
  missionDifficulty: number
  /** Difficulty gain multiplier derived from mission difficulty. */
  difficultyFactor: number
  /** Hidden disturbance value in `[0, 100]`. */
  disturbance: number
  /** Response tiers already fired during this disturbance cycle. */
  triggeredTiers: Set<LevelDisturbanceResponseTier>
  /** Seconds until another patrol reinforcement can fire. */
  patrolCooldownRemaining: number
}

interface LevelDisturbanceThreshold {
  tier: LevelDisturbanceResponseTier
  threshold: number
  enemyCount: number
  alert: string
}

/** Hidden meter cap. */
const DISTURBANCE_MAX = 100
/** Lowest supported mission difficulty. */
const MIN_MISSION_DIFFICULTY = 1
/** Highest supported mission difficulty. */
const MAX_MISSION_DIFFICULTY = 10
/** Difficulty-1 gain multiplier. */
const DIFFICULTY_FACTOR_MIN = 0.75
/** Difficulty-10 gain multiplier. */
const DIFFICULTY_FACTOR_MAX = 1.25
/** Patrol reinforcement cooldown before difficulty scaling. */
const BASE_PATROL_COOLDOWN_SECONDS = 10
/** Minimum patrol cooldown after difficulty scaling. */
const MIN_PATROL_COOLDOWN_SECONDS = 6

const EVENT_BASE_GAIN: Record<LevelDisturbanceEventType, number> = {
  movement: 0.35,
  sprint: 0.8,
  jump: 3,
  'hard-landing': 8,
  'tool-fire': 1.4,
  'mining-hit': 2.2,
  'rock-break': 7,
  'combat-hit': 1.2,
  explosion: 18,
}

const RESPONSE_THRESHOLDS: readonly LevelDisturbanceThreshold[] = [
  { tier: 'scout', threshold: 10, enemyCount: 1, alert: 'SUBSURFACE MOVEMENT DETECTED' },
  { tier: 'second-contact', threshold: 25, enemyCount: 1, alert: 'VIROID SIGNAL CLOSING' },
  { tier: 'pair', threshold: 45, enemyCount: 2, alert: 'VIROID SIGNAL CLOSING' },
  { tier: 'cluster', threshold: 70, enemyCount: 3, alert: 'VIROID PATTERN LOCK' },
  { tier: 'patrol', threshold: 90, enemyCount: 4, alert: 'VIROID SIGNAL CLOSING' },
]

/**
 * Convert mission difficulty to a disturbance gain multiplier.
 *
 * @param missionDifficulty - Mission difficulty, expected in `[1, 10]`.
 * @returns Difficulty-1 maps to `0.75`; difficulty-10 maps to `1.25`.
 */
export function getLevelDisturbanceDifficultyFactor(missionDifficulty: number): number {
  const difficulty = Math.max(
    MIN_MISSION_DIFFICULTY,
    Math.min(MAX_MISSION_DIFFICULTY, missionDifficulty),
  )
  const t = (difficulty - MIN_MISSION_DIFFICULTY) / (MAX_MISSION_DIFFICULTY - 1)
  return DIFFICULTY_FACTOR_MIN + (DIFFICULTY_FACTOR_MAX - DIFFICULTY_FACTOR_MIN) * t
}

/**
 * Create a new hidden disturbance state for one level run.
 *
 * @param params - Mission tuning input.
 * @returns Mutable disturbance state.
 */
export function createLevelDisturbanceState(params: {
  missionDifficulty: number
}): LevelDisturbanceState {
  const missionDifficulty = Math.max(
    MIN_MISSION_DIFFICULTY,
    Math.min(MAX_MISSION_DIFFICULTY, params.missionDifficulty),
  )
  return {
    missionDifficulty,
    difficultyFactor: getLevelDisturbanceDifficultyFactor(missionDifficulty),
    disturbance: 0,
    triggeredTiers: new Set(),
    patrolCooldownRemaining: 0,
  }
}

/**
 * Add one action contribution to the hidden disturbance meter.
 *
 * @param state - Disturbance state to mutate.
 * @param event - Action event emitted by level systems.
 */
export function recordLevelDisturbance(
  state: LevelDisturbanceState,
  event: LevelDisturbanceEvent,
): void {
  const raw = event.amount ?? EVENT_BASE_GAIN[event.type]
  state.disturbance = Math.min(DISTURBANCE_MAX, state.disturbance + raw * state.difficultyFactor)
}

/**
 * Advance cooldowns and emit newly crossed response thresholds.
 *
 * @param state - Disturbance state to mutate.
 * @param dt - Delta time in seconds.
 * @returns Response events requested this frame.
 */
export function tickLevelDisturbance(
  state: LevelDisturbanceState,
  dt: number,
): LevelDisturbanceResponseEvent[] {
  state.patrolCooldownRemaining = Math.max(0, state.patrolCooldownRemaining - dt)
  const events: LevelDisturbanceResponseEvent[] = []

  for (const threshold of RESPONSE_THRESHOLDS) {
    if (state.disturbance < threshold.threshold) continue
    if (state.triggeredTiers.has(threshold.tier)) continue
    state.triggeredTiers.add(threshold.tier)
    events.push({
      tier: threshold.tier,
      enemyCount: threshold.enemyCount,
      alert: threshold.alert,
    })
    if (threshold.tier === 'patrol') {
      state.patrolCooldownRemaining = getPatrolCooldownSeconds(state)
    }
  }

  if (
    state.disturbance >= DISTURBANCE_MAX * 0.9 &&
    state.triggeredTiers.has('patrol') &&
    state.patrolCooldownRemaining <= 0
  ) {
    events.push({ tier: 'patrol', enemyCount: 4, alert: 'VIROID SIGNAL CLOSING' })
    state.patrolCooldownRemaining = getPatrolCooldownSeconds(state)
  }

  return events
}

/**
 * Clear the disturbance cycle after the lander lifts off.
 *
 * @param state - Disturbance state to mutate.
 */
export function resetLevelDisturbance(state: LevelDisturbanceState): void {
  state.disturbance = 0
  state.triggeredTiers.clear()
  state.patrolCooldownRemaining = 0
}

function getPatrolCooldownSeconds(state: LevelDisturbanceState): number {
  return Math.max(MIN_PATROL_COOLDOWN_SECONDS, BASE_PATROL_COOLDOWN_SECONDS / state.difficultyFactor)
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
bun test:unit src/lib/level/__tests__/levelDisturbance.spec.ts
```

Expected: pass.

---

### Task 2: Runtime Disturbance Director

**Files:**
- Create: `src/lib/level/LevelDisturbanceDirector.ts`
- Modify: `src/lib/level/__tests__/levelDisturbance.spec.ts`

- [ ] **Step 1: Add pure spawn-count cap coverage**

Append this test to `src/lib/level/__tests__/levelDisturbance.spec.ts`:

```ts
  it('keeps patrol response count deterministic for hidden UI contract', () => {
    const state = createLevelDisturbanceState({ missionDifficulty: 10 })

    recordLevelDisturbance(state, { type: 'explosion', amount: 100 })

    expect(tickLevelDisturbance(state, 0).map((event) => event.enemyCount)).toEqual([
      1, 1, 2, 3, 4,
    ])
  })
```

- [ ] **Step 2: Run the focused test**

Run:

```bash
bun test:unit src/lib/level/__tests__/levelDisturbance.spec.ts
```

Expected: pass if Task 1 is complete.

- [ ] **Step 3: Add the scene-facing director**

Create `src/lib/level/LevelDisturbanceDirector.ts`:

```ts
/**
 * Scene-facing adapter for the hidden level disturbance system.
 *
 * Owns ambient viroid spawning, visual controller sync, projectile registry
 * wiring, and player contact damage while delegating hidden-meter math to
 * `levelDisturbance`.
 *
 * @author guinetik
 * @date 2026-05-02
 * @spec docs/superpowers/specs/2026-05-02-level-disturbance-system-design.md
 */
import * as THREE from 'three'
import type { Enemy } from '@/lib/fps/enemy'
import { EnemyDirector, type EnemyHandle } from '@/lib/fps/enemyDirector'
import type { ProjectileSystem } from '@/lib/fps/projectileSystem'
import type { Heightmap } from '@/lib/terrain/heightmap'
import {
  createLevelDisturbanceState,
  recordLevelDisturbance,
  resetLevelDisturbance,
  tickLevelDisturbance,
  type LevelDisturbanceEvent,
  type LevelDisturbanceState,
} from '@/lib/level/levelDisturbance'
import { BacteriophageController, PHAGE_HIT_CENTER_Y } from '@/three/BacteriophageController'

/** Maximum ambient disturbance enemies alive at once. */
const DISTURBANCE_MAX_LIVE_ENEMIES = 8
/** Minimum spawn distance from player, in world units. */
const DISTURBANCE_SPAWN_DISTANCE_MIN = 55
/** Maximum spawn distance from player, in world units. */
const DISTURBANCE_SPAWN_DISTANCE_MAX = 95
/** Candidate spawn attempts before dropping one requested enemy. */
const DISTURBANCE_SPAWN_ATTEMPTS = 12
/** Minimum XZ distance from the lander to avoid immediate cockpit camping. */
const DISTURBANCE_LANDER_CLEARANCE = 32
/** Squared near-zero guard for distance checks. */
const DISTURBANCE_EPSILON_SQ = 1e-6

/** Runtime dependencies for {@link LevelDisturbanceDirector}. */
export interface LevelDisturbanceDirectorDeps {
  /** Three.js scene that receives ambient viroid controllers. */
  scene: THREE.Scene
  /** Heightmap used to place and ground spawned viroids. */
  heightmap: Heightmap
  /** Projectile registry used so player bolts can hit ambient viroids. */
  projectileSystem: ProjectileSystem
  /** Mission difficulty in `[1, 10]`. */
  missionDifficulty: number
  /** Deterministic-ish level seed used for spawn angle jitter. */
  seed: number
}

/** Per-frame world context for the disturbance director. */
export interface LevelDisturbanceFrameContext {
  /** Whether the surface EVA player is active. Bunker interiors pass false. */
  evaActive: boolean
  /** Current EVA player position, or null when not in surface EVA. */
  playerPosition: THREE.Vector3 | null
  /** Current lander position, used only for spawn clearance. */
  landerPosition: THREE.Vector3 | null
}

/**
 * Hidden disturbance runtime director.
 *
 * @author guinetik
 * @date 2026-05-02
 * @spec docs/superpowers/specs/2026-05-02-level-disturbance-system-design.md
 */
export class LevelDisturbanceDirector {
  private readonly state: LevelDisturbanceState
  private readonly enemyDirector = new EnemyDirector()
  private readonly viroidControllers = new Map<number, BacteriophageController>()
  private readonly spawnScratch = new THREE.Vector3()
  private rngState: number

  /** Damage routing for viroid contact against the EVA player. */
  onDamagePlayer:
    | ((
        damage: number,
        sourceX: number,
        sourceZ: number,
        source?: 'projectile' | 'contact' | 'hazard',
      ) => void)
    | null = null

  /** Optional hidden-system alert hook. Do not expose a meter value. */
  onAlert: ((message: string) => void) | null = null

  constructor(private readonly deps: LevelDisturbanceDirectorDeps) {
    this.state = createLevelDisturbanceState({ missionDifficulty: deps.missionDifficulty })
    this.rngState = Math.max(1, Math.floor(deps.seed) | 0)
    this.enemyDirector.onContactDamage = (handle, damage) => {
      if (!handle.enemy.alive) return
      this.onDamagePlayer?.(damage, handle.enemy.position.x, handle.enemy.position.z, 'contact')
    }
  }

  /**
   * Record one noisy surface action.
   *
   * @param event - Disturbance action emitted by level systems.
   */
  record(event: LevelDisturbanceEvent): void {
    recordLevelDisturbance(this.state, event)
  }

  /** Reset hidden disturbance after actual lander lift-off. */
  resetForLiftoff(): void {
    resetLevelDisturbance(this.state)
  }

  /**
   * Notify ambient viroid visuals that an enemy took damage.
   *
   * @param enemy - Domain enemy hit by a player projectile.
   */
  notifyEnemyHit(enemy: Enemy): void {
    for (const handle of this.enemyDirector.enemies) {
      if (handle.enemy !== enemy) continue
      this.viroidControllers.get(handle.id)?.flash()
      return
    }
  }

  /**
   * Advance hidden disturbance and ambient viroids.
   *
   * @param dt - Delta time in seconds.
   * @param ctx - Current level actor positions.
   */
  tick(dt: number, ctx: LevelDisturbanceFrameContext): void {
    const responses = tickLevelDisturbance(this.state, dt)
    if (ctx.evaActive && ctx.playerPosition) {
      for (const response of responses) {
        this.onAlert?.(response.alert)
        this.spawnResponse(response.enemyCount, ctx)
      }
      this.enemyDirector.setPlayerPosition(
        ctx.playerPosition.x,
        ctx.playerPosition.y,
        ctx.playerPosition.z,
      )
    }

    this.enemyDirector.tick(dt)
    for (const handle of this.enemyDirector.enemies) {
      this.syncViroidController(handle, dt)
    }
  }

  /** Dispose all ambient viroids and detach projectile registrations. */
  dispose(): void {
    for (const ctrl of this.viroidControllers.values()) {
      ctrl.group.removeFromParent()
      ctrl.dispose()
    }
    for (const handle of this.enemyDirector.enemies) {
      this.deps.projectileSystem.removeEnemy(handle.enemy)
    }
    this.enemyDirector.despawnAll()
    this.viroidControllers.clear()
  }

  private spawnResponse(enemyCount: number, ctx: LevelDisturbanceFrameContext): void {
    const capacity = Math.max(0, DISTURBANCE_MAX_LIVE_ENEMIES - this.enemyDirector.enemies.length)
    const count = Math.min(enemyCount, capacity)
    for (let i = 0; i < count; i++) {
      if (!this.pickSpawnPosition(ctx, this.spawnScratch)) continue
      const handle = this.enemyDirector.spawn(
        'bacteriophage',
        this.spawnScratch.x,
        this.spawnScratch.y,
        this.spawnScratch.z,
      )
      this.deps.projectileSystem.addEnemy(handle.enemy)
      const ctrl = new BacteriophageController(handle.enemy)
      ctrl.group.position.copy(this.spawnScratch)
      this.deps.scene.add(ctrl.group)
      this.viroidControllers.set(handle.id, ctrl)
    }
  }

  private pickSpawnPosition(
    ctx: LevelDisturbanceFrameContext,
    out: THREE.Vector3,
  ): THREE.Vector3 | null {
    const player = ctx.playerPosition
    if (!player) return null

    for (let attempt = 0; attempt < DISTURBANCE_SPAWN_ATTEMPTS; attempt++) {
      const angle = this.rng() * Math.PI * 2
      const distance =
        DISTURBANCE_SPAWN_DISTANCE_MIN +
        this.rng() * (DISTURBANCE_SPAWN_DISTANCE_MAX - DISTURBANCE_SPAWN_DISTANCE_MIN)
      const x = player.x + Math.cos(angle) * distance
      const z = player.z + Math.sin(angle) * distance
      if (
        ctx.landerPosition &&
        this.distSqXZ(x, z, ctx.landerPosition) < DISTURBANCE_LANDER_CLEARANCE ** 2
      ) {
        continue
      }
      const y = this.deps.heightmap.heightAt(x, z)
      out.set(x, y, z)
      return out
    }

    return null
  }

  private syncViroidController(handle: EnemyHandle, dt: number): void {
    const ctrl = this.viroidControllers.get(handle.id)
    if (!ctrl) return
    if (ctrl.deathComplete) {
      ctrl.group.removeFromParent()
      ctrl.dispose()
      this.deps.projectileSystem.removeEnemy(handle.enemy)
      this.enemyDirector.despawn(handle)
      this.viroidControllers.delete(handle.id)
      return
    }

    if (handle.enemy.alive) {
      ctrl.isMoving = handle.lastOutput.isMoving
      ctrl.isAgitated = handle.lastOutput.isAgitated
      ctrl.group.position.x = handle.enemy.position.x
      ctrl.group.position.z = handle.enemy.position.z
      const groundY = this.deps.heightmap.heightAt(handle.enemy.position.x, handle.enemy.position.z)
      ctrl.group.position.y = groundY
      handle.enemy.position.y = groundY + PHAGE_HIT_CENTER_Y
    }
    ctrl.tick(dt)
  }

  private distSqXZ(x: number, z: number, other: THREE.Vector3): number {
    const dx = x - other.x
    const dz = z - other.z
    const distSq = dx * dx + dz * dz
    return distSq <= DISTURBANCE_EPSILON_SQ ? 0 : distSq
  }

  private rng(): number {
    let state = (this.rngState += 0x6d2b79f5)
    state = Math.imul(state ^ (state >>> 15), state | 1)
    state ^= state + Math.imul(state ^ (state >>> 7), state | 61)
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296
  }
}
```

- [ ] **Step 4: Run type-check for the new director**

Run:

```bash
bun run type-check
```

Expected: pass.

---

### Task 3: Mining And Projectile Event Hooks

**Files:**
- Modify: `src/lib/level/LevelCombatMiningFacade.ts`
- Modify: `src/views/LevelViewController.ts`

- [ ] **Step 1: Extend mining bindings**

Modify `LevelCombatMiningBindings` in `src/lib/level/LevelCombatMiningFacade.ts`:

```ts
export interface LevelCombatMiningBindings {
  /** Report a successful inventory pickup to the host UI. */
  onResourcePickup: (itemId: string, quantity: number, label: string) => void
  /** Report a failed pickup (full cargo, overweight, etc.) to the host UI. */
  onResourcePickupFailed: (label: string, reason: string) => void
  /** Remove the collider for a fully depleted rock. */
  onRemoveRockCollider: (spawnIndex: number) => void
  /** Read current level elapsed time in seconds (for sizzle keepalive). */
  getElapsedSeconds: () => number
  /** Called on every science-bolt hit while the rock is being prospected (drives wireframe overlay). */
  onProspectProgress: (spawnIndex: number, scienceHp: number, initialScienceHp: number) => void
  /** Called exactly once when a rock has been fully analysed. */
  onProspectComplete: (spawnIndex: number, itemId: string) => void
  /** Optional hidden disturbance hook for every successful drill hit. */
  onMiningHit?: (spawnIndex: number) => void
  /** Optional hidden disturbance hook for a fully depleted rock. */
  onRockBreak?: (spawnIndex: number) => void
}
```

- [ ] **Step 2: Emit rock-break disturbance from consume**

Inside `this.deps.rockYieldSystem.onConsume = (spawnIndex) => { ... }`, after `this.deps.projectileSystem.removeRock(spawnIndex)`, add:

```ts
      this.bindings.onRockBreak?.(spawnIndex)
```

- [ ] **Step 3: Emit mining-hit disturbance from drill hits**

Inside `this.deps.projectileSystem.onRockHit = (spawnIndex, impactPos) => { ... }`, after `if (!result) return`, add:

```ts
      this.bindings.onMiningHit?.(spawnIndex)
```

- [ ] **Step 4: Run type-check**

Run:

```bash
bun run type-check
```

Expected: pass. The new mining callbacks are optional, so existing facade construction remains valid.

---

### Task 4: LevelViewController Runtime Integration

**Files:**
- Modify: `src/views/LevelViewController.ts`

- [ ] **Step 1: Add imports**

Near the existing level imports in `src/views/LevelViewController.ts`, add:

```ts
import { LevelDisturbanceDirector } from '@/lib/level/LevelDisturbanceDirector'
```

- [ ] **Step 2: Add controller fields**

Near other private runtime fields, add:

```ts
  /** Hidden level-wide viroid disturbance system for surface EVA. */
  private disturbanceDirector: LevelDisturbanceDirector | null = null
  /** Previous grounded state used to detect actual lift-off reset edges. */
  private previousDisturbanceLanderGrounded = false
```

- [ ] **Step 3: Construct the director after projectile system and lander exist**

After `this.projectileSystem.setLander(this.landerController)` in `init`, add:

```ts
    this.disturbanceDirector = new LevelDisturbanceDirector({
      scene: this.sceneManager.scene,
      heightmap: this.heightmap,
      projectileSystem: this.projectileSystem,
      missionDifficulty: mission.difficulty,
      seed: missionSeed,
    })
    this.disturbanceDirector.onDamagePlayer = (damage, sourceX, sourceZ, source) => {
      this.applyPlayerDamageFeedback(damage, sourceX, sourceZ, source)
    }
    this.disturbanceDirector.onAlert = (message) => {
      this.onTerminalPrompt?.(message)
    }
```

- [ ] **Step 4: Add mining disturbance bindings**

In the `new LevelCombatMiningFacade(..., { ... })` binding object in `src/views/LevelViewController.ts`, add these entries alongside `onProspectComplete`:

```ts
          onMiningHit: () => this.disturbanceDirector?.record({ type: 'mining-hit' }),
          onRockBreak: () => this.disturbanceDirector?.record({ type: 'rock-break' }),
```

- [ ] **Step 5: Route ambient enemy hit flash**

Inside `this.projectileSystem.onEnemyHit = (...) => { ... }`, after `this.minigames.notifyEnemyHit(enemy)`, add:

```ts
      this.disturbanceDirector?.notifyEnemyHit(enemy)
      this.disturbanceDirector?.record({ type: 'combat-hit' })
```

- [ ] **Step 6: Tick the director from the main frame**

After `this.tickMinigames(dt)` in `tick(dt)`, add:

```ts
    this.tickDisturbance(dt)
```

Then add this method near `tickMinigames`:

```ts
  /** Tick hidden surface disturbance and reset it when the lander actually lifts off. */
  private tickDisturbance(dt: number): void {
    const lander = this.landerController
    const player = this.playerController
    const currentState = this.stateMachine?.state ?? ''
    const landerGrounded = lander?.body.grounded ?? false

    if (
      currentState === 'lander' &&
      this.previousDisturbanceLanderGrounded &&
      !landerGrounded
    ) {
      this.disturbanceDirector?.resetForLiftoff()
    }
    this.previousDisturbanceLanderGrounded = landerGrounded

    this.disturbanceDirector?.tick(dt, {
      evaActive: currentState === 'eva',
      playerPosition: currentState === 'eva' && player ? player.group.position : null,
      landerPosition: lander ? lander.position : null,
    })
  }
```

- [ ] **Step 7: Dispose the director**

In `LevelViewController.dispose()`, add this after `this.minigames.dispose()` and before `this.projectileSystem?.dispose()`:

```ts
    this.disturbanceDirector?.dispose()
    this.disturbanceDirector = null
```

- [ ] **Step 8: Run type-check**

Run:

```bash
bun run type-check
```

Expected: pass.

---

### Task 5: EVA Action Disturbance Emission

**Files:**
- Modify: `src/views/LevelViewController.ts`

- [ ] **Step 1: Emit tool-fire disturbance**

In `tickEva`, inside:

```ts
      if (this.multiToolState.isFiring) {
        this.multiTool.fire()
      }
```

change to:

```ts
      if (this.multiToolState.isFiring) {
        this.multiTool.fire()
        this.disturbanceDirector?.record({ type: 'tool-fire' })
      }
```

- [ ] **Step 2: Emit movement and sprint disturbance**

In `tickEva`, immediately after `const grounded = this.playerController.grounded`, add:

```ts
      if (grounded && this.playerController.speed > 0.5) {
        this.disturbanceDirector?.record({
          type: sprintingNow ? 'sprint' : 'movement',
          amount: this.playerController.speed * dt * 0.08,
        })
      }
```

- [ ] **Step 3: Emit hard-landing disturbance**

In the existing landing transition:

```ts
      if (physicsGrounded && !this._prevGrounded) {
        this.applyEvaFallDamage()
      }
```

change to:

```ts
      if (physicsGrounded && !this._prevGrounded) {
        this.applyEvaFallDamage()
        this.disturbanceDirector?.record({ type: 'hard-landing' })
      }
```

- [ ] **Step 4: Emit jump disturbance from input edge**

In `tickEva`, after tool keybinds and before visual sync, add:

```ts
    if (this.inputManager?.wasActionPressed('jump') && this.stateMachine?.is('eva')) {
      this.disturbanceDirector?.record({ type: 'jump' })
    }
```

- [ ] **Step 5: Run focused unit and type checks**

Run:

```bash
bun test:unit src/lib/level/__tests__/levelDisturbance.spec.ts
bun run type-check
```

Expected: both pass.

---

### Task 6: Hidden Alert Delivery And Prompt Hygiene

**Files:**
- Modify: `src/views/LevelViewController.ts`

- [ ] **Step 1: Add a short alert timer field**

Near other prompt/timer fields, add:

```ts
  /** Seconds remaining for hidden disturbance alert prompt. */
  private disturbanceAlertRemaining = 0
```

- [ ] **Step 2: Replace direct prompt alert with timed prompt**

Change the director alert binding from:

```ts
    this.disturbanceDirector.onAlert = (message) => {
      this.onTerminalPrompt?.(message)
    }
```

to:

```ts
    this.disturbanceDirector.onAlert = (message) => {
      this.disturbanceAlertRemaining = 3
      this.onTerminalPrompt?.(message)
    }
```

- [ ] **Step 3: Decay the alert timer**

In `tick(dt)`, after `this.tickDisturbance(dt)`, add:

```ts
    if (this.disturbanceAlertRemaining > 0) {
      this.disturbanceAlertRemaining = Math.max(0, this.disturbanceAlertRemaining - dt)
      if (this.disturbanceAlertRemaining <= 0) {
        this.onTerminalPrompt?.(null)
      }
    }
```

- [ ] **Step 4: Run type-check**

Run:

```bash
bun run type-check
```

Expected: pass.

---

### Task 7: Verification And Tuning Pass

**Files:**
- Modify only files already touched if verification exposes issues.

- [ ] **Step 1: Run focused disturbance tests**

Run:

```bash
bun test:unit src/lib/level/__tests__/levelDisturbance.spec.ts
```

Expected: all tests pass.

- [ ] **Step 2: Run full unit tests**

Run:

```bash
bun run test:unit
```

Expected: all tests pass.

- [ ] **Step 3: Run type-check**

Run:

```bash
bun run type-check
```

Expected: no TypeScript errors.

- [ ] **Step 4: Run lint**

Run:

```bash
bun run lint
```

Expected: zero oxlint errors, zero ESLint errors, zero ESLint warnings.

- [ ] **Step 5: Manual smoke test in dev server**

Run:

```bash
bun dev
```

Expected:

- Enter a surface asteroid level.
- Land, exit to EVA, walk/sprint/jump/fire/mine for roughly one minute.
- Viroids eventually arrive from offscreen terrain positions.
- No visible disturbance bar appears.
- Re-entering the lander without lift-off does not reset future responses.
- Lifting off resets the hidden cycle; after landing again, escalation starts over.

Do not commit unless the user explicitly asks. If asked to commit, use a short message such as:

```bash
git commit -m "feat: add level disturbance"
```

---

## Self-Review

- Spec coverage: hidden meter, all-mission scope, difficulty scaling, response ladder, terrain-edge spawning, lift-off reset, decoupled minigame ownership, and tests are each covered by tasks above.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation steps remain.
- Type consistency: pure model exports are used by the runtime director; runtime director is owned by `LevelViewController`; mining callbacks are optional so existing construction sites remain compatible.
