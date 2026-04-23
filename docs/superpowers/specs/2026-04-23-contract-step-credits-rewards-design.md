# Contract Step CR Rewards Design

> Spec for paying CR on every contract step transition, surfacing the payout
> through the existing mission notification toast plus a new `sfx.money`
> audio cue. Authored 2026-04-23.

## Overview

Contracts ship with completion-time `rewards` (fast-travel kiosks, mission-pay
multipliers, shuttle-upgrade grants) but no mid-arc carrot. Long arcs like
the Martian Marine Corps Cohort require the player to install several tiers
of turret upgrades up-front, which can drain the wallet before the bonus pay
kicks in. That bookkeeping turns a punchy military tone into an accountancy
exercise.

This design adds an authored, per-step `creditsReward` field. When a step
crosses its completion threshold, the player is paid that amount, the
existing `mission-notification` toast surfaces the gain, and a new
`sfx.money` cue fires.

## Why this design

- **Carrot every step, not just at the finish.** The player feels progress
  on a timescale that matches input cost (turret install -> mining run pays
  for the next install).
- **Authoring stays in JSON.** Each contract owns its tone (Sampaio's
  double-pay belt vs. Maverick's loaded high-roller table vs. USC's
  $666.69 minimum-wage joke). Per-step explicit value beats a global rule
  that always loses to copywriter intent.
- **Reuses the existing toast.** `MapView.vue` already exposes a 4-second
  `showMissionNotification(text)` helper used by the EVA / shuttle / mining
  delivery flows. No new component, no new layout decision.
- **Engine change is minimal.** A single new hook fires on the existing
  step-transition gate inside `ContractSystem.advanceStep`. Runtime layer
  pays the wallet; UI layer renders the toast. Each layer has one concern.
- **Idempotent on replay.** The hook is intentionally NOT fired during
  `replayCompletedRewards` so reloading a save with a finished contract does
  not double-pay or replay toasts.

## Decisions

| Decision                                  | Choice                                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| Where does the payout live?               | Per-step `creditsReward?: number` in JSON, default `0`                                        |
| Fractional values?                        | Allowed. Persisted via `addCredits` (no rounding). USC's `666.69` is intentional             |
| When does the hook fire?                  | Live `advanceStep` only, on the same gate that already routes step / completion messages    |
| Does the hook fire during replay?         | No — replay re-applies completion `rewards` only, never per-step CR                         |
| Wallet write path                         | `runtime.ts` calls `addCredits(profile, amount)` + `saveProfile`, then notifies subscribers |
| HUD sync path                             | `MapView.vue` calls `viewController.refreshPlayerProfileFromStorage()` inside the listener   |
| Notification surface                      | Existing `showMissionNotification(text)` toast (`mission-notification` class)               |
| Notification copy                         | `Contract step complete — +N CR` (uses `Number.toLocaleString()`)                            |
| Audio cue                                 | New `sfx.money` registered in the audio manifest, played via `uiAudio.notifyCreditsAwarded()` |
| Sound asset                               | `public/sound/sfx.money.mp3`                                                                 |

## Components

### Updated — `src/lib/contracts/contractTypes.ts`

- New `ContractStepRewardMixin` interface with `creditsReward?: number` (TSDoc
  notes that fractional values are preserved end-to-end).
- Every step variant — `CompleteMissionsStep`, `InstallUpgradeStep`,
  `VisitPlanetStep`, `OrbitalMissionStep`, `TradeGoodsStep` — extends the
  mixin so existing JSON without the field continues to type-check.

### Updated — `src/lib/contracts/ContractSystem.ts`

- New exported payload `ContractStepCompletedPayload`
  (`contractId`, `stepIndex`, `creditsReward`).
- New optional hook `onContractStepCompleted` on `ContractSystemHooks`.
- Inside `advanceStep`, on the `counters[stepIndex] >= required` branch,
  fire the hook with `step.creditsReward ?? 0` BEFORE delivering the
  next-step / completion message. The hook is not invoked from
  `replayCompletedRewards` (which only re-applies completion `rewards`).

### Updated — `src/lib/contracts/runtime.ts`

- New listener set `contractStepCompletedListeners` and exported
  `onContractStepCompleted(listener)` mirroring the existing
  `onContractCompleted` pattern.
- New private `payContractStepCredits(amount)` helper — guards against
  non-finite / non-positive amounts, then `loadProfile` -> `addCredits` ->
  `saveProfile`.
- The `ContractSystem` instance gains an `onContractStepCompleted` callback
  that pays the wallet first, then fans the payload out to subscribers.

### Updated — `src/audio/audioManifest.ts`

- New `'sfx.money'` entry in `AUDIO_SOUND_IDS`.
- Manifest record points at `/sound/sfx.money.mp3` with category `ui`,
  `playback: 'restart'`, `volume: 0.7`, mirroring `sfx.contract`.

### Updated — `src/audio/UiAudioDirector.ts`

- New `MONEY_VOLUME = 0.6` constant.
- New `notifyCreditsAwarded()` method playing `sfx.money` at `MONEY_VOLUME`.

### Updated — `src/views/MapView.vue`

- Imports `onContractStepCompleted` from the contract runtime.
- New `unsubscribeContractStepCompleted` reference, registered post-`init`
  alongside `unsubscribeContractShuttleUpgrade`, torn down in `onUnmounted`.
- The handler calls `viewController.refreshPlayerProfileFromStorage()`,
  refreshes `shopProfile`, and (when `creditsReward > 0`) shows the toast +
  plays `sfx.money`. Zero-reward steps still surface inside the inbox via
  the existing contract-update flow; the credit toast simply stays quiet.

### Updated contract JSONs

| Contract                              | Per-step payout                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| `space-cowboys-mars-hq.json`          | `500` on every step (Jay is your partner; you live off the pro labore)         |
| `usc-venus-certification.json`        | `666.69` on every step (USC is the day job; minimum wage)                      |
| `martian-marine-corps-cohort.json`    | `1000` on each `install-upgrade` step, `4000` on each `complete-missions` step |
| `venusian-zeppelin-trade-loop.json`   | `3000` on every trade step (Maverick is loaded; the table pays well)           |

The Maverick intro also gains a "lose your shuttle, lose your cargo" line
so the player walks into the trade loop knowing the Exchange does not
insure freight.

## Data flow

1. Player satisfies a step (mission completes, upgrade installs, planet
   visited, trade transaction commits).
2. `ContractSystem.advanceStep` updates the counter and detects the
   threshold crossing.
3. Engine fires `onContractStepCompleted({ contractId, stepIndex, creditsReward })`.
4. `runtime.ts` receives the hook:
   1. Pays the wallet via `addCredits` + `saveProfile`.
   2. Fans the payload out to UI subscribers.
5. `MapView.vue` subscriber:
   1. Calls `viewController.refreshPlayerProfileFromStorage()` so the credits
      HUD updates instantly.
   2. Calls `showMissionNotification(`Contract step complete — +N CR`)`.
   3. Calls `uiAudio.notifyCreditsAwarded()` to play `sfx.money`.
6. Engine continues with the existing flow: deliver the next step's flavor
   message, or deliver the completion message + apply completion rewards
   when the contract finishes.

## Testing

- `src/audio/__tests__/audioManifest.spec.ts` — extended `AUDIO_SOUND_IDS`
  expectation list to include `'sfx.money'`.
- `src/lib/contracts/__tests__/ContractSystem.spec.ts` — new
  `onContractStepCompleted hook` describe block:
  - Fires exactly once per step transition with the authored payout
    (including `0` for steps that omit `creditsReward`).
  - Does not fire on partial counter increments before the threshold.
  - Does not fire during `replayCompletedRewards`.

## Out of scope

- New animated banner / bespoke component for the credit gain (we reuse
  the existing toast on purpose).
- Reward changes for completion-time `Contract.rewards` (still applied
  through the existing path).
- Refactoring per-mission CR payouts (`shuttleMissionSession`,
  `asteroidMissionRewards`, `turretMiningRewards`).
- Persisting per-step payout history (the snapshot already records the
  step counters; CR balance is observed in the player profile).
