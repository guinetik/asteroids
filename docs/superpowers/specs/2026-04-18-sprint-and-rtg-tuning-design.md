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

New constant + state:

```ts
const SPRINT_RELOCK_FRACTION = 0.3
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

## Files Changed

- `src/three/FpsPlayerController.ts` — added `SPRINT_RELOCK_FRACTION` constant,
  `sprintLocked` field, and lockout logic in `tick()`.
- `src/data/fps/multitool-config.json` — `fuelCapacity 240 → 720`,
  `weapon.fuelCostPerRecharge 6.0 → 4.0`.
