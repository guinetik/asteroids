# Act 2 — Jovian Journey (three-contract arc)

**Date:** 2026-04-30  
**Author:** guinetik  
**Status:** implemented

## Goal

Add a second player-visible meta journey, **Act II**, that ties together three existing multi-step contracts into one HUD arc. The journey **starts** only after the player **reaches Jupiter for the first time** (first recorded orbit at Jupiter). Completing the journey requires finishing all three contracts (any order while the journey is active).

Retroactivity matches Act I: if the player already finished **Venusian Zeppelin** or **The Cinderline** (or all three) *before* their first Jupiter orbit, those steps must appear **already complete** the moment Act II unlocks, with no replay grind.

## Contract ids (authoritative)

| Authored file | Contract `id` in JSON |
|---------------|------------------------|
| `src/data/contracts/venusian-zeppelin-trade-loop.json` | `venusian-zeppelin-trade-loop` |
| `src/data/contracts/the-cinderline.json` | `cinderline-mercury-consecration` |
| `src/data/contracts/jovian-society-prospection.json` | `jovian-society-prospection` |

HUD copy should use player-facing names (“Venusian Zeppelin Trade Loop”, “The Cinderline”, “Jovian Society Prospection”); triggers always use the ids above.

## Scope

- **In scope:** `JOURNEY_DEFINITIONS` entry, `JourneyId` / `JourneyTriggerId` extensions, emission + save replay for the new start trigger, one achievement row for journey completion, unit tests for journey application + replay ordering.
- **Out of scope:** Rewriting contract JSON, new mission content, changing Jovian Society offer rules, or adding achievements for the individual contracts unless already tracked elsewhere.

## Player experience

1. Player finishes Act I and explores the system. They may complete Venusian Zeppelin and/or The Cinderline at any time; the new journey is **not** shown yet (gated).
2. The first time the player **establishes orbit at Jupiter** (see **First Jupiter reach** below), the **“JOURNEY BEGINS”** banner fires for Act II and the amber journey tracker lists three steps — any contracts already completed show as **done** immediately.
3. Remaining steps are satisfied by the existing `contract_completed:<id>` journey triggers when each contract closes.
4. When the last outstanding contract completes, the journey completes: **“JOURNEY COMPLETE”** banner, achievement credit, and any authored `unlocks` (empty unless design adds a feature id later).

## First Jupiter reach (start trigger semantics)

**Definition:** Align with **first persisted orbit** at Jupiter, same source of truth as exploration stats: `PlayerProfile.orbitedSolarBodies['jupiter']` transitions from unset/`0` to recorded.

**Emit points (both required):**

1. `MapViewController.trackSolarOrbitAchievements()` — normal capture path when state becomes `orbiting` and `orbitBodyKeyFromCaptureName` resolves to `jupiter`, immediately after `recordSolarBodyFirstOrbit` would mutate the profile (i.e. only on the **first** record for that body).
2. `MapViewController.lockOrbitAtPlanet('jupiter')` — fast-travel / forced orbit path already calls `recordSolarBodyFirstOrbit`; if that call changes the profile for Jupiter, emit the same trigger once.

**New trigger shape** (add to `JourneyTriggerId`):

```ts
| `first_orbit:${string}` // body key: `jupiter`, `mars`, …
```

Act II alone uses `first_orbit:jupiter`. The template keeps future acts or achievements from hard-coding one-off strings.

**Event ordering:** Emit **after** the profile reflects first orbit and has been persisted (or is about to be persisted in the same atomic sync as today’s `trackSolarOrbitAchievements` / `lockOrbitAtPlanet` flow), then call `notifyJourneyTrigger('first_orbit:jupiter')` so `MapJourneyFacade` can run `applyJourneyTrigger` and persist again if the journey state changed.

## Journey definition

Add a constant export (mirroring `ACT_1_CONTRACT_IDS`):

```ts
export const ACT_2_JOURNEY_ID: JourneyId = 'act-2-jovian-arrival' // or chosen slug; keep stable once shipped

export const ACT_2_CONTRACT_IDS = [
  'venusian-zeppelin-trade-loop',
  'cinderline-mercury-consecration',
  'jovian-society-prospection',
] as const
```

New entry in `JOURNEY_DEFINITIONS` (after Act I in array order so Welcome → Act I → Act II remains the completion sequence):

```ts
{
  id: ACT_2_JOURNEY_ID,
  eyebrow: 'Act II',
  title: '<TBD — e.g. Jovian threshold / outer deck>',
  objectiveLabel: '<TBD — one line for tracker>',
  unlocks: [],
  startTrigger: 'first_orbit:jupiter',
  steps: ACT_2_CONTRACT_IDS.map((contractId) => ({
    id: `contract-${contractId}`,
    label: '<Human label per contract>',
    trigger: `contract_completed:${contractId}`,
  })),
}
```

**Ordering:** Steps may be listed in **narrative** order (Venus → Mercury → Jupiter) or **any fixed** order; completion is **not** sequence-locked — `applyJourneyTrigger` already marks whichever step matches each `contract_completed` event. The tracker UI shows the first incomplete row as “active”; completed rows tick regardless of list order.

## Retroactivity (no new profile fields)

Existing `applyJourneyTrigger` behavior already implements the needed rules:

- **Pass 2** applies `contract_completed:*` to **all** incomplete journeys, **including** journeys whose `startTrigger` has not yet fired (`isJourneyStartReady` is not consulted in that loop). So Venusian / Cinderline / Jovian completions **pre-fill** `journeyStepProgress[act-2-id]` even while the journey is hidden.
- **Pass 1** opens the gate when `first_orbit:jupiter` fires.
- **Pass 3** marks the journey complete when start-ready **and** every step id is in the completed set — so a player who finished all three contracts before first Jupiter orbit gets an **instant** completion (and unlocks) on that first orbit, optional completion banner only if product wants to treat “already done” as instant complete without fanfare — **recommendation:** still run the normal completion path once so achievement + credits stay consistent; if UX wants to suppress banner when `completedStepIds` were already full before gate open, that is a small MapJourneyFacade policy decision).

No separate “retroactive complete” migration table is required.

## Save load / replay (`replayAct1JourneyTriggers` sibling)

Extend the existing replay routine (rename to a neutral `replayJourneyTriggers` or add `replayAct2JourneyTriggers` called from the same init site) so offline saves self-heal:

**Order matters** (same lesson as Act I `contract_accepted` before `contract_completed`):

1. Optional: replay `contract_accepted` loop (unchanged) — not required for Act II start, but keeps one code path.
2. **If** `(profile.orbitedSolarBodies['jupiter'] ?? 0) > 0`, call `notifyJourneyTrigger('first_orbit:jupiter')` **before** the `contract_completed` replay loop.  
   - Ensures `journeyStartReadyIds` contains Act II when Jupiter was visited in a prior session.
3. Replay all `contract_completed:<id>` for completed contract instances (existing loop).
4. Existing `upgrade_installed:gravitySurfing` replay stays as-is.

This guarantees a returning player with Jupiter already in `orbitedSolarBodies` immediately sees Act II gate open and steps reconciled without needing to re-enter orbit.

## Achievements

Add one definition in `src/data/achievements.ts`:

- `kind: 'journey_completed'`
- `journeyId: ACT_2_JOURNEY_ID`
- Category/icon/copy consistent with `journey-act-1-inner-system`.

## Testing

- **`src/lib/__tests__/journeys.spec.ts`:**  
  - Gated Act II: apply three `contract_completed` triggers **without** `first_orbit:jupiter` → steps progress in `journeyStepProgress` but journey not in `completedJourneyIds`.  
  - Apply `first_orbit:jupiter` after all three → journey completes in one application (or same tick sequence).  
  - Reverse: `first_orbit:jupiter` first with zero steps → tracker shows three incomplete rows; complete contracts in arbitrary order until done.
- **`MapJourneyFacade` / controller:** If tests exist for replay ordering, add a case where profile has `orbitedSolarBodies.jupiter` and three completed contracts → loaded replay marks Act II complete.

## Open questions (product)

- Final **Act II title** and **objectiveLabel** strings.
- Whether **instant completion** (all three contracts done before Jupiter) should skip the “JOURNEY BEGINS” banner, skip “JOURNEY COMPLETE”, or show a combined line — **default** in this spec: both banners may fire in one session the first time the gate opens; tighten in polish if it feels noisy.
