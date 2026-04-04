# Player Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement player profile system with localStorage persistence, credit operations, mission tracking, and asteroid visit counts.

**Architecture:** Pure functions in `src/lib/player/` handle all logic (create, load, save, update). A thin Pinia store in `src/stores/player.ts` wraps these for Vue reactivity. TDD on the pure functions only.

**Tech Stack:** TypeScript, Vitest, Pinia, localStorage.

---

### File Map

- Create: `src/lib/player/types.ts` — PlayerProfile interface
- Create: `src/lib/player/profile.ts` — pure functions for profile operations
- Create: `src/lib/player/__tests__/profile.spec.ts` — tests
- Create: `src/stores/player.ts` — Pinia store (thin reactive wrapper)
- Delete: `src/stores/counter.ts` — remove template placeholder

---

### Task 1: Types

**Files:**
- Create: `src/lib/player/types.ts`

- [ ] **Step 1: Create types file**

```ts
/**
 * Player profile data model.
 *
 * Defines the structure for player save data persisted to localStorage.
 * Credits are the only currency — earned from missions, spent in the
 * shop (separate system).
 *
 * @author guinetik
 * @date 2026-04-03
 * @spec docs/superpowers/specs/2026-04-03-player-profile-design.md
 */

/** Player save data persisted to localStorage. */
export interface PlayerProfile {
  /** Player display name. Set at profile creation. */
  name: string
  /** Current credit balance. Earned from missions, spent in the shop. */
  credits: number
  /** Total missions completed across all types. Used for difficulty scaling. */
  completedMissionCount: number
  /** Asteroid ID → mission visit count. Incremented once per mission, not per landing. */
  visitedAsteroids: Record<string, number>
}
```

- [ ] **Step 2: Verify it compiles**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/player/types.ts
git commit -m "feat(player): add PlayerProfile type definition"
```

---

### Task 2: Profile Operations — Tests First

**Files:**
- Create: `src/lib/player/__tests__/profile.spec.ts`
- Create: `src/lib/player/profile.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  createProfile,
  saveProfile,
  loadProfile,
  addCredits,
  spendCredits,
  recordMissionComplete,
  recordAsteroidVisit,
  PROFILE_STORAGE_KEY,
} from '../profile'

const mockStorage: Record<string, string> = {}

beforeEach(() => {
  for (const key of Object.keys(mockStorage)) {
    delete mockStorage[key]
  }
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value
      },
      removeItem: (key: string) => {
        delete mockStorage[key]
      },
    },
    writable: true,
  })
})

describe('createProfile', () => {
  it('creates a profile with the given name and zero values', () => {
    const profile = createProfile('Trucker Joe')

    expect(profile.name).toBe('Trucker Joe')
    expect(profile.credits).toBe(0)
    expect(profile.completedMissionCount).toBe(0)
    expect(profile.visitedAsteroids).toEqual({})
  })

  it('preserves the name exactly as given', () => {
    const profile = createProfile('  SpaceCat_42  ')
    expect(profile.name).toBe('  SpaceCat_42  ')
  })
})

describe('saveProfile / loadProfile', () => {
  it('round-trips a profile through localStorage', () => {
    const profile = createProfile('Trucker Joe')
    saveProfile(profile)
    const loaded = loadProfile()

    expect(loaded).toEqual(profile)
  })

  it('returns null when localStorage is empty', () => {
    expect(loadProfile()).toBeNull()
  })

  it('returns null when localStorage contains invalid JSON', () => {
    mockStorage[PROFILE_STORAGE_KEY] = 'not valid json {'
    expect(loadProfile()).toBeNull()
  })

  it('persists complex profile state', () => {
    const profile = createProfile('Trucker Joe')
    const updated = addCredits(
      recordAsteroidVisit(
        recordMissionComplete(profile),
        'bennu',
      ),
      500,
    )
    saveProfile(updated)
    const loaded = loadProfile()

    expect(loaded).toEqual(updated)
    expect(loaded!.credits).toBe(500)
    expect(loaded!.completedMissionCount).toBe(1)
    expect(loaded!.visitedAsteroids).toEqual({ bennu: 1 })
  })
})

describe('addCredits', () => {
  it('adds credits to profile', () => {
    const profile = createProfile('Joe')
    const updated = addCredits(profile, 1000)

    expect(updated.credits).toBe(1000)
  })

  it('does not mutate the original profile', () => {
    const profile = createProfile('Joe')
    addCredits(profile, 1000)

    expect(profile.credits).toBe(0)
  })
})

describe('spendCredits', () => {
  it('deducts credits when sufficient balance', () => {
    const profile = addCredits(createProfile('Joe'), 1000)
    const updated = spendCredits(profile, 300)

    expect(updated).not.toBeNull()
    expect(updated!.credits).toBe(700)
  })

  it('returns null when insufficient credits', () => {
    const profile = addCredits(createProfile('Joe'), 100)
    const updated = spendCredits(profile, 200)

    expect(updated).toBeNull()
  })

  it('succeeds with exact balance (0 remaining)', () => {
    const profile = addCredits(createProfile('Joe'), 500)
    const updated = spendCredits(profile, 500)

    expect(updated).not.toBeNull()
    expect(updated!.credits).toBe(0)
  })

  it('does not mutate the original profile', () => {
    const profile = addCredits(createProfile('Joe'), 1000)
    spendCredits(profile, 300)

    expect(profile.credits).toBe(1000)
  })
})

describe('recordMissionComplete', () => {
  it('increments completedMissionCount by 1', () => {
    const profile = createProfile('Joe')
    const updated = recordMissionComplete(profile)

    expect(updated.completedMissionCount).toBe(1)
  })

  it('does not mutate the original profile', () => {
    const profile = createProfile('Joe')
    recordMissionComplete(profile)

    expect(profile.completedMissionCount).toBe(0)
  })
})

describe('recordAsteroidVisit', () => {
  it('sets count to 1 on first visit', () => {
    const profile = createProfile('Joe')
    const updated = recordAsteroidVisit(profile, 'bennu')

    expect(updated.visitedAsteroids['bennu']).toBe(1)
  })

  it('increments count on subsequent visits', () => {
    const profile = createProfile('Joe')
    const v1 = recordAsteroidVisit(profile, 'bennu')
    const v2 = recordAsteroidVisit(v1, 'bennu')

    expect(v2.visitedAsteroids['bennu']).toBe(2)
  })

  it('does not affect other asteroid counts', () => {
    const profile = createProfile('Joe')
    const v1 = recordAsteroidVisit(profile, 'bennu')
    const v2 = recordAsteroidVisit(v1, 'psyche')

    expect(v2.visitedAsteroids['bennu']).toBe(1)
    expect(v2.visitedAsteroids['psyche']).toBe(1)
  })

  it('does not mutate the original profile', () => {
    const profile = createProfile('Joe')
    recordAsteroidVisit(profile, 'bennu')

    expect(profile.visitedAsteroids).toEqual({})
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/player/__tests__/profile.spec.ts`
Expected: FAIL — cannot import from `../profile`

- [ ] **Step 3: Implement profile operations**

```ts
/**
 * Player profile operations.
 *
 * Pure functions for creating, loading, saving, and updating player
 * profiles. All update functions return new profile objects — they
 * never mutate the input. localStorage is the only side effect,
 * isolated to saveProfile/loadProfile.
 *
 * @author guinetik
 * @date 2026-04-03
 * @spec docs/superpowers/specs/2026-04-03-player-profile-design.md
 */
import type { PlayerProfile } from './types'

/** localStorage key for the player profile. */
export const PROFILE_STORAGE_KEY = 'asteroid-lander-profile'

/** Create a fresh profile with zero progress. */
export function createProfile(name: string): PlayerProfile {
  return {
    name,
    credits: 0,
    completedMissionCount: 0,
    visitedAsteroids: {},
  }
}

/** Serialize and save the profile to localStorage. */
export function saveProfile(profile: PlayerProfile): void {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
}

/** Load the profile from localStorage. Returns null if missing or corrupted. */
export function loadProfile(): PlayerProfile | null {
  const raw = localStorage.getItem(PROFILE_STORAGE_KEY)
  if (raw === null) return null
  try {
    return JSON.parse(raw) as PlayerProfile
  } catch {
    return null
  }
}

/** Return a new profile with credits increased by the given amount. */
export function addCredits(profile: PlayerProfile, amount: number): PlayerProfile {
  return { ...profile, credits: profile.credits + amount }
}

/** Return a new profile with credits decreased, or null if insufficient balance. */
export function spendCredits(profile: PlayerProfile, amount: number): PlayerProfile | null {
  if (profile.credits < amount) return null
  return { ...profile, credits: profile.credits - amount }
}

/** Return a new profile with completedMissionCount incremented by 1. */
export function recordMissionComplete(profile: PlayerProfile): PlayerProfile {
  return { ...profile, completedMissionCount: profile.completedMissionCount + 1 }
}

/** Return a new profile with the visit count for the given asteroid incremented by 1. */
export function recordAsteroidVisit(profile: PlayerProfile, asteroidId: string): PlayerProfile {
  const currentCount = profile.visitedAsteroids[asteroidId] ?? 0
  return {
    ...profile,
    visitedAsteroids: {
      ...profile.visitedAsteroids,
      [asteroidId]: currentCount + 1,
    },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/player/__tests__/profile.spec.ts`
Expected: All 14 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/player/profile.ts src/lib/player/__tests__/profile.spec.ts
git commit -m "feat(player): implement profile operations with tests"
```

---

### Task 3: Pinia Store

**Files:**
- Create: `src/stores/player.ts`
- Delete: `src/stores/counter.ts`

- [ ] **Step 1: Create the Pinia store**

```ts
/**
 * Player profile Pinia store.
 *
 * Thin reactive wrapper around the pure profile functions in
 * src/lib/player/profile.ts. Auto-saves to localStorage after
 * every mutation.
 *
 * @author guinetik
 * @date 2026-04-03
 * @spec docs/superpowers/specs/2026-04-03-player-profile-design.md
 */
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { PlayerProfile } from '@/lib/player/types'
import {
  createProfile,
  loadProfile,
  saveProfile,
  addCredits as addCreditsToProfile,
  spendCredits as spendCreditsFromProfile,
  recordMissionComplete as recordMissionCompleteOnProfile,
  recordAsteroidVisit as recordAsteroidVisitOnProfile,
} from '@/lib/player/profile'

/** Reactive player profile store with auto-save to localStorage. */
export const usePlayerStore = defineStore('player', () => {
  const profile = ref<PlayerProfile | null>(loadProfile())

  /** Whether a player profile exists. */
  const hasProfile = computed(() => profile.value !== null)

  /** Check if the player can afford a given amount. */
  function canAfford(amount: number): boolean {
    return profile.value !== null && profile.value.credits >= amount
  }

  /** Create a new profile with the given name and save it. */
  function create(name: string) {
    profile.value = createProfile(name)
    saveProfile(profile.value)
  }

  /** Add credits to the player's balance. */
  function addCredits(amount: number) {
    if (!profile.value) return
    profile.value = addCreditsToProfile(profile.value, amount)
    saveProfile(profile.value)
  }

  /** Spend credits. Returns false if insufficient balance. */
  function spendCredits(amount: number): boolean {
    if (!profile.value) return false
    const updated = spendCreditsFromProfile(profile.value, amount)
    if (!updated) return false
    profile.value = updated
    saveProfile(profile.value)
    return true
  }

  /** Record a completed mission. */
  function recordMissionComplete() {
    if (!profile.value) return
    profile.value = recordMissionCompleteOnProfile(profile.value)
    saveProfile(profile.value)
  }

  /** Record an asteroid visit (once per mission, not per landing). */
  function recordAsteroidVisit(asteroidId: string) {
    if (!profile.value) return
    profile.value = recordAsteroidVisitOnProfile(profile.value, asteroidId)
    saveProfile(profile.value)
  }

  return {
    profile,
    hasProfile,
    canAfford,
    create,
    addCredits,
    spendCredits,
    recordMissionComplete,
    recordAsteroidVisit,
  }
})
```

- [ ] **Step 2: Delete the template counter store**

Delete `src/stores/counter.ts`.

- [ ] **Step 3: Verify it compiles**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/stores/player.ts
git rm src/stores/counter.ts
git commit -m "feat(player): add Pinia store, remove template counter"
```

---

### Task 4: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `bun test:unit --run`
Expected: All tests PASS. Note: the existing `src/__tests__/App.spec.ts` may fail if it references the counter store — if so, update it to remove the counter dependency.

- [ ] **Step 2: Run lint**

Run: `bun lint`
Expected: PASS

- [ ] **Step 3: Run build**

Run: `bun run build`
Expected: PASS

- [ ] **Step 4: Commit any fixes**

If App.spec.ts needed updating or lint auto-fixed anything:
```bash
git add -A
git commit -m "fix: update App test after counter store removal"
```
