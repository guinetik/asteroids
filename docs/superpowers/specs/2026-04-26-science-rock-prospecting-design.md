# Science Mode — Rock Prospecting

**Date:** 2026-04-26
**Author:** guinetik
**Status:** Draft
**Related:**
- `2026-04-04-multitool-switching-design.md` (multi-tool modes, RTG, science bolt foundation)
- `2026-04-18-gather-mission-design.md` (`RockYieldSystem` and the `onMineralExtracted` callback chain)
- `2026-04-04-fps-movement-design.md` (FPS view, projectile system, viewmodel layer)

## Problem

The science bolt has a real heal behavior on hostages and the lander hull, but on rocks it does nothing. The TODO comment in `projectileSystem.ts` already names the desired behavior — *"rocks (wireframe + yield boost)"* — without specifying mechanics. We want science mode on rocks to be a meaningful prospector loop: scan a rock, get a visible feedback ramp, end with a confirmed-analyse moment, and earn a richer payout when you eventually drill it.

The feature also needs a clean dispatch path so future objectives ("prospect 5 rocks on Eros", "scan a rock containing magnetite") can listen to the same event without bolting onto the projectile system.

## Goals

- Make science bolts a **multi-hit prospecting action** on rocks, with a visible wireframe overlay that ramps up across hits and locks in on completion.
- On the **drill-mining depletion** of a prospected rock, fire a guaranteed bonus mineral grant of the rock's primary mineral, plus a 25% chance of a second weighted-roll grant from the asteroid composition.
- Emit a structured **`onRockProspected(spawnIndex, itemId)`** callback so missions can hook in via the same chain pattern `GatherMinigame` already uses for `onMineralExtracted`.
- Surface the moment with a small **PickupToast-style corner notification** (`✓ Analysed — Olivine-bearing rock`) and a distinct **soft analytical beep**, positionally panned via `worldPointToHearing`.
- Reuse the existing `RockYieldSystem` data model and asteroid composition — no new authoring per asteroid.

## Non-Goals (this pass)

- Lander or turret-mining science prospecting. The science gun is FPS-only; turret mining stays a pure extraction loop.
- Persistent prospect state across sessions or even respawns. Prospect state lives in `RockYieldSystem` for the active level only.
- Visual flourish beyond a triangle wireframe — no animated scan sweep, no procedural ore veins. The flavored visuals are a follow-up pass.
- Any change to science bolt behavior on hostages, lander, enemies, terrain, or terminals (the rest of the resolver TODO is out of scope).
- Mission objectives that *consume* prospecting events. The callback is wired and demonstrably callable, but the first mission type to use it is a separate spec.
- Tuning passes after first ship. Numbers (33% science ratio, 10% bonus floor, 25% second-roll, 2 kg minimum) are first-cut tunables.

## Player Flow

1. Player switches to science mode (SCI), aims at a registered rock, fires.
2. Each science bolt that connects deducts `BOLT_DAMAGE_KG_PER_HIT` (4 kg) from the rock's `scienceHp`. The wireframe overlay opacity ramps from 0 → ~0.7, projected on top of the rock's existing texture.
3. When `scienceHp` reaches 0:
   - Wireframe locks at full opacity for the rock's remaining lifetime.
   - Toast appears in the pickup-toast stack: `✓ Analysed — Olivine-bearing rock` (mineral name varies by what the rock rolled).
   - Audio cue plays: `sfx.tool.prospectComplete`, panned via `worldPointToHearing` to the rock's world position.
   - `RockYieldSystem.onRockProspected(spawnIndex, itemId)` fires for any registered listener.
4. Subsequent science bolts on the same rock stop on impact (standard impact VFX/SFX), no effect, RTG fuel burned. Visual wireframe at full opacity is the player's "this is done" cue.
5. Player swaps to drill, mines the rock normally. The depletion hit grants:
   - The normal final-hit `kgGranted` (unchanged).
   - **Always:** a bonus `onMineralExtracted` grant of the rock's same `itemId`, kg = `max(2, ceil(totalKg × 0.10))`.
   - **25% chance:** a second `onMineralExtracted` grant of `itemId` rolled from the asteroid composition (same weighted roll the rock used at registration), same kg amount.
6. Player sees the bonus grants as additional `+N <Mineral>` toasts in the existing pickup stack, indistinguishable in form from regular mining grants. The narrative payoff is "the prospected rock paid out more".

## Architecture

The feature lives across one library module (the rock yield system), one Three.js controller (the wireframe overlay), the projectile system (science-bolt routing), and one HUD surface (the analyse toast). No new top-level system.

```
ProjectileSystem (existing, FPS only)
  └─ science-bolt branch
       ├─ closestHostageHealHit          (existing)
       ├─ closestLanderHealHit            (existing)
       └─ closestRockHit (NEW for science)
              └─ RockYieldSystem.scienceHit(spawnIndex)
                     ├─ if not prospected: deduct scienceHp, fire onScienceProgress
                     ├─ if scienceHp ≤ 0:  flip prospected=true, fire onRockProspected
                     └─ if already prospected: no-op (bolt still stops, handled by caller)

RockYieldSystem (extended)
  ├─ rocks: Map<spawnIndex, RockRoll>
  │     └─ RockRoll now also has: scienceHp, initialScienceHp, prospected
  ├─ scienceHit(spawnIndex)               NEW
  ├─ isProspected(spawnIndex): boolean    NEW
  ├─ getScienceProgress(spawnIndex): {hp, initialHp, prospected}  NEW
  ├─ onScienceProgress  callback          NEW (for wireframe overlay updates)
  ├─ onRockProspected   callback          NEW (toast + audio + mission listeners)
  └─ mineHit() rolls the bonus grants on the depletion hit when prospected

ProspectOverlayController (NEW, src/three/)
  ├─ implements Tickable / lifecycle hooks
  ├─ owns one wireframe Mesh per registered rock
  ├─ subscribes to RockYieldSystem.onScienceProgress + onRockProspected
  └─ updates per-rock overlay material opacity each event

LevelViewController
  ├─ instantiates ProspectOverlayController, registers it in scene
  ├─ wires RockYieldSystem.onRockProspected →
  │     ├─ pickupToast pipeline (new variant: ✓ Analysed)
  │     ├─ levelAudio.playProspectComplete(worldPos)
  │     └─ stub mission listener (no-op for now)
  └─ wires RockYieldSystem.onScienceProgress → ProspectOverlayController
```

### `RockYieldSystem` extension

`RockRoll` (private interface) gains three fields:
```ts
interface RockRoll {
  itemId: string
  totalKg: number
  remainingKg: number
  scienceHp: number          // current
  initialScienceHp: number   // for opacity normalization
  prospected: boolean
}
```

`registerRock` initializes `scienceHp = initialScienceHp = max(BOLT_DAMAGE_KG_PER_HIT, ceil(totalKg * SCIENCE_HP_RATIO))` and `prospected = false`. The floor ensures even pebbles take at least one science bolt.

New public methods:
```ts
/** Apply one science-bolt hit. No-op if already prospected. Returns the new state. */
scienceHit(spawnIndex: number): {
  prospected: boolean      // true if THIS hit completed the prospect
  scienceHp: number
  initialScienceHp: number
} | null
/** Whether this rock has been fully analysed. */
isProspected(spawnIndex: number): boolean
/** Read-only snapshot for the overlay controller. */
getScienceProgress(spawnIndex: number): { scienceHp: number; initialScienceHp: number; prospected: boolean } | null
```

New callbacks:
```ts
/** Fired on every science-hit while not yet prospected. Drives the overlay opacity. */
onScienceProgress: ((spawnIndex: number, scienceHp: number, initialScienceHp: number) => void) | null
/** Fired exactly once per rock when scienceHp first reaches 0. */
onRockProspected: ((spawnIndex: number, itemId: string) => void) | null
```

`mineRock` is extended so when the depletion hit lands on a `prospected` rock, it fires extra `onMineralExtracted` calls **after** the normal depletion grant, **before** `onConsume` and the rock's deletion from the map:
```ts
if (roll.prospected && depleted) {
  const bonusKg = Math.max(MIN_PROSPECT_BONUS_KG, Math.ceil(roll.totalKg * PROSPECT_BONUS_RATIO))
  this.onMineralExtracted?.(roll.itemId, bonusKg, spawnIndex)               // guaranteed
  const trigger = pseudoRandom(this.seed, spawnIndex ^ PROSPECT_TRIGGER_SALT)
  if (trigger < PROSPECT_SECOND_ROLL_CHANCE) {
    const rolledItemId = this.rollMineralFromSalted(
      this.weightedItems, spawnIndex, PROSPECT_ITEM_SALT,
    )
    this.onMineralExtracted?.(rolledItemId, bonusKg, spawnIndex)            // 25% jackpot
  }
}
```

Two distinct salts are used so the trigger probability and the bonus item id are statistically independent of each other and of the rock's primary mineral roll. Both reuse the existing `pseudoRandom(seed, salt)` helper, so the same rock prospected in two playthroughs of the same seed produces identical bonus outcomes — preserving the deterministic-roll guarantee the system already documents.

A small new private helper `rollMineralFromSalted(items, spawnIndex, salt)` mirrors the existing `rollMineralFrom` but passes `spawnIndex ^ salt` to `pseudoRandom`, so the second roll is uncorrelated with the primary roll.

### `ProspectOverlayController` (new, `src/three/`)

A small renderer-side controller that mirrors the rock instances and projects a wireframe overlay on top of each.

- On registration (mirroring rock registration), creates a child `THREE.Mesh` with the rock's geometry and a `MeshBasicMaterial({ wireframe: true, color: 0x22c55e, transparent: true, opacity: 0, depthWrite: false })`. Parented to the rock's transform so it follows position/rotation/scale automatically.
- Subscribes to `onScienceProgress` and updates the overlay opacity via `1 − (scienceHp / initialScienceHp)`, scaled by `WIREFRAME_MAX_OPACITY` (default 0.7).
- On `onRockProspected`, locks the overlay opacity to `WIREFRAME_FULL_OPACITY` (default 0.9) — slightly brighter than the ramp peak so the moment-of-completion is readable.
- Disposes the overlay mesh when the underlying rock is consumed (via `RockYieldSystem.onConsume`).

Render order: the overlay material has `depthWrite: false` and `polygonOffset: true` (small negative factor) so it composites cleanly on top of the rock without z-fighting and without occluding behind objects.

### `ProjectileSystem` extension

Today, science bolts only check hostages and lander. Add a third branch:

```ts
if (p.boltKind === 'science') {
  const hostageHit = this.closestHostageHealHit(this._prevPos, pos)
  if (hostageHit) { /* existing heal path */ }
  else if (this.lander && /* lander hit check */) { /* existing heal path */ }
  else {
    const rockHit = this.closestRockHit(this._prevPos, pos)   // existing helper, reused
    if (rockHit) {
      this._callbackPos.copy(pos)
      this.onScienceRockHit?.(rockHit.spawnIndex, this._callbackPos)
      hitRock = true   // bolt stops on the rock
    }
  }
}
```

`onScienceRockHit` is a new callback the projectile system exposes; `LevelViewController` wires it to `RockYieldSystem.scienceHit(spawnIndex)`. The reason for going through a `LevelViewController` callback rather than handing `RockYieldSystem` directly to the projectile system is symmetry with how drill rock hits and lander/hostage heals already work today.

Bolt impact behavior: the existing `onImpact` path already handles the visual sizzle for `kind: 'drill_rock'`. Add a new `ProjectileImpactKind` value `'science_rock'` so the audio director and impact emitter can play a science-flavored cue (different from drill-mining sizzle, different from terrain-ping). The `'already prospected'` case routes to the same `'science_rock'` impact — same cue, no functional effect on yield.

### HUD: prospect toast

Render in the existing `PickupToast` stack via a sibling array `prospectPickups: ProspectEntry[]`. The component renders both arrays in the same `transition-group` so prospect toasts and mineral-grant toasts visually share a column. The prospect entry has its own minimal template — a green `✓` glyph plus a single-line label `Analysed — <Mineral>-bearing rock`, no quantity. Toast lifetime, ordering, and removal reuse the same parent-owned timer logic the existing pickups already use.

Reasoning for the sibling array (vs. extending `PickupEntry` with a `variant` field): prospect toasts have no `quantity` semantic and aren't aggregated the way mineral grants are. Keeping them in their own array avoids a discriminated union threading through the aggregation code in the parent.

The toast label resolves the rock's `itemId` to the human-readable mineral name via the inventory catalog (same lookup `PickupToast` already uses).

### Audio

New sfx definition: `sfx.tool.prospectComplete`. Subdued two-note analytical beep — distinct from `sfx.tool.heal` (which is ramping organic) and `sfx.impact.gun` (which is sharp). Played positionally via `worldPointToHearing(camera, rockWorldPos, …)` so the cue sounds like it comes from the rock.

The per-bolt science-on-rock impact reuses an existing UI sizzle or creates a new short cue (`sfx.impact.science_rock`); first cut can reuse `sfx.impact.gun` at lower volume to ship.

### Mission dispatch

`RockYieldSystem.onRockProspected` is wrapped in the same callback-chain pattern `GatherMinigame` uses today for `onMineralExtracted`:
```ts
const previous = this.rockYieldSystem.onRockProspected
this.rockYieldSystem.onRockProspected = (spawnIndex, itemId) => {
  previous?.(spawnIndex, itemId)
  this.handleProspect(spawnIndex, itemId)
}
```

A future "prospect N rocks" or "prospect a magnetite-bearing rock" mission slots in with no changes to `RockYieldSystem` or `ProjectileSystem`.

## Data Constants

All new tunables live in `src/lib/mining/constants.ts` next to the existing rock constants:

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
/** Salt for the bonus item-id draw, distinct from the trigger salt so the two are uncorrelated. */
export const PROSPECT_ITEM_SALT = 0x85ebca77
```

Wireframe overlay tunables live in the new controller module:

```ts
/** Wireframe overlay color (matches science mode green). */
const WIREFRAME_COLOR = 0x22c55e
/** Maximum overlay opacity reached as scienceHp approaches 0. */
const WIREFRAME_MAX_OPACITY = 0.7
/** Final overlay opacity when the rock is fully prospected. */
const WIREFRAME_FULL_OPACITY = 0.9
```

## Edge Cases

- **Rock consumed mid-prospect.** If a player's drill destroys a rock that has partial `scienceHp`, the overlay controller hears `onConsume` and disposes the overlay. No `onRockProspected` fires — partial science work yields nothing.
- **Prospected then mined to depletion in the same FPS pass.** Bonus rolls are gated only on `prospected === true && depleted === true`; mining order doesn't matter.
- **Bonus roll lands on the same itemId as the guaranteed roll.** Allowed. The player sees two `+N Olivine` toasts; the existing pickup-toast aggregator may collapse them into one entry depending on its aggregation window. Acceptable behavior.
- **Already-prospected science hit.** Bolt stops, RTG fuel burned, no callbacks fire, no toast, no audio cue beyond the standard impact. The wireframe is the player's pre-fire warning.
- **Rock with `compositionOverride`.** Prospect bonus rolls use whatever weighted-items array was registered for that rock — overrides flow through naturally.
- **Player switches to drill mid-prospect, then back to science.** No state lost. `scienceHp` persists on the rock until either fully prospected or rock destroyed.
- **Rock has zero composition (`weightedItems.length === 0`).** Cannot register today — already guarded in `registerRock`. Prospect path inherits the same guard via never-existing rocks.

## Testing

`src/lib/mining/__tests__/rockYieldSystem.spec.ts` extensions:

- A registered rock starts with `scienceHp = max(4, ceil(totalKg * 0.33))` and `prospected = false`.
- `scienceHit` deducts `BOLT_DAMAGE_KG_PER_HIT` per call and fires `onScienceProgress` each time.
- `scienceHit` returns `prospected: true` exactly once — on the hit that drops `scienceHp` to 0 — and fires `onRockProspected(spawnIndex, itemId)`.
- Subsequent `scienceHit` calls on a prospected rock return `null` and fire no callbacks.
- `mineRock` on a prospected rock that depletes fires the guaranteed bonus `onMineralExtracted(itemId, bonusKg, spawnIndex)` with `bonusKg = max(2, ceil(totalKg * 0.10))`.
- `mineRock` on a prospected rock fires *two* extra `onMineralExtracted` calls when the trigger draw lands below `PROSPECT_SECOND_ROLL_CHANCE`, only one extra otherwise. Tested by picking `(seed, spawnIndex)` fixtures whose `pseudoRandom(seed, spawnIndex ^ PROSPECT_TRIGGER_SALT)` value is known to fall above and below the threshold.
- `mineRock` on a non-prospected rock that depletes fires no bonus grants.
- Bonus salt determinism: prospecting + depleting the same rock with the same seed yields the same second-roll item id across runs.

Integration: a small spec wires `ProjectileSystem` against a fake `RockYieldSystem` and asserts that a science bolt aimed at a registered rock decrements `scienceHp` once via `closestRockHit`.

The Three.js overlay controller is not unit-tested per project convention — it's a pure rendering layer with no domain logic.

## Future Work (out of scope)

- Authored `prospectMessage` per asteroid so the toast can read flavor lines instead of a generic `Olivine-bearing rock` — e.g. *"Olivine-rich chondrule cluster"*.
- "Prospect N rocks" and "Prospect a magnetite-bearing rock" mission types built on `onRockProspected`.
- Procedural ore-vein wireframe shader (replace the triangle wireframe with animated veins in the rolled mineral's color).
- Science prospecting on lander-mode mining (turret beam) — would need a different surface treatment since the lander doesn't see individual rocks.
- Persistent prospect state across respawn / level reload.
- Unprospect / decay timer if the player walks away — currently prospect is permanent for the session.
