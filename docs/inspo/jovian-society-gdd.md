# Jovian Society — Contract GDD

_Act 2 Journey Capstone · The Cloud City Arc_

---

## Premise

The Jovian Society is the late-capitalism heart of Act 2. Where Cowboys wanted partnership, Marines wanted discipline, Cinderline wanted devotion, and the Zeppelin Exchange wanted markets — the Society wants _throughput_. They are the cloud-city manufacturers who run Jupiter's orbital industry, and they are quietly enshittifying everything they touch. Moon labor on the Galilean satellites is unionized and expensive. Asteroid labor is freelance, scattered, and replaceable.

You are asteroid labor.

The contract is an onboarding pipeline for a new asset class: Jovian Trojan and Saturn co-orbital bodies the Society wants to evaluate for full extraction. Photometry tells them what the rocks are made of. Dynamic Albedo of Neutrons tells them what's underneath. Together: a complete liquidation prospectus. The player runs the surveys without ever being told the word _liquidation_. The horror lives in the corporate vocabulary that wraps it.

The chain ends with a binary choice that asks the player whether the credits are worth the cost. There is no second chance to make that choice. There is no version of the contract where you get the big payout _and_ keep your hands clean.

---

## Faction Voice — The Jovian Society

The Society's voice is **corporate-banal**. Onboarding-deck cadence. Performance-review euphemism. The language of an HR department that is genuinely surprised when you find it sinister. They never threaten directly. They never raise their voice. They use phrases like "longitudinal benefits," "asset class," "instrumentation envelope," "preferred contractor manifest." They say "warm regards" at the bottom of every message.

This is the voice slot Act 1 didn't fill. Sampaio is military-blunt. Jay is partnership-warm. Lucas is poker-philosophical. Cinderline is liturgical. Vance Hoyt is **the LinkedIn message that becomes a problem**.

### Vance Hoyt — Senior Asset Officer

The face of the contract. He is one of the cloud city's middle managers, neither high enough to make policy nor low enough to refuse it. Probably forty in a society where people live to 230. He believes, sincerely, that he is one of the good ones. He sends his contractors holiday cards. He uses your first name in the salutation by Step 4. He has a wife in Cloud City and a son who is going to engineering school and he genuinely does not understand that the rocks he is asking you to scan have any moral weight at all, because rocks don't, and that's what a rock is.

The mask cracks once, deliberately, in his closing letter on the **transmit** path: _"The Society is family."_ Up to that point he has been a man writing emails. After that point he is something else, and what he is, is who he was the whole time.

On the **tamper** path he becomes cold immediately. The warmth was conditional. _"We will not be retaining you for further work."_ The corporate-fired language is the truest expression of who the Society is — they don't punish, they _unsubscribe_.

---

## Contract Structure (9 steps)

The arc is paced as **three movements**, each ending in a beat that escalates the player's complicity:

| #   | Step                                  | Movement              | Purpose                            |
| --- | ------------------------------------- | --------------------- | ---------------------------------- |
| 1   | Lander mining run (Society board)     | Onboarding            | Demonstrate basic competence       |
| 2   | Shuttle turret mining (Society board) | Onboarding            | Verify multi-instrument capability |
| 3   | Psychosphere collection × 3–5         | Photometry attunement | Gate photometry contracts          |
| 4   | Photometry — Jovian Trojan asset      | Photometry series     | First survey on the pinned target  |
| 5   | Photometry — Saturn co-orbital asset  | Photometry series     | Travel-premium stretch run         |
| 6   | Psychosphere collection × 6–8         | DAN attunement        | Gate DAN contracts                 |
| 7   | DAN — Jovian Trojan asset             | DAN series            | Subsurface return to the same body |
| 8   | DAN — Saturn co-orbital asset         | DAN series            | Final survey deliverable           |
| 9   | The Prospectus (terminal minigame)    | Choice                | Transmit or tamper                 |

### Movement 1 (Steps 1–2): Demonstration

Light onboarding work to bind the player to the Society's mission board. Vance is friendly, efficient, complimentary. The work itself is identical to anything Jay or the Marines would post — what's different is the _paperwork_. Every closeout pings the player's inbox with a courtesy receipt. The Society has good logistics. They want you to feel taken care of.

Step 2 specifically requires turret mining — which means the contract has a soft prerequisite of having completed Marines (the only Act 1 chain that gates `turretMiningUnlock`). If a player somehow arrives without the turret, Vance has a procurement-financing line ready. The Society always has a financing line ready.

### Movement 2 (Steps 3–5): Photometry Series

Step 3 is the **first weird thing**. Vance asks for psychosphere — viroid drop residue — and frames it as _sensor calibration material_. He claims the research division uses it for photometric instrument tuning. He says, in a single perfectly Vance line: _"I'm told the residue is harmless in handled quantities. I have not personally handled it."_

Players who've completed the Cinderline arc will recognize psychosphere immediately. Players who haven't will just collect it as a generic drop. Both reads work. The Cinderline connection is **seeded but not stated** — see "Act 3 Hooks" below.

Steps 4 and 5 are the photometry runs themselves: one Jovian Trojan body, one Saturn co-orbital body. Both reference the same `pinnedAssetRef` for Jupiter's body — this is the rock the player is going to be asked to condemn. The Saturn body is a separate target and only exists in this contract; it isn't pinned for later steps.

### Movement 3 (Steps 6–8): DAN Series

Step 6 is the same beat as Step 3 but escalated: more psychosphere required (8 vs. 3). Vance "apologizes for the recurring acquisition request" — he's now performatively polite about repeatedly sending the player to kill viroids. The mask is paper-thin here.

Steps 7 and 8 are DAN runs. Step 7 returns the player to the **same Jupiter body** they photometry'd in Step 4 — Vance casually mentions the player will "find the body familiar." This is the moment the player should start to feel that something is being constructed about this specific rock. Two visits to the same place is a _plan_, not a coincidence.

Step 8's flavor introduces an explicit lie: Vance acknowledges that pilots have reported "elevated sensor cross-talk" on subsurface passes, and continues to call viroid attacks "sensor cross-talk." This is the Society's pattern crystallized — not denial, just _reframing_. They know. They have a name for what's happening. The name is wrong on purpose.

### Movement 4 (Step 9): The Prospectus

The final step is a **special canvas minigame** triggered by approaching a Society-provisioned terminal on the surface of the Jupiter body. See "The Prospectus Minigame" below. The minigame is the first and only place in the contract where the _true_ nature of the work is shown to the player in writing. Vance's contract flavor never mentions the word "extraction" or "demolition." The minigame uses both.

---

## The Attunement Mechanic (Steps 3 and 6)

The psychosphere collection beats reuse the existing Cinderline `collect-drops` step kind verbatim. Same item ID (`viroid-psychosphere`), same gathering pattern (any combat or rescue contract drops it).

**Why psychosphere?** Two readings, both intentional:

**Surface reading:** The Society sources rare biological material from contractors as a calibration medium. It's just a procurement line item. Vance treats it that way.

**Deeper reading:** The Society has reverse-engineered Cinderline-adjacent technology and stripped its meaning. Psychosphere — to Cinderline — is the residue of viroid consciousness, sacred material rendered into encaustum and applied as a consecration mark. To the Society, it is sensor calibration goo. The same substance, two completely different ontologies. The Society's version is funded better. Cinderline knows what they're doing. The Society does not, or pretends not to.

This is **Act 3 seed material** — see hooks section below.

**Reuse benefit:** The Cinderline collection mechanic already exists, the drop already drops, the inbox-handoff pattern already works. Step 3 and Step 6 are essentially zero-implementation-cost reuses of existing systems with new flavor.

---

## The Prospectus Minigame (Step 9)

### Trigger

When Step 9 activates, a special objective spawns on the Jupiter pinned-asset body: a Society-provisioned **terminal**. The player flies to the body, lands, EVAs, and approaches the terminal. Existing terminal-prompt mechanics fire: `E` to interact.

The interaction opens a Vue 2D canvas overlay (same overlay system as the other minigames).

### Layout

Terminal-style readout, monospaced, Society branding (clean blue corporate sans, Cloud City logo). Sections:

1. **Header:** "JOVIAN SOCIETY — ASSET STRATEGY · INTERNAL"
2. **Asset card:** "Asset 2306-J · Jovian Trojans · L4 cluster · 11.2km mean diameter"
3. **Photometry summary:** Visual graph with the player's actual return data from Step 4 (or a reasonable approximation if storing that telemetry is too expensive — could be procedurally generated from the asteroid's seed)
4. **DAN summary:** Same, for Step 7 data
5. **Recommendation block:** _"Asset is composition-rich and volatiles-positive. Asset is recommended for full extraction queue. Estimated yield value: ~2.8B credits over 14-month demolition cycle. No habitation, no biological signature, no protected status."_
6. **Two prompts at the bottom:**
   - **`E — TRANSMIT REPORT`** (default-highlighted, green)
   - **`Q — TAMPER REPORT`** (gray, smaller, requires deliberate move)

### The choice itself

The asymmetry of the prompts is intentional. Transmit is _the path Vance set up for you_. Tamper is the path the player must _find_. A first-time player on rails will probably hit E. The contract is designed so that hitting E _is_ the obvious move — the entire chain has been training the player to follow Vance's lead and ship clean data. That training is the trap.

There is no third option. The minigame does not ask for confirmation. The player picks one and lives with it.

### Outcome routing

The minigame returns a single string (`"transmit"` or `"tamper"`) to the contract system. The contract resolves to one of two `completionByOutcome` blocks. See JSON.

### Authorial note

The Recommendation block is the **first time the contract names the truth** — "full extraction queue," "demolition cycle," "estimated yield value." Vance's letters never said any of this. The Society talks like this internally; they just don't talk like this to contractors. Showing the player the internal language is the moment the contract reveals itself.

---

## Outcome Rewards

### Transmit (the obedient path)

- Step closeout: **5,000 credits**
- Contract reward: **`jovianEmpowerment` shuttle buff** — permanent +50% to all shuttle stats (top speed, fuel capacity, hull, thruster charge, slingshot — across the board)
- Contract reward: The pinned Jupiter asset (`jovian-prospectus-target-jupiter`) is **destroyed and removed from the game world**. Future asteroid missions will not spawn there. When the player passes through the Jovian Trojans on the star map, the body is visibly absent (or, ideally, replaced with a debris field as a one-time visual moment).
- Contract reward: 2x mission pay multiplier on Jupiter-issued contracts (matches Marines/Cinderline/Venus pattern)
- Faction standing: `jovian-society` → `cohort-member`

### Tamper (the moral path)

- Step closeout: **0 credits**
- Contract reward: _Nothing material._
- Pinned asteroid stays in play — future missions can still spawn there.
- Faction standing: `jovian-society` → `blacklisted` (removes Society missions from the Jovian board permanently for this save)
- Optional Act 3 hook: A delayed inbox message from a moon-worker union or Cinderline contact arrives ~2 in-game days later, acknowledging the player's choice without naming it directly.

### Why the asymmetry is correct

The transmit reward is genuinely large. The shuttle buff is the single most powerful reward in the game. A player who takes it gains real, lasting mechanical advantage. That's the _point_. The choice should not be between "small reward + clean conscience" and "big reward + dirty conscience" — it should be between "huge reward + dirty conscience" and "nothing + clean conscience." The temptation must be real. The cost must be real.

The tamper path's reward is **the asteroid still existing**. That's it. The player gets the satisfaction of having denied the Society their asset, and the option to return there for mining/gather missions later. It's a moral reward, not a mechanical one. Some players will hate this. That is correct.

---

## New Systems Required

This contract assumes the following new schema/code work. None are required for the existing four contracts, so all of this is greenfield:

### 1. `pinnedAssets` on contracts

A new contract-level array that designates specific celestial bodies the contract chain references. Bodies are pinned at contract acceptance and persist across steps.

```json
"pinnedAssets": [
  {
    "assetRef": "jovian-prospectus-target-jupiter",
    "region": "jovian-trojans",
    "label": "Asset 2306-J"
  }
]
```

Steps reference pinned assets via `pinnedAssetRef`. The mission generator should pin a specific procedural body at acceptance time and route all `pinnedAssetRef`-tagged steps to that body.

### 2. `objectiveType` filter on `complete-missions` steps

Existing steps filter by `missionType`. To distinguish photometry from DAN from generic asteroid missions, add an optional `objectiveType` filter:

```json
{
  "kind": "complete-missions",
  "missionType": "asteroid",
  "objectiveType": "photometry",
  ...
}
```

If your codebase already differentiates these via separate `missionType` values (e.g. `"photometry"` and `"dan"` as top-level types), use that pattern instead. The JSON below uses `objectiveType` — easy to find-and-replace.

### 3. `targetRegion` override on mission steps

For Step 5 (Saturn photometry from Jovian board) and Step 8 (Saturn DAN from Jovian board), the mission needs to spawn in `saturn-trojans` (or whatever your Saturn co-orbital region is called) even though it's posted by the Jovian Society. New optional field:

```json
{
  "kind": "complete-missions",
  "giverId": "jovian-society",
  "objectiveType": "photometry",
  "targetRegion": "saturn-trojans",
  ...
}
```

### 4. `kind: "choice-mission"` step

The terminal-decision step. New schema:

```json
{
  "kind": "choice-mission",
  "missionId": "jovian_final_prospectus",
  "minigameType": "terminal-prospectus",
  "pinnedAssetRef": "jovian-prospectus-target-jupiter",
  "outcomes": [
    { "outcomeId": "transmit", "label": "Transmit Report" },
    { "outcomeId": "tamper", "label": "Tamper Report" }
  ],
  "subject": "...",
  "flavor": [...]
}
```

### 5. `completionByOutcome` on contracts

Replaces (or supplements) the single `completionSubject` / `completionBody` / `rewards` block when a contract has branched outcomes:

```json
"completionByOutcome": {
  "transmit": {
    "completionSubject": "...",
    "completionBody": [...],
    "rewards": [...]
  },
  "tamper": {
    "completionSubject": "...",
    "completionBody": [...],
    "rewards": [...]
  }
}
```

The system reads the outcome string from the choice-mission step and selects the matching block.

### 6. New reward types

```json
{ "type": "shuttle-buff", "buffId": "jovianEmpowerment", "multiplier": 1.5 }
{ "type": "destroy-body", "assetRef": "jovian-prospectus-target-jupiter" }
{ "type": "faction-standing", "factionId": "jovian-society", "standing": "blacklisted" }
```

`shuttle-buff` is a permanent global multiplier on shuttle stats. Probably wants to be a passive entry in the upgrade ledger that survives save/load.

`destroy-body` removes a pinned body from the world. Clean implementation: mark the body as `destroyed: true` in save data and have the planet/region renderer skip it. Bonus implementation: replace it with a debris field on first sighting after destruction, fade to nothing on subsequent passes.

`faction-standing` is a tagged value the giver pool reads when deciding whether to surface missions. Blacklisted standing on `jovian-society` removes their giver from the Jupiter mission board.

### 7. Expanded Jovian Society giver pool

The giver pool currently has 2 photometry missions. The contract steps assume the giver also offers:

- Mining (lander) — for Step 1
- Mining (turret/shuttle) — for Step 2
- Photometry (Saturn region variants) — for Step 5
- DAN — for Steps 7, 8 (in both Jupiter and Saturn variants)

Add these to the giver pool when the corresponding objective types are implemented.

---

## Act 3 Hooks Seeded Here

This contract plants seeds for Act 3 (Venus, Mercury, Uranus, Neptune) without resolving them.

**Cinderline ↔ Jovian Society.** The psychosphere asks should make a Cinderline-consecrated player suspicious. The Society uses sacred material as a calibration consumable. This is either ignorance, theft, or collaboration — and the answer matters in Act 3. A Cinderline-side contract in Act 3 could open with: _"Pilot. We have noticed you fulfilling psychosphere acquisition contracts on a board that is not ours. We would like to discuss this."_

**Moon-worker union.** Mentioned only in subtext (Vance's framing of "outsourcing" to asteroid labor implicitly references the unionized moon labor he's bypassing). A tamper-path side message from a moon worker contact opens this thread.

**The Society's other contractors.** Vance mentions "the cohort" repeatedly. The implication: the player is not the only contractor running this exact chain. Other pilots are scanning other rocks. Some are tampering. Some are transmitting. The Society's portfolio is the aggregate of every contractor's choice. Act 3 could surface this in the form of a former cohort-mate making contact, or a news bulletin about a Trojan body that vanished last quarter.

---

## Open Questions / Decisions for You

1. **Trigger condition.** Currently set to `requiredCompletedContractId: martian-marine-corps-cohort` + `triggerOnPlanetVisited: jupiter`. Right gate, or do you want this contract available to players who skipped Marines?

2. **Vance's name.** Placeholder. Swap if you have a different vibe in mind. _Vance Hoyt_ leans MBA-cloud-city-middle-manager; alternatives that hit similar notes: Marcus Linwood, Davis Hartwell, Quentin Vasey.

3. **Tamper path Act 3 follow-up.** Is the moon-worker union message worth implementing now, or deferred to Act 3 design?

4. **Prospectus minigame data.** Does the recommendation block use the player's actual return data from Steps 4/7, or procedurally generated data based on the asteroid seed? The first is more authentic, the second is cheaper. Lean cheap unless the wow factor is worth the plumbing.

5. **Psychosphere counts.** I went 3 (photometry attunement) and 8 (DAN attunement). Cinderline asks for 5. Tunable.

6. **`jovianEmpowerment` buff scope.** +50% to _all_ shuttle stats is enormous. You may want to scope it more narrowly (e.g., +50% to fuel capacity, top speed, and hull only — not slingshot, not turret stats). Worth playtesting at full scope first to see if it actually breaks anything.

7. **Destroyed body visualization.** Just gone, debris field one-time, debris field permanent? My vote is one-time debris on first sighting after destruction, gone on subsequent passes. Authored memory.
