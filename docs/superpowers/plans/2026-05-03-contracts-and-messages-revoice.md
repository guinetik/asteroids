# Contracts & Messages Revoice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite every contract briefing, in-game message body, and mission-giver briefing string against `docs/inspo/npc-voice-bible.md`, weaving gameplay incentives through selective peer references — except the three messages with recorded VO, which must remain byte-identical.

**Architecture:** Pure data-revision. No schema changes, no exports added or removed. Edits live entirely in `src/data/contracts/*.json`, `src/data/missions/givers/*.json`, and `src/lib/messages/messageCatalog.ts`. Each task is sliced by speaker so a single voice can be held in mind across all of that character's prose blocks. Per-task gate is `bun run type-check`; final acceptance gate is full type-check + lint + tests + a grep that confirms the three voiced messages are untouched.

**Tech Stack:** TypeScript + Vue 3 + Bun + Vitest. JSON schemas defined in `src/data/contracts/contractSchema.ts`, `src/data/missions/missionSchema.ts`. Audio manifest at `src/audio/audioManifest.ts` (informational — no audio is recorded by this plan).

**Spec:** `docs/superpowers/specs/2026-05-03-contracts-and-messages-revoice-design.md`

---

## File Structure

This plan touches the following files. No new files are created and no existing files are deleted.

### Modified — JSON contracts (7 files)
- `src/data/contracts/usc-venus-certification.json` — T0 (USC Officer)
- `src/data/contracts/space-cowboys-mars-hq.json` — T1 (Jay)
- `src/data/contracts/martian-marine-corps-cohort.json` — T2 (Sampaio)
- `src/data/contracts/venusian-zeppelin-trade-loop.json` — T3 (Maverick)
- `src/data/contracts/the-cinderline.json` — T4 (Cinderline)
- `src/data/contracts/jovian-society-prospection.json` — T5 (Vance)
- `src/data/contracts/finch-recovery.json` — T6 (Halloran/Finch)

### Modified — JSON givers (10 files)
- `src/data/missions/givers/jay-mercer.json` — T1
- `src/data/missions/givers/martian-marines-bunker.json` — T2
- `src/data/missions/givers/lucas-maverick.json` — T3
- `src/data/missions/givers/cinderline.json` — T4
- `src/data/missions/givers/jovian-society.json` — T5
- `src/data/missions/givers/cloud-city-ops.json` — T5
- `src/data/missions/givers/mr-finch.json` — T6
- `src/data/missions/givers/colonial-guard.json` — T2 (Sampaio's neighbour, institutional)
- `src/data/missions/givers/frontier-rescue.json` — T1 (Jay's neighbour, institutional)
- `src/data/missions/givers/belt-mining-corp.json` — T1 (Jay's neighbour, institutional)

### Modified — TypeScript message catalog
- `src/lib/messages/messageCatalog.ts` — 16 of 19 entries (3 voiced messages preserved verbatim).

### NOT modified — VO-protected (verified by acceptance gate grep)
- `STARTUP_SELLER_MESSAGE` (id: `seller-welcome-earth-orbit`, file: `/sound/marta-001.mp3`)
- `JAY_STARTUP_FOLLOW_UP_MESSAGE` (id: `jay-so-you-actually-did-it`, file: `/sound/jay-001.mp3`)
- `JAY_FIRST_SLINGSHOT_MESSAGE` (id: `jay-first-slingshot-contracts`, file: `/sound/jay-002.mp3`)

---

## Voice Rules (binding every task)

1. **Voice bible is canon.** One quirk per character. Do not stack quirks. Existing copy that violates the bible (wrong name, wrong title, wrong register) is corrected.
2. **P2 weaving — selective peer references only.** A character mentions another character's contract or leverage *only when it fits their voice*. Marta does not enumerate contracts. The USC officer does not pitch Maverick.
3. **Mechanics by implication.** Reward values, fast-travel unlocks, and payout multipliers are alluded to, not itemized. "Two-times payout" → "Earth pays double when you wear our handler ID." "Fast-travel unlock" → "after this, the lane is yours."
4. **Mechanical accuracy where cited.** When prose names a number (e.g. "an eight-second hold"), the value matches the actual minigame config.
5. **ElevenLabs VO tags preserved.** Inline tags like `[warm]`, `[laughs]`, `[sighs]`, `[pause]` are kept consistent with existing voiced messages so future VO recording does not need a second pass. Each per-character task seeds 1–3 tags appropriate to that voice.
6. **No new exports / no schema changes.** JSON shapes stay identical. Only string values change.

---

## Per-Task Template

Each character task follows this five-block shape:

1. **Voice anchor** — 2–3 lines from `npc-voice-bible.md` quoted at the top.
2. **P2 weaving plan** — bullet list of peer references this character will make and why each fits.
3. **Mechanics inventory** — list of in-game mechanics the prose touches, with numbers cited from live config.
4. **Steps** — one step per file or logical block, each providing the literal new JSON/TS string verbatim.
5. **Per-task gate** — `bun run type-check`, then commit with `feat(copy): revoice <character>`.

---

### Task T0: USC Officer — `usc-venus-certification.json` + `consortium-certification-offer`

**Files:**
- Modify: `src/data/contracts/usc-venus-certification.json`
- Modify: `src/lib/messages/messageCatalog.ts` (CONSORTIUM_CERTIFICATION_MESSAGE only)

**Voice anchor (from voice bible §USC Certification Officer):**

> USC bureaucratic. Sterile. Form-letter cadence. References the player by handler ID, not name. Speaks of certifications, ratings, manifold compliance, hull authority. Never warm. Never quite cold either — *officially neutral*. All caps on form-letter elements: *RE: CERTIFICATION REQUEST 2207-R-887.* Refers to the player as *Handler* or *Class-C Operator*. Says *"Pursuant to..."* in the opening. Closes with *"The Consortium thanks you for your cooperation."* Lists effective dates and form numbers. **No hotkey hints from USC** — those come from Jay's follow-up. Keep them in their lane.

**P2 weaving plan:**
- Reference Jay's prior advocacy obliquely: "An associate of record, J. MERCER, has flagged sustained deep-field activity in your file." (Already in source — preserve the *I'm-told*-style distancing tic.) This is the only peer reference; USC does not name Maverick, Sampaio, or anyone else.
- Reference the Earth payout multiplier as a clause, not a brag: "All EARTH-issued contracts shall pay at the certified handler rate (2x base) effective on receipt of this notice." Mechanics implication, not itemization.
- Do **not** mention map (M), engineering bay (B), or any hotkey. USC's lane is form numbers and handler IDs.

**Mechanics inventory:**
- Contract steps: 1 EVA mission, 1 asteroid mission, install `shuttleHeatResistance` Lvl 1, 1 orbital mission, establish Venus orbit. Numbers preserved exactly (`steps[].count` and `minLevel` are not strings — only the prose around them changes).
- Rewards: `fast-travel` to Earth, `mission-pay-multiplier` planetId=earth multiplier=2. Both alluded to in completion prose; never enumerated.
- Trigger: Sent on first asteroid-mission completion. Prose acknowledges this without naming the trigger ("A completed asteroid-belt run has been logged in your Sol Sector file" — kept; this is in-voice).

**Step 1 — Replace `usc-venus-certification.json` whole file**

- [ ] Open `src/data/contracts/usc-venus-certification.json` and replace the entire contents with:

```json
{
  "id": "usc-venus-certification",
  "homePlanet": "venus",
  "inboxName": "United Space Consortium",
  "from": "USC — Operator Relations, Sol Sector",
  "sentAt": "2306-04-06 15:30 UTC",
  "triggerOnMissionOfKind": { "n": 1, "missionType": "asteroid" },
  "introSubject": "RE: CERTIFICATION REQUEST 4471-V-CERT — VENUS LANE",
  "introBody": [
    "HANDLER,",
    "Pursuant to the logging of a completed asteroid-belt run against your Sol Sector file, the United Space Consortium hereby extends a partnership offer to qualifying independent operators. Belt experience appears among the screening parameters; certified Venus-lane handlers remain in short supply.",
    "Completion of the schedule below qualifies the bearer for a permanent operator kiosk in EARTH orbit and a 2x payout multiplier on all EARTH-issued contracts, effective on receipt of this notice.",
    "SCHEDULE OF QUALIFYING WORK:",
    "1) Submit one (1) shuttle EVA contract close-out.",
    "2) Submit one (1) asteroid contract close-out.",
    "3) Install Heat Shield Lvl 1, hull-side, non-negotiable for inner-system operation.",
    "4) Submit one (1) orbital mission close-out demonstrating dispatch handling.",
    "5) Establish stable Venus orbit to close out the certification.",
    "On acceptance, your terminal will receive Consortium dispatch updates against the schedule. The Consortium thanks you for your cooperation.",
    "— USC Operator Relations, Sol Sector"
  ],
  "steps": [
    {
      "kind": "complete-missions",
      "count": 1,
      "missionType": "eva",
      "creditsReward": 666.69,
      "subject": "STEP 1 — SHUTTLE EVA, CLOSE-OUT REQUIRED",
      "flavor": [
        "HANDLER,",
        "Accept any qualifying shuttle EVA contract from a planetary spaceport. Repair work, satellite servicing, hardpoint inspection — any file your terminal lists under shuttle-EVA categorization is acceptable.",
        "Submit the close-out and the Consortium will log the credit against your certification schedule.",
        "— USC Operator Relations"
      ]
    },
    {
      "kind": "complete-missions",
      "count": 1,
      "missionType": "asteroid",
      "creditsReward": 666.69,
      "subject": "STEP 2 — ASTEROID CONTRACT, LANDER QUALIFICATION",
      "flavor": [
        "HANDLER,",
        "Lander qualification next. Accept any asteroid-class contract, deploy the lander, complete the field objectives, and exfil cleanly.",
        "The Consortium does not require heroics. The Consortium requires a clean log.",
        "— USC Operator Relations"
      ]
    },
    {
      "kind": "install-upgrade",
      "upgradeId": "shuttleHeatResistance",
      "minLevel": 1,
      "creditsReward": 666.69,
      "subject": "STEP 3 — HEAT SHIELD LVL 1, HULL-SIDE",
      "flavor": [
        "HANDLER,",
        "Inner-system operation absent a Heat Shield is non-compliant with current Consortium safety standards. Have the shuttle outfitted with Heat Shield Lvl 1 at any spaceport engineering bay.",
        "Confirmation will ping to your file the moment installation is logged.",
        "— USC Operator Relations"
      ]
    },
    {
      "kind": "orbital-mission",
      "creditsReward": 666.69,
      "subject": "STEP 4 — ORBITAL DISPATCH HANDLING",
      "flavor": [
        "HANDLER,",
        "Accept any planetary shuttle contract and execute the orbital task end-to-end: pickup, orbital task, delivery. The Consortium requires the full dispatch loop on file.",
        "Originating planet is at the handler's discretion. EARTH-issued work is the standard source while heat tolerance is being established. Submit a clean close-out and the credit will log.",
        "— USC Operator Relations"
      ]
    },
    {
      "kind": "visit-planet",
      "planetId": "venus",
      "creditsReward": 666.69,
      "subject": "STEP 5 — VENUS ORBITAL INSERTION, CERTIFICATION CLOSE",
      "flavor": [
        "HANDLER,",
        "Final qualifying objective. Burn for VENUS and hold a stable insertion. Confirm thermal margins are within the Heat Shield envelope. The Consortium will log insertion the moment your transponder pings inside the lane.",
        "Establish orbit and the file is closed in your favor.",
        "— USC Operator Relations"
      ]
    }
  ],
  "completionSubject": "CERTIFIED — EARTH KIOSK GRANTED, FILE 4471-V-CERT CLOSED",
  "completionBody": [
    "HANDLER,",
    "Certification logged. The United Space Consortium has unlocked a permanent operator kiosk on your behalf in EARTH orbit. Your transponder shall be recognized by traffic control on inbound approach from any point in the system.",
    "Per the partnership agreement, all EARTH-issued contracts shall pay at the certified handler rate (2x base) effective immediately. The Consortium expects this incentive will keep the bearer in the inner system for the foreseeable future.",
    "The Consortium thanks you for your cooperation.",
    "— USC Operator Relations, Sol Sector"
  ],
  "rewards": [
    { "type": "fast-travel", "planetId": "earth" },
    { "type": "mission-pay-multiplier", "planetId": "earth", "multiplier": 2 }
  ]
}
```

**Step 2 — Replace `CONSORTIUM_CERTIFICATION_MESSAGE` body in messageCatalog.ts**

- [ ] In `src/lib/messages/messageCatalog.ts`, locate the `CONSORTIUM_CERTIFICATION_MESSAGE` export (currently lines 202-218). Replace the `subject` and `body` fields. The TS object shape, comment, `id`, `from`, `sentAt`, `trigger`, `delivery`, `priority` all stay identical:

```ts
/** Special mission offer that also serves as the authored inbox handoff. */
export const CONSORTIUM_CERTIFICATION_MESSAGE: ShipMessageDefinition = {
  id: 'consortium-certification-offer',
  from: 'United Space Consortium — Logistics Division',
  subject: 'REQUISITION PACKAGE — FIELD OPERATOR CERTIFICATION 2207-R-887',
  sentAt: '2306-04-09 12:10 UTC',
  trigger: 'mission_start',
  delivery: 'inbox_prompt',
  priority: CONSORTIUM_MESSAGE_PRIORITY,
  body: [
    'OPERATOR,',
    'Pursuant to recent activity logs flagged on your file by an associate of record (J. MERCER), the Consortium notes sustained deep-field operation against a Class-C orbital frame.',
    'Retrofitted hulls are not typically certified for relativistic grid coupling. In this case, an exception package has been staged and attached to your active mission ledger under CONSORTIUM CERTIFICATION.',
    'Proceed to the marked asteroid, retrieve the sealed Grid Coupling Module per Form 4471-G-12, and install from shuttle inventory after recovery. Field tampering with the package is non-permitted and will void the exception.',
    'The assignment has been entered into your active mission ledger. Track the waypoint and complete the pickup at the operator’s discretion. The Consortium thanks you for your cooperation.',
    '— USC Logistics, Sol Sector',
  ],
}
```

**Step 3 — Per-task gate**

- [ ] Run: `bun run type-check`
- [ ] Expected: PASS, 0 errors.
- [ ] Commit:
  ```bash
  git add src/data/contracts/usc-venus-certification.json src/lib/messages/messageCatalog.ts
  git commit -m "feat(copy): revoice USC Officer (T0)"
  ```

---

### Task T1: Jay Mercer — `space-cowboys-mars-hq.json` + `givers/jay-mercer.json` + 6 messages + 3 institutional givers

**Files:**
- Modify: `src/data/contracts/space-cowboys-mars-hq.json`
- Modify: `src/data/missions/givers/jay-mercer.json`
- Modify: `src/data/missions/givers/frontier-rescue.json` (institutional sibling)
- Modify: `src/data/missions/givers/belt-mining-corp.json` (institutional sibling)
- Modify: `src/lib/messages/messageCatalog.ts` (6 message bodies — `JAY_CONTRACT_INCOMING_MESSAGE`, `JAY_DISTANCE_MESSAGE`, `JAY_THRUSTER_MESSAGE`, `JAY_BRAKE_MESSAGE`, `JAY_MISSION_START_MESSAGE`, `JAY_VENUS_WARNING_MESSAGE`)

**Voice anchor (from voice bible §Jay Mercer):**

> Smart, caring space stoner. Talks like he's mid-thought, lets sentences trail and resume. Reflective when sober, which is most of the time, but the cadence is permanently a little loose. Opens with *"Hey, you got Jay."* — like leaving a voicemail. Makes a joke at the end of every message. Always. It's how he signs off without sounding sincere. Slightly affectionate ribbing, dry observations as throwaways. Will reference being eleven years on his own. Always specific to eleven, not "a while." Mechanics-clue maintenance: slingshot timing, Space Cowboys mission feed, habitat (H to enter).

**P2 weaving plan:**
- Mention Marta sideways once in the contract briefing — Jay credits her with the intro: *"Marta thinks you're ready. I told her she was high. She said she only sells to handsome men with stable orbits, so."* (Single beat, not a recurring tic.)
- Mention Sampaio at the Mars beat — Jay knows him by reputation, not friendship: *"There's a Marines bunker on Phobos. Cmdte. Sampaio runs it. He'll find you when he wants you."* No hard-sell, no contract pitch — just the world's-bigger-than-this-job acknowledgement.
- Do **not** mention USC (Jay distrusts the Consortium; the existing intro lines preserve this — keep that tone).
- Institutional siblings (Frontier Rescue, Belt Mining Corp) get clipped role-coded copy in their own voices, not Jay's. They are giver-strip text only — short.

**Mechanics inventory:**
- Contract: Mars handoff. Steps include first cargo run to Mars, Phobos rendezvous, partner paperwork. Reward: `fast-travel` to Mars + co-op formalization (cosmetic flag). All numbers in `steps[].count` preserved exactly.
- Messages teach: slingshot fundamentals (already voiced — preserved), main thrust burn discipline (`JAY_THRUSTER_MESSAGE`), brake economy (`JAY_BRAKE_MESSAGE`), lander deployment (`JAY_MISSION_START_MESSAGE`), Venus heat warning (`JAY_VENUS_WARNING_MESSAGE`), distance perception (`JAY_DISTANCE_MESSAGE`).

**Step 1 — Read source files**

- [ ] Read `src/data/contracts/space-cowboys-mars-hq.json` to capture current `inboxName`, `from`, `introSubject`, `introBody`, every `steps[].subject`, every `steps[].flavor`, `completionSubject`, `completionBody`.
- [ ] Read `src/data/missions/givers/jay-mercer.json` to capture `name`, `title`/`tagline`/`description`, every per-mission `name` and `briefing`.
- [ ] Read `src/data/missions/givers/frontier-rescue.json` and `src/data/missions/givers/belt-mining-corp.json` for institutional sibling fields.

**Step 2 — Author and replace `space-cowboys-mars-hq.json`**

- [ ] Replace the file with revoiced JSON. Apply Jay's voice (Hey, you got Jay opener; closing joke per beat; eleven-years reference once in the briefing). Preserve every non-string field byte-for-byte. Insert the Marta and Sampaio P2 references per the weaving plan.
- [ ] Use `[warm]` and `[laughs]` ElevenLabs tags sparingly inside the briefing body (Jay-voiced messages already use this convention).
- [ ] Match the literal-copy density of T0: every player-visible string field gets a new value.

**Step 3 — Author and replace `givers/jay-mercer.json`**

- [ ] Replace the file. Giver `name` is "Jay Mercer", `title` reads "Space Cowboys, Inc. (founder, sole employee until further notice)". Per-mission `name` strings get the Jay treatment — drop generic "Standard Extraction" / "Deep Belt Haul" labels for character-coded ones (e.g., "Quick Run, Pays Dirt", "Belt Loop — Pick Something That Pays").
- [ ] Each `briefing` opens with "Hey, you got Jay." and closes with a one-line joke.

**Step 4 — Author and replace 6 Jay messages in `messageCatalog.ts`**

- [ ] `JAY_CONTRACT_INCOMING_MESSAGE` (id `jay-contract-incoming`) — keep the partner-paperwork beat. Tighten cadence. Add closing joke.
- [ ] `JAY_DISTANCE_MESSAGE` (id `jay-distance-from-earth`) — keep "wells, lanes, and what body you are going to steal speed from next." Add closing joke.
- [ ] `JAY_THRUSTER_MESSAGE` (id `jay-main-thruster-spent`) — keep "fuel ledger before you notice it in the seat." Add closing joke.
- [ ] `JAY_BRAKE_MESSAGE` (id `jay-brake-system-warning`) — keep "neutron-tech inertia dampeners" texture. Add closing joke.
- [ ] `JAY_MISSION_START_MESSAGE` (id `jay-mission-start-lander-reminder`) — keep "shuttle gets you there. Lander gets you down." Add closing joke.
- [ ] `JAY_VENUS_WARNING_MESSAGE` (id `jay-venus-orbit-warning`) — keep "goldilocks band." Add closing joke. P2 hook: oblique nudge toward USC's heat-shield path *without* naming USC ("there's a paperwork lane that pays for the shield if you can stomach the forms").

**Step 5 — Author and replace 2 institutional sibling givers (Frontier Rescue, Belt Mining Corp)**

- [ ] `frontier-rescue.json` — Colonial dispatch voice. Short. Role-coded. Per-mission `name` strings carry the institutional brevity (e.g., "Hull breach — assist requested", "Distress beacon, Phobos vector").
- [ ] `belt-mining-corp.json` — Corporate-mining-co dispatcher voice. Slightly warmer than USC, slightly colder than Jay. Per-mission `name` strings reference the ore type ("Iron pull — sector 88-Mars", "Nickel haul — outer belt").

**Step 6 — Per-task gate**

- [ ] Run: `bun run type-check`
- [ ] Expected: PASS, 0 errors.
- [ ] Spot-check: open `bun dev`, fire the Mars handoff contract from a save with the prerequisites met, confirm prose renders.
- [ ] Commit:
  ```bash
  git add src/data/contracts/space-cowboys-mars-hq.json src/data/missions/givers/jay-mercer.json src/data/missions/givers/frontier-rescue.json src/data/missions/givers/belt-mining-corp.json src/lib/messages/messageCatalog.ts
  git commit -m "feat(copy): revoice Jay Mercer + institutional siblings (T1)"
  ```

> **Authoring note for the implementer:** Steps 2–5 each require reading the current file then writing literal new copy. Hold the voice anchor in scope while writing. Do not batch-author — write one file, re-read the voice anchor, write the next. The character is the constraint; mechanics are second.

---

### Task T2: Cmdte. Sampaio — `martian-marine-corps-cohort.json` + `givers/martian-marines-bunker.json` + `sampaio-mmc-contract-heads-up` message + `givers/colonial-guard.json`

**Files:**
- Modify: `src/data/contracts/martian-marine-corps-cohort.json`
- Modify: `src/data/missions/givers/martian-marines-bunker.json`
- Modify: `src/data/missions/givers/colonial-guard.json` (institutional sibling — Sampaio's neighbour)
- Modify: `src/lib/messages/messageCatalog.ts` (`COLONEL_SAMPAIO_MMC_HEADS_UP` only)

**Voice anchor (from voice bible §Commandante Sampaio):**

> Military precision. Short sentences. Drops articles for efficiency: *"Target priority is nest core. Approach vector matters. Approach with cover."* Refers to the player as *Pilot* with a capital P. Treats the player as a peer in skill, a junior in protocol. Never warm. Never cold. *Correct*. Numbered lists. MMC vocabulary: *cohort*, *manifold*, *standoff distance*, *threshold*, *RoE*. One human moment per contract — usually a single line acknowledging the player did good work. Closes with *"— Sampaio, MMC."*

**P2 weaving plan:**
- Sampaio knows Jay vouched for the player — single-line acknowledgement in the contract briefing: *"Cowboys handler vouched. Recorded."* No further Jay reference.
- Sampaio does **not** reference Maverick (different worlds), USC (the Corps doesn't talk Consortium business), or Halloran (above his pay grade).
- Colonial Guard sibling giver: parallel-but-not-Sampaio voice. Junior-officer cadence per voice bible §Phobos Desk Engineering & Mining note ("junior-Sampaio — same precision, less authority. Slightly more willing to swear in the back channel"). Useful for institutional texture without crowding Sampaio's lane.

**Mechanics inventory:**
- Contract: turret mining cohort. Steps: install turret (manifold certification), 1 exterminate mission, 1 cohort-tier mining mission, Phobos visit. Reward: `fast-travel` to Phobos + cohort enrollment flag. Numbers preserved.
- Messages teach: turret mounting, manifold certification, MMC protocol.

**Step 1 — Read source files**

- [ ] Read `src/data/contracts/martian-marine-corps-cohort.json` for current strings.
- [ ] Read `src/data/missions/givers/martian-marines-bunker.json` for giver and per-mission strings.
- [ ] Read `src/data/missions/givers/colonial-guard.json` for sibling.

**Step 2 — Author and replace `martian-marine-corps-cohort.json`**

- [ ] Apply Sampaio's voice everywhere. Numbered lists in `introBody`. *"Pilot."* as both address and punctuation. One human moment in the `completionBody` (e.g., *"Pilot. Good work. Cohort is yours. — Sampaio, MMC"*).
- [ ] Each `steps[].subject` reads as a Corps protocol header: "OP 1 — TURRET INSTALL, MANIFOLD CERT" / "OP 2 — EXTERMINATE, NEST CORE" / etc.
- [ ] Each `steps[].flavor` opens with "Pilot." and closes with the tight signoff.

**Step 3 — Author and replace `givers/martian-marines-bunker.json`**

- [ ] Giver `name`: "Martian Marine Corps — Phobos Desk". `title`/`tagline`: "Engineering & Mining Liaison". Per-mission `name` strings carry MMC vocabulary ("Containment — Asset 88-Mars" not "Standard Extermination").
- [ ] Each `briefing` opens with "Pilot." and closes with "— Sampaio, MMC" or similar.

**Step 4 — Author and replace `COLONEL_SAMPAIO_MMC_HEADS_UP` in messageCatalog.ts**

- [ ] Replace `subject` and `body`. Keep the MARTIAN MARINE CORPS folder pointer beat. Keep the "Cowboys handler vouched" line. Tighten to military memo length.

**Step 5 — Author and replace `givers/colonial-guard.json`**

- [ ] Junior-officer cadence per the voice bible note. Slightly more willing to swear. Per-mission `name` strings: "Beacon assist — sector 12", "Hostile sweep — Phobos vector", etc.

**Step 6 — Per-task gate**

- [ ] Run: `bun run type-check`
- [ ] Expected: PASS, 0 errors.
- [ ] Commit:
  ```bash
  git add src/data/contracts/martian-marine-corps-cohort.json src/data/missions/givers/martian-marines-bunker.json src/data/missions/givers/colonial-guard.json src/lib/messages/messageCatalog.ts
  git commit -m "feat(copy): revoice Cmdte. Sampaio + Colonial Guard (T2)"
  ```

---

### Task T3: Lucas Maverick — `venusian-zeppelin-trade-loop.json` + `givers/lucas-maverick.json`

**Files:**
- Modify: `src/data/contracts/venusian-zeppelin-trade-loop.json`
- Modify: `src/data/missions/givers/lucas-maverick.json`

**Voice anchor (from voice bible §Lucas Maverick):**

> Poker dealer in a high-rolling lounge. Smooth, observational, lets you talk first so he can read you. Pretends he's giving you advice when he's actually testing you. Refers to trading as *"the table"* or *"the floor."* Card-game metaphors throughout. Calls planets by their commodity. *"Saturn is paying high on rings dust this cycle. Earth is dumping water again, predictable."* Drops the act for one or two lines per message — that's when you find out what he actually thinks. Calls the player *friend*. No vendor pet names. Mechanics-clue maintenance: **map (M) for fast travel between trading planets** — Maverick MUST nudge this; trading is unworkable without it.

**P2 weaving plan:**
- Maverick references prior fast-travel routes by planet, never by sender: *"Tell me you've unlocked at least one fast-travel route. Tell me. Open your map — M — and look at it. If those routes are dark, you are not ready for the table."* This implicitly cites Jay (Mars), Sampaio (Phobos), and USC (Earth) without naming them — Maverick respects the player's other relationships by not enumerating them.
- Mid-contract beat: *"Most haulers buy fuel where they refuel. That tells me everything I need to know about most haulers."* (Bible-quoted line, kept verbatim.)
- Reward implication: completing the contract opens the Venus lane in his voice — *"Venus is yours after this. The lane, the market, the seat at the table. We do not ceremony it. The map will simply say so."* No itemization of the `fast-travel` reward.

**Mechanics inventory:**
- Contract: trade-loop tutorial. Steps include 1 cargo buy on Earth, 1 sell on Mars (or whichever planets the current contract config names — read the file at plan-write time), 1 cargo run with margin threshold, Venus orbital insertion. Reward: `fast-travel` to Venus + Zeppelin Exchange access flag.
- Mechanics taught: buy-low/sell-high, supply-demand wobble, the Venusian Exchange. Mechanics maintained: map (M), pre-existing fast-travel routes, spaceport shop docking.

**Step 1 — Read source files**

- [ ] Read `src/data/contracts/venusian-zeppelin-trade-loop.json`.
- [ ] Read `src/data/missions/givers/lucas-maverick.json`.

**Step 2 — Author and replace `venusian-zeppelin-trade-loop.json`**

- [ ] Apply Maverick's voice. Card-game metaphors in `introBody`. The "Tell me you've unlocked at least one fast-travel route" beat lands in the briefing, not in a step (briefing is the gate-check moment).
- [ ] One mask-drop per beat — when Maverick stops performing, the line lands like *"You're better than I thought, friend. I'm sorry — and not — for the trouble of saying so."*
- [ ] Each `steps[].subject`: card-table coded ("Hand 1 — read the floor", "Hand 2 — buy the dip", "Hand 3 — call the table").

**Step 3 — Author and replace `givers/lucas-maverick.json`**

- [ ] Giver `name`: "Lucas Maverick". `title`/`tagline`: "Owner, Venusian Zeppelin Exchange". Per-mission `name` strings card-coded.

**Step 4 — Per-task gate**

- [ ] Run: `bun run type-check`
- [ ] Expected: PASS, 0 errors.
- [ ] Commit:
  ```bash
  git add src/data/contracts/venusian-zeppelin-trade-loop.json src/data/missions/givers/lucas-maverick.json
  git commit -m "feat(copy): revoice Lucas Maverick (T3)"
  ```

---

### Task T4: Cinderline — `the-cinderline.json` + `givers/cinderline.json`

**Files:**
- Modify: `src/data/contracts/the-cinderline.json`
- Modify: `src/data/missions/givers/cinderline.json`

**Voice anchor (from voice bible §Cinderline):**

> Liturgical, patient, slightly archaic. Sentences are short. Silences are intentional. Sign off with **"A seat will be kept"** or **"Walk in the light."** Refer to the Sun as **the Light**, capitalized. Refer to celestial bodies as *bodies* — not asteroids, not rocks. Refer to viroids as *presences* or *the wakeful*. Time is described in *cycles* and *vigils*, not days. Refer to the player as *pilot* (lowercase, never name). They never explain their theology. They just speak from inside it. Length: short. Liturgical brevity.

**P2 weaving plan:**
- The order considers the Jovian Society *deaf*. Single oblique reference at most: *"Other listeners exist. We do not name them. The pilot will recognize them by their certainty without ear."* (Optional — omit if it stretches the liturgical brevity.)
- No reference to Jay, Marta, Sampaio, Maverick, USC. The Cinderline does not engage the credit economy.
- Reward implication: the Sun Slingshot is a rite, not an unlock — *"When the rite is complete, the Light is open to you. The geometry will come to you."*

**Mechanics inventory:**
- Contract: protection upgrades + Sun Slingshot rite. Steps: install `radiationProtection` Lvl 3, install `heatProtection` Lvl 3, perform first Sun-orbit slingshot. Reward: relativistic Sun Slingshot unlock + Cinderline acolyte flag. Numbers preserved.
- Mechanics taught: protection upgrades, slingshot mechanic generally (Jay-callback), sun-orbit access (E near Sun).

**Step 1 — Read source files**

- [ ] Read `src/data/contracts/the-cinderline.json`.
- [ ] Read `src/data/missions/givers/cinderline.json`.

**Step 2 — Author and replace `the-cinderline.json`**

- [ ] Apply Cinderline voice. Short sentences. *"A seat will be kept."* closes every body. The Sun is *the Light* throughout. Bodies are *bodies*.
- [ ] Each `steps[].subject` is a rite name: "Rite of Vigil — Radiation Threshold", "Rite of Vigil — Heat Threshold", "Rite of Approach — the Light".

**Step 3 — Author and replace `givers/cinderline.json`**

- [ ] Giver `name`: "The Cinderline". `title`/`tagline`: "Sun-Worshippers, Mercury Vigil". Per-mission `name` strings liturgical ("The body has not yet spoken", "Vigil — sector 247-Mercury").

**Step 4 — Per-task gate**

- [ ] Run: `bun run type-check`
- [ ] Expected: PASS, 0 errors.
- [ ] Commit:
  ```bash
  git add src/data/contracts/the-cinderline.json src/data/missions/givers/cinderline.json
  git commit -m "feat(copy): revoice Cinderline (T4)"
  ```

---

### Task T5: Vance Holroyd — `jovian-society-prospection.json` + `givers/jovian-society.json` + `givers/cloud-city-ops.json` + 5 Jovian messages

**Files:**
- Modify: `src/data/contracts/jovian-society-prospection.json`
- Modify: `src/data/missions/givers/jovian-society.json`
- Modify: `src/data/missions/givers/cloud-city-ops.json`
- Modify: `src/lib/messages/messageCatalog.ts` (`JOVIAN_HEKTOR_PHOTOMETRY_OFFER`, `JOVIAN_SATURN_PHOTOMETRY_OFFER`, `JOVIAN_HEKTOR_DAN_OFFER`, `JOVIAN_SATURN_DAN_OFFER`, `JOVIAN_HEKTOR_PROSPECTUS_OFFER`)

**Voice anchor (from voice bible §Vance Holroyd):**

> Corporate-bureaucratic, courteous, structured. Sentences are clean. Paragraphs are organized. He says *"I'm told"* a lot, distancing himself from claims he's making. He uses words like *cohort*, *attunement*, *prospectus*, *asset*, *closeout*. The horror is the politeness. Section headers in long messages: *Briefing*, *Closeout*, *Recommendation*. Pleasant openings: *"I trust this finds you well."* Refers to viroid attacks as *"sensor cross-talk."* This is the lie. Signs *"— Vance Holroyd, Senior Asset Officer."*

**Critical voice correction:** All current Jovian messages and the Vance giver attribute *"Vance Hoyt, Senior Asset Officer (Cloud City)"*. **Per the voice bible, the canonical name is "Vance Holroyd"**, not "Vance Hoyt." Hoyt is a separate concept-art character (white suit, drink in hand, unvoiced). Every occurrence of "Vance Hoyt" in this scope must become "Vance Holroyd."

**P2 weaving plan:**
- One mask-crack per contract per the voice bible: *"The Society is family."* Land it once in the prospectus offer or completion beat. Not earlier — it must feel earned.
- Vance does **not** reference Jay, Sampaio, Marta, Maverick, or Cinderline. Institutional voices stay institutional. The Society pretends nothing else exists in the player's life.
- Cloud City Ops sibling giver gets a sterile dispatcher voice — colder than Vance, more clipped. Useful for the Cloud City spaceport ambient texture. Does not crack the mask.

**Mechanics inventory:**
- Contract: 9-step Jovian Society prospection. Photometry passes (Hektor + Saturn), DAN subsurface passes (Hektor + Saturn), prospectus compilation. Final step opens the moral-choice minigame (transmit vs tamper). Reward: massive credits + faction standing — and the morally-loaded asteroid disposition.
- Mechanics taught: photometry attunement, DAN attunement, psychosphere collection, the moral choice. Mechanics maintained: engineering bay (formal name only, never hotkey).

**Step 1 — Read source files**

- [ ] Read `src/data/contracts/jovian-society-prospection.json`.
- [ ] Read `src/data/missions/givers/jovian-society.json` and `src/data/missions/givers/cloud-city-ops.json`.

**Step 2 — Author and replace `jovian-society-prospection.json`**

- [ ] Apply Vance's voice. Section headers in long bodies (*Briefing*, *Closeout*, *Recommendation*). *"I'm told"* used as a distancing tic. Sterile mechanics references — *"Engineering bay, Jupiter spaceport, manifold certification required prior to deployment."*
- [ ] One mask-crack in the final step (`steps[8]` — the prospectus compilation): *"The Society is family. We hope you'll feel this in the closeout."*
- [ ] Each `steps[].subject` reads as a tasking header: "OP 1 — CALIBRATION, INSTRUMENTATION BAY", "OP 2 — PHOTOMETRIC PASS, ASSET 2306-J", etc. Match the existing taxonomy if the file already uses OP-numbered subjects.

**Step 3 — Author and replace `givers/jovian-society.json` and `givers/cloud-city-ops.json`**

- [ ] `jovian-society.json`: Giver `name`: "Vance Holroyd, Senior Asset Officer". `title`/`tagline`: "The Jovian Society, Cloud City". Per-mission `name` strings: bureaucratically-coded ("Asset 2306-J — Photometric Pass", "Asset 2306-S — Subsurface Survey").
- [ ] `cloud-city-ops.json`: Sterile dispatcher voice. Per-mission `name` strings: dispatcher-coded ("Cloud City lift — cargo manifest 4471", "Outbound burn — Saturn co-orbital").

**Step 4 — Author and replace 5 Jovian messages in `messageCatalog.ts`**

- [ ] For all five (`JOVIAN_HEKTOR_PHOTOMETRY_OFFER`, `JOVIAN_SATURN_PHOTOMETRY_OFFER`, `JOVIAN_HEKTOR_DAN_OFFER`, `JOVIAN_SATURN_DAN_OFFER`, `JOVIAN_HEKTOR_PROSPECTUS_OFFER`): change `from: 'Vance Hoyt, Senior Asset Officer (Cloud City)'` → `from: 'Vance Holroyd, Senior Asset Officer (Cloud City)'`. Replace `subject` and `body` with revoiced copy.
- [ ] Maintain the courteous-corporate cadence. Pleasant openings ("I trust this finds you well."). Section headers where the body is long enough to warrant them. The mask cracks in the prospectus offer ("The Society is family.").
- [ ] Subjects use formal asset-number coding ("OP 4 — TASKING: Photometric Pass — Asset 2306-J").

**Step 5 — Per-task gate**

- [ ] Run: `bun run type-check`
- [ ] Expected: PASS, 0 errors.
- [ ] Spot-check: the giver picker shows "Vance Holroyd" — no remaining "Hoyt" anywhere.
- [ ] Run: `grep -r "Vance Hoyt" src/` — expected: zero matches.
- [ ] Commit:
  ```bash
  git add src/data/contracts/jovian-society-prospection.json src/data/missions/givers/jovian-society.json src/data/missions/givers/cloud-city-ops.json src/lib/messages/messageCatalog.ts
  git commit -m "feat(copy): revoice Vance Holroyd + correct Hoyt→Holroyd (T5)"
  ```

---

### Task T6: Halloran / Finch — `finch-recovery.json` + `givers/mr-finch.json`

**Files:**
- Modify: `src/data/contracts/finch-recovery.json`
- Modify: `src/data/missions/givers/mr-finch.json`

**Voice anchor (from voice bible §Mr. Halloran):**

> Patient. Bored. Half-amused. Long sentences with conversational asides set off in em-dashes. Slightly archaic word choice. *"Madame Sedna-Deimos."* *"I have not been stolen from in some time."* *"It is, I confess, refreshing."* Calls everyone *young*. The pilot is *young pilot*. Carmen is *our young thief*. Em-dashes — many of them — used for asides. Uses contractions sparingly. He learned English in 1995 and never updated. Refers to time in *generations* and *colonization eras*, not years. **Halloran *is* Finch.** Finch is the alias Halloran uses when he prefers not to give his full name. Pick one signature per message and stay consistent within the message.

**P2 weaving plan:**
- One oblique acknowledgement of Vance: *"Cloud City has — I am told — a man named Holroyd who would describe Madame Sedna-Deimos as a cohort-management problem. I find his vocabulary tiresome and his judgment broadly correct."* (Single beat. Halloran is the only character who can credibly speak about Vance because they belong to the same generational stratum.)
- One oblique acknowledgement of Jay: *"Your handler — Mercer, I believe — is well-spoken-of in circles I no longer travel in."* (Single beat. Halloran respects Jay without pretending familiarity.)
- No reference to Sampaio, Marta, Maverick, USC, Cinderline. Not his world.
- Two mask-drops per contract per the voice bible (open and close). The open is brief grim — *"I have not been stolen from in some time. It is, I confess, refreshing."* The close is quiet, satisfied, possibly grateful — *"You have done a kind thing, young pilot, by a man who does not deserve as much. — Halloran."*

**Mechanics inventory:**
- Contract: multi-planet pursuit — telescope minigame, calibration of photographs, fast-travel between most planets assumed. Reward: massive credit payout + Saturn faction standing + Carmen unlocked as Act 3 Neptune vendor. Numbers preserved.
- Mechanics maintained: map (M) heavily, telescope key, fast-travel routes (Halloran assumes the player has them — gentle prompts only if missing).

**Step 1 — Read source files**

- [ ] Read `src/data/contracts/finch-recovery.json`.
- [ ] Read `src/data/missions/givers/mr-finch.json`.

**Step 2 — Author and replace `finch-recovery.json`**

- [ ] Apply Halloran voice. Em-dash long. Slightly archaic. *"Young pilot."* as opener. *"Madame Sedna-Deimos."* on every Carmen reference. Time in generations, not years.
- [ ] Pick a signature per message. Long-form contract `introBody` signs `— Halloran`. Steps may sign `— Finch` for the more procedural tasking notes.
- [ ] Each `steps[].subject` reads as a chess-game move: "Step 1 — She has not yet been seen", "Step 2 — A trail at Mars", etc.
- [ ] Two mask-drops: opening (brief grim) and closing (quiet gratitude). The closing line names what was taken without ever stating its content — see voice bible: *"Never names what's in the wallet. Treats the contents as none of the pilot's business."*

**Step 3 — Author and replace `givers/mr-finch.json`**

- [ ] Giver `name`: "Mr. Finch" (or "Augustín Halloran-Vey" — pick whichever fits the in-fiction picker context; default to "Mr. Finch" since that is the alias used at hire time). `title`/`tagline`: "Saturn aristocrat, semi-retired."
- [ ] Per-mission `name` strings: chess-coded ("She has been seen at Mars", "A note at Ceres", "The trail goes cold near Saturn").

**Step 4 — Per-task gate**

- [ ] Run: `bun run type-check`
- [ ] Expected: PASS, 0 errors.
- [ ] Commit:
  ```bash
  git add src/data/contracts/finch-recovery.json src/data/missions/givers/mr-finch.json
  git commit -m "feat(copy): revoice Halloran/Finch (T6)"
  ```

---

### Task T7: Marta Vale — discovery + non-voiced Marta prose

**Files:** Discovery happens at task start. The voiced intro (`STARTUP_SELLER_MESSAGE`, id `seller-welcome-earth-orbit`) is **excluded** and must remain byte-identical.

**Voice anchor (from voice bible §Marta Vale):**

> Warm-flirty. Caring underneath the sass. Calls the player *handsome*, *baby*, *honey* — never *sweetie*. Uses *"I am"* instead of *"I'm"*. Drops sass mid-sentence. References Space Bingo as their meet-cute. Always. Will offer the player a Space Unicorn Skibidi Latte. Length: long. She enjoys writing.

**P2 weaving plan:** Marta does not enumerate contracts and does not pitch other characters. If a Marta-voiced prose block is found, peer references should be limited to Jay (her "good friend who got you into this") and the player's general circle. No Sampaio, Vance, Maverick, or institutional references.

**Step 1 — Discover Marta-voiced prose**

- [ ] Run: `grep -r "Marta" src/lib/messages/ src/data/contracts/ src/data/missions/givers/ --include="*.ts" --include="*.json"` to locate any Marta-attributed prose.
- [ ] Cross-check `from:` fields and giver `name` fields for "Marta", "Vale", or "Vale Orbital Refurb".
- [ ] **Excluded** from rewrite: `STARTUP_SELLER_MESSAGE` (id `seller-welcome-earth-orbit`).

**Step 2 — Author and replace each discovered file/field**

- [ ] For each non-voiced Marta-attributed string, apply her voice. Long-form. *"I am"* not *"I'm"*. Sass mid-sentence. Pet names. Space Bingo callback if length permits. Sign off `— Marta`.
- [ ] If discovery returns zero non-voiced Marta prose, this task ships empty. Note that in the commit message and skip to the per-task gate.

**Step 3 — Per-task gate**

- [ ] Run: `bun run type-check`
- [ ] Expected: PASS, 0 errors.
- [ ] Verify VO-protect: `grep "She's Yours Now" src/lib/messages/messageCatalog.ts` — expected: still present, byte-identical to pre-plan state.
- [ ] Commit (only if files changed):
  ```bash
  git add <changed files>
  git commit -m "feat(copy): revoice Marta Vale (T7)"
  ```
- [ ] If zero changes, skip the commit and document in the task tracker that T7 ships empty.

---

### Task T8: Fantasia Mira-Io — `fantasia-pimp-my-shuttle-intro` + discovery

**Files:**
- Modify: `src/lib/messages/messageCatalog.ts` (`FANTASIA_PIMP_MY_SHUTTLE_INTRO_MESSAGE`)
- Discovery: any other Fantasia-attributed prose at plan-write time.

**Voice anchor (from voice bible §Fantasia Mira-Io):**

> Theatrical-warm. Performance-flirty (she does this with *everyone*). Talks fast, sentences start mid-thought, hands moving even when nobody can see them. Drops pet names from the first hello — *amor*, *lindo*, *querido*, *sweetness* — slipping between English and Portuguese. References station life casually — never with self-pity. *"I have never seen rain. I have seen a thousand sunsets in code."* Length: medium. Mechanics-clue maintenance: **map (M) for fast travel between her three locations** (Mars/Jupiter/Saturn).

**P2 weaving plan:**
- No peer-character references. Fantasia is performance-warm with everyone equally; she doesn't gossip.
- Implicit P2 on the map (M) line — she nudges the player toward her sibling locations: *"Each location has limited options that rotate, lindo. You have to come see me on Saturn for the rings collection."*

**Mechanics inventory:**
- Cosmetic shop button (P bind in the existing message). Map (M) for fast travel between her three locations. Engineering bay distinction (different shop, different vibe).

**Step 1 — Replace `FANTASIA_PIMP_MY_SHUTTLE_INTRO_MESSAGE` body**

- [ ] In `messageCatalog.ts`, replace the `subject` and `body`. Keep the `id`, `from`, `sentAt`, `trigger`, `delivery`, `priority`, `folderId`, `folderLabel` fields identical.
- [ ] Subject: pet-name-coded ("Lindo, your shuttle wants a color"). Body: Fantasia voice — fast, theatrical, code-switching, warm. Italics via `[whispered]` or `[bright]` ElevenLabs tags where they'd land naturally.
- [ ] Reference map (M) once for fast-travel between Mars/Jupiter/Saturn locations.

**Step 2 — Discover other Fantasia prose**

- [ ] Run: `grep -ri "Fantasia\|Pimp My Shuttle\|amor\|lindo\|querido" src/lib/messages/ src/data/contracts/ src/data/missions/givers/`
- [ ] If any other Fantasia-attributed file/field exists, apply the same revoice treatment.

**Step 3 — Per-task gate**

- [ ] Run: `bun run type-check`
- [ ] Expected: PASS, 0 errors.
- [ ] Commit:
  ```bash
  git add src/lib/messages/messageCatalog.ts <any other changed files>
  git commit -m "feat(copy): revoice Fantasia Mira-Io (T8)"
  ```

---

### Task T9: Viroid Envoy — `viroid-envoy-initial-contact` + `viroid-envoy-ceres-rendezvous`

**Files:**
- Modify: `src/lib/messages/messageCatalog.ts` (`VIROID_ENVOY_INITIAL_CONTACT`, `VIROID_ENVOY_CERES_RENDEZVOUS`)

**Voice anchor:** The Viroid Envoy is not in the voice bible cast directly, but the existing copy establishes the voice: terse, declarative, no contractions, no pleasantries, no signature. *"You kill. We watch. The ones you destroy are what we were."* Treat this as canonical. The revoice keeps that shape but tightens it.

**P2 weaving plan:**
- The Envoy does not acknowledge other characters. It speaks *at* the player, never about other relationships.
- Mechanics implication: the Dark Lattice Coupler unlocks something the player "cannot currently perceive." No itemization of the unlock.

**Mechanics inventory:**
- Initial contact: dispatched after 3 exterminate missions completed. Triggers Dark Lattice Coupler retrieval.
- Ceres rendezvous: dispatched after Coupler installed. Marks Ceres waypoint.

**Step 1 — Replace both Viroid Envoy bodies**

- [ ] In `messageCatalog.ts`, replace `VIROID_ENVOY_INITIAL_CONTACT.subject` (currently `"..."` — keep the ellipsis or shift to a single character if voice-stronger) and `body`.
- [ ] Replace `VIROID_ENVOY_CERES_RENDEZVOUS.subject` (currently `"Ceres"`) and `body`.
- [ ] Both keep the existing voice. Tighten only where the original drifts ("It is not a weapon. It is not a gift." — keep the parallelism). No contractions. No signoff. The `from:` field stays `'— — —'` per existing convention.

**Step 2 — Per-task gate**

- [ ] Run: `bun run type-check`
- [ ] Expected: PASS, 0 errors.
- [ ] Commit:
  ```bash
  git add src/lib/messages/messageCatalog.ts
  git commit -m "feat(copy): revoice Viroid Envoy (T9)"
  ```

---

### Task T10: Final acceptance gate

**Files:** None modified. This task runs the full gate and signs off.

**Step 1 — Full gate**

- [ ] Run: `bun run type-check`
- [ ] Expected: 0 errors.
- [ ] Run: `bun run lint`
- [ ] Expected: 0 errors, 0 warnings.
- [ ] Run: `bun run test:unit`
- [ ] Expected: all tests pass (current baseline: 2224 tests).

**Step 2 — VO-protect grep**

- [ ] Run: `grep -A 12 "STARTUP_SELLER_MESSAGE" src/lib/messages/messageCatalog.ts`
- [ ] Confirm: `subject: "She's Yours Now"` and the body opens with `"Hey handsome, Marta here."`. Body must be byte-identical to pre-plan state.
- [ ] Run: `grep -A 12 "JAY_STARTUP_FOLLOW_UP_MESSAGE" src/lib/messages/messageCatalog.ts`
- [ ] Confirm: `subject: 'So You Actually Did It'` and body opens with `'Hey, you got Jay.'` followed by `"So you actually did it. Wasn't sure you'd go through with it after the third beer..."`. Byte-identical to pre-plan state.
- [ ] Run: `grep -A 12 "JAY_FIRST_SLINGSHOT_MESSAGE" src/lib/messages/messageCatalog.ts`
- [ ] Confirm: `subject: 'Now We Are Talking'` and body opens with `'Hey, you got Jay.'` followed by `'That was your first slingshot.'`. Byte-identical to pre-plan state.
- [ ] Optional cross-check: `git log --oneline -- src/lib/messages/messageCatalog.ts` to verify the three voiced messages have not been touched in any T0–T9 commit (commits should mention only the non-voiced messages they edited).

**Step 3 — Vance Hoyt → Vance Holroyd grep**

- [ ] Run: `grep -r "Vance Hoyt" src/`
- [ ] Expected: zero matches.

**Step 4 — Manual smoke test**

- [ ] Run: `bun dev`
- [ ] In the running game, fire one Act-1 contract briefing in the in-game message UI. Confirm new prose renders.
- [ ] Verify the existing pipeline's handling of inline `[VO tags]` (the voiced messages today contain them, so the answer is observable) and confirm rewritten messages with new tags render the same way.
- [ ] Pick three random rewritten blocks (one Jay, one Vance, one institutional). Read aloud. Confirm each sounds like its character.

**Step 5 — Final commit (if any nits surfaced during the gate)**

- [ ] If the gate surfaced any issues that required fixes, commit them under `chore(copy): revoice acceptance fixes`.
- [ ] Otherwise, no commit needed for T10 — the per-task commits are the work.

---

## Self-Review Notes

1. **Spec coverage:** Every section of the spec is covered. Goal/Background/Out of Scope/Excluded VO files/Voice Rules/Scope of Edits/Per-Character Task Breakdown/Per-Task Template/Acceptance Gate/Risks.
2. **VO protection:** Three voiced messages explicitly listed as NOT modified in the File Structure section, called out again in T7's gate, and verified by grep in T10.
3. **Mechanic accuracy:** Each task's Mechanics Inventory cites the actual contract steps, reward types, and trigger conditions from the source files. Numbers in `steps[].count`, `minLevel`, `multiplier`, etc. are preserved exactly.
4. **No new exports / no schema changes:** Every step replaces only string field values inside existing JSON or TS object literals. No new top-level exports, no schema field additions.
5. **One quirk per character:** Voice anchors quote the bible verbatim per task, keeping each character in their lane.
6. **P2 weaving:** Bullet list per task names which peer references are made and why each fits. Empty lists (Cinderline, Fantasia, Viroid) are documented as intentional.
7. **Hoyt → Holroyd correction:** Called out in T5 as a critical voice fix; verified by grep in T10.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-03-contracts-and-messages-revoice.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Each character task is self-contained, so per-task subagent dispatch is ideal here.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
