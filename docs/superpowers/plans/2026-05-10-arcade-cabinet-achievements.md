# Arcade Cabinet Achievements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 7 Asteroids-specific achievements plus the per-ROM stats + event plumbing so future ROMs slot in cheaply.

**Architecture:** ROMs accumulate `ArcadeRomEvent` objects internally; `ArcadeCabinetSession` drains them every tick and forwards via an optional `onRomEvent` callback; `HabitatInteriorScene` exposes a setter for that callback; `MapHabitatFacade` implements the receiver, mutating the profile through a new `arcadeStatsRecorder` and triggering the existing achievement-eval pipeline (same path that fires `cat-beloved` after a Sushi pet).

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), Vitest, Bun.

**Spec:** `docs/superpowers/specs/2026-05-10-arcade-cabinet-achievements-design.md`

---

## File Map

**Create**
- `src/lib/player/arcadeStatsRecorder.ts` — pure recorder
- `src/lib/player/__tests__/arcadeStatsRecorder.spec.ts`
- `src/lib/minigame/arcadeAsteroids/__tests__/AsteroidsRomEvents.spec.ts`
- `src/lib/minigame/cabinet/__tests__/ArcadeCabinetSessionEvents.spec.ts`

**Modify**
- `src/lib/player/types.ts` — 4 new fields on `PlayerAchievementStats`
- `src/lib/player/profile.ts` — defaults + normalizers for new fields
- `src/lib/player/__tests__/profile.spec.ts` — extend the empty-stats baseline
- `src/lib/level/__tests__/missionTips.spec.ts` — extend the test-stats baseline (uses same shape)
- `src/data/achievements.ts` — `'arcade'` category, 4 new `AchievementKind` variants, 2 new optional `AchievementDefinition` fields, 7 new definitions, threshold/reward constants, label
- `src/lib/achievements.ts` — `EMPTY_ACHIEVEMENT_STATS` extension; 4 new switch cases in `isAchievementUnlocked`; 4 new switch cases in `getAchievementLockedHint`
- `src/lib/achievements.spec.ts` (or wherever it lives — find via test layout) — add cases for the new kinds
- `src/lib/minigame/cabinet/types.ts` — add `ArcadeRomEvent`, add required `consumeEvents()` to `ArcadeRom`
- `src/lib/minigame/cabinet/ArcadeCabinetSession.ts` — drain events + optional `onRomEvent` forwarder
- `src/lib/minigame/cabinet/__tests__/ArcadeCabinetSession.spec.ts` — extend `makeRom` to satisfy new method
- `src/lib/minigame/arcadeAsteroids/AsteroidsRom.ts` — accumulate run + saucer events
- `src/three/HabitatInteriorScene.ts` — accept `onArcadeRomEvent` callback, wire it into the cabinet session
- `src/lib/map/habitat/MapHabitatFacade.ts` — `handleArcadeRomEvent(romId, event)` doing the standard mutate/save/eval ritual

---

## Conventions

- File header on every new `src/lib/**` file:
  ```ts
  /**
   * <module description>
   *
   * @author guinetik
   * @date 2026-05-10
   * @spec docs/superpowers/specs/2026-05-10-arcade-cabinet-achievements-design.md
   */
  ```
- TSDoc on every export.
- No magic numbers — name every numeric constant at module scope.
- Run `bun run type-check && bun run lint && bun test:unit` before each commit. Lint must be 0 errors / 0 warnings.

---

## Task 1: Stats fields on profile types + defaults + normalizers

**Files:**
- Modify: `src/lib/player/types.ts`
- Modify: `src/lib/player/profile.ts`
- Modify: `src/lib/player/__tests__/profile.spec.ts`
- Modify: `src/lib/level/__tests__/missionTips.spec.ts`
- Modify: `src/lib/achievements.ts` (`EMPTY_ACHIEVEMENT_STATS`)

- [ ] **Step 1: Add fields to `PlayerAchievementStats`**

In `src/lib/player/types.ts`, find `PlayerAchievementStats` (it currently has `sushiPetCount`, `sushiBowlRefillCount`, etc. around line 56–63). Append four fields:

```ts
  /** Total runs started for each cabinet ROM, keyed by ROM id (e.g. `'asteroids': 4`). */
  arcadeRunsByRom: Record<string, number>
  /** Best single-run score reached on each cabinet ROM. */
  arcadeBestScoreByRom: Record<string, number>
  /** Best wave reached in a single run on each cabinet ROM. */
  arcadeBestWaveByRom: Record<string, number>
  /**
   * Lifetime counts of named in-ROM events, keyed first by ROM id and then by
   * event id (e.g. `arcadeEventCountsByRom.asteroids.saucerKill = 7`).
   */
  arcadeEventCountsByRom: Record<string, Record<string, number>>
```

- [ ] **Step 2: Add defaults in `createDefaultAchievementStats`**

In `src/lib/player/profile.ts`, find `createDefaultAchievementStats` (around line 160–170). Append:

```ts
    arcadeRunsByRom: {},
    arcadeBestScoreByRom: {},
    arcadeBestWaveByRom: {},
    arcadeEventCountsByRom: {},
```

(All four collections start empty — same pattern as `slingshotLaunchesByBody`.)

- [ ] **Step 3: Add normalizers**

In `src/lib/player/profile.ts`, find `normalizeAchievementStats` (around line 195+). It uses `normalizeNonNegativeNumber` for scalar counters and a custom helper for record-shaped fields like `slingshotLaunchesByBody`. Find that helper (likely `normalizeNumberRecord` or inline) and reuse it for the three flat records. For the nested record, add a helper near the others:

```ts
/** Normalize a nested Record<string, Record<string, number>> defensively. */
function normalizeNestedNumberRecord(value: unknown): Record<string, Record<string, number>> {
  if (value === null || typeof value !== 'object') return {}
  const out: Record<string, Record<string, number>> = {}
  for (const [outerKey, inner] of Object.entries(value as Record<string, unknown>)) {
    if (inner === null || typeof inner !== 'object') continue
    const innerOut: Record<string, number> = {}
    for (const [innerKey, raw] of Object.entries(inner as Record<string, unknown>)) {
      if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) continue
      innerOut[innerKey] = raw
    }
    out[outerKey] = innerOut
  }
  return out
}
```

Then in `normalizeAchievementStats`'s return, append:

```ts
    arcadeRunsByRom: normalizeNumberRecord(stats['arcadeRunsByRom']),
    arcadeBestScoreByRom: normalizeNumberRecord(stats['arcadeBestScoreByRom']),
    arcadeBestWaveByRom: normalizeNumberRecord(stats['arcadeBestWaveByRom']),
    arcadeEventCountsByRom: normalizeNestedNumberRecord(stats['arcadeEventCountsByRom']),
```

> If `normalizeNumberRecord` doesn't exist with that exact name, look for the helper used by `slingshotLaunchesByBody` (search for `'slingshotLaunchesByBody'` in profile.ts) and reuse the same one. If it's inline in the return statement, extract it once into a named helper, then call it three times.

- [ ] **Step 4: Update `EMPTY_ACHIEVEMENT_STATS`**

In `src/lib/achievements.ts`, find `EMPTY_ACHIEVEMENT_STATS` (around line 29–45). Append:

```ts
  arcadeRunsByRom: {},
  arcadeBestScoreByRom: {},
  arcadeBestWaveByRom: {},
  arcadeEventCountsByRom: {},
```

- [ ] **Step 5: Update test baselines**

Search for any `sushiBowlRefillCount: 0` in test files — those test fixtures construct full `PlayerAchievementStats` objects and now need the four new fields:

```bash
grep -rn "sushiBowlRefillCount: 0" src/
```

For each match, append the four new empty-record fields right after `sushiBowlRefillCount: 0`:

```ts
sushiBowlRefillCount: 0,
arcadeRunsByRom: {},
arcadeBestScoreByRom: {},
arcadeBestWaveByRom: {},
arcadeEventCountsByRom: {},
```

Known files to update at minimum: `src/lib/player/__tests__/profile.spec.ts` and `src/lib/level/__tests__/missionTips.spec.ts`. Cover any others grep finds.

- [ ] **Step 6: Verify**

Run: `bun run type-check && bun run lint && bun test:unit`
Expected: clean. Type-check must catch any test fixture you missed.

- [ ] **Step 7: Commit**

```bash
git add src/lib/player/types.ts src/lib/player/profile.ts \
        src/lib/player/__tests__/profile.spec.ts \
        src/lib/level/__tests__/missionTips.spec.ts \
        src/lib/achievements.ts
git commit -m "feat(arcade): add per-ROM stats fields to PlayerAchievementStats"
```

---

## Task 2: arcadeStatsRecorder — TDD

**Files:**
- Create: `src/lib/player/arcadeStatsRecorder.ts`
- Create: `src/lib/player/__tests__/arcadeStatsRecorder.spec.ts`

We need `ArcadeRomEvent` to type the recorder. **Define a temporary local copy of the type inside `arcadeStatsRecorder.ts`** — Task 5 will move it to `cabinet/types.ts` and the recorder will import it from there. This decouples Task 2 from the cabinet package.

- [ ] **Step 1: Write the failing test**

Create `src/lib/player/__tests__/arcadeStatsRecorder.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  recordArcadeRomEvent,
  type ArcadeRomEvent,
} from '../arcadeStatsRecorder'
import type { PlayerAchievementStats } from '../types'

function emptyStats(): PlayerAchievementStats {
  return {
    lifetimeCreditsEarned: 0,
    lifetimeCreditsSpent: 0,
    lifetimeTradeCreditsEarned: 0,
    lifetimeCargoIntakeCreditsEarned: 0,
    missionObjectivesCompletedByType: {},
    runtimeTipsShownCount: {},
    slingshotLaunches: 0,
    slingshotLaunchesByBody: {},
    gravitySurfStarts: 0,
    manifoldRides: 0,
    portalDepartures: 0,
    lifetimeWorldLineDistance: 0,
    maxSingleRunWorldLineDistance: 0,
    sushiPetCount: 0,
    sushiBowlRefillCount: 0,
    arcadeRunsByRom: {},
    arcadeBestScoreByRom: {},
    arcadeBestWaveByRom: {},
    arcadeEventCountsByRom: {},
  }
}

describe('recordArcadeRomEvent', () => {
  it('runStarted increments runs counter and seeds best-score/wave at 0/1', () => {
    const event: ArcadeRomEvent = { type: 'runStarted', score: 0, wave: 1 }
    const stats = recordArcadeRomEvent(emptyStats(), 'asteroids', event)
    expect(stats.arcadeRunsByRom.asteroids).toBe(1)
    expect(stats.arcadeBestScoreByRom.asteroids).toBe(0)
    expect(stats.arcadeBestWaveByRom.asteroids).toBe(1)
  })

  it('runStarted twice increments to 2', () => {
    const event: ArcadeRomEvent = { type: 'runStarted', score: 0, wave: 1 }
    let stats = recordArcadeRomEvent(emptyStats(), 'asteroids', event)
    stats = recordArcadeRomEvent(stats, 'asteroids', event)
    expect(stats.arcadeRunsByRom.asteroids).toBe(2)
  })

  it('runEnded max-tracks score and wave', () => {
    let stats = recordArcadeRomEvent(emptyStats(), 'asteroids', {
      type: 'runEnded',
      score: 7500,
      wave: 4,
    })
    expect(stats.arcadeBestScoreByRom.asteroids).toBe(7500)
    expect(stats.arcadeBestWaveByRom.asteroids).toBe(4)
    // Lower score/wave doesn't replace the max.
    stats = recordArcadeRomEvent(stats, 'asteroids', {
      type: 'runEnded',
      score: 1000,
      wave: 2,
    })
    expect(stats.arcadeBestScoreByRom.asteroids).toBe(7500)
    expect(stats.arcadeBestWaveByRom.asteroids).toBe(4)
  })

  it('event type bumps the per-eventId counter and max-tracks score/wave', () => {
    const stats = recordArcadeRomEvent(emptyStats(), 'asteroids', {
      type: 'event',
      eventId: 'saucerKill',
      score: 1200,
      wave: 3,
    })
    expect(stats.arcadeEventCountsByRom.asteroids?.saucerKill).toBe(1)
    expect(stats.arcadeBestScoreByRom.asteroids).toBe(1200)
    expect(stats.arcadeBestWaveByRom.asteroids).toBe(3)
  })

  it('event without eventId is a no-op', () => {
    const stats = recordArcadeRomEvent(emptyStats(), 'asteroids', {
      type: 'event',
      score: 100,
      wave: 1,
    })
    expect(stats.arcadeEventCountsByRom.asteroids).toBeUndefined()
  })

  it('keys are isolated per ROM id', () => {
    let stats = recordArcadeRomEvent(emptyStats(), 'asteroids', {
      type: 'runStarted',
      score: 0,
      wave: 1,
    })
    stats = recordArcadeRomEvent(stats, 'pong', { type: 'runStarted', score: 0, wave: 1 })
    expect(stats.arcadeRunsByRom.asteroids).toBe(1)
    expect(stats.arcadeRunsByRom.pong).toBe(1)
  })

  it('does not mutate the input stats object', () => {
    const before = emptyStats()
    const after = recordArcadeRomEvent(before, 'asteroids', {
      type: 'runStarted',
      score: 0,
      wave: 1,
    })
    expect(before.arcadeRunsByRom).toEqual({})
    expect(after).not.toBe(before)
  })
})
```

- [ ] **Step 2: Run, expect failure**

Run: `bun test:unit src/lib/player/__tests__/arcadeStatsRecorder.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/player/arcadeStatsRecorder.ts`:

```ts
/**
 * Pure reducer that folds an ArcadeRomEvent into PlayerAchievementStats. The
 * cabinet wiring drives it from HabitatInteriorScene → MapHabitatFacade.
 *
 * @author guinetik
 * @date 2026-05-10
 * @spec docs/superpowers/specs/2026-05-10-arcade-cabinet-achievements-design.md
 */
import type { PlayerAchievementStats } from './types'

/**
 * One observable thing that happened inside a ROM. The cabinet drains a queue
 * of these every tick. Mirrors the type defined in
 * `src/lib/minigame/cabinet/types.ts` — kept in sync by the type-checker.
 *
 * Note: the canonical definition lives in the cabinet package; this duplicate
 * exists only because Task 2 lands before the cabinet types update. After
 * Task 5 lands, switch the import here to `@/lib/minigame/cabinet/types`.
 */
export interface ArcadeRomEvent {
  /** Event family. */
  type: 'runStarted' | 'runEnded' | 'event'
  /** For type='event': the event id (e.g. 'saucerKill'). */
  eventId?: string
  /** Score at the moment the event fired. */
  score: number
  /** Wave at the moment the event fired. */
  wave: number
}

/** Increment guard for record fields that may not exist yet. */
const ARCADE_COUNTER_INCREMENT = 1

/**
 * Fold one ROM event into the achievement stats. Returns a new stats object;
 * the input is never mutated.
 *
 * @param stats - Current achievement stats from the player profile.
 * @param romId - Cabinet ROM id (e.g. 'asteroids').
 * @param event - Event drained from the ROM's `consumeEvents()` queue.
 * @returns Updated stats with the relevant counters bumped.
 */
export function recordArcadeRomEvent(
  stats: PlayerAchievementStats,
  romId: string,
  event: ArcadeRomEvent,
): PlayerAchievementStats {
  const arcadeRunsByRom = { ...stats.arcadeRunsByRom }
  const arcadeBestScoreByRom = { ...stats.arcadeBestScoreByRom }
  const arcadeBestWaveByRom = { ...stats.arcadeBestWaveByRom }
  const arcadeEventCountsByRom = cloneNested(stats.arcadeEventCountsByRom)

  if (event.type === 'runStarted') {
    arcadeRunsByRom[romId] = (arcadeRunsByRom[romId] ?? 0) + ARCADE_COUNTER_INCREMENT
  }

  arcadeBestScoreByRom[romId] = Math.max(arcadeBestScoreByRom[romId] ?? 0, event.score)
  arcadeBestWaveByRom[romId] = Math.max(arcadeBestWaveByRom[romId] ?? 0, event.wave)

  if (event.type === 'event' && typeof event.eventId === 'string' && event.eventId.length > 0) {
    const inner = { ...(arcadeEventCountsByRom[romId] ?? {}) }
    inner[event.eventId] = (inner[event.eventId] ?? 0) + ARCADE_COUNTER_INCREMENT
    arcadeEventCountsByRom[romId] = inner
  }

  return {
    ...stats,
    arcadeRunsByRom,
    arcadeBestScoreByRom,
    arcadeBestWaveByRom,
    arcadeEventCountsByRom,
  }
}

function cloneNested(
  src: Record<string, Record<string, number>>,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {}
  for (const [k, v] of Object.entries(src)) out[k] = { ...v }
  return out
}
```

- [ ] **Step 4: Run, type-check, lint**

Run: `bun test:unit src/lib/player/__tests__/arcadeStatsRecorder.spec.ts && bun run type-check && bun run lint`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/player/arcadeStatsRecorder.ts \
        src/lib/player/__tests__/arcadeStatsRecorder.spec.ts
git commit -m "feat(arcade): pure recorder for ArcadeRomEvent → profile stats"
```

---

## Task 3: Achievement kinds + category + switch cases

**Files:**
- Modify: `src/data/achievements.ts`
- Modify: `src/lib/achievements.ts`

This task adds the schema (kinds + optional fields + category) AND the evaluation (switch cases) but no concrete definitions yet — Task 4 adds the 7 rows. Splitting keeps each commit small.

- [ ] **Step 1: Add the new category**

In `src/data/achievements.ts`, find `AchievementCategory` (around line 22). Add `'arcade'` between `'cat'` and `'cosmetics'`:

```ts
export type AchievementCategory =
  | 'flight'
  | 'missions'
  | 'exploration'
  | 'credits'
  | 'contracts'
  | 'upgrades'
  | 'cat'
  | 'arcade'
  | 'cosmetics'
```

- [ ] **Step 2: Add the category label**

Find `ACHIEVEMENT_CATEGORY_LABELS` in the same file (it maps each category to a UI string). Add:

```ts
arcade: 'Arcade',
```

- [ ] **Step 3: Add the new `AchievementKind` variants**

Find `AchievementKind` (around line 33). Append before the closing newline:

```ts
  | 'arcade_runs_started'
  | 'arcade_best_score'
  | 'arcade_best_wave'
  | 'arcade_event_count'
```

- [ ] **Step 4: Add the new `AchievementDefinition` optional fields**

Find `AchievementDefinition` (around line 66). After the existing optional fields (`upgradeId`, `journeyId`, etc.), add:

```ts
  /** ROM id (cabinet) used by `arcade_*` achievements, e.g. `'asteroids'`. */
  romId?: string
  /** Event id used by `arcade_event_count`, e.g. `'saucerKill'`. */
  arcadeEventId?: string
```

- [ ] **Step 5: Add switch cases in `isAchievementUnlocked`**

In `src/lib/achievements.ts`, find the giant switch in `isAchievementUnlocked` (around lines 200–355). Append four new cases right before the closing brace:

```ts
    case 'arcade_runs_started':
      return hasRequiredString(definition.romId)
        ? requiredThresholdReached(
            getAchievementStats(progress.profile).arcadeRunsByRom[definition.romId] ?? 0,
            getRequiredThreshold(definition),
          )
        : false
    case 'arcade_best_score':
      return hasRequiredString(definition.romId)
        ? requiredThresholdReached(
            getAchievementStats(progress.profile).arcadeBestScoreByRom[definition.romId] ?? 0,
            getRequiredThreshold(definition),
          )
        : false
    case 'arcade_best_wave':
      return hasRequiredString(definition.romId)
        ? requiredThresholdReached(
            getAchievementStats(progress.profile).arcadeBestWaveByRom[definition.romId] ?? 0,
            getRequiredThreshold(definition),
          )
        : false
    case 'arcade_event_count':
      return hasRequiredString(definition.romId) && hasRequiredString(definition.arcadeEventId)
        ? requiredThresholdReached(
            getAchievementStats(progress.profile).arcadeEventCountsByRom[definition.romId]?.[
              definition.arcadeEventId
            ] ?? 0,
            getRequiredThreshold(definition),
          )
        : false
```

- [ ] **Step 6: Add switch cases in `getAchievementLockedHint`**

Same file, second giant switch (around lines 400–574). Append matching hint cases before the closing brace:

```ts
    case 'arcade_runs_started': {
      if (!hasRequiredString(definition.romId)) return 'Play the cabinet ROM.'
      const current =
        getAchievementStats(progress.profile).arcadeRunsByRom[definition.romId] ?? 0
      const needed = getRequiredThreshold(definition)
      if (needed === null) return 'Play the cabinet ROM.'
      return `Start ${needed} ${definition.romId} run${needed === 1 ? '' : 's'} (${current}/${needed}).`
    }
    case 'arcade_best_score': {
      if (!hasRequiredString(definition.romId)) return 'Reach the required score.'
      const current =
        getAchievementStats(progress.profile).arcadeBestScoreByRom[definition.romId] ?? 0
      const needed = getRequiredThreshold(definition)
      if (needed === null) return 'Reach the required score.'
      return `Score ${needed.toLocaleString()} in one run (best ${current.toLocaleString()}).`
    }
    case 'arcade_best_wave': {
      if (!hasRequiredString(definition.romId)) return 'Reach the required wave.'
      const current =
        getAchievementStats(progress.profile).arcadeBestWaveByRom[definition.romId] ?? 0
      const needed = getRequiredThreshold(definition)
      if (needed === null) return 'Reach the required wave.'
      return `Reach wave ${needed} (best ${current}).`
    }
    case 'arcade_event_count': {
      if (!hasRequiredString(definition.romId) || !hasRequiredString(definition.arcadeEventId)) {
        return 'Hit the required event count.'
      }
      const eventId = definition.arcadeEventId
      const current =
        getAchievementStats(progress.profile).arcadeEventCountsByRom[definition.romId]?.[
          eventId
        ] ?? 0
      const needed = getRequiredThreshold(definition)
      if (needed === null) return 'Hit the required event count.'
      return `Count ${eventId}: ${current}/${needed}.`
    }
```

- [ ] **Step 7: Verify**

Run: `bun run type-check && bun run lint && bun test:unit`
Expected: clean. Type-check must approve the exhaustive switches.

- [ ] **Step 8: Commit**

```bash
git add src/data/achievements.ts src/lib/achievements.ts
git commit -m "feat(arcade): wire arcade achievement kinds + category"
```

---

## Task 4: 7 Asteroids achievement definitions

**Files:**
- Modify: `src/data/achievements.ts`

- [ ] **Step 1: Add reward + threshold constants**

Near the existing reward constants in `src/data/achievements.ts` (search for `REWARD_SUSHI_BELOVED` for the pattern), append:

```ts
/** Reward credits for early-tier arcade achievements (Insert Coin, score gates, wave 5, UFO Hunter). */
const REWARD_ARCADE_EARLY = 3000
/** Reward credits for late-tier arcade achievements (Wave 10, Marathon). */
const REWARD_ARCADE_LATE = 5000

/** Run count for the INSERT COIN unlock. */
const ARCADE_INSERT_COIN_RUNS = 1
/** Single-run score thresholds. */
const ARCADE_SCORE_LITTLE_LEAGUE = 5000
const ARCADE_SCORE_KILOMETRIC = 10000
/** Wave thresholds. */
const ARCADE_WAVE_FIVE = 5
const ARCADE_WAVE_DECA = 10
const ARCADE_WAVE_MARATHON = 15
/** Lifetime saucer-kill threshold. */
const ARCADE_SAUCER_KILLS_HUNTER = 15
```

- [ ] **Step 2: Append the 7 definitions**

Find `ACHIEVEMENT_DEFINITIONS` (the big array — search for the last definition's `id`, e.g. `'cosmetics-cargo-intake-fifty-k'`). Append the 7 new rows at the end of the array, immediately before its closing `]`:

```ts
  {
    id: 'arcade-asteroids-insert-coin',
    category: 'arcade',
    icon: '\u{1FA99}', // 🪙
    title: 'INSERT COIN',
    subtitle: "First quarter dropped — welcome to the cabinet",
    description: "Start your first run on the cabinet's Asteroids ROM.",
    type: 'ARCADE',
    rewardCredits: REWARD_ARCADE_EARLY,
    kind: 'arcade_runs_started',
    romId: 'asteroids',
    threshold: ARCADE_INSERT_COIN_RUNS,
  },
  {
    id: 'arcade-asteroids-score-5k',
    category: 'arcade',
    icon: '\u{1F3AF}', // 🎯
    title: 'LITTLE LEAGUE',
    subtitle: 'Five thousand points in a single run',
    description: 'Reach a single-run score of 5,000 in Asteroids.',
    type: 'ARCADE',
    rewardCredits: REWARD_ARCADE_EARLY,
    kind: 'arcade_best_score',
    romId: 'asteroids',
    threshold: ARCADE_SCORE_LITTLE_LEAGUE,
  },
  {
    id: 'arcade-asteroids-score-10k',
    category: 'arcade',
    icon: '\u{1F3C6}', // 🏆
    title: 'KILOMETRIC',
    subtitle: 'Ten thousand points in a single run',
    description: 'Reach a single-run score of 10,000 in Asteroids.',
    type: 'ARCADE',
    rewardCredits: REWARD_ARCADE_EARLY,
    kind: 'arcade_best_score',
    romId: 'asteroids',
    threshold: ARCADE_SCORE_KILOMETRIC,
  },
  {
    id: 'arcade-asteroids-wave-5',
    category: 'arcade',
    icon: '\u{1F30A}', // 🌊
    title: 'WAVE FIVE',
    subtitle: 'Cleared five waves of rocks',
    description: 'Reach wave 5 in Asteroids.',
    type: 'ARCADE',
    rewardCredits: REWARD_ARCADE_EARLY,
    kind: 'arcade_best_wave',
    romId: 'asteroids',
    threshold: ARCADE_WAVE_FIVE,
  },
  {
    id: 'arcade-asteroids-wave-10',
    category: 'arcade',
    icon: '\u{1F525}', // 🔥
    title: 'DECA-CLEAR',
    subtitle: 'Cleared ten waves — the hand has memory now',
    description: 'Reach wave 10 in Asteroids.',
    type: 'ARCADE',
    rewardCredits: REWARD_ARCADE_LATE,
    kind: 'arcade_best_wave',
    romId: 'asteroids',
    threshold: ARCADE_WAVE_DECA,
  },
  {
    id: 'arcade-asteroids-wave-15',
    category: 'arcade',
    icon: '\u{1F3C3}', // 🏃
    title: 'MARATHON',
    subtitle: 'Reach wave 15 in one run — pure endurance',
    description: 'Reach wave 15 in Asteroids.',
    type: 'ARCADE',
    rewardCredits: REWARD_ARCADE_LATE,
    kind: 'arcade_best_wave',
    romId: 'asteroids',
    threshold: ARCADE_WAVE_MARATHON,
  },
  {
    id: 'arcade-asteroids-ufo-hunter',
    category: 'arcade',
    icon: '\u{1F6F8}', // 🛸
    title: 'UFO HUNTER',
    subtitle: "Fifteen saucers down — pilot's vendetta",
    description: 'Destroy 15 saucers in Asteroids across all runs.',
    type: 'ARCADE',
    rewardCredits: REWARD_ARCADE_EARLY,
    kind: 'arcade_event_count',
    romId: 'asteroids',
    arcadeEventId: 'saucerKill',
    threshold: ARCADE_SAUCER_KILLS_HUNTER,
  },
```

- [ ] **Step 3: Verify**

Run: `bun run type-check && bun run lint && bun test:unit`
Expected: clean. Pure data extension — no behavior change yet.

- [ ] **Step 4: Commit**

```bash
git add src/data/achievements.ts
git commit -m "feat(arcade): add 7 Asteroids achievement definitions"
```

---

## Task 5: ArcadeRomEvent type + consumeEvents() interface

**Files:**
- Modify: `src/lib/minigame/cabinet/types.ts`
- Modify: `src/lib/player/arcadeStatsRecorder.ts` (switch to canonical import)
- Modify: `src/lib/minigame/cabinet/__tests__/ArcadeCabinetSession.spec.ts` (extend `makeRom`)
- Modify: `src/lib/minigame/arcadeAsteroids/AsteroidsRom.ts` (stub `consumeEvents` returning `[]`)

This task moves the `ArcadeRomEvent` type to the cabinet package and makes `consumeEvents()` a required ROM method. It returns `[]` from `AsteroidsRom` for now — Task 6 fills in real events.

- [ ] **Step 1: Add `ArcadeRomEvent` to cabinet types**

In `src/lib/minigame/cabinet/types.ts`, append before `ArcadeRomFactory`:

```ts
/**
 * One observable thing that happened inside a ROM. Drained by the cabinet
 * session each tick via {@link ArcadeRom.consumeEvents}.
 */
export interface ArcadeRomEvent {
  /** Event family. `'runStarted'` and `'runEnded'` are framework-recognized; `'event'` is ROM-specific and uses `eventId` to disambiguate. */
  type: 'runStarted' | 'runEnded' | 'event'
  /** For `type: 'event'`: the event id (e.g. `'saucerKill'`). Required for that type, ignored otherwise. */
  eventId?: string
  /** Score at the moment the event fired. */
  score: number
  /** Wave at the moment the event fired. */
  wave: number
}
```

- [ ] **Step 2: Add `consumeEvents()` to `ArcadeRom`**

In the same file, find `interface ArcadeRom` and add the new method (place it after `hudSnapshot()`):

```ts
  /**
   * Drain queued events accumulated since the last call. The cabinet session
   * calls this every tick. ROMs that don't track events return `[]`.
   */
  consumeEvents(): ArcadeRomEvent[]
```

- [ ] **Step 3: Update arcadeStatsRecorder to import the canonical type**

In `src/lib/player/arcadeStatsRecorder.ts`:

1. Remove the local `ArcadeRomEvent` interface definition.
2. Add an import at the top:
   ```ts
   import type { ArcadeRomEvent } from '@/lib/minigame/cabinet/types'
   ```
3. Re-export the type so existing consumers don't break:
   ```ts
   export type { ArcadeRomEvent }
   ```
   Place that line near the top of the file, after the import block.

- [ ] **Step 4: Stub `consumeEvents()` on `AsteroidsRom`**

In `src/lib/minigame/arcadeAsteroids/AsteroidsRom.ts`, in the returned ROM object literal, add (next to `hudSnapshot()`):

```ts
    consumeEvents() {
      return []
    },
```

- [ ] **Step 5: Update the existing cabinet session test helper**

In `src/lib/minigame/cabinet/__tests__/ArcadeCabinetSession.spec.ts`, find `makeRom()`. Add `consumeEvents: () => []` next to the other no-op methods so the test doubles still satisfy the interface.

- [ ] **Step 6: Verify**

Run: `bun run type-check && bun run lint && bun test:unit`
Expected: clean. The 9 existing `ArcadeCabinetSession` tests still pass; the recorder test still passes against the relocated type.

- [ ] **Step 7: Commit**

```bash
git add src/lib/minigame/cabinet/types.ts \
        src/lib/player/arcadeStatsRecorder.ts \
        src/lib/minigame/arcadeAsteroids/AsteroidsRom.ts \
        src/lib/minigame/cabinet/__tests__/ArcadeCabinetSession.spec.ts
git commit -m "feat(arcade): require consumeEvents() on ArcadeRom; centralize event type"
```

---

## Task 6: AsteroidsRom emits run + saucer events — TDD

**Files:**
- Create: `src/lib/minigame/arcadeAsteroids/__tests__/AsteroidsRomEvents.spec.ts`
- Modify: `src/lib/minigame/arcadeAsteroids/AsteroidsRom.ts`

The adapter detects events by diffing the `AsteroidsGame` snapshot frame-to-frame. Detection rules:

- `runStarted` → emitted from `start()`.
- `runEnded` → emitted on the first tick where `phase` transitions to `'gameOver'` (so each run-end fires exactly once).
- `saucerKill` (a `'event'` with `eventId: 'saucerKill'`) → emitted when:
  1. The previous snapshot had a non-null `saucer`.
  2. The current snapshot has a null `saucer`.
  3. The score increased by **≥ 200** this tick (= small-saucer score floor minus margin; large saucers award 200, small award 1000).

Asteroid score multiples that exactly match the band are rare enough across one tick to live with; the spec accepts the heuristic.

- [ ] **Step 1: Write the failing test**

Create `src/lib/minigame/arcadeAsteroids/__tests__/AsteroidsRomEvents.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createAsteroidsRom } from '../AsteroidsRom'
import { ASTEROIDS_GAME_CONFIG } from '../config'
import { AsteroidsGame } from '../AsteroidsGame'
import type { ArcadeRomDeps } from '@/lib/minigame/cabinet/types'
import type { AsteroidsGameState } from '../types'

const META = {
  id: 'asteroids',
  title: 'ASTEROIDS',
  year: '1979',
  blurb: '',
  highScoreKey: 'test-key',
}

function deps(): ArcadeRomDeps {
  return { width: 640, height: 480, storage: null, meta: META, random: () => 0.5 }
}

function attractInputs() {
  return {
    rotateLeft: false,
    rotateRight: false,
    thrust: false,
    fire: false,
    hyperspace: false,
    start: false,
    up: false,
    down: false,
    enter: false,
  }
}

describe('AsteroidsRom event emission', () => {
  it('emits runStarted when start() is called', () => {
    const rom = createAsteroidsRom(deps())
    rom.start()
    const events = rom.consumeEvents()
    expect(events.some((e) => e.type === 'runStarted')).toBe(true)
  })

  it('drains the queue (subsequent consume returns empty)', () => {
    const rom = createAsteroidsRom(deps())
    rom.start()
    rom.consumeEvents()
    expect(rom.consumeEvents()).toEqual([])
  })

  it('saucerKill heuristic: prev saucer present + curr null + score jump ≥ small-saucer score', () => {
    const rom = createAsteroidsRom(deps())
    rom.start()
    rom.consumeEvents()

    // Drive the rom via the public tick() API by injecting a stub snapshot
    // sequence. The cleanest way: spy on the AsteroidsGame instance that the
    // rom holds. The rom has no public game getter, so the test patches
    // `AsteroidsGame.prototype.snapshot` for the duration of the test.
    //
    // Step 1: set the score before the saucer presence flips.
    const stubSeq: AsteroidsGameState[] = [
      buildSnapshot({
        phase: 'playing',
        score: 0,
        wave: 1,
        saucer: { x: 100, y: 100, vx: 0, vy: 0, radius: 12, size: 'small', fireTimer: 0 } as never,
      }),
      buildSnapshot({
        phase: 'playing',
        score: ASTEROIDS_GAME_CONFIG.saucerScore.small,
        wave: 1,
        saucer: null,
      }),
    ]
    let i = 0
    const spy = vi.spyOn(AsteroidsGame.prototype, 'snapshot').mockImplementation(function (
      this: InstanceType<typeof AsteroidsGame>,
    ): AsteroidsGameState {
      const next = stubSeq[Math.min(i, stubSeq.length - 1)]!
      return next
    })

    rom.tick(0.016, attractInputs())
    i = 1
    rom.tick(0.016, attractInputs())

    const events = rom.consumeEvents()
    const kill = events.find((e) => e.type === 'event' && e.eventId === 'saucerKill')
    expect(kill).toBeDefined()
    expect(kill?.score).toBe(ASTEROIDS_GAME_CONFIG.saucerScore.small)
    expect(kill?.wave).toBe(1)

    spy.mockRestore()
  })

  it('does NOT emit saucerKill when saucer leaves without a score jump', () => {
    const rom = createAsteroidsRom(deps())
    rom.start()
    rom.consumeEvents()

    const stubSeq: AsteroidsGameState[] = [
      buildSnapshot({
        phase: 'playing',
        score: 0,
        wave: 1,
        saucer: { x: 100, y: 100, vx: 0, vy: 0, radius: 12, size: 'small', fireTimer: 0 } as never,
      }),
      buildSnapshot({ phase: 'playing', score: 0, wave: 1, saucer: null }),
    ]
    let i = 0
    const spy = vi.spyOn(AsteroidsGame.prototype, 'snapshot').mockImplementation(
      (): AsteroidsGameState => stubSeq[Math.min(i, stubSeq.length - 1)]!,
    )

    rom.tick(0.016, attractInputs())
    i = 1
    rom.tick(0.016, attractInputs())

    const events = rom.consumeEvents()
    expect(events.some((e) => e.type === 'event' && e.eventId === 'saucerKill')).toBe(false)

    spy.mockRestore()
  })

  it('emits runEnded when phase transitions to gameOver (once)', () => {
    const rom = createAsteroidsRom(deps())
    rom.start()
    rom.consumeEvents()

    const stubSeq: AsteroidsGameState[] = [
      buildSnapshot({ phase: 'playing', score: 1000, wave: 3, saucer: null }),
      buildSnapshot({ phase: 'gameOver', score: 1000, wave: 3, saucer: null }),
      buildSnapshot({ phase: 'gameOver', score: 1000, wave: 3, saucer: null }),
    ]
    let i = 0
    const spy = vi.spyOn(AsteroidsGame.prototype, 'snapshot').mockImplementation(
      (): AsteroidsGameState => stubSeq[Math.min(i, stubSeq.length - 1)]!,
    )

    rom.tick(0.016, attractInputs())
    i = 1
    rom.tick(0.016, attractInputs())
    i = 2
    rom.tick(0.016, attractInputs())

    const events = rom.consumeEvents()
    const enders = events.filter((e) => e.type === 'runEnded')
    expect(enders.length).toBe(1)
    expect(enders[0]?.score).toBe(1000)
    expect(enders[0]?.wave).toBe(3)

    spy.mockRestore()
  })
})

/** Build a minimal AsteroidsGameState for tests; only the fields the adapter reads matter. */
function buildSnapshot(partial: Partial<AsteroidsGameState>): AsteroidsGameState {
  return {
    width: 640,
    height: 480,
    score: 0,
    highScore: 0,
    lives: 3,
    wave: 1,
    phase: 'playing',
    ship: { x: 320, y: 240, vx: 0, vy: 0, angle: 0, radius: 8, visible: true, invulnerableTimer: 0 } as never,
    asteroids: [],
    bullets: [],
    saucerBullets: [],
    saucer: null,
    saucerSpawnTimer: 0,
    respawnTimer: 0,
    fireCooldown: 0,
    ...partial,
  }
}
```

> Note on `AsteroidsGameState` shape: this test uses `buildSnapshot` with what we believe the state shape is. The implementer should adjust the helper to match the actual state shape (look at `AsteroidsGame.snapshot()` and at `src/lib/minigame/arcadeAsteroids/types.ts`). The point of the helper is *only* to populate `phase`, `score`, `wave`, and `saucer` — the four fields the adapter inspects. Other fields can use `as never`-style placeholders or real default values. Do NOT add features to `AsteroidsGame` to make this test work.

- [ ] **Step 2: Run, expect failure**

Run: `bun test:unit src/lib/minigame/arcadeAsteroids/__tests__/AsteroidsRomEvents.spec.ts`
Expected: FAIL — `consumeEvents()` returns `[]` from the Task 5 stub, so all assertions fail.

- [ ] **Step 3: Implement event tracking in `AsteroidsRom.ts`**

Open `src/lib/minigame/arcadeAsteroids/AsteroidsRom.ts`. Add the saucer-kill score floor near the top of the file:

```ts
/** Minimum score delta in one tick that counts as a saucer kill (= small-saucer score). */
const SAUCER_KILL_SCORE_MIN = 200
```

In the factory body, after `let lastThrust = false`, add:

```ts
  let prevSaucerPresent = false
  let prevScore = 0
  let prevPhase: string = 'attract'
  const queue: ArcadeRomEvent[] = []
```

Import `ArcadeRomEvent` near the existing imports:

```ts
import type {
  ArcadeRom,
  ArcadeRomDeps,
  ArcadeRomFactory,
  ArcadeInputs,
  ArcadeRomEvent,
  RomHudSnapshot,
} from '@/lib/minigame/cabinet/types'
```

Add a helper inside the factory:

```ts
  function detectAndEnqueueEvents(): void {
    const s = game.snapshot()
    const saucerNow = s.saucer !== null && s.saucer !== undefined
    const scoreDelta = s.score - prevScore

    // Saucer kill: prev present, curr absent, score jumped enough.
    if (prevSaucerPresent && !saucerNow && scoreDelta >= SAUCER_KILL_SCORE_MIN) {
      queue.push({ type: 'event', eventId: 'saucerKill', score: s.score, wave: s.wave })
    }

    // Run ended: phase transitioned to 'gameOver'.
    if (prevPhase !== 'gameOver' && s.phase === 'gameOver') {
      queue.push({ type: 'runEnded', score: s.score, wave: s.wave })
    }

    prevSaucerPresent = saucerNow
    prevScore = s.score
    prevPhase = s.phase
  }
```

Update the four tick/attractTick/start/reset handlers:

```ts
    tick(dt, inputs) {
      const mapped = toAsteroidsInputs(inputs)
      lastThrust = mapped.thrust
      game.tick(dt, mapped)
      persistIfBeaten()
      detectAndEnqueueEvents()
    },
    // render unchanged
    attractTick(dt) {
      game.tick(dt, ASTEROIDS_IDLE_INPUTS)
      lastThrust = false
      persistIfBeaten()
      detectAndEnqueueEvents()
    },
    // attractRender unchanged
    start() {
      game.startRun()
      // Reset diff trackers so a freshly started run doesn't re-fire saucerKill
      // from leftover prevState.
      const s = game.snapshot()
      prevSaucerPresent = s.saucer !== null && s.saucer !== undefined
      prevScore = s.score
      prevPhase = s.phase
      queue.push({ type: 'runStarted', score: s.score, wave: s.wave })
    },
    reset() {
      game = buildGame()
      lastThrust = false
      const s = game.snapshot()
      prevSaucerPresent = s.saucer !== null && s.saucer !== undefined
      prevScore = s.score
      prevPhase = s.phase
      queue.length = 0
    },
    // isRunComplete + hudSnapshot unchanged
    consumeEvents() {
      const out = queue.slice()
      queue.length = 0
      return out
    },
```

- [ ] **Step 4: Run + verify**

Run: `bun test:unit src/lib/minigame/arcadeAsteroids/__tests__/AsteroidsRomEvents.spec.ts && bun test:unit src/lib/minigame/arcadeAsteroids && bun run type-check && bun run lint`
Expected: PASS / clean. Existing AsteroidsRom tests still pass (the new logic doesn't change existing behavior).

If the saucer-kill test still fails because the snapshot stub shape is wrong, fix `buildSnapshot()` to match the real `AsteroidsGameState` interface — do NOT change the adapter logic.

- [ ] **Step 5: Commit**

```bash
git add src/lib/minigame/arcadeAsteroids/AsteroidsRom.ts \
        src/lib/minigame/arcadeAsteroids/__tests__/AsteroidsRomEvents.spec.ts
git commit -m "feat(arcade): AsteroidsRom emits runStarted/runEnded/saucerKill"
```

---

## Task 7: ArcadeCabinetSession drains events + forwards via onRomEvent — TDD

**Files:**
- Create: `src/lib/minigame/cabinet/__tests__/ArcadeCabinetSessionEvents.spec.ts`
- Modify: `src/lib/minigame/cabinet/ArcadeCabinetSession.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/minigame/cabinet/__tests__/ArcadeCabinetSessionEvents.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { ArcadeCabinetSession } from '../ArcadeCabinetSession'
import { ArcadeRomRegistry } from '../ArcadeRomRegistry'
import type {
  ArcadeRom,
  ArcadeRomEvent,
  ArcadeRomFactory,
  RomMeta,
} from '../types'

const META: RomMeta = {
  id: 'asteroids',
  title: 'ASTEROIDS',
  year: '1979',
  blurb: '',
  highScoreKey: 'k',
}

function makeRomWithEvents(): ArcadeRom & { enqueue: (e: ArcadeRomEvent) => void } {
  const queue: ArcadeRomEvent[] = []
  return {
    enqueue: (e) => queue.push(e),
    tick: () => {},
    render: () => {},
    attractTick: () => {},
    attractRender: () => {},
    start: () => {},
    reset: () => {},
    isRunComplete: () => false,
    hudSnapshot: () => ({ score: 0, highScore: 0, lives: 3, wave: 1, phaseLabel: 'ATTRACT' }),
    consumeEvents() {
      const out = queue.slice()
      queue.length = 0
      return out
    },
  }
}

describe('ArcadeCabinetSession event forwarding', () => {
  it('forwards drained events to onRomEvent with the active rom id', () => {
    const rom = makeRomWithEvents()
    const factory: ArcadeRomFactory = () => rom
    const registry = new ArcadeRomRegistry([META], { asteroids: factory })
    const onRomEvent = vi.fn()
    const session = new ArcadeCabinetSession({
      registry,
      width: 640,
      height: 480,
      storage: null,
      renderer: { drawAttract: () => {}, drawMenu: () => {}, drawPlay: () => {} },
      onRomEvent,
    })

    rom.enqueue({ type: 'runStarted', score: 0, wave: 1 })
    session.tick(0.016)

    expect(onRomEvent).toHaveBeenCalledWith('asteroids', {
      type: 'runStarted',
      score: 0,
      wave: 1,
    })
  })

  it('does not throw when onRomEvent is undefined', () => {
    const rom = makeRomWithEvents()
    const factory: ArcadeRomFactory = () => rom
    const registry = new ArcadeRomRegistry([META], { asteroids: factory })
    const session = new ArcadeCabinetSession({
      registry,
      width: 640,
      height: 480,
      storage: null,
      renderer: { drawAttract: () => {}, drawMenu: () => {}, drawPlay: () => {} },
    })
    rom.enqueue({ type: 'runEnded', score: 50, wave: 2 })
    expect(() => session.tick(0.016)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run, expect failure**

Run: `bun test:unit src/lib/minigame/cabinet/__tests__/ArcadeCabinetSessionEvents.spec.ts`
Expected: FAIL — `onRomEvent` not in `ArcadeCabinetSessionOptions`.

- [ ] **Step 3: Implement**

In `src/lib/minigame/cabinet/ArcadeCabinetSession.ts`:

1. Add the import:
   ```ts
   import type {
     // existing imports …
     ArcadeRomEvent,
   } from './types'
   ```
2. Extend the options interface (find `ArcadeCabinetSessionOptions`):

   ```ts
   /** Optional sink for events drained from the active ROM each tick. */
   onRomEvent?: (romId: string, event: ArcadeRomEvent) => void
   ```

3. Hold the active ROM's id as a class field. Find where the ctor builds the rom; around there:

   ```ts
   private activeRomId: string
   ```

   In the ctor, after `const first = this.catalog[0]!`:
   ```ts
   this.activeRomId = first.id
   ```

   In `menuConfirm()`, after `const meta = this.catalog[this.menuIndex]!`:
   ```ts
   this.activeRomId = meta.id
   ```

4. After EVERY `attractTick(dt)` / `tick(dt, this.inputs)` call inside the session's `tick(dt)`, drain events. Easiest: add one helper:

   ```ts
   private drainEvents(): void {
     const cb = this.options.onRomEvent
     if (!cb) {
       this.rom.consumeEvents()
       return
     }
     const events = this.rom.consumeEvents()
     for (const event of events) cb(this.activeRomId, event)
   }
   ```

   Call `this.drainEvents()` at the end of each branch in `tick(dt)` (after the rom tick + render, but BEFORE the early `return`s). Three call sites: idle/engaging/disengaging branch, menu branch, playing branch.

- [ ] **Step 4: Run + verify**

Run: `bun test:unit src/lib/minigame/cabinet && bun run type-check && bun run lint`
Expected: PASS / clean. The 9 existing session tests still pass (their `makeRom` already returns `consumeEvents: () => []` from Task 5, so `drainEvents()` is a no-op in those tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/minigame/cabinet/ArcadeCabinetSession.ts \
        src/lib/minigame/cabinet/__tests__/ArcadeCabinetSessionEvents.spec.ts
git commit -m "feat(arcade): cabinet session drains ROM events via onRomEvent"
```

---

## Task 8: Wire HabitatInteriorScene → MapHabitatFacade

**Files:**
- Modify: `src/three/HabitatInteriorScene.ts`
- Modify: `src/lib/map/habitat/MapHabitatFacade.ts`
- Modify: `src/views/MapViewController.ts` (if needed — see step 4)

This connects the cabinet session's `onRomEvent` to the standard profile-mutation pipeline. The pattern mirrors `handleSushiPetted`.

- [ ] **Step 1: Add a setter on HabitatInteriorScene**

In `src/three/HabitatInteriorScene.ts`, find the `setSushiBridgeCallbacks` method (~line 2268). Right before it, add:

```ts
/** Callback signature for receiving cabinet ROM events from outside the scene. */
export type ArcadeRomEventListener = (romId: string, event: ArcadeRomEvent) => void
```

Add the import at the top of the file:

```ts
import type { ArcadeRomEvent } from '@/lib/minigame/cabinet/types'
```

In the class, add a private field near `private sushiCallbacks` (~line 1306):

```ts
private arcadeRomEventListener: ArcadeRomEventListener | null = null
```

Add a public setter after `setSushiBridgeCallbacks`:

```ts
/**
 * Install (or replace) the cabinet ROM event listener. Forwarded by the
 * cabinet session each tick. Pass `null` to detach.
 */
setArcadeRomEventListener(listener: ArcadeRomEventListener | null): void {
  this.arcadeRomEventListener = listener
}
```

- [ ] **Step 2: Pass it into the cabinet session**

In `loadArcadeMachineAsync()` (around line 1860), find the `new ArcadeCabinetSession({ ... })` block. Add an `onRomEvent` field to the options literal:

```ts
this.arcadeSession = new ArcadeCabinetSession({
  registry,
  width: ARCADE_SCREEN_WIDTH,
  height: ARCADE_SCREEN_HEIGHT,
  storage: typeof window === 'undefined' ? null : window.localStorage,
  renderer: this.arcadeRenderer,
  onRomEvent: (romId, event) => this.arcadeRomEventListener?.(romId, event),
})
```

- [ ] **Step 3: Add the receiver in MapHabitatFacade**

In `src/lib/map/habitat/MapHabitatFacade.ts`:

Add imports:

```ts
import { recordArcadeRomEvent } from '@/lib/player/arcadeStatsRecorder'
import type { ArcadeRomEvent } from '@/lib/minigame/cabinet/types'
```

Find the `handleSushiPetted` method (~line 292) for the pattern. Add a parallel handler nearby:

```ts
/**
 * Apply a cabinet ROM event to the player profile and re-evaluate achievements.
 * Mirrors {@link handleSushiPetted} — read profile, mutate via recorder, save,
 * fire the existing achievement-eval entrypoint.
 */
private handleArcadeRomEvent(romId: string, event: ArcadeRomEvent): void {
  const deps = this.deps
  if (!deps) return
  const current = deps.getProfile()
  const updatedStats = recordArcadeRomEvent(current.achievementStats, romId, event)
  const next: PlayerProfile = { ...current, achievementStats: updatedStats }
  deps.setProfile(next)
  saveProfile(next)
  deps.evaluateAchievements()
}
```

> If `PlayerProfile` isn't already imported in this file, find the existing `import type { PlayerProfile } from '@/lib/player/types'` (or similar) — there is one. If `saveProfile` isn't imported there yet, add the import next to the others; the sushi handler already uses it so it should already be present.

In the same facade, find where `setSushiBridgeCallbacks` is wired into the scene (the `next.setSushiBridgeCallbacks({ ... })` block, around line 243). Right after that block, add:

```ts
next.setArcadeRomEventListener((romId, event) => this.handleArcadeRomEvent(romId, event))
```

Where `next` is the scene reference being configured (verify variable name in the surrounding code).

- [ ] **Step 4: Verify MapViewController doesn't need a sibling change**

The facade owns the scene reference today (it's how sushi callbacks reach the scene). Run:

```bash
grep -n "setSushiBridgeCallbacks\|HabitatInteriorScene" src/views/MapViewController.ts
```

If `MapViewController` brokers any of the scene-side callbacks (the way it does for `onObservatory`, `onShuttleControl`, etc.), this task is complete in the facade. If there's a controller-side relay also needed, mirror the same pattern there: pass the scene reference into the facade exactly as sushi does. **Only modify if the existing wiring requires it** — do not pre-emptively add controller-level state.

- [ ] **Step 5: Verify**

Run: `bun run type-check && bun run lint && bun test:unit`
Expected: clean.

- [ ] **Step 6: Manual smoke**

Run `bun dev`. Walk to the cabinet, F to engage, ENTER to start a run. The "INSERT COIN" achievement should fire immediately with a 3000 CR reward toast. Score over 5K → "LITTLE LEAGUE" fires. Reach wave 5 → "WAVE FIVE" fires. Etc.

If the toast doesn't appear, the `evaluateAchievements()` callback isn't running. Sanity-check by setting a `console.log('arcade event', romId, event)` inside `handleArcadeRomEvent` and confirming events arrive.

- [ ] **Step 7: Commit**

```bash
git add src/three/HabitatInteriorScene.ts src/lib/map/habitat/MapHabitatFacade.ts
# Add MapViewController.ts only if Step 4 required modifying it.
git commit -m "feat(arcade): route cabinet ROM events into achievement pipeline"
```

---

## Task 9: Final acceptance

- [ ] **Step 1: Full pipeline**

Run: `bun run type-check && bun run lint && bun test:unit`
Expected: clean. Lint must be 0/0.

- [ ] **Step 2: Manual end-to-end**

Run `bun dev`.

1. Walk into the habitat. Cabinet shows attract.
2. Press F → engage; menu appears; ASTEROIDS selected.
3. ENTER → run starts. Toast: **INSERT COIN +3000 CR**.
4. Score crosses 5,000 → toast **LITTLE LEAGUE +3000 CR**.
5. Score crosses 10,000 → toast **KILOMETRIC +3000 CR**.
6. Reach wave 5 → toast **WAVE FIVE +3000 CR**.
7. Reach wave 10 → toast **DECA-CLEAR +5000 CR**.
8. Reach wave 15 → toast **MARATHON +5000 CR**.
9. Across one or more runs, kill 15 saucers total → toast **UFO HUNTER +3000 CR**.
10. Open the achievements panel. There should be a new **Arcade** category section with all 7 rows; locked rows show progress hints like "Reach wave 5 (best 3)".

- [ ] **Step 3: No commit needed unless fixes were made.**

---

## Open Items / Risks (carry-forward)

- **Saucer-kill heuristic.** If you see UFO HUNTER unlock without ever killing a saucer (e.g. asteroid clusters happen to sum to ≥ 200 score on the same tick a saucer leaves the screen), tighten by also checking the magnitude — exactly 200 (large) or 1000 (small). The spec called this risk out and accepted it for v1.
- **Reward credits.** The existing achievement-unlock pipeline grants `rewardCredits` automatically when an achievement flips from locked to unlocked. We do not touch that flow. If the toast/credit grant fails, the bug is in the existing pipeline, not in this work.
- **Achievement panel ordering.** The new `'arcade'` category is added to the union AFTER `'cat'` and BEFORE `'cosmetics'`; if the panel renders in `AchievementCategory` declaration order (which `getAchievementGroups` does — it iterates through `ACHIEVEMENT_DEFINITIONS` in array order, not category union order), the section will appear after the last cat row and before the first cosmetics row, which is the intent.
