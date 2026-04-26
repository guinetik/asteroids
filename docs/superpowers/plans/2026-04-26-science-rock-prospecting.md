# Science Rock Prospecting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the science gun prospect rocks — multi-hit science HP with a wireframe overlay ramp, completion toast + audio, and bonus mineral grants on the eventual drill-depletion of a prospected rock.

**Architecture:** Extend the existing `RockYieldSystem` with science HP and a prospected flag (pure TS, fully unit-tested). Route science bolts through a new `closestRockHit`-style branch in `ProjectileSystem`. Render the wireframe overlay via a new lightweight Three.js controller that lazily creates one wireframe-material mesh per prospected/in-progress rock. Wire toast + audio in `LevelView.vue` and `LevelAudioDirector` using the existing pickup-toast pipeline as a sibling array.

**Tech Stack:** Vue 3 + TypeScript, Three.js (instanced rocks, additive wireframe overlay), Vitest (unit tests in `src/lib/`), Bun for scripts. Spec: `docs/superpowers/specs/2026-04-26-science-rock-prospecting-design.md`.

---

## File Structure

**New files:**
- `src/three/ProspectOverlayController.ts` — wireframe overlay manager, one mesh per rock, opacity driven by `RockYieldSystem` callbacks.

**Modified:**
- `src/lib/mining/constants.ts` — add prospect tunables.
- `src/lib/mining/rockYieldSystem.ts` — science HP fields, `scienceHit`, `isProspected`, `getScienceProgress`, `onScienceProgress`, `onRockProspected`, bonus rolls in `mineRock`.
- `src/lib/mining/__tests__/rockYieldSystem.spec.ts` — tests for every new behavior.
- `src/lib/fps/projectileSystem.ts` — add `'science_rock'` impact kind, science-bolt → rock routing, `onScienceRockHit` callback, accept rock registrations regardless of bolt kind.
- `src/audio/audioManifest.ts` — register `sfx.tool.prospectComplete`.
- `src/audio/LevelAudioDirector.ts` — `notifyProspectComplete(worldPos, listener)`.
- `src/lib/level/LevelCombatMiningFacade.ts` — wire `onScienceRockHit` → `scienceHit`, wire `onRockProspected` and `onScienceProgress` to the host.
- `src/views/LevelViewController.ts` — expose new `onProspect` host callback, instantiate `ProspectOverlayController`, register it in scene, wire facade bindings.
- `src/views/LevelView.vue` — sibling `prospectPickups: ProspectEntry[]` array, render in PickupToast stack, `onProspect` handler.
- `src/components/PickupToast.vue` — render an optional `prospectEntries` prop alongside mineral entries.

---

## Task 1: Add prospecting tunables to `constants.ts`

**Files:**
- Modify: `src/lib/mining/constants.ts`

- [ ] **Step 1: Append tunables at the bottom of the file**

Add after the existing `BOLT_DAMAGE_KG_PER_HIT` export:

```ts
/** Fraction of total kg used to derive a rock's science HP (prospecting). */
export const SCIENCE_HP_RATIO = 0.33

/** Lower clamp on the bonus grant kg from a depleted prospected rock. */
export const MIN_PROSPECT_BONUS_KG = 2

/** Bonus grant kg = max(MIN_PROSPECT_BONUS_KG, ceil(totalKg * PROSPECT_BONUS_RATIO)). */
export const PROSPECT_BONUS_RATIO = 0.10

/** Probability that a depleted prospected rock fires a second composition-weighted grant. */
export const PROSPECT_SECOND_ROLL_CHANCE = 0.25

/** Salt for the trigger draw that decides whether the second roll fires. */
export const PROSPECT_TRIGGER_SALT = 0x9e3779b9

/** Salt for the bonus item-id draw, distinct from PROSPECT_TRIGGER_SALT so the two are uncorrelated. */
export const PROSPECT_ITEM_SALT = 0x85ebca77
```

- [ ] **Step 2: Verify type-check passes**

Run: `bun run type-check`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/mining/constants.ts
git commit -m "feat(mining): add prospecting tunables to constants"
```

---

## Task 2: Add science HP fields and `getScienceProgress` to `RockYieldSystem` (TDD)

**Files:**
- Test: `src/lib/mining/__tests__/rockYieldSystem.spec.ts`
- Modify: `src/lib/mining/rockYieldSystem.ts`

- [ ] **Step 1: Write failing test for initial science HP**

Append to the existing `describe('RockYieldSystem', () => { ... })` block, just before its closing `})`:

```ts
  it('seeds science HP at ceil(totalKg * SCIENCE_HP_RATIO) with a per-bolt floor', () => {
    const sys = makeSystem()
    sys.registerRock({ spawnIndex: 100, diameter: 5 })
    const rock = sys.peekRock(100)!
    const expectedRaw = Math.ceil(rock.totalKg * 0.33)
    const expected = Math.max(BOLT_DAMAGE_KG_PER_HIT, expectedRaw)
    const progress = sys.getScienceProgress(100)
    expect(progress).not.toBeNull()
    expect(progress!.scienceHp).toBe(expected)
    expect(progress!.initialScienceHp).toBe(expected)
    expect(progress!.prospected).toBe(false)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test:unit src/lib/mining/__tests__/rockYieldSystem.spec.ts`
Expected: FAIL with `sys.getScienceProgress is not a function`.

- [ ] **Step 3: Add new fields to `RockRoll` and seed them in `registerRock`**

In `src/lib/mining/rockYieldSystem.ts`:

Add the import for the new constant near the existing constants import:
```ts
import {
  BOLT_DAMAGE_KG_PER_HIT,
  MAX_ROCK_YIELD_KG,
  MIN_PROSPECT_BONUS_KG,
  MIN_ROCK_YIELD_KG,
  MINERAL_KG_PER_DIAMETER_UNIT,
  PROSPECT_BONUS_RATIO,
  PROSPECT_ITEM_SALT,
  PROSPECT_SECOND_ROLL_CHANCE,
  PROSPECT_TRIGGER_SALT,
  SCIENCE_HP_RATIO,
} from './constants'
```

(Some imports may already exist — keep them deduplicated; the list above is the final set.)

Replace the `RockRoll` interface (currently `interface RockRoll { itemId: string; totalKg: number; remainingKg: number }`) with:

```ts
/** Per-rock roll registered when the rock is spawned. */
interface RockRoll {
  /** Inventory item id for this rock (rolled at registration). */
  itemId: string
  /** Total kg available at registration. */
  totalKg: number
  /** Remaining kg after drill hits. Reaches 0 on depletion. */
  remainingKg: number
  /** Remaining science HP for prospecting, in kg-equivalent units. */
  scienceHp: number
  /** Initial science HP, used to normalize wireframe-overlay opacity. */
  initialScienceHp: number
  /** Whether this rock has been fully analysed by the science gun. */
  prospected: boolean
}
```

In `registerRock`, after `const totalKg = spawn.totalKgOverride ?? this.rollTotalKg(spawn.diameter)`, change the `this.rocks.set` line to seed the new fields:

```ts
const initialScienceHp = Math.max(
  BOLT_DAMAGE_KG_PER_HIT,
  Math.ceil(totalKg * SCIENCE_HP_RATIO),
)
this.rocks.set(spawn.spawnIndex, {
  itemId,
  totalKg,
  remainingKg: totalKg,
  scienceHp: initialScienceHp,
  initialScienceHp,
  prospected: false,
})
```

Add the new public method just below `peekRock`:

```ts
/**
 * Inspect the prospecting state for a rock without mutating it. Returns
 * `null` when the rock is unknown.
 */
getScienceProgress(spawnIndex: number): {
  scienceHp: number
  initialScienceHp: number
  prospected: boolean
} | null {
  const roll = this.rocks.get(spawnIndex)
  if (!roll) return null
  return {
    scienceHp: roll.scienceHp,
    initialScienceHp: roll.initialScienceHp,
    prospected: roll.prospected,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test:unit src/lib/mining/__tests__/rockYieldSystem.spec.ts`
Expected: PASS. All previously-passing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mining/rockYieldSystem.ts src/lib/mining/__tests__/rockYieldSystem.spec.ts
git commit -m "feat(mining): seed per-rock science HP in RockYieldSystem"
```

---

## Task 3: `scienceHit` mutation with `onScienceProgress` and `onRockProspected` callbacks (TDD)

**Files:**
- Test: `src/lib/mining/__tests__/rockYieldSystem.spec.ts`
- Modify: `src/lib/mining/rockYieldSystem.ts`

- [ ] **Step 1: Write failing tests for the prospect lifecycle**

Append to the same `describe` block:

```ts
  it('decrements science HP per scienceHit and fires onScienceProgress', () => {
    const sys = makeSystem()
    const events: { idx: number; hp: number; initial: number }[] = []
    sys.onScienceProgress = (idx, hp, initial) => events.push({ idx, hp, initial })
    sys.registerRock({ spawnIndex: 5, diameter: 1 })
    const initial = sys.getScienceProgress(5)!.initialScienceHp
    const result = sys.scienceHit(5)
    expect(result).not.toBeNull()
    expect(result!.scienceHp).toBe(Math.max(0, initial - BOLT_DAMAGE_KG_PER_HIT))
    expect(result!.initialScienceHp).toBe(initial)
    expect(events).toEqual([{ idx: 5, hp: result!.scienceHp, initial }])
  })

  it('flips prospected exactly once when scienceHp reaches zero', () => {
    const sys = makeSystem({ boltDamageKg: 4 })
    const prospects: { idx: number; itemId: string }[] = []
    sys.onRockProspected = (idx, itemId) => prospects.push({ idx, itemId })
    sys.registerRock({ spawnIndex: 7, diameter: 5 })
    const initial = sys.getScienceProgress(7)!.initialScienceHp

    let safety = 100
    let lastResult = sys.scienceHit(7)
    while (lastResult && !lastResult.prospected && safety-- > 0) {
      lastResult = sys.scienceHit(7)
    }
    expect(lastResult?.prospected).toBe(true)
    expect(prospects.length).toBe(1)
    expect(prospects[0]!.idx).toBe(7)
    expect(prospects[0]!.itemId).toBe(sys.peekRock(7)!.itemId)
    expect(sys.isProspected(7)).toBe(true)
    expect(initial).toBeGreaterThan(0)
  })

  it('returns null and fires no callbacks for science hits on already-prospected rocks', () => {
    const sys = makeSystem()
    sys.registerRock({ spawnIndex: 9, diameter: 1 })
    const initial = sys.getScienceProgress(9)!.initialScienceHp
    const hits = Math.ceil(initial / BOLT_DAMAGE_KG_PER_HIT)
    for (let i = 0; i < hits; i++) sys.scienceHit(9)
    expect(sys.isProspected(9)).toBe(true)

    let progressCount = 0
    let prospectCount = 0
    sys.onScienceProgress = () => progressCount++
    sys.onRockProspected = () => prospectCount++
    expect(sys.scienceHit(9)).toBeNull()
    expect(progressCount).toBe(0)
    expect(prospectCount).toBe(0)
  })

  it('returns null for scienceHit on unknown spawn indices', () => {
    const sys = makeSystem()
    expect(sys.scienceHit(404)).toBeNull()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/mining/__tests__/rockYieldSystem.spec.ts`
Expected: 4 new tests FAIL with `sys.scienceHit is not a function`.

- [ ] **Step 3: Add `scienceHit`, `isProspected`, and the two callbacks**

In `src/lib/mining/rockYieldSystem.ts`, add the callbacks above the existing `onConsume` declaration (so they sit with the other callbacks):

```ts
/**
 * Fired on every science-hit while not yet prospected. Drives the
 * wireframe-overlay opacity ramp.
 */
onScienceProgress:
  ((spawnIndex: number, scienceHp: number, initialScienceHp: number) => void) | null = null

/**
 * Fired exactly once per rock when scienceHp first reaches 0.
 * Listeners chain themselves with the same wrap-and-call pattern
 * `onMineralExtracted` already uses.
 */
onRockProspected: ((spawnIndex: number, itemId: string) => void) | null = null
```

Add `scienceHit` and `isProspected` as public methods just below `getScienceProgress`:

```ts
/**
 * Apply one science-bolt hit to the rock at `spawnIndex`. No-op (returns
 * `null`) when the rock is unknown or already prospected. Returns the
 * updated state on success — callers use `prospected` to know whether
 * THIS hit completed the analysis.
 */
scienceHit(spawnIndex: number): {
  prospected: boolean
  scienceHp: number
  initialScienceHp: number
} | null {
  const roll = this.rocks.get(spawnIndex)
  if (!roll) return null
  if (roll.prospected) return null

  roll.scienceHp = Math.max(0, roll.scienceHp - this.boltDamageKg)
  const justProspected = roll.scienceHp <= 0
  if (justProspected) {
    roll.prospected = true
  }

  this.onScienceProgress?.(spawnIndex, roll.scienceHp, roll.initialScienceHp)
  if (justProspected) {
    this.onRockProspected?.(spawnIndex, roll.itemId)
  }
  return {
    prospected: roll.prospected,
    scienceHp: roll.scienceHp,
    initialScienceHp: roll.initialScienceHp,
  }
}

/** Whether this rock has been fully analysed. */
isProspected(spawnIndex: number): boolean {
  return this.rocks.get(spawnIndex)?.prospected ?? false
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/mining/__tests__/rockYieldSystem.spec.ts`
Expected: PASS for all four new tests; previously-passing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mining/rockYieldSystem.ts src/lib/mining/__tests__/rockYieldSystem.spec.ts
git commit -m "feat(mining): scienceHit lifecycle with progress + prospect callbacks"
```

---

## Task 4: Bonus rolls on drill-depletion of prospected rocks (TDD)

**Files:**
- Test: `src/lib/mining/__tests__/rockYieldSystem.spec.ts`
- Modify: `src/lib/mining/rockYieldSystem.ts`

- [ ] **Step 1: Find seeds whose pseudoRandom outcomes are known**

The `pseudoRandom(seed, salt)` helper in `rockYieldSystem.ts` is deterministic. The test below pins specific `(seed, spawnIndex)` fixtures whose `pseudoRandom(seed, spawnIndex ^ PROSPECT_TRIGGER_SALT)` value falls below or above `PROSPECT_SECOND_ROLL_CHANCE` (0.25).

Run this throwaway probe in `bun repl`:

```bash
bun repl
```

Inside REPL:

```js
const pseudoRandom = (seed, salt) => {
  let s = ((seed | 0) * 0x9e3779b1) ^ ((salt | 0) * 0x85ebca77)
  s = (s + 0x6d2b79f5) | 0
  let t = Math.imul(s ^ (s >>> 15), 1 | s)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const TRIGGER = 0x9e3779b9
for (let seed = 1; seed < 100; seed++) {
  for (let idx = 0; idx < 10; idx++) {
    const r = pseudoRandom(seed, idx ^ TRIGGER)
    if (r < 0.25) console.log('FIRES', seed, idx, r.toFixed(3))
  }
}
```

Pick one `(seed, spawnIndex)` whose printed `r < 0.25` (e.g. record it as `FIRES_SEED`/`FIRES_INDEX`) and one with `r >= 0.25` (`SKIP_SEED`/`SKIP_INDEX` from a quick adjacent loop, or simply use the unmatched outputs). Quit REPL with `process.exit()`.

- [ ] **Step 2: Write failing tests**

Append to the same `describe` block. Replace `<FIRES_SEED>`, `<FIRES_INDEX>`, `<SKIP_SEED>`, `<SKIP_INDEX>` with the values you recorded:

```ts
  it('fires no bonus grants when a non-prospected rock depletes', () => {
    const sys = makeSystem({ boltDamageKg: MAX_ROCK_YIELD_KG })
    const grants: { itemId: string; kg: number; idx: number }[] = []
    sys.onMineralExtracted = (itemId, kg, idx) => grants.push({ itemId, kg, idx })
    sys.registerRock({ spawnIndex: 1, diameter: 4 })
    sys.mineRock(1)
    expect(grants.length).toBe(1)
  })

  it('fires the guaranteed bonus on depletion of a prospected rock', () => {
    const sys = new RockYieldSystem({
      composition: COMPOSITION,
      seed: <SKIP_SEED>,
      boltDamageKg: MAX_ROCK_YIELD_KG,
    })
    const grants: { itemId: string; kg: number; idx: number }[] = []
    sys.onMineralExtracted = (itemId, kg, idx) => grants.push({ itemId, kg, idx })
    sys.registerRock({ spawnIndex: <SKIP_INDEX>, diameter: 4 })
    const rock = sys.peekRock(<SKIP_INDEX>)!
    // Force prospected without simulating science hits
    sys.registerRock({ spawnIndex: <SKIP_INDEX>, diameter: 4 })
    sys['rocks'].get(<SKIP_INDEX>)!.prospected = true
    sys.mineRock(<SKIP_INDEX>)
    // 1 normal grant + 1 guaranteed bonus = 2; trigger roll skipped at this seed.
    expect(grants.length).toBe(2)
    expect(grants[1]!.itemId).toBe(rock.itemId)
    const expectedKg = Math.max(2, Math.ceil(rock.totalKg * 0.10))
    expect(grants[1]!.kg).toBe(expectedKg)
  })

  it('fires both bonuses when the trigger roll lands below threshold', () => {
    const sys = new RockYieldSystem({
      composition: COMPOSITION,
      seed: <FIRES_SEED>,
      boltDamageKg: MAX_ROCK_YIELD_KG,
    })
    const grants: { itemId: string; kg: number; idx: number }[] = []
    sys.onMineralExtracted = (itemId, kg, idx) => grants.push({ itemId, kg, idx })
    sys.registerRock({ spawnIndex: <FIRES_INDEX>, diameter: 4 })
    sys['rocks'].get(<FIRES_INDEX>)!.prospected = true
    sys.mineRock(<FIRES_INDEX>)
    // 1 normal grant + 1 guaranteed bonus + 1 jackpot = 3.
    expect(grants.length).toBe(3)
  })

  it('produces the same bonus item id across runs of the same seed', () => {
    const a = new RockYieldSystem({
      composition: COMPOSITION,
      seed: <FIRES_SEED>,
      boltDamageKg: MAX_ROCK_YIELD_KG,
    })
    const b = new RockYieldSystem({
      composition: COMPOSITION,
      seed: <FIRES_SEED>,
      boltDamageKg: MAX_ROCK_YIELD_KG,
    })
    const grantsA: string[] = []
    const grantsB: string[] = []
    a.onMineralExtracted = (itemId) => grantsA.push(itemId)
    b.onMineralExtracted = (itemId) => grantsB.push(itemId)
    a.registerRock({ spawnIndex: <FIRES_INDEX>, diameter: 4 })
    b.registerRock({ spawnIndex: <FIRES_INDEX>, diameter: 4 })
    a['rocks'].get(<FIRES_INDEX>)!.prospected = true
    b['rocks'].get(<FIRES_INDEX>)!.prospected = true
    a.mineRock(<FIRES_INDEX>)
    b.mineRock(<FIRES_INDEX>)
    expect(grantsA).toEqual(grantsB)
  })
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test:unit src/lib/mining/__tests__/rockYieldSystem.spec.ts`
Expected: the 3 bonus-firing tests FAIL (only 1 grant fires); the "no bonus on non-prospected" test passes already.

- [ ] **Step 4: Implement bonus rolls in `mineRock`**

In `src/lib/mining/rockYieldSystem.ts`, replace the body of `mineRock`'s depletion branch. The current code is:

```ts
this.onMineralExtracted?.(roll.itemId, granted, spawnIndex)

if (depleted) {
  this.rocks.delete(spawnIndex)
  this.onConsume?.(spawnIndex)
}

return { itemId: roll.itemId, kgGranted: granted, depleted }
```

Replace with:

```ts
this.onMineralExtracted?.(roll.itemId, granted, spawnIndex)

if (depleted && roll.prospected) {
  const bonusKg = Math.max(
    MIN_PROSPECT_BONUS_KG,
    Math.ceil(roll.totalKg * PROSPECT_BONUS_RATIO),
  )
  // Guaranteed: another grant of the rock's primary mineral.
  this.onMineralExtracted?.(roll.itemId, bonusKg, spawnIndex)
  // 25% chance: a second composition-weighted grant. Two distinct salts
  // keep trigger and item-id draws statistically independent.
  const trigger = pseudoRandom(this.seed, spawnIndex ^ PROSPECT_TRIGGER_SALT)
  if (trigger < PROSPECT_SECOND_ROLL_CHANCE) {
    const rolledItemId = this.rollMineralFromSalted(
      this.weightedItems,
      spawnIndex,
      PROSPECT_ITEM_SALT,
    )
    this.onMineralExtracted?.(rolledItemId, bonusKg, spawnIndex)
  }
}

if (depleted) {
  this.rocks.delete(spawnIndex)
  this.onConsume?.(spawnIndex)
}

return { itemId: roll.itemId, kgGranted: granted, depleted }
```

Add the salted-roll helper as a private method just below `rollMineralFrom`:

```ts
/**
 * Roll a mineral from a weighted list using a salted pseudo-random draw.
 * Used by prospecting bonus rolls so the second grant's item-id draw is
 * statistically independent of the primary roll for the same rock.
 */
private rollMineralFromSalted(
  items: { itemId: string; weight: number }[],
  spawnIndex: number,
  salt: number,
): string {
  const r = pseudoRandom(this.seed, spawnIndex ^ salt)
  const totalWeight = items.reduce((sum, entry) => sum + entry.weight, 0)
  const target = r * totalWeight
  let acc = 0
  for (const entry of items) {
    acc += entry.weight
    if (target < acc) return entry.itemId
  }
  return items[items.length - 1]!.itemId
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test:unit src/lib/mining/__tests__/rockYieldSystem.spec.ts`
Expected: ALL tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mining/rockYieldSystem.ts src/lib/mining/__tests__/rockYieldSystem.spec.ts
git commit -m "feat(mining): bonus mineral rolls on drill-depletion of prospected rocks"
```

---

## Task 5: Add `'science_rock'` impact kind and `onScienceRockHit` callback to `ProjectileSystem`

**Files:**
- Modify: `src/lib/fps/projectileSystem.ts`

- [ ] **Step 1: Extend `ProjectileImpactKind` and add the new callback**

In `src/lib/fps/projectileSystem.ts`, change:

```ts
export type ProjectileImpactKind = 'terrain' | 'drill_rock' | 'enemy' | 'hostage'
```

to:

```ts
export type ProjectileImpactKind = 'terrain' | 'drill_rock' | 'science_rock' | 'enemy' | 'hostage'
```

Add a new callback declaration right below the existing `onRockHit` declaration:

```ts
/**
 * Called when a **science** bolt hits a registered mineable rock.
 *
 * @param spawnIndex - Stable id of the hit rock.
 * @param position - **Transient** impact point. Mutated on the next
 *   callback; copy if you need to keep it past the synchronous handler body.
 */
onScienceRockHit: ((spawnIndex: number, position: THREE.Vector3) => void) | null = null
```

- [ ] **Step 2: Verify type-check still passes**

Run: `bun run type-check`
Expected: no errors. The `'science_rock'` value isn't yet emitted anywhere.

- [ ] **Step 3: Commit**

```bash
git add src/lib/fps/projectileSystem.ts
git commit -m "feat(fps): add science_rock impact kind and onScienceRockHit callback"
```

---

## Task 6: Route science bolts through `closestRockHit` in `ProjectileSystem.tick`

**Files:**
- Modify: `src/lib/fps/projectileSystem.ts`

The current science branch falls through to a TODO when neither hostage nor lander is hit. We add a third routing target so science bolts now stop on rocks and call `onScienceRockHit`.

- [ ] **Step 1: Locate the science branch in `tick`**

Open `src/lib/fps/projectileSystem.ts` and find the block beginning with `if (p.boltKind === 'science') {`. Inside, after the `else if (this.lander) { ... }` branch, there's an `else { /* TODO: ... */ }` clause.

- [ ] **Step 2: Replace the science fallthrough branch with rock routing**

Replace the existing science branch:

```ts
if (p.boltKind === 'science') {
  const hostageHit = this.closestHostageHealHit(this._prevPos, pos)
  if (hostageHit) {
    hostageHit.hostage.heal(HEAL_BOLT_AMOUNT)
    this._callbackPos.copy(pos)
    this.onHostageBolt?.(hostageHit.hostage, this._callbackPos, 'heal')
    hitHostage = true
  } else if (this.lander) {
    // Science bolt hits lander → heal hull + green glow pulse (Prey-style)
    this.lander.group.getWorldPosition(this._landerCenter)
    const distSq = pos.distanceToSquared(this._landerCenter)
    if (distSq < 180) {  // ~13.4 unit radius around lander center
      const healAmount = HEAL_BOLT_AMOUNT
      this.lander.healHull(healAmount)
      this._callbackPos.copy(pos)
      // Trigger impact for VFX (green sparks could be added in onImpact)
      hitHostage = true  // reuse flag to trigger onImpact
    }
  } else {
    // TODO: full resolver for rocks, terminals, enemies, terrain crater
    this._callbackPos.copy(pos)
  }
}
```

with:

```ts
if (p.boltKind === 'science') {
  const hostageHit = this.closestHostageHealHit(this._prevPos, pos)
  if (hostageHit) {
    hostageHit.hostage.heal(HEAL_BOLT_AMOUNT)
    this._callbackPos.copy(pos)
    this.onHostageBolt?.(hostageHit.hostage, this._callbackPos, 'heal')
    hitHostage = true
  } else {
    let landerHit = false
    if (this.lander) {
      this.lander.group.getWorldPosition(this._landerCenter)
      const distSq = pos.distanceToSquared(this._landerCenter)
      if (distSq < 180) {
        this.lander.healHull(HEAL_BOLT_AMOUNT)
        this._callbackPos.copy(pos)
        hitHostage = true // reuse flag so onImpact fires for VFX
        landerHit = true
      }
    }
    if (!landerHit) {
      const rockHit = this.closestRockHit(this._prevPos, pos)
      if (rockHit) {
        this._callbackPos.copy(pos)
        this.onScienceRockHit?.(rockHit.spawnIndex, this._callbackPos)
        hitRock = true
      }
    }
  }
}
```

- [ ] **Step 3: Update the impact-kind classification block**

Find the block in `tick` that decides the `ProjectileImpactKind` for `onImpact` (around line 380, where the variable `kind: ProjectileImpactKind` is set). Currently it distinguishes `enemy`, `hostage`, `drill_rock`, `terrain`. Add a `science_rock` case.

The existing block looks like (verify before editing):

```ts
let kind: ProjectileImpactKind
if (hitEnemy) kind = 'enemy'
else if (hitHostage) kind = 'hostage'
else if (hitRock) kind = p.boltKind === 'drill' ? 'drill_rock' : 'terrain'
else kind = 'terrain'
```

Change the `hitRock` line to:

```ts
else if (hitRock) {
  if (p.boltKind === 'drill') kind = 'drill_rock'
  else if (p.boltKind === 'science') kind = 'science_rock'
  else kind = 'terrain'
}
```

(If the existing block already maps differently — e.g. ternary chains — adapt the same logic. Goal: `boltKind === 'science'` AND `hitRock` ⇒ `kind = 'science_rock'`.)

- [ ] **Step 4: Run type-check and existing tests**

Run: `bun run type-check && bun test:unit`
Expected: no type errors; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fps/projectileSystem.ts
git commit -m "feat(fps): route science bolts to rocks via onScienceRockHit"
```

---

## Task 7: New `ProspectOverlayController`

**Files:**
- Create: `src/three/ProspectOverlayController.ts`

This controller manages one wireframe-overlay mesh per registered rock. The overlay is **lazily created on first science hit** so untouched rocks pay zero cost. The controller exposes register/unregister hooks and an update method.

- [ ] **Step 1: Create the controller**

Write `src/three/ProspectOverlayController.ts`:

```ts
/**
 * Wireframe overlay that fades in over a rock as the science gun
 * prospects it, locks at full opacity once analysed, and disposes when
 * the rock is consumed.
 *
 * The overlay is a per-rock {@link THREE.Mesh} parented to the scene at
 * the rock's world position. Geometry is cloned from the rock instance's
 * source `THREE.InstancedMesh` so the wireframe traces the actual rock
 * silhouette. Lazily created on first science hit — rocks the player
 * never scans cost nothing.
 *
 * @author guinetik
 * @date 2026-04-26
 * @spec docs/superpowers/specs/2026-04-26-science-rock-prospecting-design.md
 */
import * as THREE from 'three'
import type { SurfaceRockController } from '@/three/controllers/SurfaceRockController'
import type { Heightmap } from '@/lib/terrain/heightmap'

/** Wireframe overlay color (matches science mode green). */
const WIREFRAME_COLOR = 0x22c55e
/** Maximum opacity reached as science HP approaches 0. */
const WIREFRAME_MAX_OPACITY = 0.7
/** Final opacity when the rock is fully prospected. */
const WIREFRAME_FULL_OPACITY = 0.9
/** Polygon offset factor / units to lift wireframe above the rock surface. */
const POLYGON_OFFSET_FACTOR = -1
const POLYGON_OFFSET_UNITS = -1

/**
 * Per-rock prospect wireframe overlay.
 *
 * @author guinetik
 * @date 2026-04-26
 * @spec docs/superpowers/specs/2026-04-26-science-rock-prospecting-design.md
 */
export class ProspectOverlayController {
  private readonly scene: THREE.Scene
  private readonly surfaceRocks: SurfaceRockController
  private readonly heightmap: Heightmap
  /** spawnIndex → overlay mesh + material. */
  private readonly overlays = new Map<
    number,
    { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial }
  >()
  /** Reused scratch — rock world center. */
  private readonly _center = new THREE.Vector3()

  constructor(scene: THREE.Scene, surfaceRocks: SurfaceRockController, heightmap: Heightmap) {
    this.scene = scene
    this.surfaceRocks = surfaceRocks
    this.heightmap = heightmap
  }

  /**
   * Update overlay opacity as a rock accumulates science hits. Lazily
   * creates the overlay mesh on the first call for `spawnIndex`.
   */
  updateProgress(spawnIndex: number, scienceHp: number, initialScienceHp: number): void {
    const overlay = this.overlays.get(spawnIndex) ?? this.createOverlay(spawnIndex)
    if (!overlay) return
    const ratio = initialScienceHp <= 0 ? 1 : 1 - scienceHp / initialScienceHp
    overlay.material.opacity = THREE.MathUtils.clamp(ratio * WIREFRAME_MAX_OPACITY, 0, WIREFRAME_MAX_OPACITY)
    overlay.material.needsUpdate = true
  }

  /** Lock the overlay at full opacity once the rock is fully prospected. */
  markProspected(spawnIndex: number): void {
    const overlay = this.overlays.get(spawnIndex) ?? this.createOverlay(spawnIndex)
    if (!overlay) return
    overlay.material.opacity = WIREFRAME_FULL_OPACITY
    overlay.material.needsUpdate = true
  }

  /** Tear down the overlay for a consumed rock. */
  remove(spawnIndex: number): void {
    const overlay = this.overlays.get(spawnIndex)
    if (!overlay) return
    this.scene.remove(overlay.mesh)
    overlay.material.dispose()
    overlay.mesh.geometry.dispose()
    this.overlays.delete(spawnIndex)
  }

  /** Tear down every overlay (e.g. on scene exit). */
  dispose(): void {
    for (const spawnIndex of Array.from(this.overlays.keys())) {
      this.remove(spawnIndex)
    }
  }

  /** Create the overlay mesh for `spawnIndex`. Returns null if the rock is unknown. */
  private createOverlay(
    spawnIndex: number,
  ): { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial } | null {
    const center = this.surfaceRocks.getRockCenter(spawnIndex, this.heightmap, this._center)
    if (!center) return null
    const radius = this.surfaceRocks.getRockRadius(spawnIndex)
    if (radius === null) return null

    // A low-poly icosphere is enough to read as "wireframe scan" without
    // duplicating the GLB instance geometry. Rotated subtly per-rock so
    // adjacent prospected rocks don't form a pattern.
    const geometry = new THREE.IcosahedronGeometry(radius, 1)

    const material = new THREE.MeshBasicMaterial({
      color: WIREFRAME_COLOR,
      wireframe: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: POLYGON_OFFSET_FACTOR,
      polygonOffsetUnits: POLYGON_OFFSET_UNITS,
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(center)
    mesh.rotation.set(
      (spawnIndex * 0.317) % (Math.PI * 2),
      (spawnIndex * 0.521) % (Math.PI * 2),
      (spawnIndex * 0.733) % (Math.PI * 2),
    )
    mesh.frustumCulled = true
    this.scene.add(mesh)

    const entry = { mesh, material }
    this.overlays.set(spawnIndex, entry)
    return entry
  }
}
```

- [ ] **Step 2: Run type-check**

Run: `bun run type-check`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/three/ProspectOverlayController.ts
git commit -m "feat(three): add ProspectOverlayController for wireframe scan visual"
```

---

## Task 8: Register `sfx.tool.prospectComplete` audio cue

**Files:**
- Modify: `src/audio/audioManifest.ts`
- Modify: `src/audio/LevelAudioDirector.ts`

For the first cut we route the prospect-complete cue to the existing `tool-heal` procedural — different volume/duration, same family. A dedicated procedural can replace it later without touching call sites.

- [ ] **Step 1: Locate the existing `sfx.tool.heal` entry in `audioManifest.ts`**

In `src/audio/audioManifest.ts`, find the `'sfx.tool.heal'` entry and the surrounding manifest map structure. Identify the `id` literal-union list near the top of the file (around the `'sfx.tool.heal'` entry).

- [ ] **Step 2: Add the new id to the literal union**

Add `'sfx.tool.prospectComplete'` to the id list near the top of the file, alphabetically placed next to `'sfx.tool.heal'`:

```ts
  'sfx.tool.heal',
  'sfx.tool.prospectComplete',
```

- [ ] **Step 3: Add the manifest entry**

Add the entry just below the `'sfx.tool.heal'` entry in the manifest map:

```ts
  'sfx.tool.prospectComplete': {
    id: 'sfx.tool.prospectComplete',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'sfx',
    load: 'lazy',
    playback: 'overlap',
    volume: 0.45,
    effect: 'none',
    procedural: 'tool-heal',
  },
```

(The `procedural: 'tool-heal'` reuses the existing synthesizer; later we can author a dedicated `'tool-prospect'` procedural without changing callers.)

- [ ] **Step 4: Run audio manifest tests**

Run: `bun test:unit src/audio/__tests__/audioManifest.spec.ts`
Expected: PASS — the manifest spec asserts every listed id has a matching entry; passing means the id list and the map agree.

- [ ] **Step 5: Add `notifyProspectComplete` to `LevelAudioDirector`**

In `src/audio/LevelAudioDirector.ts`, add the new method just below `notifyResourcePickup`:

```ts
/**
 * A rock was fully prospected; play the analytical-beep cue as a
 * positional point source so it reads as coming from the rock.
 *
 * @param worldPos - World-space center of the prospected rock.
 * @param camera - FPS camera (for `worldPointToHearing`).
 */
notifyProspectComplete(worldPos: THREE.Vector3, camera: THREE.Camera): void {
  const w = worldPointToHearing(camera, worldPos, {
    refDistance: 50,
    minVolumeScale: 0.7,
  })
  const def = getAudioDefinition('sfx.tool.prospectComplete')
  const handle = this.audio.play('sfx.tool.prospectComplete', {
    volume: def.volume * w.volumeScale,
  })
  handle.setStereo(w.pan)
}
```

If `worldPointToHearing` and `getAudioDefinition` are not yet imported, add them to the top of the file:

```ts
import * as THREE from 'three'
import { getAudioDefinition } from '@/audio/audioManifest'
import { worldPointToHearing } from '@/lib/audio/worldHearing'
```

(Inspect existing imports first — they may already cover some of these.)

- [ ] **Step 6: Run type-check and existing tests**

Run: `bun run type-check && bun test:unit`
Expected: no type errors; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/audio/audioManifest.ts src/audio/LevelAudioDirector.ts
git commit -m "feat(audio): register prospect-complete cue and notifier"
```

---

## Task 9: Wire science-bolt → rock yield in `LevelCombatMiningFacade`

**Files:**
- Modify: `src/lib/level/LevelCombatMiningFacade.ts`
- Modify: `src/views/LevelViewController.ts`

`LevelCombatMiningFacade` already wires drill bolt hits into `RockYieldSystem.mineRock` and broadcasts mineral grants to the host. We add three more wires: science hits, science progress, and prospect completion.

- [ ] **Step 1: Extend `LevelCombatMiningBindings` with the prospect host hooks**

In `src/lib/level/LevelCombatMiningFacade.ts`, find the `LevelCombatMiningBindings` interface (around line 32) and add two methods:

```ts
/** Called when a science bolt hits a rock; carries the rock's world center for VFX/audio. */
onProspectProgress: (
  spawnIndex: number,
  scienceHp: number,
  initialScienceHp: number,
) => void
/** Called when a rock has been fully analysed. */
onProspectComplete: (spawnIndex: number, itemId: string) => void
```

- [ ] **Step 2: Wire the new callbacks in `attach()`**

In `attach()`, after the existing `this.deps.projectileSystem.onRockHit = ...` block, add:

```ts
this.deps.projectileSystem.onScienceRockHit = (spawnIndex, impactPos) => {
  const result = this.deps.rockYieldSystem.scienceHit(spawnIndex)
  if (!result) return
  // Reuse the drill flash/sizzle cues for an immediate per-hit acknowledgement.
  this.deps.surfaceRocks.flashRock(spawnIndex)
  // Tiny chip burst at the impact point so the player sees they hit something.
  this.impactVel.set(
    (Math.random() - 0.5) * 1.5,
    2.5 + Math.random(),
    (Math.random() - 0.5) * 1.5,
  )
  this.deps.impactEmitter.emit(impactPos, this.impactVel)
}

this.deps.rockYieldSystem.onScienceProgress = (spawnIndex, scienceHp, initialScienceHp) => {
  this.bindings.onProspectProgress(spawnIndex, scienceHp, initialScienceHp)
}

this.deps.rockYieldSystem.onRockProspected = (spawnIndex, itemId) => {
  this.bindings.onProspectComplete(spawnIndex, itemId)
}
```

- [ ] **Step 3: Clear the new callbacks in `detach()`**

In `detach()`, add:

```ts
this.deps.projectileSystem.onScienceRockHit = null
this.deps.rockYieldSystem.onScienceProgress = null
this.deps.rockYieldSystem.onRockProspected = null
```

- [ ] **Step 4: Wire the new bindings in `LevelViewController.ts`**

In `src/views/LevelViewController.ts`, find the `new LevelCombatMiningFacade(...)` call (around line 789). Add the two new bindings to the second argument:

```ts
{
  onResourcePickup: (itemId, quantity, label) =>
    this.onResourcePickup?.(itemId, quantity, label),
  onResourcePickupFailed: (label, reason) => this.onResourcePickupFailed?.(label, reason),
  onRemoveRockCollider: (spawnIndex) => this.removeRockCollider(spawnIndex),
  getElapsedSeconds: () => this.elapsed,
  onProspectProgress: (spawnIndex, scienceHp, initialScienceHp) => {
    this.prospectOverlay?.updateProgress(spawnIndex, scienceHp, initialScienceHp)
  },
  onProspectComplete: (spawnIndex, itemId) => {
    this.prospectOverlay?.markProspected(spawnIndex)
    const center = this.surfaceRocks?.getRockCenter(
      spawnIndex,
      this.heightmap!,
      this._prospectCenterScratch,
    )
    if (center && this.fpsCamera) {
      this.levelAudio.notifyProspectComplete(center, this.fpsCamera.camera)
    }
    this.onProspect?.(itemId)
  },
},
```

Add the supporting fields near the other private fields in `LevelViewController` (search for `private rockYieldSystem` and add nearby):

```ts
private prospectOverlay: ProspectOverlayController | null = null
private readonly _prospectCenterScratch = new THREE.Vector3()
```

Add a public binding for the host UI near other host callbacks like `onResourcePickup`:

```ts
/** Called when a rock is fully analysed. Host shows the prospect toast. */
onProspect: ((itemId: string) => void) | null = null
```

Import `ProspectOverlayController` near the existing `src/three/...` imports:

```ts
import { ProspectOverlayController } from '@/three/ProspectOverlayController'
```

Just before the `new LevelCombatMiningFacade(...)` call, instantiate the overlay controller and tear it down on the existing `RockYieldSystem.onConsume` cleanup path (the facade already handles `onConsume`; add a sibling hook):

```ts
if (this.surfaceRocks) {
  this.prospectOverlay = new ProspectOverlayController(
    this.sceneManager.scene,
    this.surfaceRocks,
    this.heightmap,
  )
}
```

In the existing `combatMining.attach()` block, after attaching, also chain a cleanup hook on `onConsume` so overlays are torn down with the rock. The facade already sets `onConsume` for hide/cleanup; in the wrap-and-call style the gather minigame uses, do this in `LevelViewController` AFTER `combatMining.attach()`:

```ts
const previousConsume = this.rockYieldSystem!.onConsume
this.rockYieldSystem!.onConsume = (spawnIndex) => {
  previousConsume?.(spawnIndex)
  this.prospectOverlay?.remove(spawnIndex)
}
```

In the existing teardown method (search for `combatMining.detach()` and the `rockYieldSystem = null` line near line 2461), dispose the overlay controller:

```ts
this.prospectOverlay?.dispose()
this.prospectOverlay = null
```

- [ ] **Step 5: Run type-check and tests**

Run: `bun run type-check && bun test:unit`
Expected: no type errors; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/level/LevelCombatMiningFacade.ts src/views/LevelViewController.ts
git commit -m "feat(level): wire science bolts, prospect progress, and prospect complete"
```

---

## Task 10: Render prospect toasts in `LevelView.vue` via sibling array on `PickupToast`

**Files:**
- Modify: `src/components/PickupToast.vue`
- Modify: `src/views/LevelView.vue`

The component already renders mineral pickups. We add an optional `prospectEntries` prop and render them in the same column.

- [ ] **Step 1: Extend `PickupToast.vue` with the prospect entries prop**

In `src/components/PickupToast.vue`, just below the existing `PickupEntry` interface, add a sibling type and extend the props:

```ts
/** A prospect-complete entry shown in the same toast stack. */
export interface ProspectEntry {
  /** Stable key for v-for diffing. */
  id: string
  /** Display label, e.g. "Olivine-bearing rock". */
  label: string
}
```

Update `defineProps`:

```ts
const props = defineProps<{
  /** Active mineral pickups, oldest first. */
  pickups: readonly PickupEntry[]
  /** Active prospect-complete entries, oldest first. */
  prospectEntries?: readonly ProspectEntry[]
  /** Optional max number of toasts to render simultaneously. */
  maxVisible?: number
}>()
```

Add a `visibleProspects` computed mirroring `visiblePickups`:

```ts
const visibleProspects = computed(() => {
  const list = props.prospectEntries ?? []
  const max = props.maxVisible ?? 5
  if (list.length <= max) return list
  return list.slice(list.length - max)
})
```

In the `<template>`, inside the existing `<transition-group>`, add prospect entries below the pickup loop:

```vue
<div
  v-for="entry in visibleProspects"
  :key="entry.id"
  class="pickup-toast__entry pickup-toast__entry--prospect"
>
  <span class="pickup-toast__check">✓</span>
  <span class="pickup-toast__prospect-label">Analysed — {{ entry.label }}</span>
</div>
```

Add the new styles to the `<style>` block:

```css
.pickup-toast__entry--prospect {
  color: rgba(34, 197, 94, 0.95);
  border-color: rgba(34, 197, 94, 0.45);
  box-shadow:
    0 0 12px rgba(34, 197, 94, 0.18),
    inset 0 0 8px rgba(34, 197, 94, 0.05);
}
.pickup-toast__check {
  color: rgba(34, 197, 94, 0.95);
  font-size: 0.95rem;
}
.pickup-toast__prospect-label {
  color: rgba(34, 197, 94, 0.92);
}
```

- [ ] **Step 2: Wire prospect entries in `LevelView.vue`**

In `src/views/LevelView.vue`, just below the `pickups` ref (near line 71), add the sibling state and helpers:

```ts
import type { ProspectEntry } from '@/components/PickupToast.vue'

const prospectEntries = ref<ProspectEntry[]>([])
const PROSPECT_TOAST_LIFETIME_SEC = 2.6
const prospectTimers = new Map<string, ReturnType<typeof Timer.after>>()
let prospectSeq = 0

function recordProspect(label: string): void {
  prospectSeq += 1
  const entry: ProspectEntry = { id: `prospect-${prospectSeq}`, label }
  prospectEntries.value.push(entry)
  const handle = Timer.after(PROSPECT_TOAST_LIFETIME_SEC, () => {
    const idx = prospectEntries.value.findIndex((p) => p.id === entry.id)
    if (idx >= 0) prospectEntries.value.splice(idx, 1)
    prospectTimers.delete(entry.id)
  })
  prospectTimers.set(entry.id, handle)
}
```

Extend `clearPickups()` to also clear prospect entries:

```ts
function clearPickups(): void {
  for (const { handle } of pickupTimers.values()) Timer.cancel(handle)
  pickupTimers.clear()
  pickups.value = []
  for (const handle of prospectTimers.values()) Timer.cancel(handle)
  prospectTimers.clear()
  prospectEntries.value = []
  for (const handle of pickupFailedTimers) Timer.cancel(handle)
  pickupFailedTimers.clear()
  pickupFailed.value = null
}
```

Wire the new view-controller callback alongside `onResourcePickup` (find `viewController.onResourcePickup = ...` near line 289):

```ts
viewController.onProspect = (itemId) => {
  const label = inventoryLabelForItemId(itemId)
  recordProspect(label)
}
```

Reuse the same inventory label resolver `recordPickup` already calls. If a `inventoryLabelForItemId` helper does not exist, mirror what the resource-pickup path does — search nearby for how `label` is obtained for `recordPickup` and use the same lookup.

Pass the new array to the `<PickupToast>` element:

```vue
<PickupToast :pickups="pickups" :prospect-entries="prospectEntries" />
```

(Find the existing `<PickupToast>` usage and add the new prop.)

- [ ] **Step 3: Run type-check, tests, and the dev server briefly**

Run: `bun run type-check && bun test:unit`
Expected: no type errors; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/PickupToast.vue src/views/LevelView.vue
git commit -m "feat(hud): prospect-complete toast variant in PickupToast stack"
```

---

## Task 11: Lint + final verification

**Files:**
- (no edits expected — this is the merge gate)

- [ ] **Step 1: Run the full lint pass**

Run: `bun lint`
Expected: oxlint 0 errors, ESLint 0 errors / 0 warnings. Fix any TSDoc gaps inline (every new exported function/class/interface needs a TSDoc block per project rules; the plan above includes them but verify nothing was missed).

- [ ] **Step 2: Run the full test pass**

Run: `bun test:unit`
Expected: all tests pass.

- [ ] **Step 3: Run the type-check**

Run: `bun run type-check`
Expected: no errors.

- [ ] **Step 4: Manual smoke test (FPS scene)**

Run: `bun dev`

Walk through:
1. Open `/level` for any asteroid mission with surface rocks.
2. Switch to SCI mode.
3. Aim at a rock and fire — verify the wireframe overlay fades in across hits.
4. Continue firing — verify the green toast appears (`✓ Analysed — <Mineral>-bearing rock`) and an analytical beep plays.
5. Fire science again at the analysed rock — verify the bolt impacts but no extra toast/audio fires.
6. Switch to DRL and mine the rock to depletion — verify on the killing blow you see at least one extra mineral toast (the guaranteed bonus). Occasionally a second extra toast (the 25% jackpot).
7. Mine an un-prospected rock to depletion — verify only the normal grants fire.

If anything misbehaves, reopen the relevant task and address; do not paper over.

- [ ] **Step 5: Final commit if anything was tweaked during smoke test, otherwise skip**

```bash
git add -A
git commit -m "chore(prospect): smoke-test polish"
```

---

## Self-Review Checklist (run by author before handoff)

- [ ] Every spec section has a task: science HP (T2), prospect lifecycle + callbacks (T3), bonus rolls (T4), `'science_rock'` impact (T5), bolt routing (T6), wireframe overlay (T7), audio cue (T8), facade wiring (T9), HUD toast (T10), lint+verify (T11). Constants helper task (T1) backstops T2/T4.
- [ ] No placeholders, TBDs, or "implement later" steps. Each step shows exact code.
- [ ] Type/property names are consistent across tasks: `scienceHp`, `initialScienceHp`, `prospected`, `onScienceProgress`, `onRockProspected`, `onScienceRockHit`, `onProspectProgress`, `onProspectComplete`, `onProspect`, `ProspectOverlayController.updateProgress` / `markProspected` / `remove` / `dispose`.
- [ ] TDD for the pure-TS yield system (T2, T3, T4). Three.js / Vue layers verified via type-check + manual smoke (project convention — see CLAUDE.md "Tests focus on math/domain").
- [ ] Frequent commits — one per task.
