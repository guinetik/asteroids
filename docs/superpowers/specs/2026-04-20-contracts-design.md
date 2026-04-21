# Contracts and Fast Travel Design

> Spec for the Contracts and Fast Travel features. Authored 2026-04-20.

## Overview

This spec defines two coupled gameplay systems:

1. **Contracts** — multi-step guided progression arcs delivered as messages in
   their own per-contract inbox folder. Each contract is a sequence of steps;
   completing all of them grants reward effects (fast-travel kiosks, mission
   pay multipliers).
2. **Fast Travel** — instant in-orbit relocation between planets the player has
   unlocked through contracts. Triggered by clicking an unlocked planet on the
   tactical map.

The two systems are wired together: the only way to unlock fast travel for a
planet is to finish a contract whose `rewards` includes a `fast-travel` effect
for that planet id.

## Why this design

- **Lore-first delivery** — the existing `MessageSystem` already drives the
  ShipNet inbox UI. Reusing it for contract intros / step flavor / completion
  means contracts feel like dispatcher transmissions rather than a quest log.
- **Pure data + tiny engine** — contract content lives in JSON. The
  `ContractSystem` is a thin event-driven state machine that can be unit-tested
  without UI. Adding new contracts is a JSON-only change.
- **Decoupled events** — gameplay subsystems do not import the contract
  system. Instead, the consumer layer (the map view + the asteroid mission
  reward writer) calls `contractSystem.notifyXxx()` at the right boundaries.
- **Retroactive evaluation only where it makes sense** — `visit-planet` and
  `install-upgrade` steps auto-complete when the player already qualifies on
  acceptance. `complete-missions` counters never look back.

## Data model

All types live in `src/lib/contracts/contractTypes.ts`.

### Contract definition (JSON-authored)

```ts
interface Contract {
  id: string                       // stable id, used for folderId + persistence
  inboxName: string                // sidebar folder label
  from: string                     // sender display name (all messages)
  sentAt: string                   // ISO/lore date string (all messages)
  triggerOnMessageArchived?: string // offer when this message id is archived
  triggerOnMissionCompletedNth?: number // offer on the Nth observed mission completion
  introSubject: string
  introBody: string[]
  introAudioUrl?: string
  steps: ContractStep[]
  completionSubject: string
  completionBody: string[]
  rewards: RewardEffect[]
}
```

### Steps

```ts
type ContractStep =
  | { kind: 'complete-missions'; count: number; missionType?: 'shuttle' | 'asteroid' | 'eva';
      giverId?: string; giverPlanetId?: string; subject: string; flavor: string[] }
  | { kind: 'install-upgrade'; upgradeId: UpgradeId; minLevel: number;
      subject: string; flavor: string[] }
  | { kind: 'visit-planet'; planetId: string; subject: string; flavor: string[] }
  | { kind: 'orbital-mission'; planetId: string; subject: string; flavor: string[] }
```

- **complete-missions** counts post-acceptance mission completions matching the
  filters. Counter increments by 1 per matching event.
- **install-upgrade** auto-satisfies on accept if the player already has
  `upgradeId` at `>= minLevel`; otherwise satisfies the moment a future install
  pushes the level above the threshold.
- **visit-planet** auto-satisfies on accept if the player has ever orbited the
  planet (uses `orbitedSolarBodies`); otherwise satisfies on the next
  `orbiting` transition for that planet.
- **orbital-mission** counts each planetary shuttle mission whose orbital
  minigame completes at `planetId`. The planet only needs to match the
  mission's `targetPlanet`; delivery may happen elsewhere.

### Rewards

```ts
type RewardEffect =
  | { type: 'fast-travel'; planetId: string }
  | { type: 'mission-pay-multiplier'; planetId: string; multiplier: number }
```

Rewards are applied in `src/lib/contracts/runtime.ts` via
`applyRewardToProfile`. They mutate the persisted `PlayerProfile`:

- `fast-travel` adds `planetId` to `unlockedFastTravelPlanets`.
- `mission-pay-multiplier` raises `missionPayMultipliers[planetId]` (max-only —
  it never regresses an existing bonus).

### Runtime instance

```ts
interface ContractInstance {
  contractId: string
  status: 'available' | 'active' | 'completed' | 'declined'
  currentStepIndex: number
  stepCounters: number[]   // length === steps.length
  offeredAt: string | null
  acceptedAt: string | null
  completedAt: string | null
}
```

Instances are persisted as a snapshot under
`asteroid-lander-contracts-v1` in `localStorage`.

## Lifecycle

1. **Offered.** A contract becomes `available` when its trigger fires
   (message archived or Nth mission completed). The intro message is
   enqueued into the contract's folder.
2. **Accepted.** The player opens the intro message; the
   `ContractAcceptCard` shows step previews + Accept / Decline buttons.
   - Accept: status → `active`, the first step's flavor message is
     enqueued, and the runtime re-fires `notifyPlanetVisited` /
     `notifyUpgradeInstalled` for the player's current state so any
     already-met first step auto-completes.
   - Decline: status → `declined`. Intro stays archived.
3. **Active.** Each gameplay event walks the active instances and
   advances the current step's counter when the event matches. Reaching
   the required count either delivers the next step's message or the
   contract's completion message.
4. **Completed.** Status → `completed`, completion message enqueued,
   `RewardEffect`s applied to the profile, `onContractsChanged` fires.

## Event surface

`ContractSystem` exposes a small set of `notify*` methods. Consumers call
them at well-defined boundaries:

| Notify method                    | Caller                                         | When                                     |
| -------------------------------- | ---------------------------------------------- | ---------------------------------------- |
| `notifyMessageArchived`          | `runtime.ts` via `MessageSystem.onMessageArchived` | Player archives any inbox message     |
| `notifyMissionCompleted`         | `MapView.vue` (shuttle/EVA), `asteroidMissionRewards.ts` | Mission rewards are paid out         |
| `notifyOrbitalMissionCompleted`  | `MapView.vue` `onMissionComplete`              | Orbital minigame for a planetary shuttle mission completes |
| `notifyUpgradeInstalled`         | `MapView.vue` `handlePurchaseUpgrade`          | After a successful upgrade purchase      |
| `notifyPlanetVisited`            | `MapView.vue` `orbitState` watcher             | Shuttle transitions into `orbiting`      |

All notify methods are idempotent and safe to call when no contract
matches.

## Mission pay multipliers

Both planetary shuttle deliveries (`MapViewController.missionDeliver`) and EVA
mission completion (`MapViewController.evaMinigameComplete`) read the player's
multiplier for the giver planet via `getMissionPayMultiplier(profile,
giverPlanet)` and pass it as the `rewardMultiplier` argument. The shuttle
science-station bonus and the contract multiplier compose multiplicatively.

## UI integration

### Mail UI (`ShuttleControlProgramMail.vue`)

- Folder sidebar driven by `MessageSystem.listFolders()` — one entry per
  active folder id (default inbox + every contract folder that has at
  least one delivered message).
- Selecting a folder filters `listInboxRows(folderId)`.
- When the selected message is a contract intro
  (`contractMessageKind === 'intro'`), the reader injects
  `ContractAcceptCard.vue` above the body. The card shows step previews,
  reward summaries, and Accept / Decline buttons. Accept calls
  `acceptContractWithRetroEval` (defined in `runtime.ts`).

### Tactical map (`MapView.vue` + `MapOverlay.vue`)

- `MapOverlay` accepts a `fastTravelablePlanetIds: Set<string>` prop and
  renders an animated dashed-ring "JUMP" hotspot over each unlocked
  planet's label. Clicking emits `@planet-click(planetId, planetName)`.
- `MapView` watches the player profile snapshot and derives the set of
  unlocked planet ids from `unlockedFastTravelPlanets`.
- Clicking a planet opens `FastTravelConfirmDialog.vue`. On confirm:
  1. `fastTravelFadeOpacity` → 1 (CSS transitions to opaque black over
     `FAST_TRAVEL_FADE_MS`).
  2. `viewController.fastTravelToPlanet(planetId)` warps the shuttle to
     a stable standoff position above the planet (using the same logic
     as `devWarpNearBody`) and closes the map.
  3. `fastTravelFadeOpacity` → 0 after a short hold; the player is now
     orbiting the destination planet.

The fade is rendered as a single absolute-position `<div>` at z-index 80
so it covers everything except the dialog itself.

## Persistence

- `src/lib/contracts/contractStorage.ts` reads/writes a versioned
  snapshot under `asteroid-lander-contracts-v1`.
- `PlayerProfile` is migrated by `normalizeLoadedProfile` to add
  `unlockedFastTravelPlanets: []` and `missionPayMultipliers: {}` for
  pre-existing saves.

## Catalog

Two contracts ship with this feature:

- `space-cowboys-mars-hq` (Jay) — triggered by archiving the
  `jay-first-slingshot-contracts` message. Five steps culminating in a
  Mars visit. Reward: fast travel to Mars.
- `usc-venus-certification` — triggered by the player's first mission
  completion (`triggerOnMissionCompletedNth: 1`). Five steps culminating
  in a Venus orbital mission. Reward: fast travel to Earth + 2× pay on
  all Earth-given missions.

Adding a contract is a JSON-only change in `src/data/contracts/` plus an
import in `src/lib/contracts/contractCatalog.ts`.

## Decoupling and module ownership

```
src/lib/contracts/
  contractTypes.ts         # data model
  contractStorage.ts       # localStorage persistence
  ContractSystem.ts        # state machine; no UI / no profile imports
  contractCatalog.ts       # JSON aggregation
  runtime.ts               # singleton wiring (profile + messages + retro eval)
src/data/contracts/*.json  # authored content
src/components/shuttle-control/ContractAcceptCard.vue
src/components/FastTravelConfirmDialog.vue
```

The `ContractSystem` only knows about contract data, the message system, and
its persistence adapter. The `runtime.ts` layer is the only place that
reaches into the player profile and into upgrade snapshots. UI components
talk to `runtime.ts`, never to the contract system directly for state
mutations that involve profile data.
