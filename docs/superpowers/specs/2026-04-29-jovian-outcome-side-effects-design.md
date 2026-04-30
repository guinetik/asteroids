# Outcome Side Effects — Shuttle Buff, Hektor Disposition, Giver Blacklist

_Plan 7 of the Jovian Society Prospection contract rollout. Final plan in the chain._

---

## Premise

By the time the player picks an outcome on the prospectus terminal, plans 1-6 have:
- Walked them through the contract's 9 steps and gotten them to the terminal.
- Resolved the choice via plan 6's overlay → `notifyChoiceResolved(missionId, outcomeId)`.
- Dispatched plan 2's `completionByOutcome` arm matching the chosen outcome.
- Persisted the outcome's reward effects on the player profile: `profile.shuttleBuffs.jovianEmpowerment = 1.5`, `bodyAccess.hektor = 'destroyed'` (transmit) or `'liberated'` (tamper), `profile.disabledGiverIds['jovian-society'] = true` (tamper), and the existing `mission-pay-multiplier` for Jupiter on transmit (cohort-member).

What plans 1-6 did **not** do is make those flags mean anything mechanically. The shuttle buff persists but doesn't apply to ship stats. The destroyed body is removed by plan 1's renderer-skip path but there's no visual punctuation. The disabled giver flag is set but the Society still surfaces missions on the Jupiter board. Plan 7 is the connective tissue: it reads the persisted flags at runtime and turns them into actual game effects.

This is the last plan. After it lands, the contract is fully playable from offer through resolution to consequence, and the player who picked TRANSMIT *feels* the shuttle's new envelope, sees Hektor missing from the map, and watches the Society stop posting work; the player who picked TAMPER sees Hektor stay, watches it integrate into the Jupiter asteroid pool, and sees the Society's Jupiter listings disappear from their board.

---

## Scope

**In scope**

1. **`shuttle-buff` math** — read `profile.shuttleBuffs.jovianEmpowerment` (or any registered buff) and apply the multiplier to the relevant shuttle stats at runtime.
2. **Hektor `destroyed` visual** — one-time debris field on first flyby through Hektor's former L4 position after the contract resolves with TRANSMIT, then nothing on subsequent passes. (Authored memory, per GDD Q7.) Falls back to "just gone" if the debris-field implementation runs long.
3. **Hektor `liberated` integration** — when `bodyAccess['hektor'] === 'liberated'`, Hektor becomes a candidate body for procedural Jupiter-giver missions (mining, photometry, DAN, gather). The asteroid mission generator includes it in its pool of named bodies in `jovian-trojans` region.
4. **`disable-giver` enforcement** — when `profile.disabledGiverIds['jovian-society'] === true`, the Jovian Society giver does not surface on the Jupiter mission board. Their missions don't roll up in the procedural board generation. Their giver entry in the kiosk listing disappears.
5. **Replay safety** — all of the above read the profile at runtime, not at completion time, so plan 2's `replayCompletedRewards` and any save-migration self-heal Just Work.
6. **Tests** — buff math applies expected multiplier to stats; destroyed/liberated states drive the right behaviors; disabled giver does not surface; replay across reload is stable.

**Optional / deferred to Act 3**

- **Cinderline / moon-worker union follow-up message.** GDD seeds an Act-3 hook: ~2 in-game days post-tamper, a delayed inbox message arrives from a moon-worker contact (or Cinderline) acknowledging the player's choice obliquely. Plan 7 can ship this if cheap (it's just a delayed-message enqueue with a date check), but the dialogue authoring and the chain of follow-ups belong to Act 3 design. Default: defer.

**Out of scope**

- Any new contracts, missions, or givers.
- Any UI redesign on the orbit prompt or mission board beyond the giver-suppression check.
- Refactoring the buff system into a more general modifier pipeline. Plan 7 ships a focused implementation; if the codebase grows more buffs in Act 3, that's the time for generalization.

---

## Shuttle buff — design call

GDD's open question 6 asks whether `jovianEmpowerment` is **+50% to all shuttle stats** (top speed, fuel capacity, hull, thruster charge, slingshot, turret) or a narrower scope.

**Recommendation: ship full scope first, tune down only if it breaks things.**

The transmit reward needs to *feel* enormous to make the choice meaningful. The whole design pivot of the contract is "huge reward + dirty conscience vs. nothing + clean conscience." If the buff is tame, players who tamper will feel like they sacrificed nothing — and the moral weight of the choice evaporates. The GDD calls this out directly: "The temptation must be real."

Stats targeted by the +50% multiplier:

- **Top speed** — main thruster max velocity multiplier
- **Fuel capacity** — shared fuel pool size (both shuttle and lander)
- **Hull HP** — both shuttle and lander max HP
- **Thruster charge** — `ThrusterSystem` group capacity (all groups: main, RCS, slingshot, turret if present)
- **Recharge rate** — `ThrusterSystem` group recharge rate
- **Slingshot charge** — solar/planetary slingshot energy gained per orbit

That's the full envelope. If a particular stat is broken-feeling in playtest (e.g. top-speed +50% makes navigation impossible to tune for), the implementer narrows the scope inline and notes which stats were excluded.

### Implementation

A new `src/lib/shuttle/buffs.ts` (or co-located with whatever module owns shuttle stats) reads `profile.shuttleBuffs` at the points where stats are read:

```ts
/**
 * Apply registered shuttle buffs to a base stat value.
 * Multiplies by every registered buff's multiplier (compounding if multiple buffs target the same stat — though for now there's only one buff).
 */
export function applyShuttleBuffs(
  profile: PlayerProfile,
  baseValue: number,
  _statKey: string,   // reserved for per-stat buffs in future; jovianEmpowerment applies to all
): number {
  if (!profile.shuttleBuffs) return baseValue
  let value = baseValue
  for (const multiplier of Object.values(profile.shuttleBuffs)) {
    value *= multiplier
  }
  return value
}
```

The `_statKey` is reserved for future buffs that target specific stats. `jovianEmpowerment` is global, so it applies regardless of `statKey`.

Call sites: any place that reads `MAX_FUEL`, `MAX_HULL`, `MAX_SPEED`, etc. The implementer audits where these constants are used and wraps each read site with `applyShuttleBuffs(profile, RAW_VALUE, 'fuel')`. For `ThrusterSystem` groups, the constructor (or hot-reload of capacity/rechargeRate) reads the buff and scales accordingly.

Edge case: when the buff is granted, the player's *current* fuel level / hull HP / thruster charge doesn't auto-fill to the new max. The increased capacity raises the ceiling; existing values stay where they are. (Player has to refuel/repair to reach the new max.) That's correct game-feel.

### Tests

- `applyShuttleBuffs(profile, 100, '_')` returns `150` when `profile.shuttleBuffs.jovianEmpowerment === 1.5`.
- Multiple buffs compound: `{ a: 1.5, b: 2 }` → `300`.
- Missing `shuttleBuffs` field returns the base value.
- One end-to-end check: a profile with the buff set hits the shuttle stat reads and produces the expected effective max.

---

## Hektor `destroyed` — visual punctuation

Plan 1's renderer skips bodies whose `bodyAccess` is `'destroyed'`, so Hektor is gone from the map by default. Plan 7 adds a small authored beat: **the first time the player flies through Hektor's former L4 region after the destroyed transition, a debris field renders for that one approach.** Subsequent passes show nothing.

Implementation:

- New profile field: `seenHektorDebris: boolean` (default `false`).
- When `bodyAccess['hektor'] === 'destroyed'` AND `seenHektorDebris === false` AND the player's map position enters a radius around Hektor's former orbital position: render a debris field (procedural particle cloud at Hektor's last-known orbital coords, ~1.5x the body's display radius, colored from the body's `accentColor`). On exit from the trigger radius, set `seenHektorDebris = true` and persist.
- After flagged: skip the debris render. Hektor is gone, the moment was authored.

The "former orbital position" is a bit fuzzy because Hektor was on Jupiter's orbital ring at L4 — it would have moved over time. For game purposes the renderer can just use the orbital elements from `planetarium.json` to compute where Hektor *would* be right now; the debris field renders there, then disappears.

If the debris field implementation feels heavy for plan 7, the fallback is "just gone" — `bodyAccess === 'destroyed'` skips the body, no debris, and the absence speaks for itself. That's acceptable. The debris field is polish, not load-bearing.

---

## Hektor `liberated` — joining the asteroid pool

When `bodyAccess['hektor'] === 'liberated'`:

1. **Renderer keeps Hektor visible.** Already handled by plan 1's `isBodyRendered` returning `true` for `'liberated'`.
2. **Asteroid mission generator surfaces it.** Audit how named asteroids (eros, vesta, bennu, etc.) enter the Jupiter giver's procedural pool. If they're listed in a region map (e.g. `jovian-trojans` region pulls from `[hektor, eurybates, ...]`), add Hektor conditionally — only included when access is `'liberated'`.
3. **Standard Jupiter missions can spawn there.** Mining, photometry, DAN, gather — same as any other Jupiter asteroid. Hektor isn't special anymore; it's just another rock the cohort would have mined if the contractor hadn't tampered.
4. **No special flavor on these missions.** The asteroid catalog entry stays the same (Hektor's `name`, `composition`, etc. don't change). The Jovian giver in plan 3's generic-pool work might roll Hektor as a target via region weighting.

The `liberated` state is asymmetric to `destroyed` in one way: the body keeps existing in the world, available for normal play. The player's reward is the asteroid still being there.

### Edge case: the Society can't post missions to Hektor on `liberated`

When the player tampers, plan 7 also disables the Jovian Society giver entirely (next section). So Hektor as a `liberated` body would only ever surface via *other* Jupiter givers — not the Society itself. That's fine and on-theme: the Society no longer wants the player anywhere near their (former) asset.

---

## `disable-giver` enforcement

When `profile.disabledGiverIds['jovian-society'] === true`:

1. **Giver does not surface on the Jupiter mission board.** Audit the mission-board surfacing logic (likely `getGiversForDifficulty` or sibling in `giverCatalog.ts`). Filter out any giver whose id is in `disabledGiverIds`.
2. **Procedural mission generation skips the giver.** When the system rolls a giver for a procedural mission, exclude disabled ones.
3. **The giver's existing missions on the player's board (if any are unaccepted at the moment of tamper) stay until they expire.** Plan 7 doesn't actively cancel pending offers — that's overreach. New mission generation just stops including the giver.

The tamper completion message ("We will not be retaining you for further work") narrates the disablement; plan 7 makes it real.

### Re-enable hooks

Plan 7 doesn't ship any UI to re-enable a disabled giver. If the design ever wants a "the Society reopens its books to you" path, that's a future contract that flips the flag back. Plan 7 just respects the flag.

---

## Cinderline / moon-worker follow-up — optional

GDD's Act-3 seed: ~2 in-game days post-tamper, a delayed inbox message arrives from a moon-worker contact or Cinderline. Tone: oblique acknowledgment. The Society's behavior was visible to others; the player's choice didn't go unnoticed.

If shipped in plan 7:

- New message catalog entry, e.g. `cinderline-acknowledgment`.
- A scheduled-message system (does one exist? if not, this is more work) enqueues it 2 in-game days after the contract resolved with `tamper`.
- Body text suggested by the GDD: subtle, doesn't name Hektor or the Society directly, just acknowledges "the work you did not do" or similar.

If the scheduled-message system doesn't exist and would need authoring: defer to Act 3. Plan 7 ships a TODO note in the contract resolution path; Act 3 plans pick it up.

If a delayed-inbox-enqueue already exists (e.g. for the tutorial flow): cheap to wire.

**Default: defer unless the implementer finds the scheduling primitive trivially available.**

---

## Tests

In `src/lib/shuttle/__tests__/` (or wherever buffs live):

1. **`applyShuttleBuffs` math** — covered above.
2. **End-to-end max-fuel computation** — profile with buff produces the expected max fuel value at the call site.

In `src/lib/contracts/__tests__/`:

3. **Transmit outcome end-to-end.** Drive the contract to resolution with `transmit`. Assert: `bodyAccess.hektor === 'destroyed'`, `shuttleBuffs.jovianEmpowerment === 1.5`, Jupiter `mission-pay-multiplier === 2`, `disabledGiverIds['jovian-society']` is `undefined`.
4. **Tamper outcome end-to-end.** Drive to resolution with `tamper`. Assert: `bodyAccess.hektor === 'liberated'`, `shuttleBuffs` empty, no mission-pay-multiplier change, `disabledGiverIds['jovian-society'] === true`.
5. **Replay safety.** Persist the post-resolution profile, reload, assert all flags survive and the runtime effects re-apply.

In `src/lib/missions/__tests__/`:

6. **Disabled giver suppression.** With `disabledGiverIds['jovian-society'] = true`, `getGiversForDifficulty(...)` for Jupiter does not include `jovian-society`.
7. **Liberated asteroid surfaces.** With `bodyAccess.hektor === 'liberated'`, the procedural mission generator's pool of named bodies in `jovian-trojans` includes `'hektor'`. Without the flag, it doesn't (or doesn't yet — plan 7 may allow Hektor pre-flag too if the implementer prefers; see open question).

Manual:

8. **Transmit playthrough.** Complete the contract with TRANSMIT. Verify the shuttle feels significantly more capable (fuel lasts longer, hull is harder to damage, thrusters charge faster, top speed is higher). Verify Hektor is gone on next pass; first flyby through L4 shows debris briefly, subsequent passes show nothing. Verify Society listings persist on the Jupiter board (cohort-member, not blacklisted).
9. **Tamper playthrough.** Complete with TAMPER. Verify shuttle stats are unchanged. Verify Hektor stays visible and orbit-able. Verify Hektor occasionally rolls up as a target for Jupiter giver missions (mining, photometry from non-Society givers). Verify Society listings vanish from the Jupiter board.

---

## Acceptance criteria

1. `bun run type-check` passes.
2. `bun run lint` passes.
3. `bun run test:unit` passes including new tests.
4. **Manual: transmit playthrough mechanics meaningfully different.** The buff is felt; Hektor is gone; the Society is still around.
5. **Manual: tamper playthrough mechanics meaningfully different.** No buff; Hektor persists in the asteroid pool; Society is invisible.
6. **Plans 1-6 regression.** All prior acceptance criteria still pass.
7. **Replay-stable.** Loading a save mid-state (e.g. mid-Movement-2 of the contract, or post-resolution) recovers all flags correctly.

---

## Open questions for the implementer

1. **Buff scope tuning.** I argued for full scope. Playtest may show a particular stat (probably top speed or slingshot) is broken at +50%. Narrow inline if so; document which stats were excluded.
2. **Debris field implementation.** Procedural particle cloud or a small canvas overlay? If the existing rendering toolkit has a particle system, prefer that. If not, the fallback is "just gone."
3. **Liberated body in pre-flag state.** Should the procedural Jupiter pool ever include Hektor *before* `liberated` (e.g. during the contract's Movement 2-3, while Hektor is `unrestricted`)? My instinct: no — only contract missions target Hektor while the contract is active. After resolution it's available either way (destroyed = gone, liberated = open pool). If the implementer thinks pre-resolution access is fine, that's a tunable; doesn't change the spec.
4. **Cinderline follow-up.** Defer unless the scheduling primitive is trivially available.
5. **Multi-buff interaction.** The current `applyShuttleBuffs` compounds multiplicatively. If Act 3 introduces a second buff that should additive-stack instead, the implementer adapts then; plan 7 doesn't need to anticipate.

---

## End of contract

After plan 7 lands, the Jovian Society Prospection contract is **complete and shippable**. The full arc — offer, generic recruiting, attunement, photometry, comparison data, DAN, prospectus, choice, consequence — is playable end-to-end with both outcomes producing distinct mechanical and narrative endings.

The infrastructure built across plans 1-7 (pinned bodies, contract-driven special missions with auto-activation, choice-mission step kind, completion-by-outcome, body access state machine, shuttle buff system, giver disablement) is reusable for Act 3 contracts that need similar shapes. None of it was authored Jovian-specific at the engine level.
