# Rocket Survey — SCI Mode Hidden Utility

**Author:** guinetik
**Date:** 2026-04-26
**Status:** Draft

## Summary

Shooting the gather mission's `DepositRocketModel` with the multitool's SCI mode runs a covert "deposit-signature scan" that reveals the closest matching unmined rock for the next still-needed mineral. Hidden mechanic — never advertised in tutorials or HUD instructions; players discover it the same way they discover hold-to-mine on rocks.

The mechanic exists only inside `LevelView`. It is a player aid for "I cannot find olivine" moments, not a required progression step.

## Goals

- Give the SCI gun a second purpose beyond rock prospecting and lander/hostage healing.
- Reuse the prospect-style multi-hit ramp so the verb feels consistent with rock prospecting.
- Keep `LevelViewController` lean — all new logic lives in a dedicated facade + pure-TS state machine.
- Hide the mechanic. No HUD prompts, no tutorial, vague RP-style toast on success.

## Non-goals

- Other terminals (`TerminalModel`-based survey/photometry/collect terminals) do **not** respond to SCI hits in this iteration. Scope is the gather rocket only.
- Orbit-map waypoint. Gather missions only run in the level scene; the rocket is unreachable from the orbit map.
- Naming the mineral in the toast. RP framing only.
- Re-targeting a placed marker if its rock is mined by something else. v1 keeps the marker fixed; if its rock dies, the marker disappears with it.

## Architecture

```
ProjectileSystem
   |
   |  bolt hits rocket AABB while p.boltKind === 'science'
   |  -> onScienceRocketHit(impactPos)
   v
RocketSurveyFacade (new)
   |  attach() / detach() — owns wiring lifetime
   |  reads quotas from gather minigame
   |  forwards hits into the state machine
   v
RocketSurveyState (new pure-TS)
   |  idle / ramping / awaitingDelivery / exhausted
   |  fires onProgress + onReveal
   v
RocketSurveyFacade
   |  on reveal: query RockYieldSystem for itemId match,
   |  pick closest to rocket via SurfaceRockController.getRockCenter,
   |  place WaypointMarkers (surface preset, green),
   |  fire surveyEntries toast,
   |  notify LevelAudioDirector,
   |  pulse DepositRocketModel.flash()
   v
RockYieldSystem.onConsume (chained)
   |  if consumed spawnIndex matches active marker -> remove waypoint
```

`LevelViewController` change is two lines: instantiate the facade in `onLevelEntered`, dispose in teardown. No business logic added there.

## Domain split

| Layer | Unit | Responsibility |
|---|---|---|
| `src/lib/fps/projectileSystem.ts` | `'science_rocket'` impact kind, `onScienceRocketHit` callback, rocket AABB registration | Routes science bolts that hit the registered rocket volume |
| `src/lib/level/rocketSurveyState.ts` | Pure-TS state machine | Tracks survey HP and phase; deterministic; fully unit-tested |
| `src/lib/level/RocketSurveyFacade.ts` | Facade (mirrors `LevelCombatMiningFacade` shape) | Owns the state machine, picks the target rock, places + tears down waypoints, fires UI/audio callbacks |
| `src/three/DepositRocketModel.ts` | New `flash(intensity)` method | Per-hit green pulse on the rocket's emissive surfaces |
| `src/components/PickupToast.vue` | New sibling array `surveyEntries` | Shows the survey toast in the same stack as mineral pickups and prospect completes |
| `src/audio/audioManifest.ts` | `sfx.tool.surveyReveal` cue | Placeholder procedural reuse; dedicated synth later |
| `src/audio/LevelAudioDirector.ts` | `notifySurveyReveal(worldPos, camera)` | Positional one-shot at the rocket |

`WaypointMarkers.ts` is reused as-is (surface preset, color override to science green `0x22c55e`).

## State machine

```
States: idle | ramping | awaitingDelivery | exhausted

Transitions:
  idle             --(scienceHit, hasScannableMineral)-->         ramping           (init surveyHp; pick target itemId)
  idle             --(scienceHit, !hasScannableMineral)-->        idle              (silent no-op)
  ramping          --(scienceHit, hp > BOLT)-->                   ramping           (decrement hp)
  ramping          --(scienceHit, hp <= BOLT, rockAvailable)-->   awaitingDelivery  (emit onReveal{itemId, spawnIndex})
  ramping          --(scienceHit, hp <= BOLT, !rockAvailable)-->  ramping or idle   (skip itemId; reset hp; pick next still-needed)
  awaitingDelivery --(notifyDelivery, matches target)-->          idle              (next mineral unlocks)
  any              --(allMineralsDelivered)-->                    exhausted         (rocket inert)
  any              --(detach)-->                                  idle              (cleanup)
```

**Inputs:**
- `scienceHit()` — facade calls per bolt impact. Returns `{ phase, surveyHp, surveyHpInitial, justRevealed, targetItemId, targetSpawnIndex } | null`. Returns `null` when state is `exhausted` or there is no scannable mineral. `justRevealed: true` only on the bolt that actually places a marker.
- `notifyDelivery(itemId)` — facade calls when the gather minigame confirms a deposit. Clears `awaitingDelivery` if itemId matches the current revealed target. Also clears that itemId from `skippedItemIds` (the world may have changed since the skip — e.g. a prospect bonus produced a new mineable itemId).
- `setQuotas(quotas: ReadonlyArray<{ itemId, minedKg, targetKg, deliveredKg }>)` — facade pushes quota state on every gather quota change.

**Rock-availability predicate (injected at construction):**
- `rockAvailability: (itemId: string) => { spawnIndex: number } | null`.
- The state machine calls this only at the reveal step (when `hp` would otherwise drop to zero). The facade implements it by querying `RockYieldSystem` + selecting the closest matching rock to the rocket via `SurfaceRockController.getRockCenter`. Returning `null` means no rock currently exists for this itemId.
- Keeping this as an injected predicate (not part of state) keeps the state machine pure-TS testable. Tests inject a fake.

**Scannable mineral selection (deterministic):**
- Pool: quotas where `deliveredKg < targetKg` AND `itemId` is not in the internal `skippedItemIds` set.
- If empty → state stays `idle`, hits are no-ops.
- Otherwise pick the **first** quota in mission order. That itemId becomes the active scan target until it is revealed, skipped, or delivered.

**Skip-and-retry rule:**
When `hp` reaches zero, the state machine calls `rockAvailability(targetItemId)`:
- If it returns a `spawnIndex` → state moves to `awaitingDelivery`; emit `onReveal({ itemId, spawnIndex })`. Toast / waypoint / audio fire.
- If it returns `null` → state adds `targetItemId` to `skippedItemIds`, **resets `surveyHp` to full**, re-picks a scannable mineral. If another itemId is scannable, state moves to `ramping` so the **next** bolt advances toward that itemId's reveal. If no itemId is scannable, state moves to `idle`. The current bolt does **not** auto-reveal a new itemId — one bolt = one HP step.
- No toast / waypoint / audio fires when an itemId is skipped. The rocket flash from the bolt **does** fire (it's tied to per-hit progress, not the reveal outcome). The player never sees a difference between "ramp not yet complete" and "ramp completed but reveal skipped" — preserves the hidden-mechanic feel.

**Idle decay (v1: skip):**
If the player abandons a ramp, surveyHp stays where it is until the next bolt or until detach. v2 may add a 4–6 s decay-to-full timer.

## Bolt routing

`src/lib/fps/projectileSystem.ts`:

- Extend `ProjectileImpactKind` with `'science_rocket'`.
- Add `onScienceRocketHit: ((position: THREE.Vector3) => void) | null = null`.
- Add a private rocket AABB the facade registers via `setSurveyTarget(rocket: THREE.Object3D | null, halfExtents: THREE.Vector3)`. When `null`, no rocket routing is active.
- In the existing science-bolt branch (`if (p.boltKind === 'science') { ... }`), insert rocket detection **before** rock detection: bolts hit the rocket AABB first, otherwise fall through to the existing hostage / lander / rock cascade. Order: `hostage → rocket → lander → rock`.
- On rocket hit, set `kind = 'science_rocket'` for the existing `onImpact` classification block.

The rocket AABB is computed from `DepositRocketModel.group` bounding box at attach time; the facade re-pushes it on every `tick()` with the rocket's current world position so the takeoff animation doesn't break detection (in practice rocket is static until takeoff, but cheap to refresh).

## Picking the target rock

In `RocketSurveyFacade`:

1. State machine emits `onReveal(targetItemId)`.
2. Query `RockYieldSystem` via a new public iterator `forEachActiveRock(cb: (spawnIndex, itemId, remainingKg) => void)` (today only `peekRock(spawnIndex)` exists; the iterator is a small additive method).
3. Filter to `itemId === target && remainingKg > 0`.
4. For each candidate, fetch `SurfaceRockController.getRockCenter(spawnIndex, heightmap, scratch)` to get world position.
5. Sort by squared distance to the rocket world position; pick first.
6. If the candidate set is empty after filtering → silent no-op (per rules above).

## Waypoint lifecycle

- Reveal: `addWaypointMarker(\`survey-${spawnIndex}\`, x, z, groundY, scene)` with color override `0x22c55e`. Color must be parameterizable — `WaypointMarkers.ts` already accepts a color in `createWaypointMarkerGroup`; expose it through `addWaypointMarker` (small additive change).
- Consumption: facade chains `RockYieldSystem.onConsume` (wrap-and-call). When the consumed spawn index matches the active marker, the facade calls `removeWaypointMarker`.
- Detach: facade clears any active marker on `detach()`.
- The "rock mined by something else" edge case is intentionally simple: if the marked rock is consumed (via drill, prospect bonus, or anything else), the marker disappears with it. State machine remains in `awaitingDelivery` until the player actually deposits the mineral — they may need to mine another matching rock without the visual aid.

## Visuals

**Rocket flash (per hit):**
- New `DepositRocketModel.flash(progressRatio: number)` method.
- Driven by `RocketSurveyFacade` per `onProgress`. The facade tracks an animated emissive multiplier on the rocket's screen + antenna materials. Color: science green `0x22c55e`. Decays over ~250 ms per hit.
- Reveal moment uses a longer (~600 ms) brighter flash.
- Reverts to default cyan emissive when state returns to `idle` or `awaitingDelivery`.

**Per-hit chip burst:**
- Reuse `LevelCombatMiningFacade`'s impact emitter pattern. The facade gets an injected `impactEmitter: ParticleEmitter` and emits a small chip burst at the bolt impact point on every rocket hit. Existing visual.

**Waypoint beam:**
- `WaypointMarkers.ts` surface preset with `0x22c55e` color. Reuses pulse / proximity-fade behavior already in place.

**Lander minimap:**
- If `LevelMinimap.vue` already plots mission waypoint markers, the survey marker is added to the same source-of-truth list. Implementation will check; if not trivial, skipped.

## Audio

**`sfx.tool.surveyReveal`** (new, in `audioManifest.ts`):
- First cut reuses the existing `tool-prospect`-family procedural (or `tool-heal` if `tool-prospect` does not exist as a distinct synth — `prospectComplete` currently piggybacks on `tool-heal`).
- Volume: `0.5`. Category: `sfx`. Playback: `overlap`. Effect: `none`.
- Dedicated synth can replace it later without touching call sites.

**`LevelAudioDirector.notifySurveyReveal(worldPos, camera)`**:
- Same shape as `notifyProspectComplete` (positional point-source via `worldPointToHearing`).

Per-hit bolt impacts use the existing science-bolt SFX — no new cue.

## HUD / Toast

**`PickupToast.vue` extension:**

```ts
/** A survey-reveal entry shown alongside mineral pickups and prospect completes. */
export interface SurveyEntry {
  /** Stable v-for key. */
  id: string
  /** Display text — vague on purpose. */
  label: string
}
```

New `surveyEntries?: readonly SurveyEntry[]` prop, mirroring the `prospectEntries` work just shipped. Rendered in the same `<transition-group>`, styled green to match SCI / waypoint color.

**`LevelView.vue` wiring:**
- New `surveyEntries: SurveyEntry[]` ref + `recordSurvey(label: string)` helper. Same lifetime / clear semantics as `prospectEntries`.
- `viewController.onSurvey = () => recordSurvey('DEPOSIT SIGNATURE LOCATED')`.

**Toast text:** `"DEPOSIT SIGNATURE LOCATED"` (RP-flavored, no mineral name).

No HUD instruction text. No tutorial. The mechanic is discoverable, not taught.

## Gather minigame integration

`GatherMinigame` exposes (additive, all read-only):
- `getRocketGroup(): THREE.Group | null` — the `DepositRocketModel.group`.
- `getQuotaSnapshot(): ReadonlyArray<{ itemId, minedKg, targetKg, deliveredKg }>` — current quotas.
- `onQuotaChange: ((snapshot) => void) | null = null` — fires whenever any quota field updates (extraction or delivery).
- `onMineralDelivered: ((itemId: string) => void) | null = null` — fires after a successful deposit interaction.

`RocketSurveyFacade.attach()` registers the rocket AABB and subscribes to `onQuotaChange` + `onMineralDelivered`. `detach()` unhooks and disposes the active marker.

Gather minigame already tracks `minedKg` per quota. The facade does **not** mutate that data — it only reads.

## Lifecycle in `LevelViewController`

Two new lines in `onLevelEntered` (after `LevelCombatMiningFacade.attach()`):

```ts
this.rocketSurvey = new RocketSurveyFacade(deps, bindings)
this.rocketSurvey.attach()
```

In teardown (after `combatMining.detach()`):

```ts
this.rocketSurvey?.detach()
this.rocketSurvey = null
```

Bindings: a single `onSurvey: () => void` for the toast. No other state escapes the facade.

## Tunables (new constants)

```ts
// src/lib/level/rocketSurveyConstants.ts (new)

/** Total survey HP for one scan cycle, in kg-equivalent units. */
export const ROCKET_SURVEY_HP = 32

/** Damage applied per science bolt hit on the rocket. */
export const ROCKET_SURVEY_DAMAGE_PER_HIT = 4

/** Survey marker beam color (science green). */
export const ROCKET_SURVEY_MARKER_COLOR = 0x22c55e

/** Per-hit rocket flash duration (seconds). */
export const ROCKET_SURVEY_FLASH_HIT_DURATION = 0.25

/** Reveal flash duration (seconds). */
export const ROCKET_SURVEY_FLASH_REVEAL_DURATION = 0.6
```

`ROCKET_SURVEY_HP / ROCKET_SURVEY_DAMAGE_PER_HIT = 8` hits per reveal — same ballpark as rock prospecting.

## Testing strategy

**Pure TS — full unit coverage:**
- `src/lib/level/__tests__/rocketSurveyState.spec.ts`:
  - Initial state is `idle`, `surveyHp = 0`. Tests use a stub `rockAvailability` that returns `{ spawnIndex: 1 }` by default.
  - `setQuotas` with all-delivered → state goes to `exhausted`; further `scienceHit` returns `null`.
  - `scienceHit` from `idle` with scannable mineral → state moves to `ramping`, hp initialised, returns `{ phase: 'ramping', justRevealed: false }`.
  - `scienceHit` from `idle` without scannable mineral → stays `idle`, returns `null`.
  - Repeated `scienceHit` decrements hp deterministically.
  - Reveal-step `scienceHit` with `rockAvailability → spawnIndex` → returns `{ justRevealed: true, targetItemId, targetSpawnIndex }`; state moves to `awaitingDelivery`.
  - Reveal-step `scienceHit` with `rockAvailability → null` for the only scannable itemId → returns `{ justRevealed: false }`; itemId added to `skippedItemIds`; state moves to `idle` since nothing else is scannable.
  - Reveal-step `scienceHit` with `rockAvailability → null` for the first itemId, but a second still-needed itemId is scannable → returns `{ justRevealed: false }`; first itemId skipped; state moves to `ramping` with hp reset and target = second itemId.
  - `notifyDelivery` with matching itemId → state moves to `idle`; next still-needed mineral becomes scannable.
  - `notifyDelivery` with non-matching itemId → state unchanged.
  - `notifyDelivery` clears that itemId from `skippedItemIds` (subsequent scans may re-target it if it's still needed).
  - All-delivered after `notifyDelivery` → state moves to `exhausted`.
  - `detach` from any state → state returns to `idle`; `skippedItemIds` cleared.

**Three.js / Vue layers:**
- Type-check + lint + manual smoke test (per `CLAUDE.md` testing convention).

## Risks

- **Bolt routing collision:** If the rocket AABB sits next to the gather flat zone's terrain, a stray bolt could double-hit. Mitigation: rocket check fires before rock check; `hitRocket` short-circuits subsequent classification.
- **Marker color collision:** Mission objective beams are cyan, prospect overlay is green. The waypoint beam's green is distinct from the prospect overlay because they appear on different objects (rock surface marker vs. wireframe overlay), but worth verifying in smoke.
- **Quota snapshot staleness:** Gather minigame mutates quotas in callbacks. The state machine reads via the snapshot getter on every `scienceHit`, so freshness is guaranteed at hit time.

## Files

**New:**
- `src/lib/level/rocketSurveyState.ts`
- `src/lib/level/RocketSurveyFacade.ts`
- `src/lib/level/rocketSurveyConstants.ts`
- `src/lib/level/__tests__/rocketSurveyState.spec.ts`

**Modified:**
- `src/lib/fps/projectileSystem.ts` — `'science_rocket'` impact kind, `onScienceRocketHit`, rocket AABB hookup.
- `src/three/DepositRocketModel.ts` — `flash(progressRatio)` method, screen + antenna emissive override.
- `src/three/WaypointMarkers.ts` — expose color through `addWaypointMarker`.
- `src/lib/minigame/GatherMinigame.ts` — `getRocketGroup`, `getQuotaSnapshot`, `onQuotaChange`, `onMineralDelivered` accessors / callbacks.
- `src/audio/audioManifest.ts` — register `sfx.tool.surveyReveal`.
- `src/audio/LevelAudioDirector.ts` — `notifySurveyReveal(worldPos, camera)`.
- `src/components/PickupToast.vue` — `surveyEntries` prop and rendering.
- `src/views/LevelView.vue` — `surveyEntries` ref, `recordSurvey`, `onSurvey` wiring, prop pass-through.
- `src/views/LevelViewController.ts` — instantiate / dispose facade, expose `onSurvey` host callback. **No new business logic.**
- `src/lib/mining/rockYieldSystem.ts` — `forEachActiveRock` iterator (additive).

## Open questions

None. Ready for plan.
