# Arcade Cabinet Achievements

- **Author:** guinetik
- **Date:** 2026-05-10
- **Status:** Approved
- **Depends on:** `docs/superpowers/specs/2026-05-09-arcade-cabinet-projection-design.md` (the cabinet + ROM system)

## Goal

Add a generalized achievement pipeline for the in-world arcade cabinet, plus 7 Asteroids-specific badges. The plumbing is per-ROM from day one so future ROMs slot in with zero schema changes for the common cases.

## Non-goals

- Achievements for ROMs other than Asteroids. The system is built ROM-pluggable, but only Asteroids ships rules today.
- A separate arcade unlock-toast UI. Reuse the existing achievement-unlock toast / credit reward path that fires for every achievement.
- Migration of existing high-score localStorage. The cabinet's per-ROM high score is already persisted (Task 3 of the prior spec); this work piggybacks on the live profile, not the high score.

## Achievements (7)

Category: new `'arcade'` bucket, slotted between `'cat'` and `'cosmetics'` in the player-profile panel order. Label: `Arcade`.

| id | Title | Subtitle | Description | kind | romId | threshold | reward |
|---|---|---|---|---|---|---|---|
| `arcade-asteroids-insert-coin` | INSERT COIN | First quarter dropped — welcome to the cabinet | Start your first run on the cabinet's Asteroids ROM. | `arcade_runs_started` | `asteroids` | 1 | 3000 |
| `arcade-asteroids-score-5k` | LITTLE LEAGUE | Five thousand points in a single run | Reach a single-run score of 5,000 in Asteroids. | `arcade_best_score` | `asteroids` | 5000 | 3000 |
| `arcade-asteroids-score-10k` | KILOMETRIC | Ten thousand points in a single run | Reach a single-run score of 10,000 in Asteroids. | `arcade_best_score` | `asteroids` | 10000 | 3000 |
| `arcade-asteroids-wave-5` | WAVE FIVE | Cleared five waves of rocks | Reach wave 5 in Asteroids. | `arcade_best_wave` | `asteroids` | 5 | 3000 |
| `arcade-asteroids-wave-10` | DECA-CLEAR | Cleared ten waves — the hand has memory now | Reach wave 10 in Asteroids. | `arcade_best_wave` | `asteroids` | 10 | 5000 |
| `arcade-asteroids-wave-15` | MARATHON | Reach wave 15 in one run — pure endurance | Reach wave 15 in Asteroids. | `arcade_best_wave` | `asteroids` | 15 | 5000 |
| `arcade-asteroids-ufo-hunter` | UFO HUNTER | Fifteen saucers down — pilot's vendetta | Destroy 15 saucers in Asteroids across all runs. | `arcade_event_count` | `asteroids` / `saucerKill` | 15 | 3000 |

Total reward credits if every arcade achievement is unlocked: **25,000 CR** — equal to the cabinet's purchase price. The cabinet pays itself off if you fully clear it.

## Architecture

The work spans three layers in the existing codebase:

1. **Profile stats** — generalized "by ROM" accumulators in `PlayerAchievementStats`.
2. **Achievement evaluation** — 4 new `AchievementKind` variants and switch cases.
3. **Event plumbing** — ROMs emit events; the cabinet session drains them; a recorder mutates the profile and triggers the existing eval pipeline.

### 1. Profile Stats

`PlayerAchievementStats` (`src/lib/player/types.ts`) gets four new fields:

```ts
/** Total runs started for each cabinet ROM, keyed by ROM id. */
arcadeRunsByRom: Record<string, number>

/** Best single-run score reached on each cabinet ROM. */
arcadeBestScoreByRom: Record<string, number>

/** Best wave/level reached in a single run on each cabinet ROM. */
arcadeBestWaveByRom: Record<string, number>

/**
 * Lifetime counts of named in-ROM events, keyed first by ROM id and then by
 * event name. Used for ROM-specific milestones like saucer kills that don't
 * fit the score/wave/runs taxonomy.
 */
arcadeEventCountsByRom: Record<string, Record<string, number>>
```

The first three mirror the existing `slingshotLaunchesByBody: Record<string, number>` pattern. The fourth (`arcadeEventCountsByRom`) is the only nested record, used for ROM-specific milestones like saucer kills.

`profile.ts` gets defensive normalizers and defaults for each, matching the style of the existing `missionObjectivesCompletedByType` normalization.

### 2. Achievement Evaluation

Four new `AchievementKind` variants in `src/data/achievements.ts`:

- `arcade_runs_started` — fields: `romId`, `threshold`
- `arcade_best_score` — fields: `romId`, `threshold`
- `arcade_best_wave` — fields: `romId`, `threshold`
- `arcade_event_count` — fields: `romId`, `eventId`, `threshold`

`AchievementDefinition` gets two new optional fields:

- `romId?: string` — used by all four arcade kinds.
- `arcadeEventId?: string` — used only by `arcade_event_count`.

`isAchievementUnlocked` (`src/lib/achievements.ts`) gets four new switch cases. Each looks up the by-ROM stats:

```ts
case 'arcade_runs_started':
  return hasRequiredString(definition.romId)
    ? requiredThresholdReached(
        getAchievementStats(progress.profile).arcadeRunsByRom[definition.romId] ?? 0,
        getRequiredThreshold(definition),
      )
    : false
```

Same shape for the other three; `arcade_event_count` does a two-level lookup (`arcadeEventCountsByRom[romId]?.[eventId] ?? 0`). `getAchievementLockedHint` gets matching cases with progress-aware copy ("Reach 10,000 (current 4,200)"), keyed off the existing helpers.

`AchievementCategory` adds `'arcade'`. `ACHIEVEMENT_CATEGORY_LABELS` adds `'arcade': 'Arcade'`.

### 3. Event Plumbing

ROMs emit events; the cabinet session drains them; a recorder updates the profile and triggers achievement evaluation.

**ROM contract.** `ArcadeRom` (in `src/lib/minigame/cabinet/types.ts`) gets one new method:

```ts
/**
 * Drain queued events accumulated since the last call. Cabinet calls this
 * each tick. Returning [] is fine for ROMs that don't track events.
 */
consumeEvents(): ArcadeRomEvent[]
```

```ts
export interface ArcadeRomEvent {
  /** Event family. */
  type: 'runStarted' | 'runEnded' | 'event'
  /** For type='event': the event id (e.g. 'saucerKill'). Required for type='event'. */
  eventId?: string
  /** Score at the moment the event fired. */
  score: number
  /** Wave at the moment the event fired. */
  wave: number
}
```

**Asteroids adapter.** `AsteroidsRom` (`src/lib/minigame/arcadeAsteroids/AsteroidsRom.ts`) accumulates events by watching snapshot diffs:

- `runStarted` — emitted from `start()`.
- `runEnded` — emitted on the first tick where `phase` transitions to `'gameOver'`.
- `event` with `eventId='saucerKill'` — emitted on the tick where the previous snapshot's saucer was non-null, the current snapshot's saucer is null, **and** the score increased by an amount within `[ASTEROIDS_GAME_CONFIG.saucerKillScoreMin, saucerKillScoreMax]` (drawn from the existing config). The score-band check is what disambiguates "saucer killed by player" from "saucer left the screen un-killed".

The adapter holds a small `prevSaucerPresent` flag and a `prevScore` integer between ticks. No changes required to `AsteroidsGame.ts` — the simulation stays pure.

**Cabinet session.** `ArcadeCabinetSession` (`src/lib/minigame/cabinet/ArcadeCabinetSession.ts`) gets one new optional dep:

```ts
interface ArcadeCabinetSessionOptions {
  // ... existing ...
  /** Optional sink for ROM events. Called once per drained event. */
  onRomEvent?: (romId: string, event: ArcadeRomEvent) => void
}
```

After every `rom.tick(...)` or `rom.attractTick(...)` (events only fire during play, but draining always is harmless), the session calls `rom.consumeEvents()` and forwards each event with the active ROM's id.

**Stats recorder.** New module `src/lib/player/arcadeStatsRecorder.ts`. A pure-TS function:

```ts
export function recordArcadeRomEvent(
  stats: PlayerAchievementStats,
  romId: string,
  event: ArcadeRomEvent,
): PlayerAchievementStats
```

Returns a new stats object with the appropriate counter bumped:
- `runStarted` → `arcadeRunsByRom[romId] += 1`.
- Any event with non-zero score/wave → `arcadeBestScoreByRom[romId] = max(prev, event.score)` and `arcadeBestWaveByRom[romId] = max(prev, event.wave)`.
- `event` with `eventId` → `arcadeEventCountsByRom[romId][eventId] += 1`.

Pure, immutable in the same style as the rest of the profile reducers. Unit-tested.

**Habitat scene wiring.** `HabitatInteriorScene` builds the session with an `onRomEvent` that delegates to a host-supplied callback (passed in via the existing `HabitatSceneOptions` or similar). The host (`MapHabitatFacade` / `MapViewController`) records the event into the player profile and calls the existing achievement-eval entrypoint that already runs after profile mutations. We do not invent a new pipeline — we feed the same one cat-pet, slingshot, and orbit achievements use.

## Data Flow

```
AsteroidsGame.tick(dt, inputs)
  └─► AsteroidsRom (adapter): diff vs. prevSaucerPresent / prevScore
        └─► append events to internal queue

ArcadeCabinetSession.tick(dt)
  ├─► rom.tick / rom.attractTick (existing)
  └─► rom.consumeEvents()
        └─► for each event: options.onRomEvent?.(romId, event)
              └─► HabitatInteriorScene.onArcadeEvent
                    └─► host: recordArcadeRomEvent(profile.stats, romId, event)
                          └─► save profile + run existing achievement evaluation
                                └─► reward credits + unlock toast (existing path)
```

## Files

### Added

- `src/lib/player/arcadeStatsRecorder.ts` — pure recorder.
- `src/lib/player/__tests__/arcadeStatsRecorder.spec.ts` — bumps each counter, max-tracks score/wave, handles missing maps.
- `src/lib/minigame/arcadeAsteroids/__tests__/AsteroidsRomEvents.spec.ts` — verifies adapter emits `runStarted` on `start()`, `runEnded` on game-over transition, and `saucerKill` on the saucer-disappear-with-matching-score-delta heuristic.
- `src/lib/minigame/cabinet/__tests__/ArcadeCabinetSessionEvents.spec.ts` — verifies session drains events and forwards to `onRomEvent` with the active ROM id.

### Changed

- `src/lib/player/types.ts` — add 4 fields to `PlayerAchievementStats`.
- `src/lib/player/profile.ts` — normalizers + defaults for the 4 new fields.
- `src/data/achievements.ts` — new category, 4 new `AchievementKind` variants, 2 new optional `AchievementDefinition` fields (`romId`, `arcadeEventId`), 7 new definitions + their threshold/reward constants. Add `'Arcade'` label to `ACHIEVEMENT_CATEGORY_LABELS`.
- `src/lib/achievements.ts` — 4 new switch cases in `isAchievementUnlocked` and `getAchievementLockedHint`.
- `src/lib/minigame/cabinet/types.ts` — add `ArcadeRomEvent`; add `consumeEvents(): ArcadeRomEvent[]` to `ArcadeRom` (required).
- `src/lib/minigame/cabinet/ArcadeCabinetSession.ts` — drain events each tick, forward to optional `onRomEvent`. Add field to `ArcadeCabinetSessionOptions`.
- `src/lib/minigame/arcadeAsteroids/AsteroidsRom.ts` — accumulate `runStarted`, `runEnded`, `saucerKill` events; expose `consumeEvents()`.
- `src/three/HabitatInteriorScene.ts` — accept an optional event callback in the existing scene-options surface, pass it into the session.
- `src/lib/map/habitat/MapHabitatFacade.ts` and/or `src/views/MapViewController.ts` — pipe the event from the scene through to the profile-mutation path that already exists for other achievement-eligible events.

## Testing

Pure-TS targets only (per ground rule 2):

- `arcadeStatsRecorder.spec.ts` — first-runStarted creates entry; subsequent bumps increment; score/wave do max-tracking; missing maps initialize gracefully; unknown event types are no-ops.
- `AsteroidsRomEvents.spec.ts` — `runStarted` fires once per `start()`; `runEnded` fires once when `phase` flips to `'gameOver'`; `saucerKill` fires when saucer disappears with matching score band; does NOT fire when saucer leaves the screen without a kill (score doesn't jump).
- `ArcadeCabinetSessionEvents.spec.ts` — session calls `rom.consumeEvents()` each tick; forwards every drained event to `onRomEvent` with the current ROM id; no calls when `onRomEvent` is undefined.
- Update existing `ArcadeCabinetSession.spec.ts` makeRom() helper to include a `consumeEvents: () => []` no-op so the existing 9 tests keep passing.

No tests for `HabitatInteriorScene` wiring (integration surface). The achievement evaluation itself is exercised by the existing `achievements.spec.ts` test file — add a few cases there for the new `kind` switch branches.

## Acceptance

- `bun run type-check` clean.
- `bun run lint` — 0 errors, 0 warnings.
- `bun run test:unit` — all green, including the new specs.
- Manual: walk into the habitat, F at the cabinet, start an Asteroids run → INSERT COIN unlock toast fires immediately and 3000 CR lands in the wallet. Beat 5K points → LITTLE LEAGUE fires. Etc.

## Open Questions / Risks

- **Saucer-kill heuristic.** Detection relies on score-delta band matching. If the score-band overlaps an asteroid-cluster kill happening on the same frame the saucer leaves the screen, the heuristic could false-positive. Mitigations: pick a tight band; only count when the saucer has spent at least one full tick on screen; if it gets noisy, promote to a dedicated `consumeEvents()` on `AsteroidsGame` itself. Implementation note: read `ASTEROIDS_GAME_CONFIG.saucer*Score` in `config.ts` to get the exact reward bands.
- **Profile-mutation entrypoint.** The exact API to push stats into the profile and re-run achievement eval depends on how the existing slingshot/orbit/sushi events do it. Implementation phase will trace one of those (e.g., `cat-beloved` triggered by petting Sushi) and reuse the same path. No new pipeline.
- **Reward credits double-counting.** Achievements grant credits via the existing `rewardCredits` field. We don't touch that flow — confirmed during implementation that the new arcade rows behave identically to the cat / slingshot rows.
