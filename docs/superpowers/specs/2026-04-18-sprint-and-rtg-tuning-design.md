# Sprint Lockout + RTG / Laser Tuning

**Date:** 2026-04-18
**Author:** guinetik (with agent assistance)
**Spec:** Stop sprint from stuttering on after exhaustion, and rebalance the
multitool RTG so the laser doesn't drain the tank in two trigger pulls.

## Problems

1. **Sprint stutter** — `FpsPlayerController` only checked
   `thrusterSystem.canFire('sprint')` (which is "do I have enough charge for
   one frame?"). The moment the bar emptied and the player kept Shift held,
   each individual frame of recovered charge was immediately spent. Visually
   the player twitched between sprint and walk speed for several seconds, and
   the sprint sound effect chattered. Felt like the system was fighting input.
2. **Laser too thirsty** — multitool weapon thruster had
   `fuelCostPerRecharge: 6.0` (highest of the three) on top of an aggressive
   `rechargeRate: 18`. A single full bar drained ~120 of the 240-unit RTG
   tank, so two engagements emptied the entire reactor.
3. **RTG tank too small** — even with the efficiency buff above, the player
   wanted more headroom on the shared tank for sustained combat / drilling.

## Fixes

### 1. Sprint lockout latch in `FpsPlayerController`

New constant + state (the constant was originally `0.3`; raised to `0.5`
in followup #3 — see below):

```ts
const SPRINT_RELOCK_FRACTION = 0.5
private sprintLocked = false
```

Added to the top of `tick()`:

```ts
const sprintCfg = this.config.o2.thrusters.sprint
const sprintCharge = this.thrusterSystem.getState('sprint').charge
if (sprintCharge <= 0) {
  this.sprintLocked = true
} else if (
  this.sprintLocked &&
  sprintCharge >= sprintCfg.capacity * SPRINT_RELOCK_FRACTION
) {
  this.sprintLocked = false
}
```

And folded into the `isSprinting` computation:

```ts
const isSprinting =
  this.body.grounded &&
  this.inputManager.isActionActive('sprint') &&
  !this.sprintLocked &&
  this.thrusterSystem.canFire('sprint')
```

When the bar empties, sprint is locked until the bar refills to 30 % of
capacity — about 1 s of standing still at the current recharge rate. Holding
Shift during the lockout does nothing, so the player can't dribble out one
frame of sprint at a time.

### 2. Laser efficiency buff + 3 × RTG capacity

`src/data/fps/multitool-config.json`:

| Field | Old | New |
|---|---|---|
| `rtg.fuelCapacity` | 240 | **720** (3 ×) |
| `rtg.thrusters.weapon.fuelCostPerRecharge` | 6.0 | **4.0** |

Combined effect on the laser: a full sweep that previously cost ~119 fuel
now costs ~79 fuel against a 720-unit tank, so sustained DPS is roughly
~5 × what it was without changing the per-shot damage profile or rate of
fire. Drill and heal thrusters are unchanged (their efficiency was already
fine; the user only flagged the laser).

`burstMin` / `burstMax` / `burstAmount` (passive RTG decay drip) are
intentionally untouched — the larger tank means each natural decay tick still
provides a meaningful refill but won't trivially top off the new capacity.

## Verification

- `bun run type-check` — exit 0.
- `bun test:unit` — 1127/1127 pass (no sprint or RTG capacity values are
  hard-coded in the suite, so the tuning shifts didn't break anything).

## Followup — audio + downstream consumers honour the lockout

After shipping the lockout the player movement was correct, but the run-breath
audio loop in `LevelViewController` was still chattering during the recovery
window. The audio block (and the multitool / footsteps blocks alongside it)
were independently recomputing "is the player sprinting?" from
`isActionActive('sprint') && canFire('sprint')`, which doesn't know about the
lockout — so every frame of recovered charge briefly counted as sprinting
and re-triggered the breathing crossfade.

Fix:

1. Added an `isSprinting` getter on `FpsPlayerController` that exposes the
   exact value computed inside `tick()` (grounded + input + !locked + canFire).
2. `LevelViewController` now reads `playerController.isSprinting` for breathing
   crossfade, multitool sprint state, and footsteps cadence — all three were
   duplicating the check.
3. `FpsViewController.multiTool.setState` switched to the same getter so the
   demo scene benefits too.

Single source of truth: anywhere downstream that needs "is the player
sprinting?" reads `isSprinting`, never the raw input/charge pair.

## Followup #2 — require Shift release to clear the lockout

After the audio routing fix the breathing-run loop *still* pulsed every couple
of seconds when the player kept Shift held through exhaustion. Root cause:
the lockout was auto-clearing as soon as the bar refilled past
`SPRINT_RELOCK_FRACTION` (30 %), so with the current tuning
(`capacity 50, burnRate 25, rechargeRate 15`) a held-Shift run would cycle:

- recharge to 15 (1.0 s) → unlock
- sprint, drain 15 → 0 (0.6 s) → lock
- repeat every ~1.6 s

Each unlock counted as a fresh rising edge of `isSprinting`, restarting
`sfx.breathing.run` from zero — perceived by the player as the sprint sound
"spamming" while there was no real stamina to back it up.

Fix: gate the lockout's auto-clear on **both** the charge gate *and* a Shift
release. New field on `FpsPlayerController`:

```ts
private sprintReleasedSinceLockout = true
```

Set to `false` when the lockout latches, set back to `true` the first frame
the sprint button is observed released. The unlock condition becomes:

```ts
if (
  this.sprintLocked &&
  this.sprintReleasedSinceLockout &&
  sprintCharge >= sprintCfg.capacity * SPRINT_RELOCK_FRACTION
) {
  this.sprintLocked = false
}
```

Now after exhaustion, the player must let go of Shift before sprint becomes
available again — the standard FPS stamina convention. The
recharge-drain-lock cycle (and the audio pulse it caused) is gone, and any
re-engagement is a deliberate input that the breathing crossfade can react to
cleanly.

## Followup #3 — raise the unlock charge gate to 50 %

Even with the release requirement, the unlock fired as soon as the bar hit
30 % capacity (≈1 s of recovery). Players who instinctively release+repress
Shift the moment they notice they've stopped sprinting were back in a sprint
within a heartbeat, and the breathing-run loop crossfaded right back in. The
"out of stamina" beat just wasn't long enough to read as a real cooldown.

Bumped `SPRINT_RELOCK_FRACTION` from `0.3` → `0.5`, which (with the current
`capacity 50 / rechargeRate 15` tuning) means sprint can't re-engage until
the bar is visibly half-full — about 1.7 s of recovery. Combined with the
release-required gate from followup #2 this finally feels like a proper
"winded" beat, and `isSprinting` only flips back true on a clearly-recovered
bar.

Also added: `replenish()` now clears `sprintLocked` and resets
`sprintReleasedSinceLockout` so a return-to-lander refill (or any other
manual top-up) gives the player fresh sprint immediately, without forcing a
Shift release first.

## Files Changed

- `src/three/FpsPlayerController.ts` — added `SPRINT_RELOCK_FRACTION` constant,
  `sprintLocked` + `sprintReleasedSinceLockout` fields, lockout logic in
  `tick()` (with the release-required gate added in followup #2), and an
  `isSprinting` getter backed by the latest tick state.
- `src/data/fps/multitool-config.json` — `fuelCapacity 240 → 720`,
  `weapon.fuelCostPerRecharge 6.0 → 4.0`.
- `src/views/LevelViewController.ts` — breathing crossfade, multitool state, and
  footsteps cadence now read `playerController.isSprinting` instead of
  recomputing from raw input + `canFire`.
- `src/views/FpsViewController.ts` — `multiTool.setState` reads
  `playerController.isSprinting`.
