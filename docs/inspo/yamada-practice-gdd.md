# Yamada Farms — Uranus Contract GDD

## Premise

Yamada is a multigenerational family practice on Uranus's moons. They sell time. Stem cell collection into a patient-pig kept in a private asteroid bunker, neural baseline collection via a hat-and-glasses combo, body and brain replacement when the originals fail, post-mortem cloning if the body is lost. The practice has been doing this work since the original Dolly cloning in 1996 — they are, in their own framing, *farmers* who learned biology. The pig is a working animal. When its organs are harvested for the patient, the practice sends the rendered flesh back to the patient as cured meat. This is treated as normal.

The handler is **Sumiko Yamada**, granddaughter of the current matriarch, mid-30s by appearance, ~60 by Yamada math. Country-doctor register; quiet, formal but not stiff; warm without performing warmth. The horror lives in her cheerfulness about awful things. She runs intake on Titania.

The unnamed matriarch is ~240 years old and stays off-screen for this contract. She is the act-4 figure.

The faction fills the East Asian gap in the cast. Their texture is *practice* not *corporation* — clinic, not Cyberpunk biotech megacorp. Wool sweaters and tea, not lab coats and screens.

## Pedagogical role in the contract grid

Each contract teaches one system. Yamada's system is **biological cargo with thermal/time constraints** — a new cargo class that has to be moved within a temperature window and a clock. Not new physics; a new lens on the existing grid. Mercury hardened the ship; Uranus hardens the cargo.

The contract also gates Uranus fast travel and serves as the act-4 antechamber: the player's first contact with the longevity infrastructure that will retroactively explain Saturn.

## Trigger

- Activates on first Uranus visit after Act 1.
- If Act 2 is completed without the contract being started, an invitation message fires regardless of visit status. (Same fallback pattern as Cinderline.)

## Lore beats this contract must plant

By the end of the contract, the player must have:

1. **Seen the listening ward** — neuron-computer Saturnines in jars, hooked to deep-space arrays, listening for decades on instruments Yamada maintains. This is the SETI infrastructure that explains how Uranus has been quietly running a 50-year signal hunt in the background. Also the act-4 escalation seed.
2. **Met an old patient** (offscreen) — at least one Bunker Extract delivers to a "strange orbit, quieter than you expect" patient receiving asteroid. This plants that some Saturnine patients don't have bodies anymore.
3. **Heard Finch's name** in a Yamada context — the enroll completion drops *"Mr. Finch in particular has a fondness for the frames. I do not know him personally; I know him as a file. The practice has had his file for some time."* That single line is the act-4 detonator: when the player walks into the Uranus signal team in act 4 and says *Finch sent me*, the shock is double-loaded — Finch is the interlocutor *and* the longest-running patient on file.

These three beats are non-negotiable. Everything else is texture.

## Mission pool

Three new asteroid archetypes plus one new EVA archetype. All four go into the standing Yamada pool, which means they're available outside the contract too — the contract just selects from the pool when its steps demand them.

### Bunker Protect (asteroid, new)

Reskin of the existing bunker mission. Final model is a patient-pig in a suspended cylinder with cables, instead of the standard data terminal. Viroids have invaded the bunker — uses existing wave combat. Final action is a "reboot the suspension cylinder" interaction instead of "extract data." The player is keeping the pig alive. The pig is, in Yamada's language, the patient's "shadow self."

### Bunker Extract (asteroid, new)

No combat. Player enters the bunker, retrieves the suspension cylinder, mounts it on the lander, exits. Leaving the asteroid does **not** complete the mission. A waypoint spawns on the map — the patient's receiving asteroid — with a timer. The cylinder degrades if the timer expires; mission fails. Teaches thermal-route planning: you can't slingshot through the sun (heat damage), can't sit too long in deep cold (freeze).

### Patient Rescue (asteroid, new)

Variant of the existing rescue mission. One operator on the asteroid is colored **yellow** — that's the VIP patient. Other operators are standard rescue targets and worth saving for credits. If the yellow operator dies, mission fails outright. Teaches priority targeting under wave-combat pressure.

### Neuron-Install EVA (eva, new)

Variant of the existing satellite EVA. Specific satellite model with the Yamada logo on the underside. New minigame: seat a baseline-interface board into the satellite's housing, route connectors, reboot. Quiet job. No timer.

## Contract structure (5 steps)

| # | Kind | Type | Notes |
|---|------|------|-------|
| 1 | `complete-missions` × 1 | shuttle | Earth supply run — Roslin archive in Midlothian, calibration standards. Reuses existing supply-run mission. |
| 2 | `install-upgrades` | objective | Heat L3, Freeze L3, Radiation L3, Hull L3. Auto-completes if already met. |
| 3 | `complete-missions` × 3 | asteroid | Player picks any three from the Yamada pool: Bunker Protect / Bunker Extract / Patient Rescue. |
| 4 | `complete-missions` × 2 | eva | Two Neuron-Install EVAs from the Yamada pool. |
| 5 | `choice-mission` | intake-interview | Visit the Titania compound. Choose Enroll or Decline. |

Step 3 deliberately doesn't pin specific missions — the player chooses which Yamada work to take. This is a structural difference from the Ceres contract, which scripted every step. Yamada's tone is *we are not in a hurry*, so the contract reflects it.

## The finale — Step 5 walkthrough

The player flies to Titania. Sumiko meets them at the dock. Three rooms, one offer.

**1. The Margaret Room.** The first sheep, kept past every reason to die, displayed in a small environmental chamber. Sumiko narrates. *"She is older than your country. Older than most of our patients. She is the answer to every question you have not yet asked."* This is the practice's foundational lie: that everything we do is just *keeping animals alive past their reasons.*

**2. The Pig Ward.** Thousands of suspension cylinders neatly racked, each labeled with a patient's name. The player walks past. Sumiko narrates without shame. **One cylinder reads "H. Halloran-Vey, est. 1740."** The player will not know this is Finch. (Finch is publicly known as Mr. Finch.) This is the seed for the act-4 reveal.

**3. The Listening Ward.** Quieter, older. The neuron-computer patients in jars, hooked to deep-space arrays. Sumiko's register shifts here — reverent, careful. *"These are our oldest patients. Some of them have been listening for a hundred years. They hear things now that they could not have heard when they were alive."* The player does not get to ask what.

Then the offer. Enroll or decline.

**Enroll.** Player receives the **glasses** as a permanent HUD cosmetic. Saturnine NPCs treat the player differently from now on — Marta clocks them, Halsey clocks them and says nothing, Finch in act 4 will *recognize* the frames. Reward: Uranus fast travel + 2× pay multiplier on Yamada contracts + cosmetic + story flag.

**Decline.** Sumiko walks the player to the dock herself. Standing contracts remain available. The door does not close. Reward: Uranus fast travel + story flag. No multiplier.

**Crucial:** decline is not a punished path. Yamada has time. The act-4 door opens from either side — the enrolled player gets recognition; the declined player gets to be *the one Saturnine-adjacent figure who walked away*, which carries its own weight in act 4. Both are valid. This is the contract's design innovation against Hoyt's transmit/tamper and Halsey's release/quiet — those are forks about *what you do to the world*; this is a threshold about *what you let the world do to you.*

## Rewards summary

| Outcome | Fast travel | Multiplier | Cosmetic | Flag |
|---|---|---|---|---|
| Enroll | ✓ | 2× Yamada contracts | yamada-glasses | yamada-enrolled |
| Decline | ✓ | — | — | yamada-declined |

## Implementation gaps

These don't exist yet and will need to be built before the contract ships:

1. **`install-upgrades` step kind** — multi-upgrade objective, auto-completes if met. Same shape as the prerequisite block, used as a step.
2. **`complete-missions` with `count > 1` and no `objectiveType`** — currently every Ceres `complete-missions` step pins an objectiveType. Yamada step 3 needs "any mission from this giver counts" semantics. Engine may need to allow `objectiveType` to be omitted.
3. **`missionType: "eva"`** — confirm EVA is a top-level mission type alongside `shuttle` and `asteroid`. If not, add it.
4. **`objectiveType: "neuron-install"`** — new EVA variant.
5. **Three new asteroid mission archetypes** — `bunker-protect`, `bunker-extract`, `patient-rescue`. First two are bunker reskins; third is a rescue variant with VIP fail condition.
6. **Bunker Extract delivery loop** — waypoint spawn + timer + cylinder degradation. Hooks into the existing thermal damage model.
7. **`set-cosmetic` reward type** — for the glasses. Permanent HUD cosmetic, visible to other NPCs.
8. **`minigameType: "intake-interview"`** — the three-room walkthrough at the Titania compound.

## Open questions

1. **The matriarch's name.** Saved for act 4 by default, but if we want to plant it now I need it for Sumiko's introBody.
2. **What the glasses actually do mechanically.** Right now they're a cosmetic + identity marker. We could give them a functional layer (HUD overlay, NPC dialogue gating) but I'd argue against — Cinderline's encaustum is also pure marker, and the symmetry is good.
3. **Whether the hat is offered separately.** Mentioned in the enroll completion as available but not pushed. If we want the hat to ever do anything, we need to decide what — currently it's flavor.
4. **Whether enrolled players see Yamada NPCs differently across the system.** Worth doing. Marta has one extra line if she sees the glasses. Finch in act 4 reacts to them. Halsey does not, and that silence is its own beat.
5. **Beatrice.** Named in the enroll completion as the player's pig. Do we want the player to ever *see* Beatrice? My instinct: only in act 4, only if enrolled.
