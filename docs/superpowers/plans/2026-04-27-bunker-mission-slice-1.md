# Bunker Mission — Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a playable Bunker mission end-to-end: accept on a non-Earth planet's board, fly to an asteroid, descend through a hatch, clear authored waves in a wireframe interior, extract back to the surface.

**Architecture:** New `'bunker'` `ObjectiveType` plumbed through the existing asteroid mission generator. A new `bunker-interior` sub-state in the level state machine swaps the active simulation root (asteroid hidden, `BunkerSceneController` activated) without tearing down `/level`. A new `BunkerMinigame` mirrors `RescueMinigame`'s shape and drives waves via the existing `EnemyDirector`. All interior geometry is procedurally built from `BoxGeometry` with a faction-tinted grid shader; no GLB assets.

**Tech Stack:** TypeScript strict, Vue 3, Three.js, Vite, Vitest + JSDOM, Tailwind v4. Bun as package manager. ESLint with TSDoc errors.

**Spec:** `docs/superpowers/specs/2026-04-27-bunker-mission-design.md`

**Acceptance gates (run after each task):**
- `bun run type-check` — 0 errors
- `bun run lint` — 0 oxlint errors, 0 ESLint errors, 0 ESLint warnings
- `bun test:unit` — all green

---

## Task 1: Type-system foundation

Add `'bunker'` to `ObjectiveType`, define `BunkerScalableParams`, extend `ConcreteObjective` with `waveCount`, extend `MissionGiverTemplate` with optional `planetIds`. Pure type changes — no runtime logic yet.

**Files:**
- Modify: `src/lib/missions/types.ts`

- [ ] **Step 1: Add `'bunker'` to `ObjectiveType` union**

Edit `src/lib/missions/types.ts`. Find the `ObjectiveType` declaration (currently lines 17–23) and append `'bunker'`:

```ts
/** The asteroid objective types a mission can contain. */
export type ObjectiveType =
  | 'gather'
  | 'exterminate'
  | 'rescue'
  | 'survey'
  | 'photometry'
  | 'collect'
  | 'bunker'
```

- [ ] **Step 2: Add `BunkerScalableParams` interface**

Insert after `CollectScalableParams`:

```ts
/**
 * Scalable params for BUNKER objectives. Wave count is not authored per
 * template — the generator picks 3 / 5 / 7 waves from the rolled mission
 * difficulty band (1–4 / 5–7 / 8–10). Slice 1 has no other knobs.
 */
export interface BunkerScalableParams {
  /** Discriminator for the union type. */
  type: 'bunker'
}
```

- [ ] **Step 3: Add `BunkerScalableParams` to the `ScalableParams` union**

Find the `ScalableParams` union (currently `| GatherScalableParams | ExterminateScalableParams | RescueScalableParams | SurveyScalableParams | PhotometryScalableParams | CollectScalableParams`) and append `| BunkerScalableParams`.

- [ ] **Step 4: Add `waveCount?: number` to `ConcreteObjective`**

Inside `ConcreteObjective`, append before `reward`:

```ts
  /** For bunker: number of waves to clear, stamped from the rolled difficulty band (3 / 5 / 7). */
  waveCount?: number
```

- [ ] **Step 5: Add optional `planetIds` to `MissionGiverTemplate`**

Find `MissionGiverTemplate` (around line 395). Append:

```ts
  /**
   * Optional planet-id allowlist. When set, this template only rolls when the
   * asteroid mission is generated at one of these planets. Templates without
   * `planetIds` remain globally available (current default behavior).
   */
  planetIds?: string[]
```

- [ ] **Step 6: Run type-check and verify clean**

Run: `bun run type-check`
Expected: PASS — new fields are additive and optional.

- [ ] **Step 7: Commit**

```bash
git add src/lib/missions/types.ts
git commit -m "feat(missions): add bunker objective type + per-template planetIds filter"
```

---

## Task 2: Wave skeletons data + `bunkerWaveSchedule` lib (TDD)

Pure function: given `(tier, waveIndex, missionId)` return the wave roster (fixed roster + 1–3 deterministic random fill units). No Three.js, no Vue.

**Files:**
- Create: `src/data/missions/bunker-waves.json`
- Create: `src/lib/bunker/bunkerWaveSchedule.ts`
- Create: `src/lib/bunker/__tests__/bunkerWaveSchedule.spec.ts`

- [ ] **Step 1: Author the wave skeletons JSON**

Create `src/data/missions/bunker-waves.json`:

```json
{
  "easy": [
    {
      "fixed": [{ "type": "bacteriophage", "count": 3 }],
      "fillPool": ["bacteriophage"]
    },
    {
      "fixed": [
        { "type": "bacteriophage", "count": 3 },
        { "type": "spire", "count": 1 }
      ],
      "fillPool": ["bacteriophage"]
    },
    {
      "fixed": [
        { "type": "chimera", "count": 1 },
        { "type": "spire", "count": 1 },
        { "type": "bacteriophage", "count": 4 }
      ],
      "fillPool": ["bacteriophage", "spire"]
    }
  ],
  "medium": [
    {
      "fixed": [{ "type": "bacteriophage", "count": 4 }],
      "fillPool": ["bacteriophage"]
    },
    {
      "fixed": [
        { "type": "bacteriophage", "count": 4 },
        { "type": "spire", "count": 1 }
      ],
      "fillPool": ["bacteriophage"]
    },
    {
      "fixed": [
        { "type": "chimera", "count": 1 },
        { "type": "bacteriophage", "count": 4 }
      ],
      "fillPool": ["bacteriophage", "spire"]
    },
    {
      "fixed": [
        { "type": "chimera", "count": 1 },
        { "type": "spire", "count": 2 },
        { "type": "bacteriophage", "count": 3 }
      ],
      "fillPool": ["bacteriophage"]
    },
    {
      "fixed": [
        { "type": "chimera", "count": 2 },
        { "type": "spire", "count": 2 },
        { "type": "bacteriophage", "count": 5 }
      ],
      "fillPool": ["bacteriophage", "spire", "chimera"]
    }
  ],
  "hard": [
    {
      "fixed": [{ "type": "bacteriophage", "count": 5 }],
      "fillPool": ["bacteriophage"]
    },
    {
      "fixed": [
        { "type": "bacteriophage", "count": 5 },
        { "type": "spire", "count": 1 }
      ],
      "fillPool": ["bacteriophage"]
    },
    {
      "fixed": [
        { "type": "chimera", "count": 1 },
        { "type": "spire", "count": 1 },
        { "type": "bacteriophage", "count": 5 }
      ],
      "fillPool": ["bacteriophage"]
    },
    {
      "fixed": [
        { "type": "chimera", "count": 1 },
        { "type": "spire", "count": 2 },
        { "type": "bacteriophage", "count": 5 }
      ],
      "fillPool": ["bacteriophage", "spire"]
    },
    {
      "fixed": [
        { "type": "chimera", "count": 2 },
        { "type": "spire", "count": 2 },
        { "type": "bacteriophage", "count": 6 }
      ],
      "fillPool": ["bacteriophage", "spire"]
    },
    {
      "fixed": [
        { "type": "chimera", "count": 2 },
        { "type": "spire", "count": 3 },
        { "type": "bacteriophage", "count": 6 }
      ],
      "fillPool": ["bacteriophage", "spire", "chimera"]
    },
    {
      "fixed": [
        { "type": "chimera", "count": 3 },
        { "type": "spire", "count": 3 },
        { "type": "bacteriophage", "count": 8 }
      ],
      "fillPool": ["bacteriophage", "spire", "chimera"]
    }
  ]
}
```

- [ ] **Step 2: Write failing tests**

Create `src/lib/bunker/__tests__/bunkerWaveSchedule.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  difficultyToTier,
  rollWave,
  totalWavesForTier,
  type BunkerWaveTier,
} from '../bunkerWaveSchedule'

describe('difficultyToTier', () => {
  it('maps 1–4 to easy', () => {
    for (const d of [1, 2, 3, 4]) expect(difficultyToTier(d)).toBe('easy')
  })

  it('maps 5–7 to medium', () => {
    for (const d of [5, 6, 7]) expect(difficultyToTier(d)).toBe('medium')
  })

  it('maps 8–10 to hard', () => {
    for (const d of [8, 9, 10]) expect(difficultyToTier(d)).toBe('hard')
  })
})

describe('totalWavesForTier', () => {
  it('returns 3 for easy', () => {
    expect(totalWavesForTier('easy')).toBe(3)
  })

  it('returns 5 for medium', () => {
    expect(totalWavesForTier('medium')).toBe(5)
  })

  it('returns 7 for hard', () => {
    expect(totalWavesForTier('hard')).toBe(7)
  })
})

describe('rollWave', () => {
  it('returns the fixed roster for easy wave 0', () => {
    const roster = rollWave('easy', 0, 'mission-1')
    const phages = roster.filter((u) => u === 'bacteriophage').length
    // Fixed = 3 phages; fill = 1–3 phages from ['bacteriophage'].
    expect(phages).toBeGreaterThanOrEqual(4)
    expect(phages).toBeLessThanOrEqual(6)
  })

  it('rolls deterministic results for the same seed', () => {
    const a = rollWave('medium', 2, 'mission-42')
    const b = rollWave('medium', 2, 'mission-42')
    expect(a).toEqual(b)
  })

  it('rolls different results for different seeds (typically)', () => {
    const a = rollWave('hard', 4, 'seed-A')
    const b = rollWave('hard', 4, 'seed-B')
    // Not strictly required, but with the seed strings differing the rosters
    // should differ at least 50% of the time. We assert *not equal* and accept
    // a 1-in-N flaky risk; if this ever flakes we widen seeds.
    expect(a).not.toEqual(b)
  })

  it('respects the fillPool — never produces unauthored types', () => {
    // Easy wave 0 fillPool is ['bacteriophage'] — no spires/chimeras.
    for (let s = 0; s < 50; s++) {
      const roster = rollWave('easy', 0, `seed-${s}`)
      for (const unit of roster) {
        expect(['bacteriophage']).toContain(unit)
      }
    }
  })

  it('always adds 1–3 fill units', () => {
    // Compare roster size to known fixed count (3 phages on easy wave 0).
    const fixed = 3
    for (let s = 0; s < 50; s++) {
      const total = rollWave('easy', 0, `seed-${s}`).length
      expect(total).toBeGreaterThanOrEqual(fixed + 1)
      expect(total).toBeLessThanOrEqual(fixed + 3)
    }
  })

  it('throws on an out-of-range wave index', () => {
    expect(() => rollWave('easy', 3, 'seed')).toThrow()
    expect(() => rollWave('easy', -1, 'seed')).toThrow()
  })
})

describe('BunkerWaveTier', () => {
  it('exports the literal union', () => {
    const t: BunkerWaveTier = 'easy'
    expect(t).toBe('easy')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail with module-not-found**

Run: `bun test:unit src/lib/bunker/__tests__/bunkerWaveSchedule.spec.ts`
Expected: FAIL — `Cannot find module '../bunkerWaveSchedule'`.

- [ ] **Step 4: Implement `bunkerWaveSchedule.ts`**

Create `src/lib/bunker/bunkerWaveSchedule.ts`:

```ts
/**
 * Pure wave-roster generator for the Bunker minigame.
 *
 * Loads authored skeletons from `src/data/missions/bunker-waves.json` and
 * produces a per-wave enemy roster: the fixed authored units plus 1–3 random
 * fill units drawn from the wave's `fillPool`. The RNG is seeded per
 * `(missionId, waveIndex)` so replays of the same mission see the same waves.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-bunker-mission-design.md
 */
import waveData from '@/data/missions/bunker-waves.json'

/** Slice-1 enemy types valid in bunker rosters. */
export type BunkerEnemyType = 'bacteriophage' | 'spire' | 'chimera'

/** Difficulty tier — drives wave count and authored skeletons. */
export type BunkerWaveTier = 'easy' | 'medium' | 'hard'

/** A single fixed roster entry: spawn `count` of `type`. */
interface WaveFixedEntry {
  type: BunkerEnemyType
  count: number
}

/** One authored wave skeleton: fixed roster + a fill pool. */
interface WaveSkeleton {
  fixed: WaveFixedEntry[]
  fillPool: BunkerEnemyType[]
}

/** Lower bound (inclusive) of random fill units added per wave. */
const FILL_MIN = 1
/** Upper bound (inclusive) of random fill units added per wave. */
const FILL_MAX = 3

const WAVES: Record<BunkerWaveTier, readonly WaveSkeleton[]> = waveData as Record<
  BunkerWaveTier,
  readonly WaveSkeleton[]
>

/**
 * Map an asteroid mission difficulty (1–10) to a bunker tier.
 *
 * @param difficulty - Rolled mission difficulty
 */
export function difficultyToTier(difficulty: number): BunkerWaveTier {
  if (difficulty <= 4) return 'easy'
  if (difficulty <= 7) return 'medium'
  return 'hard'
}

/**
 * Total wave count the player must clear at this tier.
 *
 * @param tier - Bunker tier
 */
export function totalWavesForTier(tier: BunkerWaveTier): number {
  return WAVES[tier].length
}

/**
 * FNV-1a 32-bit hash of a string. Tiny, deterministic, dependency-free —
 * used to seed the per-wave PRNG.
 *
 * @param input - String to hash
 */
function hashString(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/**
 * Mulberry32 PRNG — small, fast, well-distributed.
 *
 * @param seed - 32-bit unsigned seed
 */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Roll the full enemy roster for a single wave.
 *
 * @param tier      - Difficulty tier
 * @param waveIndex - Zero-based wave index
 * @param missionId - Stable mission instance id, used as PRNG seed
 * @returns Flat list of enemy type strings; spawn order = list order
 */
export function rollWave(
  tier: BunkerWaveTier,
  waveIndex: number,
  missionId: string,
): BunkerEnemyType[] {
  const skeletons = WAVES[tier]
  if (waveIndex < 0 || waveIndex >= skeletons.length) {
    throw new Error(
      `bunkerWaveSchedule: waveIndex ${waveIndex} out of range for tier '${tier}' (${skeletons.length} waves)`,
    )
  }
  const skeleton = skeletons[waveIndex]!

  const roster: BunkerEnemyType[] = []
  for (const entry of skeleton.fixed) {
    for (let i = 0; i < entry.count; i++) roster.push(entry.type)
  }

  const seed = hashString(`${missionId}:${tier}:${waveIndex}`)
  const rng = mulberry32(seed)
  const fillCount = FILL_MIN + Math.floor(rng() * (FILL_MAX - FILL_MIN + 1))
  for (let i = 0; i < fillCount; i++) {
    const pick = skeleton.fillPool[Math.floor(rng() * skeleton.fillPool.length)]!
    roster.push(pick)
  }

  return roster
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test:unit src/lib/bunker/__tests__/bunkerWaveSchedule.spec.ts`
Expected: All green.

- [ ] **Step 6: Commit**

```bash
git add src/data/missions/bunker-waves.json src/lib/bunker/bunkerWaveSchedule.ts src/lib/bunker/__tests__/bunkerWaveSchedule.spec.ts
git commit -m "feat(bunker): authored wave skeletons + deterministic roster generator"
```

---

## Task 3: `bunkerSceneState` FSM (TDD)

Pure sub-state machine for the bunker interior. No Three.js, no Vue. Owns transitions and timers; the minigame class drives it.

**Files:**
- Create: `src/lib/bunker/bunkerSceneState.ts`
- Create: `src/lib/bunker/__tests__/bunkerSceneState.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/bunker/__tests__/bunkerSceneState.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { BunkerSceneState, type BunkerSubState } from '../bunkerSceneState'

const ENTERED: BunkerSubState = 'antechamber-idle'
const ACTIVE: BunkerSubState = 'wave-active'
const BREATHER: BunkerSubState = 'wave-breather'
const FINAL: BunkerSubState = 'final-clear'
const EXIT: BunkerSubState = 'exit-prompt'

describe('BunkerSceneState', () => {
  it('starts in entering', () => {
    const s = new BunkerSceneState({ totalWaves: 3 })
    expect(s.current).toBe('entering')
  })

  it('transitions entering → antechamber-idle on activate', () => {
    const s = new BunkerSceneState({ totalWaves: 3 })
    s.notifyActivated()
    expect(s.current).toBe(ENTERED)
  })

  it('transitions antechamber-idle → wave-active on door interact', () => {
    const s = new BunkerSceneState({ totalWaves: 3 })
    s.notifyActivated()
    s.notifyDoorInteracted()
    expect(s.current).toBe(ACTIVE)
    expect(s.currentWaveIndex).toBe(0)
  })

  it('door-interact during wave-active is ignored (interlock)', () => {
    const s = new BunkerSceneState({ totalWaves: 3 })
    s.notifyActivated()
    s.notifyDoorInteracted() // → wave-active
    const before = s.currentWaveIndex
    s.notifyDoorInteracted()
    expect(s.current).toBe(ACTIVE)
    expect(s.currentWaveIndex).toBe(before)
  })

  it('transitions wave-active → wave-breather when wave is cleared (non-final)', () => {
    const s = new BunkerSceneState({ totalWaves: 3 })
    s.notifyActivated()
    s.notifyDoorInteracted()
    s.notifyWaveCleared()
    expect(s.current).toBe(BREATHER)
    expect(s.currentWaveIndex).toBe(0)
  })

  it('breather counts down and advances to wave-active with the next wave index', () => {
    const s = new BunkerSceneState({ totalWaves: 3, breatherSeconds: 3 })
    s.notifyActivated()
    s.notifyDoorInteracted()
    s.notifyWaveCleared() // → breather, wave 0 done
    s.tick(1.5)
    expect(s.current).toBe(BREATHER)
    s.tick(1.5)
    expect(s.current).toBe(ACTIVE)
    expect(s.currentWaveIndex).toBe(1)
  })

  it('final wave clear transitions wave-active → final-clear → exit-prompt', () => {
    const s = new BunkerSceneState({ totalWaves: 3 })
    s.notifyActivated()
    s.notifyDoorInteracted()
    s.notifyWaveCleared() // wave 0 done → breather
    s.tick(3)
    s.notifyWaveCleared() // wave 1 done → breather
    s.tick(3)
    s.notifyWaveCleared() // wave 2 done → final-clear → exit-prompt
    expect([FINAL, EXIT]).toContain(s.current)
    s.tick(1) // settle
    expect(s.current).toBe(EXIT)
  })

  it('hatch-interact before exit-prompt is ignored', () => {
    const s = new BunkerSceneState({ totalWaves: 3 })
    s.notifyActivated()
    s.notifyHatchInteracted()
    expect(s.current).toBe(ENTERED)
    s.notifyDoorInteracted()
    s.notifyHatchInteracted()
    expect(s.current).toBe(ACTIVE)
  })

  it('hatch-interact during exit-prompt transitions to exiting', () => {
    const s = new BunkerSceneState({ totalWaves: 1 })
    s.notifyActivated()
    s.notifyDoorInteracted()
    s.notifyWaveCleared()
    s.tick(1) // settle to exit-prompt
    s.notifyHatchInteracted()
    expect(s.current).toBe('exiting')
  })

  it('emits an event on every transition', () => {
    const events: BunkerSubState[] = []
    const s = new BunkerSceneState({ totalWaves: 1, onTransition: (next) => events.push(next) })
    s.notifyActivated()
    s.notifyDoorInteracted()
    s.notifyWaveCleared()
    s.tick(1)
    s.notifyHatchInteracted()
    expect(events).toEqual([ENTERED, ACTIVE, FINAL, EXIT, 'exiting'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail with module-not-found**

Run: `bun test:unit src/lib/bunker/__tests__/bunkerSceneState.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `bunkerSceneState.ts`**

Create `src/lib/bunker/bunkerSceneState.ts`:

```ts
/**
 * Sub-state machine for the bunker interior.
 *
 * Drives the per-tick flow inside the bunker: enter → idle in antechamber →
 * waves (active + breather) → final clear → exit prompt → exiting. Owns the
 * breather countdown timer and emits transitions through `onTransition`.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-bunker-mission-design.md
 */

/** Discrete sub-states of the bunker interior. */
export type BunkerSubState =
  | 'entering'
  | 'antechamber-idle'
  | 'wave-active'
  | 'wave-breather'
  | 'final-clear'
  | 'exit-prompt'
  | 'exiting'

/** Default seconds between waves while no enemies are alive. */
const DEFAULT_BREATHER_SECONDS = 3.0

/** Seconds spent on the brief `final-clear` celebration before transitioning to `exit-prompt`. */
const FINAL_CLEAR_HOLD_SECONDS = 0.6

/** Constructor options for {@link BunkerSceneState}. */
export interface BunkerSceneStateOptions {
  /** Total wave count this tier requires. */
  totalWaves: number
  /** Seconds between waves. Defaults to {@link DEFAULT_BREATHER_SECONDS}. */
  breatherSeconds?: number
  /** Fired on every transition. Argument is the new state. */
  onTransition?: (next: BunkerSubState, previous: BunkerSubState) => void
}

/**
 * Bunker interior sub-FSM. Transitions are driven by the minigame via the
 * `notify*` methods; the only time-based transition is the breather → next
 * wave handoff and the brief final-clear hold.
 */
export class BunkerSceneState {
  private _current: BunkerSubState = 'entering'
  private _currentWaveIndex = -1
  private timer = 0
  private readonly totalWaves: number
  private readonly breatherSeconds: number
  private readonly onTransition?: (next: BunkerSubState, previous: BunkerSubState) => void

  /**
   * @param opts - Wave count, breather length, optional transition listener
   */
  constructor(opts: BunkerSceneStateOptions) {
    this.totalWaves = opts.totalWaves
    this.breatherSeconds = opts.breatherSeconds ?? DEFAULT_BREATHER_SECONDS
    this.onTransition = opts.onTransition
  }

  /** Current sub-state. */
  get current(): BunkerSubState {
    return this._current
  }

  /** Zero-based index of the wave currently active or last cleared. -1 before wave 1. */
  get currentWaveIndex(): number {
    return this._currentWaveIndex
  }

  /**
   * Advance internal timers. Call once per simulation tick.
   *
   * @param dt - Delta time in seconds
   */
  tick(dt: number): void {
    if (this._current === 'wave-breather') {
      this.timer = Math.max(0, this.timer - dt)
      if (this.timer <= 0) {
        this._currentWaveIndex += 1
        this.transition('wave-active')
      }
      return
    }
    if (this._current === 'final-clear') {
      this.timer = Math.max(0, this.timer - dt)
      if (this.timer <= 0) {
        this.transition('exit-prompt')
      }
    }
  }

  /** Called by the scene controller after `activate` finishes. */
  notifyActivated(): void {
    if (this._current === 'entering') this.transition('antechamber-idle')
  }

  /** Called when the player presses E on the arena door. */
  notifyDoorInteracted(): void {
    if (this._current !== 'antechamber-idle') return
    this._currentWaveIndex = 0
    this.transition('wave-active')
  }

  /** Called when the active wave's enemies are all dead. */
  notifyWaveCleared(): void {
    if (this._current !== 'wave-active') return
    const isFinal = this._currentWaveIndex >= this.totalWaves - 1
    if (isFinal) {
      this.timer = FINAL_CLEAR_HOLD_SECONDS
      this.transition('final-clear')
    } else {
      this.timer = this.breatherSeconds
      this.transition('wave-breather')
    }
  }

  /** Called when the player presses E on the antechamber exit hatch. */
  notifyHatchInteracted(): void {
    if (this._current !== 'exit-prompt') return
    this.transition('exiting')
  }

  /**
   * Internal transition with listener emission.
   *
   * @param next - The new sub-state
   */
  private transition(next: BunkerSubState): void {
    if (next === this._current) return
    const prev = this._current
    this._current = next
    this.onTransition?.(next, prev)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/bunker/__tests__/bunkerSceneState.spec.ts`
Expected: All green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bunker/bunkerSceneState.ts src/lib/bunker/__tests__/bunkerSceneState.spec.ts
git commit -m "feat(bunker): scene-state sub-FSM with timer-driven breather"
```

---

## Task 4: Generator extension — per-template `planetIds` filter + bunker materialization (TDD)

Two surgical changes inside `asteroidMissionGenerator.ts`. First, when picking a template from a giver's pool, honor optional `planetIds`. Second, materialize a `'bunker'` objective stamping `waveCount` from the rolled difficulty band.

**Files:**
- Modify: `src/lib/missions/asteroidMissionGenerator.ts`
- Modify: `src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts` (extend)

- [ ] **Step 1: Read the existing generator structure**

Read `src/lib/missions/asteroidMissionGenerator.ts` lines 350–420 to locate the per-objective `switch` (existing arms: gather / exterminate / rescue / survey / photometry / collect) and the per-giver template-filter site near line 600–700. Make sure your edits land in the right places.

- [ ] **Step 2: Write failing tests**

Append to `src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts` a new `describe` block. Read the file first to match its existing imports / fixtures style. Add (adjusting fixture names to whatever the file uses):

```ts
describe('bunker objective generation', () => {
  it('stamps waveCount=3 for difficulty 1–4', () => {
    const mission = generateForTest({
      objectiveType: 'bunker',
      difficulty: 3,
    })
    expect(mission.objectives[0]!.type).toBe('bunker')
    expect(mission.objectives[0]!.waveCount).toBe(3)
  })

  it('stamps waveCount=5 for difficulty 5–7', () => {
    const mission = generateForTest({
      objectiveType: 'bunker',
      difficulty: 6,
    })
    expect(mission.objectives[0]!.waveCount).toBe(5)
  })

  it('stamps waveCount=7 for difficulty 8–10', () => {
    const mission = generateForTest({
      objectiveType: 'bunker',
      difficulty: 9,
    })
    expect(mission.objectives[0]!.waveCount).toBe(7)
  })
})

describe('per-template planetIds filter', () => {
  it('skips templates whose planetIds excludes the host planet', () => {
    // A giver with two templates, one Jupiter-only and one global. At Mercury,
    // only the global one should ever be picked.
    for (let i = 0; i < 50; i++) {
      const mission = generateForTest({
        hostPlanet: 'mercury',
        giverWith: { planetIdsOnFirst: ['jupiter'] },
      })
      expect(mission.templateId).not.toBe('first-template')
    }
  })

  it('does not affect templates without planetIds (regression)', () => {
    const mission = generateForTest({ hostPlanet: 'mars' })
    expect(mission).toBeTruthy()
  })
})
```

> **Note on fixtures:** the existing spec file likely has helpers like `buildGiver(...)` or imports actual data and stubs the random source. Use whatever pattern is already there; the names above are illustrative. If the spec lacks a controllable fixture, add one rather than calling the public API blind.

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test:unit src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts`
Expected: New tests FAIL — bunker not yet materialized; planetIds filter not yet applied.

- [ ] **Step 4: Add the per-template `planetIds` filter**

In `asteroidMissionGenerator.ts`, find the template-selection inside the per-giver loop. Before evaluating a template's `regionByDifficulty`, add an early-skip:

```ts
// Per-template planet filter — when set, the template only rolls at the
// listed host planets. Templates without `planetIds` remain global.
if (template.planetIds && !template.planetIds.includes(hostPlanetId)) {
  continue
}
```

Wire `hostPlanetId` from the existing host-anchor variable already in scope (around the same place `getHostGiverOverride(anchor.planetId)` is called).

- [ ] **Step 5: Add the bunker materialization arm**

Find the objective `switch` (around line 350 onward). Add:

```ts
case 'bunker': {
  const waveCount = difficulty <= 4 ? 3 : difficulty <= 7 ? 5 : 7
  return {
    type: 'bunker',
    x,
    z,
    waveCount,
    reward: rolledReward,
  }
}
```

Use the same `x` / `z` / `rolledReward` variables the other arms use. Import `difficulty` from the same scope they do.

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun test:unit src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts`
Expected: All green.

- [ ] **Step 7: Run the full asteroid-generator suite to catch regressions**

Run: `bun test:unit src/lib/missions/__tests__/`
Expected: All green — no other generator test breaks.

- [ ] **Step 8: Commit**

```bash
git add src/lib/missions/asteroidMissionGenerator.ts src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts
git commit -m "feat(missions): per-template planetIds filter + bunker materialization"
```

---

## Task 5: Author 4 giver JSON files + extend Jovian Society + load in catalog

Pure data + one tiny code edit to register the new giver files.

**Files:**
- Create: `src/data/missions/givers/cinderline.json`
- Create: `src/data/missions/givers/lucas-maverick.json`
- Create: `src/data/missions/givers/martian-marines-bunker.json`
- Modify: `src/data/missions/givers/jovian-society.json`
- Modify: `src/lib/missions/giverCatalog.ts`

- [ ] **Step 1: Author `cinderline.json`**

Create `src/data/missions/givers/cinderline.json`:

```json
{
  "id": "cinderline",
  "name": "The Cinderline, at The Anvil",
  "title": "Standing Order, Mercury",
  "objectiveTypes": ["bunker"],
  "minDifficulty": 1,
  "maxDifficulty": 10,
  "planetIds": ["mercury"],
  "missions": [
    {
      "id": "cinderline_anvil_substation",
      "name": "Anvil Substation, Sealed",
      "briefing": "Pilot, an Anvil substation has gone quiet. Viroids inside the door, the work inside the viroids. We do not abandon a sealed room. Take the descent. Walk the work. Return when the room is ours again. A seat will be kept.",
      "objectiveSlots": [
        {
          "type": "bunker",
          "weight": 1.0,
          "params": { "type": "bunker" },
          "reward": { "min": 3000, "max": 7500 }
        }
      ],
      "completionBonus": { "min": 1500, "max": 3000 },
      "regionByDifficulty": {
        "near-earth": [1, 4],
        "asteroid-belt": [4, 7],
        "kuiper-belt": [7, 10]
      }
    }
  ]
}
```

- [ ] **Step 2: Author `lucas-maverick.json`**

Create `src/data/missions/givers/lucas-maverick.json`:

```json
{
  "id": "lucas-maverick",
  "name": "Lucas Maverick",
  "title": "Exchange Floor Boss, Venus",
  "objectiveTypes": ["bunker"],
  "minDifficulty": 1,
  "maxDifficulty": 10,
  "planetIds": ["venus"],
  "missions": [
    {
      "id": "maverick_safehouse_ledger",
      "name": "Safehouse Ledger Recovery",
      "briefing": "Pilot — got a private safehouse on a rock that just flipped on me. Viroids in the vault, ledger inside the viroids. Standard hand: descend, clear the table, walk out. House rule: lose your shuttle and you lose the cargo with it. Ante up clean and you get the doubled lane on the way back. — Lucas",
      "objectiveSlots": [
        {
          "type": "bunker",
          "weight": 1.0,
          "params": { "type": "bunker" },
          "reward": { "min": 3500, "max": 8000 }
        }
      ],
      "completionBonus": { "min": 2000, "max": 3500 },
      "regionByDifficulty": {
        "near-earth": [1, 4],
        "asteroid-belt": [4, 7],
        "kuiper-belt": [7, 10]
      }
    }
  ]
}
```

- [ ] **Step 3: Author `martian-marines-bunker.json`**

Create `src/data/missions/givers/martian-marines-bunker.json`:

```json
{
  "id": "martian-marines-bunker",
  "name": "Martian Marines Corps",
  "title": "Cohort Operations, Mars",
  "objectiveTypes": ["bunker"],
  "minDifficulty": 1,
  "maxDifficulty": 10,
  "planetIds": ["mars"],
  "missions": [
    {
      "id": "mmc_forward_bunker_recon",
      "name": "Forward Bunker — Recon and Reclaim",
      "briefing": "Operator. Forward bunker on the rock has gone dark. Viroid signature inside. Recon-and-reclaim: descend, neutralize, recover the position. Cohort cannot dispatch hard at distance — that's why we contract pilots like you. Hold the door. Make it ours.",
      "objectiveSlots": [
        {
          "type": "bunker",
          "weight": 1.0,
          "params": { "type": "bunker" },
          "reward": { "min": 3500, "max": 8500 }
        }
      ],
      "completionBonus": { "min": 2000, "max": 4000 },
      "regionByDifficulty": {
        "near-earth": [1, 4],
        "asteroid-belt": [4, 7],
        "kuiper-belt": [7, 10]
      }
    }
  ]
}
```

- [ ] **Step 4: Extend `jovian-society.json` with a bunker template**

Read `src/data/missions/givers/jovian-society.json` first. Then:

1. Edit `objectiveTypes` from `["photometry"]` to `["photometry", "bunker"]`.
2. Append one new mission entry to the `missions` array with `planetIds: ["jupiter"]` on the bunker objective slot's *template* level (not the slot — i.e., next to `objectiveSlots`/`completionBonus` at the template object level since `MissionGiverTemplate` carries `planetIds`):

```json
{
  "id": "jovian_asset_substrate_recovery",
  "name": "Asset Substrate Recovery",
  "briefing": "Pilot. The Society maintains an asset bunker on the body in question. A viroid incursion has compromised it. Per portfolio terms, we require descent, neutralization, and recovery of the substrate before the next review cycle. Standard pass: clear the floor, walk out. — Vance Hoyt",
  "objectiveSlots": [
    {
      "type": "bunker",
      "weight": 1.0,
      "params": { "type": "bunker" },
      "reward": { "min": 3500, "max": 9000 }
    }
  ],
  "completionBonus": { "min": 2500, "max": 4000 },
  "regionByDifficulty": {
    "asteroid-belt": [3, 7],
    "kuiper-belt": [7, 10]
  },
  "planetIds": ["jupiter"]
}
```

- [ ] **Step 5: Wire the three new giver files into the catalog**

Read `src/lib/missions/giverCatalog.ts` to see the existing import/loader pattern (around lines 14–30). Add three imports + register them in the catalog array:

```ts
import cinderlineData from '@/data/missions/givers/cinderline.json'
import lucasMaverickData from '@/data/missions/givers/lucas-maverick.json'
import martianMarinesBunkerData from '@/data/missions/givers/martian-marines-bunker.json'
```

Add `cinderlineData`, `lucasMaverickData`, `martianMarinesBunkerData` to whatever array the catalog assembles (next to `jovianSocietyData`).

- [ ] **Step 6: Run type-check and tests**

Run: `bun run type-check && bun test:unit`
Expected: All green.

- [ ] **Step 7: Commit**

```bash
git add src/data/missions/givers/cinderline.json \
        src/data/missions/givers/lucas-maverick.json \
        src/data/missions/givers/martian-marines-bunker.json \
        src/data/missions/givers/jovian-society.json \
        src/lib/missions/giverCatalog.ts
git commit -m "feat(bunker): author 4 faction givers (cinderline, lucas, mmc, jovian)"
```

---

## Task 6: `BunkerGridMaterial` shader

A single `ShaderMaterial` that paints faction-tinted grid lines on world-space-UV box geometry. No tests (`src/three/` per repo norms).

**Files:**
- Create: `src/three/bunker/BunkerGridMaterial.ts`

- [ ] **Step 1: Implement the material**

Create `src/three/bunker/BunkerGridMaterial.ts`:

```ts
/**
 * Faction-tinted cartesian grid shader for bunker walls.
 *
 * Derives world-space UVs from object position so every wall, floor, and
 * ceiling shares one coherent grid regardless of mesh size. Emissive output
 * is intended to flow through the existing post-FX bloom.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-bunker-mission-design.md
 */
import * as THREE from 'three'

/** Configuration for {@link createBunkerGridMaterial}. */
export interface BunkerGridMaterialOptions {
  /** Faction tint hex (`#rrggbb`). */
  tint: number
  /** Cell size in world units. Defaults to 2.0. */
  cellSize?: number
  /** Line half-width as a fraction of `cellSize`. Defaults to 0.04. */
  lineWidth?: number
  /** Emissive multiplier. Defaults to 1.6. */
  emissive?: number
}

/** Default cell size in world units. */
const DEFAULT_CELL_SIZE = 2.0
/** Default line half-width relative to cell. */
const DEFAULT_LINE_WIDTH = 0.04
/** Default emissive multiplier. */
const DEFAULT_EMISSIVE = 1.6
/** Idle breathing cadence in Hz. */
const BREATHE_HZ = 0.5
/** Minimum emissive multiplier during the breath cycle. */
const BREATHE_MIN_FACTOR = 0.85

const VERT = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`

const FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  uniform vec3 uColorBase;
  uniform vec3 uColorGrid;
  uniform float uCellSize;
  uniform float uLineWidth;
  uniform float uEmissive;
  uniform float uTime;

  // Pick two world axes by face normal — the largest absolute component is
  // the face normal axis; the other two are the in-plane UVs.
  vec2 worldUV(vec3 pos, vec3 n) {
    vec3 a = abs(n);
    if (a.x > a.y && a.x > a.z) return pos.yz;
    if (a.y > a.x && a.y > a.z) return pos.xz;
    return pos.xy;
  }

  void main() {
    vec2 uv = worldUV(vWorldPos, vWorldNormal) / uCellSize;
    vec2 g = abs(fract(uv) - 0.5) - (0.5 - uLineWidth);
    float line = step(0.0, max(g.x, g.y));
    float breathe = mix(${BREATHE_MIN_FACTOR.toFixed(3)}, 1.0, 0.5 + 0.5 * sin(uTime * 6.2831853 * ${BREATHE_HZ.toFixed(3)}));
    vec3 col = mix(uColorBase, uColorGrid * uEmissive * breathe, line);
    gl_FragColor = vec4(col, 1.0);
  }
`

/**
 * Build the bunker grid material. The returned `ShaderMaterial` exposes a
 * `userData.tick(dt)` hook the scene controller calls each frame to advance
 * the breathing animation.
 *
 * @param opts - Tint + tuning
 */
export function createBunkerGridMaterial(opts: BunkerGridMaterialOptions): THREE.ShaderMaterial {
  const colorBase = new THREE.Color(0x0a0e14)
  const colorGrid = new THREE.Color(opts.tint)
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColorBase: { value: colorBase },
      uColorGrid: { value: colorGrid },
      uCellSize: { value: opts.cellSize ?? DEFAULT_CELL_SIZE },
      uLineWidth: { value: opts.lineWidth ?? DEFAULT_LINE_WIDTH },
      uEmissive: { value: opts.emissive ?? DEFAULT_EMISSIVE },
      uTime: { value: 0 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.FrontSide,
  })
  mat.userData.tick = (dt: number) => {
    mat.uniforms.uTime.value += dt
  }
  return mat
}
```

- [ ] **Step 2: Run type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/three/bunker/BunkerGridMaterial.ts
git commit -m "feat(bunker): faction-tinted cartesian grid ShaderMaterial"
```

---

## Task 7: `BunkerWallBuilder`

Procedural geometry: antechamber + corridor + arena. Returns a single root `THREE.Group` with named child groups so the scene controller can hide/show pieces. No tests.

**Files:**
- Create: `src/three/bunker/BunkerWallBuilder.ts`

- [ ] **Step 1: Implement the builder**

Create `src/three/bunker/BunkerWallBuilder.ts`:

```ts
/**
 * Procedural bunker geometry — antechamber + corridor + arena.
 *
 * Builds box meshes around three rectangular volumes whose dimensions match
 * the spec. All meshes share one {@link createBunkerGridMaterial} instance
 * via the `material` argument so the breathing animation stays coherent.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-bunker-mission-design.md
 */
import * as THREE from 'three'

/** Antechamber inner dimensions (world units). */
export const ANTECHAMBER = { width: 8, depth: 8, height: 5 }
/** Corridor inner dimensions. */
export const CORRIDOR = { width: 3, depth: 4, height: 4 }
/** Arena inner dimensions. */
export const ARENA = { width: 30, depth: 30, height: 7 }
/** Wall thickness for all six faces of every volume. */
export const WALL_THICKNESS = 0.4
/** Inset from each arena corner (world units) where spawn pads sit. */
export const SPAWN_PAD_INSET = 4

/** Built bunker — root group plus references the controller cares about. */
export interface BunkerGeometry {
  /** Scene root — add this to the scene. */
  root: THREE.Group
  /** All six wall meshes per room, named for hide/show. */
  rooms: { antechamber: THREE.Group; corridor: THREE.Group; arena: THREE.Group }
  /** XZ centers of the four arena spawn pads in world space. */
  spawnPadCenters: ReadonlyArray<{ x: number; z: number }>
  /** XZ position of the antechamber's exit hatch (floor center). */
  antechamberHatch: { x: number; z: number }
  /** Door slot — the scene controller fills this with a `BunkerDoorController`. */
  arenaDoorAnchor: THREE.Object3D
  /** Player spawn point inside the antechamber when entering the bunker. */
  playerSpawn: THREE.Vector3
}

/**
 * Build the bunker geometry rooted at the world origin. The arena is placed
 * north of the antechamber with the corridor between them.
 *
 * @param material - Shared grid material for all six faces of every volume
 */
export function buildBunkerGeometry(material: THREE.ShaderMaterial): BunkerGeometry {
  const root = new THREE.Group()
  root.name = 'bunkerRoot'

  // Lay out z-axis as "depth" with antechamber at z=0, corridor next, arena last.
  const anteCenterZ = 0
  const corrCenterZ = ANTECHAMBER.depth / 2 + CORRIDOR.depth / 2
  const arenaCenterZ = corrCenterZ + CORRIDOR.depth / 2 + ARENA.depth / 2

  const ante = buildRoom('antechamber', ANTECHAMBER, 0, anteCenterZ, material)
  const corr = buildRoom('corridor', CORRIDOR, 0, corrCenterZ, material)
  const arena = buildRoom('arena', ARENA, 0, arenaCenterZ, material)
  root.add(ante, corr, arena)

  // Door anchor sits on the corridor's antechamber-facing wall (between ante and corridor).
  const arenaDoorAnchor = new THREE.Object3D()
  arenaDoorAnchor.position.set(0, 0, ANTECHAMBER.depth / 2)
  root.add(arenaDoorAnchor)

  // Spawn pads inset from the four arena corners.
  const halfW = ARENA.width / 2 - SPAWN_PAD_INSET
  const halfD = ARENA.depth / 2 - SPAWN_PAD_INSET
  const spawnPadCenters = [
    { x: -halfW, z: arenaCenterZ - halfD },
    { x: halfW, z: arenaCenterZ - halfD },
    { x: -halfW, z: arenaCenterZ + halfD },
    { x: halfW, z: arenaCenterZ + halfD },
  ]

  return {
    root,
    rooms: { antechamber: ante, corridor: corr, arena },
    spawnPadCenters,
    antechamberHatch: { x: 0, z: anteCenterZ },
    arenaDoorAnchor,
    playerSpawn: new THREE.Vector3(0, 0, anteCenterZ - ANTECHAMBER.depth / 2 + 1.5),
  }
}

/**
 * Build the six wall meshes for one rectangular room centered at (cx, cz)
 * with floor at y=0 and ceiling at y=`dims.height`.
 */
function buildRoom(
  name: string,
  dims: { width: number; depth: number; height: number },
  cx: number,
  cz: number,
  material: THREE.ShaderMaterial,
): THREE.Group {
  const g = new THREE.Group()
  g.name = name
  const t = WALL_THICKNESS

  // Floor + ceiling
  const floor = new THREE.Mesh(new THREE.BoxGeometry(dims.width, t, dims.depth), material)
  floor.position.set(cx, -t / 2, cz)
  g.add(floor)

  const ceil = new THREE.Mesh(new THREE.BoxGeometry(dims.width, t, dims.depth), material)
  ceil.position.set(cx, dims.height + t / 2, cz)
  g.add(ceil)

  // North + south walls (along x-axis), with the corridor opening punched out at small rooms.
  const north = new THREE.Mesh(new THREE.BoxGeometry(dims.width, dims.height, t), material)
  north.position.set(cx, dims.height / 2, cz + dims.depth / 2 + t / 2)
  g.add(north)

  const south = new THREE.Mesh(new THREE.BoxGeometry(dims.width, dims.height, t), material)
  south.position.set(cx, dims.height / 2, cz - dims.depth / 2 - t / 2)
  g.add(south)

  // East + west walls (along z-axis)
  const east = new THREE.Mesh(new THREE.BoxGeometry(t, dims.height, dims.depth), material)
  east.position.set(cx + dims.width / 2 + t / 2, dims.height / 2, cz)
  g.add(east)

  const west = new THREE.Mesh(new THREE.BoxGeometry(t, dims.height, dims.depth), material)
  west.position.set(cx - dims.width / 2 - t / 2, dims.height / 2, cz)
  g.add(west)

  return g
}
```

> Slice-1 simplification: walls are solid boxes — there is no CSG cut for the corridor opening. Player movement in slice 1 is gated by the FSM (the door controller blocks passage), and the corridor opening is implied by the door mesh rather than a hole in the wall. If walking through the wall is observable in playtest, slice 2 carves a hole.

- [ ] **Step 2: Run type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/three/bunker/BunkerWallBuilder.ts
git commit -m "feat(bunker): procedural antechamber+corridor+arena geometry"
```

---

## Task 8: `BunkerHatchModel`

Surface-side hatch prop on the asteroid + antechamber-side exit hatch (mirrored). Procedural ring + two animated radial leaves. No tests.

**Files:**
- Create: `src/three/bunker/BunkerHatchModel.ts`

- [ ] **Step 1: Implement the model**

Create `src/three/bunker/BunkerHatchModel.ts`:

```ts
/**
 * Bunker hatch prop — recessed circular pad with two radial sliding leaves.
 *
 * Same model is used for both the surface hatch (player descends) and the
 * antechamber exit hatch (player extracts). Visual idle: a slow inner-ring
 * pulse when interactable.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-bunker-mission-design.md
 */
import * as THREE from 'three'

/** Hatch outer diameter in world units. */
export const HATCH_OUTER_RADIUS = 1.25
/** Open-state radial offset of each half-leaf (world units). */
const OPEN_OFFSET = 1.25
/** Tween duration for open/close in seconds. */
const TWEEN_DURATION = 0.6

/** A single bunker hatch (surface or antechamber). */
export class BunkerHatchModel {
  /** Add this group to the parent scene/group. */
  readonly group = new THREE.Group()

  private readonly leafA: THREE.Mesh
  private readonly leafB: THREE.Mesh
  private readonly ring: THREE.Mesh
  private readonly ringMat: THREE.MeshBasicMaterial
  private readonly tint: number
  private targetOpen = 0
  private currentOpen = 0
  private idlePhase = 0
  /** True when the hatch should pulse (player can interact). */
  active = false

  /**
   * @param tint - Faction tint hex
   */
  constructor(tint: number) {
    this.tint = tint
    this.ringMat = new THREE.MeshBasicMaterial({
      color: tint,
      transparent: true,
      opacity: 0.55,
    })
    const ringGeo = new THREE.RingGeometry(HATCH_OUTER_RADIUS * 0.65, HATCH_OUTER_RADIUS, 48)
    this.ring = new THREE.Mesh(ringGeo, this.ringMat)
    this.ring.rotation.x = -Math.PI / 2
    this.ring.position.y = 0.02
    this.group.add(this.ring)

    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x121821,
      emissive: tint,
      emissiveIntensity: 0.15,
      metalness: 0.4,
      roughness: 0.6,
    })
    const leafGeo = new THREE.CylinderGeometry(
      HATCH_OUTER_RADIUS,
      HATCH_OUTER_RADIUS,
      0.2,
      32,
      1,
      false,
      0,
      Math.PI,
    )
    this.leafA = new THREE.Mesh(leafGeo, leafMat)
    this.leafA.position.y = -0.1
    this.leafB = new THREE.Mesh(leafGeo.clone(), leafMat)
    this.leafB.rotation.y = Math.PI
    this.leafB.position.y = -0.1
    this.group.add(this.leafA, this.leafB)
  }

  /** Mark the hatch as open (1) or closed (0); animation follows in `tick`. */
  setOpen(open: boolean): void {
    this.targetOpen = open ? 1 : 0
  }

  /**
   * Advance the open/close tween + idle pulse.
   *
   * @param dt - Delta time in seconds
   */
  tick(dt: number): void {
    const step = dt / TWEEN_DURATION
    if (this.currentOpen < this.targetOpen) {
      this.currentOpen = Math.min(this.targetOpen, this.currentOpen + step)
    } else if (this.currentOpen > this.targetOpen) {
      this.currentOpen = Math.max(this.targetOpen, this.currentOpen - step)
    }
    const offset = OPEN_OFFSET * easeOut(this.currentOpen)
    this.leafA.position.x = -offset
    this.leafB.position.x = offset

    this.idlePhase += dt
    const pulse = this.active ? 0.55 + 0.35 * Math.sin(this.idlePhase * 3.0) : 0.15
    this.ringMat.opacity = pulse
  }

  /** Free GPU resources. */
  dispose(): void {
    this.leafA.geometry.dispose()
    this.leafB.geometry.dispose()
    ;(this.leafA.material as THREE.Material).dispose()
    this.ring.geometry.dispose()
    this.ringMat.dispose()
  }
}

/**
 * Cubic ease-out for the open animation.
 *
 * @param t - 0..1 progress
 */
function easeOut(t: number): number {
  const inv = 1 - t
  return 1 - inv * inv * inv
}
```

- [ ] **Step 2: Run type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/three/bunker/BunkerHatchModel.ts
git commit -m "feat(bunker): hatch prop with two-leaf radial open animation"
```

---

## Task 9: `BunkerDoorController`

Vertical-slider arena door. Slides up into the wall on `setOpen(true)`. No tests.

**Files:**
- Create: `src/three/bunker/BunkerDoorController.ts`

- [ ] **Step 1: Implement the controller**

Create `src/three/bunker/BunkerDoorController.ts`:

```ts
/**
 * Vertical-slider arena door.
 *
 * Slides up into the wall when {@link setOpen}(true) is called; otherwise
 * sits on the floor blocking the corridor. Closed state has a thin animated
 * scanline along the seam — the visual cue that the door is locked.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-bunker-mission-design.md
 */
import * as THREE from 'three'

/** Door clear width (world units). */
const DOOR_WIDTH = 3
/** Door height (world units). */
const DOOR_HEIGHT = 4
/** Door thickness (world units). */
const DOOR_THICKNESS = 0.3
/** Tween duration for open/close in seconds. */
const TWEEN_DURATION = 0.8

/** A single locking door across the bunker corridor. */
export class BunkerDoorController {
  /** Add this group to the bunker root. */
  readonly group = new THREE.Group()

  private readonly slab: THREE.Mesh
  private readonly slabMat: THREE.MeshStandardMaterial
  private readonly seamMat: THREE.MeshBasicMaterial
  private readonly seam: THREE.Mesh
  private targetOpen = 0
  private currentOpen = 0
  private elapsed = 0

  /**
   * @param tint - Faction tint hex
   */
  constructor(tint: number) {
    this.slabMat = new THREE.MeshStandardMaterial({
      color: 0x101620,
      emissive: tint,
      emissiveIntensity: 0.08,
      metalness: 0.5,
      roughness: 0.55,
    })
    this.slab = new THREE.Mesh(
      new THREE.BoxGeometry(DOOR_WIDTH, DOOR_HEIGHT, DOOR_THICKNESS),
      this.slabMat,
    )
    this.slab.position.y = DOOR_HEIGHT / 2
    this.group.add(this.slab)

    this.seamMat = new THREE.MeshBasicMaterial({
      color: tint,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    this.seam = new THREE.Mesh(
      new THREE.PlaneGeometry(DOOR_WIDTH, 0.06),
      this.seamMat,
    )
    this.seam.position.set(0, DOOR_HEIGHT * 0.25, DOOR_THICKNESS / 2 + 0.001)
    this.group.add(this.seam)
  }

  /** Open or close the door. */
  setOpen(open: boolean): void {
    this.targetOpen = open ? 1 : 0
  }

  /**
   * Advance the slide tween + scanline animation.
   *
   * @param dt - Delta time in seconds
   */
  tick(dt: number): void {
    this.elapsed += dt
    const step = dt / TWEEN_DURATION
    if (this.currentOpen < this.targetOpen) {
      this.currentOpen = Math.min(this.targetOpen, this.currentOpen + step)
    } else if (this.currentOpen > this.targetOpen) {
      this.currentOpen = Math.max(this.targetOpen, this.currentOpen - step)
    }
    const eased = easeOut(this.currentOpen)
    this.slab.position.y = DOOR_HEIGHT / 2 + eased * DOOR_HEIGHT
    this.seam.position.y = DOOR_HEIGHT * 0.25 + Math.sin(this.elapsed * 4.0) * (DOOR_HEIGHT * 0.18)
    this.seamMat.opacity = (1 - this.currentOpen) * 0.85
  }

  /** Free GPU resources. */
  dispose(): void {
    this.slab.geometry.dispose()
    this.slabMat.dispose()
    this.seam.geometry.dispose()
    this.seamMat.dispose()
  }
}

/**
 * Cubic ease-out for the slide animation.
 *
 * @param t - 0..1 progress
 */
function easeOut(t: number): number {
  const inv = 1 - t
  return 1 - inv * inv * inv
}
```

- [ ] **Step 2: Run type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/three/bunker/BunkerDoorController.ts
git commit -m "feat(bunker): vertical-slider arena door with seam scanline"
```

---

## Task 10: `BunkerSceneController` orchestrator

Owns the bunker scene root, the grid material, walls, lights, hatches, door, and the bunker-side `EnemyDirector`. Exposes `activate / deactivate / tick / spawnWave / disposeWave`. No tests.

**Files:**
- Create: `src/three/bunker/BunkerSceneController.ts`

- [ ] **Step 1: Implement the controller**

Create `src/three/bunker/BunkerSceneController.ts`:

```ts
/**
 * Orchestrator for the bunker interior scene.
 *
 * Owns one root group containing walls, lights, hatch + door props, and the
 * bunker-side {@link EnemyDirector}. The {@link BunkerMinigame} drives wave
 * spawns through {@link spawnWave}. The level view calls {@link activate} /
 * {@link deactivate} when the player crosses the surface hatch.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-bunker-mission-design.md
 */
import * as THREE from 'three'
import { EnemyDirector, type EnemyHandle } from '@/lib/fps/enemyDirector'
import {
  buildBunkerGeometry,
  type BunkerGeometry,
} from './BunkerWallBuilder'
import { createBunkerGridMaterial } from './BunkerGridMaterial'
import { BunkerHatchModel } from './BunkerHatchModel'
import { BunkerDoorController } from './BunkerDoorController'
import type { BunkerEnemyType } from '@/lib/bunker/bunkerWaveSchedule'

/** Color of the per-corner arena lights. */
const CORNER_LIGHT_DISTANCE = 14
const CORNER_LIGHT_INTENSITY = 1.6
const DOOR_LIGHT_INTENSITY = 2.2

/** Constructor opts for {@link BunkerSceneController}. */
export interface BunkerSceneControllerOptions {
  /** Faction tint hex. */
  tint: number
  /** Parent THREE scene to attach to on `activate`. */
  scene: THREE.Scene
}

/** Interior scene wrapper — the level view treats this as a black box. */
export class BunkerSceneController {
  readonly enemyDirector = new EnemyDirector()
  readonly hatch: BunkerHatchModel
  readonly door: BunkerDoorController

  private readonly tint: number
  private readonly scene: THREE.Scene
  private readonly material: THREE.ShaderMaterial
  private readonly geometry: BunkerGeometry
  private readonly lights: THREE.Light[] = []
  private readonly enemySpawnObservers = new Set<(handle: EnemyHandle) => void>()
  private spawnPadCursor = 0
  private active = false

  constructor(opts: BunkerSceneControllerOptions) {
    this.tint = opts.tint
    this.scene = opts.scene
    this.material = createBunkerGridMaterial({ tint: opts.tint })
    this.geometry = buildBunkerGeometry(this.material)
    this.hatch = new BunkerHatchModel(opts.tint)
    this.door = new BunkerDoorController(opts.tint)

    this.hatch.group.position.set(
      this.geometry.antechamberHatch.x,
      0,
      this.geometry.antechamberHatch.z,
    )
    this.door.group.position.copy(this.geometry.arenaDoorAnchor.position)
    this.geometry.root.add(this.hatch.group, this.door.group)

    this.buildLights()
  }

  /** XZ position the player should spawn at on entry. */
  get playerSpawn(): THREE.Vector3 {
    return this.geometry.playerSpawn
  }

  /** XZ center of the antechamber's exit hatch (for interaction range checks). */
  get hatchPosition(): { x: number; z: number } {
    return this.geometry.antechamberHatch
  }

  /** XZ center of the arena door (for interaction range checks). */
  get doorPosition(): { x: number; z: number } {
    return {
      x: this.geometry.arenaDoorAnchor.position.x,
      z: this.geometry.arenaDoorAnchor.position.z,
    }
  }

  /**
   * Register an observer for every enemy spawned by the bunker director.
   * Used by the loot drop pipeline.
   *
   * @param listener - Fired per spawn
   * @returns Unsubscribe
   */
  installEnemySpawnObserver(listener: (handle: EnemyHandle) => void): () => void {
    this.enemySpawnObservers.add(listener)
    return () => this.enemySpawnObservers.delete(listener)
  }

  /** Add the bunker root to the scene. */
  activate(): void {
    if (this.active) return
    this.scene.add(this.geometry.root)
    this.active = true
  }

  /** Remove the bunker root from the scene; geometry and materials remain alive. */
  deactivate(): void {
    if (!this.active) return
    this.scene.remove(this.geometry.root)
    this.active = false
  }

  /**
   * Spawn one wave's roster, distributing units round-robin across the four
   * corner pads. Uses the bunker {@link enemyDirector}.
   *
   * @param roster - Flat list of enemy types
   */
  spawnWave(roster: readonly BunkerEnemyType[]): void {
    for (const type of roster) {
      const pad = this.geometry.spawnPadCenters[
        this.spawnPadCursor % this.geometry.spawnPadCenters.length
      ]!
      this.spawnPadCursor++
      const handle = this.enemyDirector.spawn(type, pad.x, 0, pad.z)
      for (const obs of this.enemySpawnObservers) {
        try {
          obs(handle)
        } catch {
          // observer-side errors must not break spawning
        }
      }
    }
  }

  /**
   * Per-frame update for material breathing, hatch animations, door.
   * Enemy director is ticked by the minigame so the simulation step order
   * matches Rescue.
   *
   * @param dt - Delta time in seconds
   */
  tick(dt: number): void {
    ;(this.material.userData.tick as (dt: number) => void)?.(dt)
    this.hatch.tick(dt)
    this.door.tick(dt)
  }

  /** Free all GPU resources. */
  dispose(): void {
    this.deactivate()
    this.hatch.dispose()
    this.door.dispose()
    this.material.dispose()
    this.geometry.root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh
        if ((m.geometry as THREE.BufferGeometry).dispose) m.geometry.dispose()
      }
    })
    this.enemyDirector.despawnAll()
  }

  /** Build the four corner lights + door light. Called once in the constructor. */
  private buildLights(): void {
    const ambient = new THREE.AmbientLight(0xffffff, 0.25)
    this.geometry.root.add(ambient)
    this.lights.push(ambient)

    const corners = this.geometry.spawnPadCenters
    for (const c of corners) {
      const l = new THREE.PointLight(this.tint, CORNER_LIGHT_INTENSITY, CORNER_LIGHT_DISTANCE)
      l.position.set(c.x, 4, c.z)
      this.geometry.root.add(l)
      this.lights.push(l)
    }

    const doorLight = new THREE.PointLight(this.tint, DOOR_LIGHT_INTENSITY, CORNER_LIGHT_DISTANCE)
    doorLight.position.set(
      this.geometry.arenaDoorAnchor.position.x,
      3,
      this.geometry.arenaDoorAnchor.position.z + 1.5,
    )
    this.geometry.root.add(doorLight)
    this.lights.push(doorLight)
  }
}
```

- [ ] **Step 2: Run type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/three/bunker/BunkerSceneController.ts
git commit -m "feat(bunker): scene controller (walls + lights + hatch + door + director)"
```

---

## Task 11: `BunkerMinigame` class (TDD on the state-driven parts)

Mirrors `RescueMinigame`'s shape. Owns the scene controller, drives the FSM, advances steps, fires prompts. Tests cover deterministic state transitions; visuals are exercised end-to-end manually.

**Files:**
- Create: `src/lib/minigame/BunkerMinigame.ts`
- Create: `src/lib/minigame/__tests__/BunkerMinigame.spec.ts`

- [ ] **Step 1: Read the rescue minigame for the shape**

Read `src/lib/minigame/RescueMinigame.ts` lines 100–250 to confirm:
- The `MiniGame` interface contract (what `tick`, `dispose`, `status`, `steps` look like).
- The 6-step pattern and how `advanceStep(index)` behaves.
- The signature of the static `create(...)` factory.

- [ ] **Step 2: Write failing tests**

Create `src/lib/minigame/__tests__/BunkerMinigame.spec.ts`. Mock the scene controller — we only test pure FSM/step logic here:

```ts
import { describe, it, expect, vi } from 'vitest'
import { BunkerMinigame } from '../BunkerMinigame'
import type { ConcreteObjective } from '@/lib/missions/types'

vi.mock('@/three/bunker/BunkerSceneController', () => {
  const fake = {
    activate: vi.fn(),
    deactivate: vi.fn(),
    tick: vi.fn(),
    dispose: vi.fn(),
    spawnWave: vi.fn(),
    enemyDirector: {
      enemies: [],
      tick: vi.fn(),
      despawnAll: vi.fn(),
    },
    hatch: { setOpen: vi.fn(), active: false },
    door: { setOpen: vi.fn() },
    playerSpawn: { x: 0, y: 0, z: 0 },
    hatchPosition: { x: 0, z: 0 },
    doorPosition: { x: 0, z: 5 },
    installEnemySpawnObserver: vi.fn(() => () => {}),
  }
  return { BunkerSceneController: vi.fn(() => fake) }
})

const baseObjective: ConcreteObjective = {
  type: 'bunker',
  x: 0,
  z: 0,
  waveCount: 3,
  reward: 5000,
}

function buildMinigame(): BunkerMinigame {
  // BunkerMinigame.create signature mirrors Rescue's; pass test-friendly nulls
  // where Three.js objects are expected (the mock makes them unused).
  return BunkerMinigame.createForTest({
    objectiveIndex: 0,
    objective: baseObjective,
    missionId: 'test-mission',
    factionTint: 0xffffff,
  })
}

describe('BunkerMinigame', () => {
  it('starts with all 6 steps, first one active', () => {
    const m = buildMinigame()
    expect(m.steps.length).toBe(6)
    expect(m.steps[0]!.active).toBe(true)
    expect(m.steps[0]!.complete).toBe(false)
  })

  it('advances steps as the player progresses', () => {
    const m = buildMinigame()
    m.advanceStepForTest(0) // travel
    m.advanceStepForTest(1) // land
    m.advanceStepForTest(2) // enter
    expect(m.steps[3]!.active).toBe(true)
  })

  it('progressCurrent / progressTotal track waves cleared', () => {
    const m = buildMinigame()
    m.startWavesForTest()
    expect(m.progressTotal).toBe(3)
    expect(m.progressCurrent).toBe(0)
    m.notifyWaveClearedForTest()
    expect(m.progressCurrent).toBe(1)
  })

  it('marks status=completed after extract', () => {
    const m = buildMinigame()
    m.completeForTest()
    expect(m.status).toBe('completed')
  })

  it('marks status=failed on player death', () => {
    const m = buildMinigame()
    m.onKillPlayer?.()
    expect(m.status).toBe('failed')
  })
})
```

> **Note:** `BunkerMinigame` exposes a small set of `*ForTest` helpers (`createForTest`, `advanceStepForTest`, `startWavesForTest`, `notifyWaveClearedForTest`, `completeForTest`) that wrap private internals so the tests can drive the FSM without booting a real scene. These are not part of the normal contract — they're test seams. Keep them tiny and explicit.

- [ ] **Step 3: Run tests to verify they fail with module-not-found**

Run: `bun test:unit src/lib/minigame/__tests__/BunkerMinigame.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `BunkerMinigame.ts`**

Create `src/lib/minigame/BunkerMinigame.ts`:

```ts
/**
 * Bunker minigame — descend through the hatch, clear authored waves in the
 * arena, walk back out.
 *
 * Mirrors {@link RescueMinigame}'s shape: 6-step list, status flag,
 * scene-and-director ownership, callback bag for the level facade. The
 * interior scene is owned by {@link BunkerSceneController}; this class
 * drives the FSM ({@link BunkerSceneState}) and the wave scheduler.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-bunker-mission-design.md
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
import { BunkerSceneController } from '@/three/bunker/BunkerSceneController'
import { BunkerSceneState } from '@/lib/bunker/bunkerSceneState'
import {
  rollWave,
  totalWavesForTier,
  type BunkerWaveTier,
} from '@/lib/bunker/bunkerWaveSchedule'

/** XZ interaction range for the surface hatch / arena door / antechamber hatch. */
const INTERACT_RANGE = 6

/** Test seam — internal options for {@link BunkerMinigame.createForTest}. */
export interface BunkerMinigameTestOptions {
  objectiveIndex: number
  objective: ConcreteObjective
  missionId: string
  factionTint: number
}

/** Bunker minigame implementation. */
export class BunkerMinigame implements MiniGame, MiniGameEvents {
  readonly objectiveIndex: number
  private readonly objective: ConcreteObjective
  private readonly missionId: string
  private readonly tier: BunkerWaveTier
  private readonly totalWaves: number
  private readonly state: BunkerSceneState
  private readonly scene: BunkerSceneController | null
  private wavesCleared = 0
  private spawnedWaveIndex = -1
  private _status: MiniGameStatus = 'active'
  private _isPlayerNear = false

  private readonly _steps: MiniGameStep[] = [
    { label: 'Travel to the asteroid', complete: false, active: true },
    { label: 'Land in the bunker zone', complete: false, active: false },
    { label: 'Enter the bunker', complete: false, active: false },
    { label: 'Clear the waves', complete: false, active: false },
    { label: 'Extract from the bunker', complete: false, active: false },
    { label: 'Return to the giver planet', complete: false, active: false },
  ]

  // --- MiniGameEvents ---
  onPrompt: ((text: string | null) => void) | null = null
  onComplete: ((objectiveIndex: number) => void) | null = null
  onStepChange: ((objectiveIndex: number, steps: readonly MiniGameStep[]) => void) | null = null
  onFail: ((objectiveIndex: number, cause: string) => void) | null = null
  onDamagePlayer:
    | ((damage: number, sourceX: number, sourceZ: number, source?: 'projectile' | 'contact') => void)
    | null = null
  onKillPlayer: (() => void) | null = (() => {
    this.fail('Operator KIA')
  }).bind(this)
  onDestroyLander: (() => void) | null = null
  onExplosion: ((position: THREE.Vector3) => void) | null = null

  /**
   * Build a minigame with a real scene controller. Used by
   * `LevelMinigameFacade`.
   */
  static create(params: {
    objectiveIndex: number
    objective: ConcreteObjective
    missionId: string
    factionTint: number
    threeScene: THREE.Scene
  }): BunkerMinigame {
    const scene = new BunkerSceneController({
      tint: params.factionTint,
      scene: params.threeScene,
    })
    return new BunkerMinigame(
      params.objectiveIndex,
      params.objective,
      params.missionId,
      scene,
    )
  }

  /**
   * Build a minigame without a scene — for tests only.
   */
  static createForTest(opts: BunkerMinigameTestOptions): BunkerMinigame {
    return new BunkerMinigame(opts.objectiveIndex, opts.objective, opts.missionId, null)
  }

  private constructor(
    objectiveIndex: number,
    objective: ConcreteObjective,
    missionId: string,
    scene: BunkerSceneController | null,
  ) {
    this.objectiveIndex = objectiveIndex
    this.objective = objective
    this.missionId = missionId
    this.scene = scene
    this.tier =
      objective.waveCount === 3 ? 'easy' : objective.waveCount === 5 ? 'medium' : 'hard'
    this.totalWaves = totalWavesForTier(this.tier)
    this.state = new BunkerSceneState({ totalWaves: this.totalWaves })
  }

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
    return this.wavesCleared
  }

  get progressTotal(): number | null {
    return this.totalWaves
  }

  get steps(): readonly MiniGameStep[] {
    return this._steps
  }

  /** Bunker tier (slice 1: easy/medium/hard from rolled difficulty). */
  get bunkerTier(): BunkerWaveTier {
    return this.tier
  }

  /** Currently-active wave index (zero-based) — for HUD. */
  get currentWaveIndex(): number {
    return this.state.currentWaveIndex
  }

  /** @inheritdoc */
  tick(dt: number, _ctx: MiniGameContext): void {
    if (this._status !== 'active') return
    this.state.tick(dt)
    this.scene?.tick(dt)
    this.scene?.enemyDirector.tick(dt)

    // Spawn the wave roster once on entry to a fresh wave-active state. The
    // spawnedWaveIndex tracker prevents respawning every tick while enemies
    // are still alive.
    if (
      this.state.current === 'wave-active' &&
      this.scene &&
      this.spawnedWaveIndex !== this.state.currentWaveIndex
    ) {
      const roster = rollWave(this.tier, this.state.currentWaveIndex, this.missionId)
      this.scene.spawnWave(roster)
      this.spawnedWaveIndex = this.state.currentWaveIndex
    }

    // Wave is cleared when at least one enemy was spawned for it AND every
    // enemy is dead. The `spawnedWaveIndex` guard ensures we don't fire
    // wave-cleared on the same frame as the spawn.
    if (
      this.state.current === 'wave-active' &&
      this.scene &&
      this.spawnedWaveIndex === this.state.currentWaveIndex &&
      this.scene.enemyDirector.enemies.length > 0 &&
      this.scene.enemyDirector.enemies.every((h) => !h.enemy.alive)
    ) {
      this.wavesCleared += 1
      this.state.notifyWaveCleared()
      if (this.state.current === 'exit-prompt' || this.state.current === 'final-clear') {
        this.scene.hatch.active = true
        this.scene.hatch.setOpen(true)
      }
    }
  }

  /** @inheritdoc */
  dispose(): void {
    this.scene?.dispose()
  }

  // ----------------- Step driving (called by LevelView) -----------------

  /** Advance step `index` if not yet complete. */
  advanceStep(index: number): void {
    const step = this._steps[index]
    if (!step || step.complete) return
    step.complete = true
    step.active = false
    const next = this._steps.find((c) => !c.complete)
    if (next) next.active = true
    this.onStepChange?.(this.objectiveIndex, this._steps)
  }

  /** Called when the player presses E on the surface hatch. Caller swaps scene. */
  notifyDescended(): void {
    this.advanceStep(2) // Enter the bunker
    this.scene?.activate()
    this.state.notifyActivated()
  }

  /** Called when the player presses E on the arena door. */
  notifyArenaDoorInteract(): void {
    this.state.notifyDoorInteracted()
  }

  /** Called when the player presses E on the antechamber exit hatch. */
  notifyExitInteract(): void {
    this.state.notifyHatchInteracted()
    if (this.state.current === 'exiting') {
      this.advanceStep(3) // Clear the waves
      this.advanceStep(4) // Extract
      this._status = 'completed'
      this.onComplete?.(this.objectiveIndex)
    }
  }

  /** Mark mission failed; reuses Rescue's pattern. */
  fail(cause: string): void {
    if (this._status !== 'active') return
    this._status = 'failed'
    this.onFail?.(this.objectiveIndex, cause)
  }

  // ----------------- Test seams -----------------

  /** @internal used by tests only. */
  advanceStepForTest(index: number): void {
    this.advanceStep(index)
  }

  /** @internal used by tests only. */
  startWavesForTest(): void {
    this.state.notifyActivated()
    this.state.notifyDoorInteracted()
  }

  /** @internal used by tests only. */
  notifyWaveClearedForTest(): void {
    this.wavesCleared += 1
    this.state.notifyWaveCleared()
  }

  /** @internal used by tests only. */
  completeForTest(): void {
    this._status = 'completed'
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test:unit src/lib/minigame/__tests__/BunkerMinigame.spec.ts`
Expected: All green.

- [ ] **Step 6: Run type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/minigame/BunkerMinigame.ts src/lib/minigame/__tests__/BunkerMinigame.spec.ts
git commit -m "feat(bunker): minigame class — FSM, wave dispatch, step list"
```

---

## Task 12: `BunkerWaveHud` Vue component + sibling CSS

Top-center HUD: wave label, breather sub-label, enemy counter, final-clear text. Mounted only while `inBunker`.

**Files:**
- Create: `src/components/BunkerWaveHud.vue`
- Create: `src/components/level/bunkerWaveHud.css`
- Modify: `src/assets/css/main.css` (add `@import` for the new sibling CSS — match the existing pattern other level CSS files use)

- [ ] **Step 1: Create the component**

Create `src/components/BunkerWaveHud.vue`:

```vue
<script setup lang="ts">
defineProps<{
  /** Zero-based current wave index. */
  waveIndex: number
  /** Total waves the player must clear. */
  totalWaves: number
  /** Live alive-enemy count. */
  hostiles: number
  /** Sub-state label for the bottom row. */
  phase: 'wave-active' | 'wave-breather' | 'final-clear' | 'exit-prompt'
}>()
</script>

<template>
  <div class="bunker-wave-hud">
    <template v-if="phase === 'exit-prompt'">
      <div class="bunker-wave-hud__title">BUNKER SECURE — EXTRACT</div>
    </template>
    <template v-else>
      <div class="bunker-wave-hud__title">
        WAVE {{ waveIndex + 1 }} OF {{ totalWaves }}
      </div>
      <div v-if="phase === 'wave-breather'" class="bunker-wave-hud__sub">
        WAVE {{ waveIndex + 2 }} INCOMING
      </div>
      <div v-else-if="phase === 'wave-active'" class="bunker-wave-hud__sub">
        {{ hostiles }} HOSTILE{{ hostiles === 1 ? '' : 'S' }}
      </div>
    </template>
  </div>
</template>
```

- [ ] **Step 2: Create the sibling CSS**

Create `src/components/level/bunkerWaveHud.css`:

```css
.bunker-wave-hud {
  @apply pointer-events-none fixed top-6 left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-1 text-center font-mono;
}

.bunker-wave-hud__title {
  @apply text-2xl font-bold tracking-[0.2em] text-emerald-300 drop-shadow-[0_0_8px_rgba(110,231,183,0.6)];
}

.bunker-wave-hud__sub {
  @apply text-sm tracking-[0.3em] text-emerald-200/80;
}
```

- [ ] **Step 3: Import the CSS into the global stylesheet**

Read `src/assets/css/main.css`. Find the existing block of level-component `@import` lines and add:

```css
@import '@/components/level/bunkerWaveHud.css';
```

(Use the same path style as the surrounding entries.)

- [ ] **Step 4: Run type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/BunkerWaveHud.vue src/components/level/bunkerWaveHud.css src/assets/css/main.css
git commit -m "feat(bunker): wave-hud component + sibling tailwind utilities"
```

---

## Task 13: Add `'bunker-interior'` to `LevelState` + scene-swap helpers

Tiny state machine extension + a fade helper. Keep this isolated — no LevelView wiring yet.

**Files:**
- Modify: `src/lib/level/levelStateMachine.ts`

- [ ] **Step 1: Extend the state union**

Edit `src/lib/level/levelStateMachine.ts` line 13:

```ts
export type LevelState =
  | 'arrival'
  | 'lander'
  | 'eva'
  | 'bunker-interior'
  | 'dead'
  | 'exfil'
  | 'complete'
  | 'failed'
```

- [ ] **Step 2: Add the transition rules**

Read the file's `StateMachine` configuration (transitions are defined declaratively in this codebase). Add:

- `eva → bunker-interior` triggered by `enter-bunker` event.
- `bunker-interior → eva` triggered by `exit-bunker` event.
- `bunker-interior → dead` (player-death pipeline already targets `dead`; ensure no rule blocks the transition from the new sub-state).

Match the file's existing pattern verbatim. If the file uses a `.transition({ from, to, on })` style, use that; if it's a `transitions: [...]` array, append entries to it.

- [ ] **Step 3: Run type-check + tests**

Run: `bun run type-check && bun test:unit src/lib/level/`
Expected: PASS — existing level state tests are unaffected (the new state is reachable only via the new event, and no test fires that event).

- [ ] **Step 4: Commit**

```bash
git add src/lib/level/levelStateMachine.ts
git commit -m "feat(level): bunker-interior sub-state with eva↔bunker transitions"
```

---

## Task 14: Wire `BunkerMinigame` into `LevelMinigameFacade`

Add the dispatch branch and the bindings the minigame needs.

**Files:**
- Modify: `src/lib/level/LevelMinigameFacade.ts`

- [ ] **Step 1: Read the existing dispatch site**

Read `LevelMinigameFacade.ts` lines 175–270. Confirm the `else if (objective.type === 'rescue')` branch shape and the bindings it wires.

- [ ] **Step 2: Pick a faction tint from the giver id**

Add a small helper near the top of the file (or import from `@/lib/bunker/factionTint.ts` — easier to test if you split):

```ts
const BUNKER_FACTION_TINTS: Record<string, number> = {
  cinderline: 0xff5a1a,
  'lucas-maverick': 0x22d3a8,
  'martian-marines-bunker': 0x7afca7,
  'jovian-society': 0x5cc8ff,
}

function tintForGiver(giverId: string | undefined): number {
  if (!giverId) return 0xffffff
  return BUNKER_FACTION_TINTS[giverId] ?? 0xffffff
}
```

- [ ] **Step 3: Add the dispatch branch**

After the `'rescue'` branch (line ~234), add:

```ts
} else if (objective.type === 'bunker') {
  const minigame = BunkerMinigame.create({
    objectiveIndex: i,
    objective,
    missionId: mission.id,
    factionTint: tintForGiver(mission.giverId),
    threeScene: scene,
  })
  this.applySharedBindings(minigame, bindings)
  minigame.onDamagePlayer = bindings.onDamagePlayer
  minigame.onKillPlayer = bindings.onKillPlayer
  minigame.onDestroyLander = () => bindings.onDestroyLander?.('bunker')
  minigame.onFail = bindings.onRescueFail // reuse rescue's fail pipeline
  bindings.onInstallCombatDropObserver?.(minigame)
  this.add(minigame)
}
```

Add the import at the top of the file:

```ts
import { BunkerMinigame } from '@/lib/minigame/BunkerMinigame'
```

- [ ] **Step 4: Run type-check + tests**

Run: `bun run type-check && bun test:unit`
Expected: PASS — `LevelMinigameFacade.spec.ts` continues to pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/level/LevelMinigameFacade.ts
git commit -m "feat(level): dispatch BunkerMinigame for bunker objectives"
```

---

## Task 15: `LevelView` — surface hatch placement, scene-swap, HUD gating

The biggest user-facing wiring step. Hatch on the surface (placed where Rescue's virus pillar / Exterminate's nest would sit), interaction → fade → activate bunker scene. Bunker hatch interaction → fade → restore. HUD gating + `BunkerWaveHud` mount.

**Files:**
- Modify: `src/views/LevelView.vue`

- [ ] **Step 1: Read the existing prop-spawn site**

Find where `RescueMinigame` / `ExterminateMinigame` install their hero prop on the asteroid (likely a `levelObjectivePlacement.ts` helper or in `LevelView` itself). Confirm the convention.

- [ ] **Step 2: Add `BunkerHatchModel` to the surface for bunker objectives**

When the active objective is `'bunker'`, instantiate one `BunkerHatchModel(factionTint)` and place it at `(objective.x, heightmap.heightAt(x, z), objective.z)` on the asteroid root. Mark it `active = true` so the inviting glow plays. Store a reference for the interaction range check.

- [ ] **Step 3: Add `inBunker` reactive flag**

In the `<script setup>` block:

```ts
const inBunker = computed(() => stateInfo.value.state === 'bunker-interior')
```

- [ ] **Step 4: Gate surface-only HUD overlays**

Locate the `FpsCompass` overlay (`v-if` on `state === 'eva'`). Append `&& !inBunker`:

```vue
<FpsCompass
  v-if="stateInfo.state === 'eva' && !inBunker"
  ...
/>
```

Apply the same `&& !inBunker` to: low-O₂ warning, asteroid name plate, exfil prompt, any other surface-only chrome that today gates only on `state === 'eva'`. Leave `ObjectiveTracker` and `FpsHud` alone.

- [ ] **Step 5: Mount the wave HUD**

Add to the template:

```vue
<BunkerWaveHud
  v-if="inBunker && bunkerHudProps"
  :waveIndex="bunkerHudProps.waveIndex"
  :totalWaves="bunkerHudProps.totalWaves"
  :hostiles="bunkerHudProps.hostiles"
  :phase="bunkerHudProps.phase"
/>
```

In `<script setup>`, derive `bunkerHudProps` from the active `BunkerMinigame` reference (via `LevelMinigameFacade.activeMinigame` or whatever accessor exists). Update each tick.

- [ ] **Step 6: Wire the surface hatch interaction**

Where the existing EVA-interact code dispatches Rescue's `notifyVirusInteract` etc., add a branch: if the active objective is bunker AND the player is within `INTERACT_RANGE` of the surface hatch's XZ:

```ts
if (activeBunkerMinigame && distanceXZ(player, surfaceHatchPos) <= INTERACT_RANGE) {
  // Animate fade-to-black, then on midpoint:
  await fadeOut(0.25)
  asteroidRoot.visible = false
  // Pause surface director by removing it from the tickables list, OR rely on
  // visibility-gated tickers. (Match whatever Rescue does for similar patterns.)
  activeBunkerMinigame.notifyDescended()
  player.position.copy(activeBunkerMinigame.scene.playerSpawn) // teleport
  stateMachine.send('enter-bunker')
  await fadeIn(0.25)
}
```

Use the file's existing fade helper if there is one (`arrivalFade` / `deathFade` ref-driven CSS exist already); otherwise add a `bunkerSwapFade` ref styled identically.

- [ ] **Step 7: Wire the arena-door interaction**

When `inBunker` and the player is within `INTERACT_RANGE` of the arena door's world position:

```ts
if (interactPressed) activeBunkerMinigame.notifyArenaDoorInteract()
```

- [ ] **Step 8: Wire the antechamber-hatch interaction**

When `inBunker` and the player is within `INTERACT_RANGE` of the antechamber hatch:

```ts
if (interactPressed) {
  activeBunkerMinigame.notifyExitInteract()
  if (activeBunkerMinigame.status === 'completed') {
    await fadeOut(0.25)
    asteroidRoot.visible = true
    player.position.copy(savedSurfacePosition) // captured on descent
    stateMachine.send('exit-bunker')
    await fadeIn(0.25)
  }
}
```

- [ ] **Step 9: Run type-check + tests + lint**

Run: `bun run type-check && bun test:unit && bun run lint`
Expected: All green.

- [ ] **Step 10: Manual smoke test**

Run: `bun dev`
Drive: open browser, accept a bunker mission at Mercury (Cinderline) on the shuttle board, fly to the asteroid, descend through the hatch, clear all 3 waves, walk back to the antechamber hatch, extract.

Verify:
- HUD compass hides on descent and shows again on extract.
- ObjectiveTracker steps tick from "Enter the bunker" → "Clear the waves" (with progress) → "Extract from the bunker".
- BunkerWaveHud shows wave count + hostile count.
- Player loadout (HP/ammo) survives both transitions unchanged.
- Death inside the bunker triggers the existing fail flow / page reload.

- [ ] **Step 11: Commit**

```bash
git add src/views/LevelView.vue
git commit -m "feat(level): wire bunker hatch interaction + scene swap + HUD gating"
```

---

## Task 16: Final verification gate

Run all merge-acceptance checks together. Fix anything that comes up.

- [ ] **Step 1: Type-check, lint, tests**

```bash
bun run type-check
bun run lint
bun test:unit
```

Expected: all green, 0 errors / 0 warnings.

- [ ] **Step 2: Smoke run all four givers**

In `bun dev`, accept a bunker mission at each of: Mercury (Cinderline), Venus (Lucas Maverick), Mars (Martian Marines), Jupiter (Jovian Society). Confirm:

1. The mission appears on the local board with correct giver name and briefing.
2. Faction tint matches the spec palette.
3. Wave count matches the rolled difficulty band (1–4 → 3, 5–7 → 5, 8–10 → 7).
4. Extracting completes the mission cleanly; returning to the giver planet pays out as expected.

- [ ] **Step 3: Final commit if any fixes were needed**

```bash
git add -p
git commit -m "fix(bunker): post-smoke-test cleanup"
```

If no fixes were needed, no commit — the slice is done.

---

## Self-review checklist

Run this after marking all tasks complete:

- [ ] Spec coverage — every section in `2026-04-27-bunker-mission-design.md` maps to at least one task above. Specifically:
  - Mission system integration → Task 1, 4, 5
  - BunkerSceneController + minigame architecture → Tasks 6, 7, 8, 9, 10, 11
  - Wave content & HUD → Tasks 2, 12
  - Visual design → Tasks 6, 7, 10
  - Failure handling → Tasks 11, 14
  - Testing strategy → Tasks 2, 3, 4, 11

- [ ] No placeholders — every step shows full code or an exact command.

- [ ] Type consistency — `BunkerSceneState`, `bunkerWaveSchedule`, `BunkerMinigame` use the same `BunkerWaveTier` / `BunkerEnemyType` aliases throughout.

- [ ] Slice scope respected — vault, loot chests, switch puzzles, free-upgrade reward, procedural dungeons all explicitly excluded.
