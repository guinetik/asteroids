# Ceres Institute for Eternal Biology — Contract Design

**Spec date:** 2026-05-04
**Author:** guinetik (with Claude)
**Status:** Approved for implementation planning

---

## Premise

Ceres needs a reason to exist beyond being a waypoint. The eccentric orbit, the unexplained neutron-tech hooks (orbital manifold, DAN albedo, viroid psychosphere drops), and Carmen's Act-3 escape route all point at the same gap: there's no faction *at* Ceres explaining any of it. This contract fills the gap.

The **Ceres Institute for Eternal Biology** is, on its surface, a well-funded research facility — bankrolled by the Jovian Society, the USC, Mr. Finch, and the military — studying viroid eradication. Its real motive: viroids are eternal (microscopic, never truly killed), and the Institute *envies* that. They are seeking immortality through viroid bonding, which means they need viroid material (psychosphere) and a steady stream of test subjects.

The player accepts a sequence of routine errands and field jobs from the Institute's outreach liaison, **Dean Bernard Porter**. The work escalates — supply runs, then rescues of "field scientists" cocooned by viroids, then mineral and DAN surveys. The bunker finale reveals environmentally what the player has been complicit in: the bunker waves are populated by **astronaut-chimera** enemies, the inevitable end-state of the Institute's "research." A terminal at the end offers a choice — *transmit* the archive (Porter thrives) or *sabotage* it (Porter writes you off; a story flag fires for downstream contracts to react to).

Vibes: Westworld liaison energy on Porter, Martyrs / Bloodborne on the bunker reveal.

---

## Architecture

Mirrors the **Jovian Society Prospection** pattern (the closest existing analogue): a multi-step contract with `complete-missions` steps that auto-stage `kind: "special"` missions, terminating in a `choice-mission` step backed by a special bunker mission with a custom enemy variant. Two completion arms via `completionByOutcome`.

### Net-new infrastructure

1. **`offerWhenPrerequisites.requiredUpgrades`** — new optional field on the prerequisite block on `Contract`. Shape:

   ```ts
   requiredUpgrades?: Array<{ upgradeId: UpgradeId; minLevel: number }>
   ```

   AND-ed against existing fields. Single bool check in the gate evaluator that reads installed upgrades from the player profile.

2. **`astronaut-chimera` enemy variant** — reskin / parented-mesh subclass of the existing chimera walker. Used by the Step 7 special bunker mission's wave. No new behavior, just visual variant.

3. **Ceres Research Station body** — new station body (`ceres-research-station`) with its own GLB. Used as Step 2's `visit-planet` target.

### Reused as-is

- `complete-missions` step kind
- `choice-mission` step kind + terminal infra
- Special-mission auto-staging (`specialMissionId` field on steps)
- `pinnedAssets` Kuiper-Belt pinning (mirrors Jovian's Hektor)
- Rescue, mineral-analysis, DAN, bunker objective types
- Psychosphere drop + collect system
- `completionByOutcome` two-arm completion pattern
- Per-step `creditsReward`

---

## Giver

- **Institution:** Ceres Institute for Eternal Biology
- **Liaison:** Dean Bernard Porter (faculty rank "Dean," not nickname)
- **Description:** Black, middle-aged, academically credentialed, slick. Charming-polite-intelligent without being arrogant. *Westworld-grade* presence: warm with you specifically, performatively concerned about colleagues, gently delusional about the cause. He wants you to *want* to advance their work. He frames every grim ask as inevitable, regrettable, and noble. The mask is good. Only at the bunker, after sabotage, does the warmth drop and the operator beneath show.
- **From line:** `Dean Bernard Porter, Ceres Institute for Eternal Biology`
- **`giverId`:** `ceres-institute`
- **Inbox folder name:** `Ceres Institute`

---

## Offer Prerequisites

Contract is offered when **all** of:

- Player has `gravitySurfing` upgrade installed at minLevel ≥ 1
- Player has `orbitalSurfing` upgrade installed at minLevel ≥ 1
- Player is currently orbiting Ceres (`triggerOnPlanetVisited: 'ceres'`)

JSON shape:

```json
"offerWhenPrerequisites": {
  "requiredUpgrades": [
    { "upgradeId": "gravitySurfing", "minLevel": 1 },
    { "upgradeId": "orbitalSurfing", "minLevel": 1 }
  ],
  "triggerOnPlanetVisited": "ceres"
}
```

Rationale: Ceres-board missions remain visible without the upgrades — only the contract offer is gated. Player has to actually *get there* to encounter Porter.

---

## Steps

7 steps. Each non-choice step uses `specialMissionId` to auto-stage exactly the right mission on activation. `revealsBody` is not used (no body is hidden).

| # | Title | Kind | Filter / target | CR |
|---|---|---|---|---|
| 1 | Earth Supply Run | `complete-missions` count 1 | `missionType: shuttle`, `giverPlanetId: ceres`, `targetPlanetId: earth`, `specialMissionId: ceres-institute-earth-supplies` | 2,500 |
| 2 | Reach the Institute Station | `visit-planet` | `planetId: ceres-research-station` | 4,000 |
| 3 | First Rescue | `complete-missions` count 1 | `missionType: asteroid`, `giverPlanetId: ceres`, `objectiveType: rescue`, `specialMissionId: ceres-institute-rescue-1` | 6,500 |
| 4 | Mineral Analysis | `complete-missions` count 1 | `objectiveType: mineral-analysis`, `giverPlanetId: ceres`, `specialMissionId: ceres-institute-mineral-analysis` | 6,000 |
| 5 | DAN Survey | `complete-missions` count 1 | `objectiveType: dan`, `giverPlanetId: ceres`, `specialMissionId: ceres-institute-dan` | 7,500 |
| 6 | Second Rescue | `complete-missions` count 1 | `objectiveType: rescue`, `giverPlanetId: ceres`, `specialMissionId: ceres-institute-rescue-2` | 10,500 |
| 7 | Archive Transmission | `choice-mission` | `specialMissionId: ceres-institute-archive-bunker`, outcomes `transmit` / `sabotage`, pinned Kuiper Belt asteroid | 13,000 |
| | **Total** | | | **50,000** |

### Step 7 specifics

- `pinnedAssets`: one Kuiper-Belt asteroid (`assetRef: ceres-archive-site`, region `kuiper-belt`, label `Site CIB-7`)
- `pinnedAssetRef: 'ceres-archive-site'` on the choice-mission step
- `minigameType: 'terminal-prospectus'` (reuse Jovian's terminal)
- `outcomes`: `transmit` and `sabotage`. `ChoiceMissionStep` does not extend `ContractStepRewardMixin` — each outcome carries its own `creditsReward`. Both outcomes are set to **13,000 CR** (symmetric pay; the *cost* of sabotage is the disabled giver and the closed pay multiplier, not a smaller closeout)
- The underlying special mission (`ceres-institute-archive-bunker`) spawns a standard bunker wave whose chimera enemies are all the **astronaut-chimera** variant. No boss.

---

## Narrative Arc

Porter's voice across the steps. The reveal is environmental at Step 7 (the chimera variant), recoloring the polite tone of every prior message.

### Intro (offer message)

> Young pilot — your work for our funders has not gone unnoticed. The Institute would be honored to retain you for a sequence of small services. Nothing taxing. Largely errands, with a few calibrations toward the end. Compensation is academic-grade, which is to say generous.

### Step 1 — Earth Supply Run

> We need spectrometry calibration standards from the ESA stockpile on Earth. Our equipment is finicky. The pickup is routine; treat it as a paid familiarization run.

### Step 2 — Reach the Institute Station

> Ceres orbit is a beast even with both packages installed. You'll need both your gravitational and orbital surfing rigs — there's no other way to make the corotating insertion. Come up. Have a look around. We keep the heavier work elsewhere.

### Step 3 — First Rescue

> A field team went silent on a viroid sample run. Extract who you can — the viroids are a known hazard of the work, but a hazard worth braving. While you're out there: collect a few units of psychosphere for us. The research is promising.

(First psychosphere collection in the contract triggers the *Specimen Run* achievement.)

### Step 4 — Mineral Analysis

> Ceres's eccentric orbit puts certain rare-earth resonances within reach nowhere else. The readings refine our theoretical model. The model is — well. You'll hear about the model when there's something to hear.

(First *withholding*. He's polite about it.)

### Step 5 — DAN Survey

> There's a phenomenon we call DAN albedo. Neutron-rich materials seem to *attract* viroid attention. We're studying why. They approach. We have hypotheses.

(The astute reader should ask: *why are they studying what attracts viroids?*)

### Step 6 — Second Rescue

> Another team. The viroids do not discriminate, and we do not abandon our own. More psychosphere if your cargo allows.

(Step completion fires the *We Do Not Abandon Our Own* achievement — the player has now seen the pattern repeat.)

### Step 7 — Archive Transmission (offer)

> One last matter. We've prepared an archive — a culmination of the past several months of your work. The terminal in the Kuiper bunker is the secure transmit point. Reach it the same way you reached the station. There is a chimera presence at the site; please clear it. After transmission, walk away with our full thanks. Please don't read the archive. It would only confuse you.

### At the bunker

The wave is populated entirely by astronaut-chimera variants. The reveal is environmental — the player understands what happened to the "field scientists" they rescued without anyone saying it. The terminal at the end presents two choices.

### Completion — Transmit arm

> You've helped us cross a threshold. The Foundation will remember. Your retainer is paid in full, with the Institute's gratitude. Cerean traffic control has been instructed to extend you fast-travel privileges in perpetuity, and your future work with us — should you choose it — will be compensated at our partner rate.
>
> — Porter

### Completion — Sabotage arm

> You are, of course, no longer welcome at the Institute. Your retainer has been settled. We will not be in contact again.
>
> — Porter

(Cold, businesslike. The warmth was always strategic.)

---

## Rewards

Both arms set `homePlanet: 'ceres'` so fast-travel is auto-granted by the home-planet machinery. Explicit `fast-travel` reward is repeated in each arm for clarity.

### Transmit arm (`completionByOutcome.transmit.rewards`)

```json
[
  { "type": "fast-travel", "planetId": "ceres" },
  { "type": "mission-pay-multiplier", "planetId": "ceres", "multiplier": 2 },
  { "type": "set-story-flag", "flag": "ceres-archive-transmitted" }
]
```

### Sabotage arm (`completionByOutcome.sabotage.rewards`)

```json
[
  { "type": "fast-travel", "planetId": "ceres" },
  { "type": "disable-giver", "giverId": "ceres-institute" },
  { "type": "set-story-flag", "flag": "ceres-archive-sabotaged" },
  { "type": "set-story-flag", "flag": "ceres-cult-exposed" }
]
```

Sabotage's `disable-giver` removes the Ceres Institute from the Ceres mission board; standard Ceres planet missions (if any non-Institute givers exist) are unaffected.

`ceres-cult-exposed` is a deliberate dangling hook — no current contract reads it. Future contracts (Finch Recovery, USC, Jovian Society) can branch on it later. Cost-now: zero. Cost-deferred: each downstream contract must opt in.

---

## Achievements

Live in `src/data/achievements.ts`, wired in `src/lib/achievements.ts`.

| Id | Title | Trigger |
|---|---|---|
| `ceres-institute-accepted` | *Faculty Welcome* | Contract accepted |
| `ceres-first-psychosphere` | *Specimen Run* | First psychosphere unit collected while contract is active |
| `ceres-rescue-pattern` | *We Do Not Abandon Our Own* | Step 6 (second rescue) completed |
| `ceres-archive-transmitted` | *Faithful Servant* | Transmit arm resolved |
| `ceres-archive-sabotaged` | *Heretic* | Sabotage arm resolved |

`ceres-archive-transmitted` and `ceres-archive-sabotaged` are mutually exclusive per save (standard pattern).

A future hidden achievement (`ceres-cult-exposed` — *The Foundation Will Remember*) for completing both arms across separate playthroughs is **noted but deferred** — do not author until cross-save tracking exists.

---

## File Plan

### Modify

- `src/lib/contracts/contractTypes.ts` — add `requiredUpgrades` to `offerWhenPrerequisites` block
- `src/lib/contracts/ContractSystem.ts` — gate evaluator reads installed upgrades from profile, AND-s the new field
- `src/lib/contracts/contractCatalog.ts` — register the new contract import
- `src/data/achievements.ts` — add 5 active achievements
- `src/lib/achievements.ts` — wire triggers (psychosphere-during-contract, rescue-step-2-complete, arm-resolved)
- `src/data/missions/givers/ceres-institute.json` (create alongside existing givers) — Institute giver definition
- `src/views/MapViewController.ts` — register 6 special-mission offer-message ids in `SPECIAL_MISSION_OFFER_IDS`; verify Step 2's `visit-planet` to a station body works through existing infra (extend if not)
- Planet/body catalog — register `ceres-research-station` body. Exact file resolved during plan-writing (`src/lib/planets/catalog.ts` is the likely entrypoint based on existing planet definitions).
- Three.js chimera controller — add `astronaut-chimera` variant. Exact file resolved during plan-writing (search for the existing chimera walker enemy controller used by the Spire / Bacteriophage / wave-bunker spawners).
- `public/models/` — Ceres station GLB, astronaut-chimera GLB

### Create

**Contract:**

- `src/data/contracts/ceres-institute-eternal-biology.json`

**Special missions** (6):

- `src/data/missions/ceres-institute-earth-supplies.json`
- `src/data/missions/ceres-institute-rescue-1.json`
- `src/data/missions/ceres-institute-mineral-analysis.json`
- `src/data/missions/ceres-institute-dan.json`
- `src/data/missions/ceres-institute-rescue-2.json`
- `src/data/missions/ceres-institute-archive-bunker.json`

**Offer-message templates** (6) — one per non-intro step, authored where Jovian's offer messages live (`src/lib/messages/messageCatalog.ts` or wherever offer templates are registered).

### Tests

- `src/lib/contracts/__tests__/ceres-institute-contract.spec.ts` — full walkthrough mirroring `jovian-contract.spec.ts`. Drives all 7 steps, asserts both arms.
- `src/lib/contracts/__tests__/requiredUpgrades-gate.spec.ts` — new prerequisite field exercised in isolation.
- `src/lib/missions/__tests__/ceres-institute-missions.spec.ts` — schema validation for the 6 special missions (load, parse, target shape).

---

## Out of scope

- Cross-save achievement (`ceres-cult-exposed` — *The Foundation Will Remember*)
- Downstream consumers of `ceres-cult-exposed` story flag (Finch Act 3, USC, Jovian reactions)
- Boss fight at the bunker (explicitly: standard wave bunker, no boss)
- Custom rescue mission flavor variants (use existing rescue objective)
- New rescue mission *type* (existing cocoon-extraction objective is reused)
- Carmen Act-3 wiring (the lore mentions Carmen passes through Ceres in Act 3; this contract does not depend on Act 3 existing)
- Time-attack / "arrive within T seconds" gravity-surfing step kind (deferred — gating on the upgrades themselves at offer time is sufficient)

---

## Implementation order (suggested for plan-writing)

1. **Add `requiredUpgrades` prerequisite field** — schema + gate evaluator + isolated test. Lands cleanly without touching content.
2. **Author the contract JSON** — drive the contract walkthrough test red-on-missing-missions (mirrors Finch Phase 1 pattern).
3. **Author the 6 special missions + giver + planet body** — walkthrough test goes green.
4. **Astronaut-chimera variant** — wire into the Step 7 special bunker wave.
5. **Achievements + offer messages** — wire and ship.
6. **Manual smoke test on `/map`** — full walkthrough end-to-end, both arms.
