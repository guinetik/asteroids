# Player Profile — Design Spec

**Date:** 2026-04-03
**Status:** Approved

## Overview

Player profile system with localStorage persistence. Tracks player name, credits, completed mission count, and per-asteroid visit counts. Pure functions in `src/lib/player/` handle all logic; a thin Pinia store in `src/stores/player.ts` provides Vue reactivity.

No backend, no login — the game jam rules require free-to-play with no signup.

## Scope

Player profile data model, CRUD operations, and localStorage persistence. Out of scope: shop/store system, lander upgrades, mission state machine.

## Data Model

All interfaces in `src/lib/player/types.ts`.

```ts
interface PlayerProfile {
  name: string
  credits: number
  completedMissionCount: number
  visitedAsteroids: Record<string, number>
}
```

### Field Details

- **`name`** — player display name. Set at profile creation. Non-empty string.
- **`credits`** — current credit balance. Starts at 0. Earned from completing missions, spent in the shop (separate system).
- **`completedMissionCount`** — total missions completed across all types. Used for difficulty scaling. Incremented once per mission completion.
- **`visitedAsteroids`** — maps asteroid ID to mission visit count. Incremented once per mission to that asteroid (NOT per landing within a mission). Used for UI "explored" indicators and potential gameplay effects.

## File Layout

```
src/lib/player/
  types.ts              — PlayerProfile interface
  profile.ts            — create/load/save/update pure functions

src/lib/player/__tests__/
  profile.spec.ts       — tests for all profile operations

src/stores/
  player.ts             — Pinia store wrapping profile (thin reactive layer)
```

## Functions — `src/lib/player/profile.ts`

### Profile Lifecycle

- **`createProfile(name: string): PlayerProfile`** — returns a fresh profile with 0 credits, 0 completed missions, empty visited asteroids.
- **`saveProfile(profile: PlayerProfile): void`** — serializes profile to `localStorage` under a named key.
- **`loadProfile(): PlayerProfile | null`** — deserializes from `localStorage`. Returns `null` if no saved profile exists or if data is corrupted/unparseable.

### Credit Operations (pure functions)

- **`addCredits(profile: PlayerProfile, amount: number): PlayerProfile`** — returns a new profile with credits increased by `amount`. `amount` must be positive.
- **`spendCredits(profile: PlayerProfile, amount: number): PlayerProfile | null`** — returns a new profile with credits decreased by `amount`, or `null` if insufficient credits. `amount` must be positive.

### Progress Tracking (pure functions)

- **`recordMissionComplete(profile: PlayerProfile): PlayerProfile`** — returns a new profile with `completedMissionCount` incremented by 1.
- **`recordAsteroidVisit(profile: PlayerProfile, asteroidId: string): PlayerProfile`** — returns a new profile with the visit count for `asteroidId` incremented by 1. If the asteroid hasn't been visited before, initializes it to 1.

## Constants

- **`PROFILE_STORAGE_KEY = 'asteroid-lander-profile'`** — localStorage key.

## Pinia Store — `src/stores/player.ts`

Thin reactive wrapper. The store:

- Holds a `ref<PlayerProfile | null>` as state
- On creation, calls `loadProfile()` to hydrate from localStorage
- Exposes actions that call the pure functions from `profile.ts` and auto-save to localStorage after each mutation
- Exposes computed getters for common reads: `hasProfile`, `canAfford(amount)`

The store contains no business logic — it delegates everything to the pure functions and handles persistence.

## Testing Plan

All tests in `src/lib/player/__tests__/profile.spec.ts`. Tests mock `localStorage` via a simple in-memory implementation.

### createProfile
- Returns profile with given name, 0 credits, 0 completed missions, empty visited asteroids.
- Name is preserved exactly as given.

### saveProfile / loadProfile
- `saveProfile` then `loadProfile` round-trips correctly.
- `loadProfile` returns `null` when localStorage is empty.
- `loadProfile` returns `null` when localStorage contains invalid JSON.

### addCredits
- Adds credits to profile, returns new profile.
- Original profile is not mutated.

### spendCredits
- Deducts credits when sufficient balance, returns new profile.
- Returns `null` when insufficient credits.
- Original profile is not mutated.
- Exact balance (credits === amount) succeeds with 0 remaining.

### recordMissionComplete
- Increments completedMissionCount by 1.
- Original profile is not mutated.

### recordAsteroidVisit
- First visit to an asteroid sets count to 1.
- Subsequent visits increment count.
- Other asteroid counts are not affected.
- Original profile is not mutated.

### Pinia store
- No tests — thin wrapper, all logic tested via pure functions.
