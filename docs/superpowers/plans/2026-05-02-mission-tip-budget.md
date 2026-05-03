# Mission Tip Budget & Priority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cap each runtime visor tip at two completed missions before it stops appearing, persist the show-count only on mission completion (mid-mission refresh re-fires), and make runtime tips outrank objective/first-run tips in the visible visor stack.

**Architecture:** Add a per-id show-count map to `PlayerAchievementStats` plus a recorder that runs at mission completion. Gate `pushRuntimeMissionTip` on the persisted count. Reuse the existing `runtime:*` id prefix already produced by `resolveRuntimeMissionTipTransmission` to drive priority sorting in `getVisibleMissionTipsForView` — no `MissionTipTransmission` schema change required.

**Tech Stack:** TypeScript, Vue 3, Vitest, Pinia, localStorage (existing player profile).

**Out of scope:** Authoring new combat/rescue runtime tips. The existing runtime tip set (`oxygenLow`, `rtgLow`, `drillWalking`, `gatherRocketScience`, `landerDescentWarning`, `landerAttitudeWarning`, `landerGroundBoost`, `landerObjectiveExfil`, `landerHullRepair`) is the full set governed by this budget.

---

## File Structure

**Create:** none.

**Modify:**
- `src/data/level/mission-tips.json` — rewrite runtime + objective copy for accuracy and tone; fix three mechanically-wrong giver tips.
- `src/lib/player/types.ts` — add `runtimeTipsShownCount` to `PlayerAchievementStats`.
- `src/lib/player/profile.ts` — default/normalize the new field, add `recordRuntimeTipsShown` mutator.
- `src/lib/level/missionTips.ts` — add `MISSION_TIP_RUNTIME_SHOW_LIMIT` and `isRuntimeTipShowable` helpers.
- `src/lib/level/missionTipQueue.ts` — sort runtime ids (`runtime:*`) ahead of others in `getVisibleMissionTipsForView`.
- `src/views/LevelView.vue` — gate `pushRuntimeMissionTip` on the budget; flush dispatched ids to profile in `onMissionComplete`.

**Tests:**
- `src/lib/player/__tests__/profile.spec.ts` — extend with cases for the new field + recorder.
- `src/lib/level/__tests__/missionTips.spec.ts` — extend with cases for `isRuntimeTipShowable`.
- `src/lib/level/__tests__/missionTipQueue.spec.ts` — extend with priority-ordering cases.

---

## Task 0: Rewrite mission tip copy for accuracy and tone

**Why this is Task 0:** Pure data change with no code dependency on later tasks. Ships independently and lets QA validate the new copy before the budget logic lands.

**Voice authority:** All copy below is written against `docs/inspo/npc-voice-bible.md`. Canonical bindings used in this task:
- **Jay (Texas-coded space stoner):** opens "Hey, you got Jay." Closes every message with a joke. Casual contractions, gravity-and-physics-as-second-nature, no textbook tone.
- **Vance Holroyd, Senior Asset Officer (Jovian Society):** corporate-bureaucratic, courteous, distancing tics ("I'm told"), refers to "the Society", says "sensor cross-talk" for viroid hazards. Note: previous data used "Vance Hoyt, Asset Strategy" — that conflated him with a separate concept-art character. Bible says Holroyd / Senior Asset Officer is canonical.
- **Finch (alias used by Mr. Halloran):** long, em-dash-laden, slightly archaic, addresses the player as *young pilot*, signs as Finch.
- **Frontier Rescue / Mission Control / Consortium Dispatch / Colonial Guard:** institutional dispatch voices (not in the bible's named cast); keep them clipped, role-coded, no character quirks.
- **SuitSys:** suit telemetry, not a person — terse, sterile, third-person clinical.

**Scope of edits:**
- **Runtime tips (all 9):** rewrite for mechanical accuracy (concrete thresholds, key bindings, what each control actually does), drop patronizing phrasing, and align Jay's lines with the bible (voicemail open + closing joke).
- **Objective tips (all 9):** rewrite to convey the actual minigame flow. The current `rescue` copy is the canonical bug — it says "destroy the infestation" without explaining that the player has to defend hostages, heal them, free tethers, walk under the virus, plant charges with E, and evacuate. Voice each tip per its speaker (Jay / Vance / institutional).
- **Giver tips:** keep the rest untouched. Fix only the three that are mechanically wrong — `frontier-rescue.rescue`, `jay.gather`, `mr-finch.gather`. The Finch override switches to Halloran's voice per bible (Finch = Halloran alias).

**Files:**
- Modify: `src/data/level/mission-tips.json`

- [ ] **Step 1: Replace `firstRunLanderTip` and the `runtimeTips` block**

In `src/data/level/mission-tips.json`, replace the existing `firstRunLanderTip` and `runtimeTips` keys (lines 2-73) with:

```json
  "firstRunLanderTip": {
    "speaker": "Jay",
    "channel": "LANDER REFRESH",
    "view": "lander",
    "tone": "logistics",
    "message": "Hey, you got Jay. Lander refresher before you scratch the paint: SPACE is your main lift, WASD nudges with the side RCS, SHIFT is a separate ascent thruster you can ride alongside SPACE, and C kills lateral drift. Every thruster has its own charge bar — drains while firing, refills from the shared tank when you let off. Don't burn 'em both flat at the same time. Or do, I'm not your dad."
  },
  "runtimeTips": {
    "landerDescentWarning": {
      "speaker": "Jay",
      "channel": "DESCENT ADVISORY",
      "view": "lander",
      "tone": "logistics",
      "message": "Hey, you got Jay. DESCENT RATE is hot. Past 7 m/s the warning lights up; past 12 the hull starts paying out of your wallet. Hold SPACE for main lift, and if it's not catching, hold SHIFT alongside it so the ascent RCS stacks on top. Soft hands, partner."
    },
    "landerAttitudeWarning": {
      "speaker": "Jay",
      "channel": "ATTITUDE ADVISORY",
      "view": "lander",
      "tone": "logistics",
      "message": "Hey, you got Jay. ATTITUDE band — past about 10 degrees of tilt the hull's coming in crooked, 15 is the danger zone. Feather WASD to level out, then short SPACE bursts instead of one long correction. Ground doesn't care how you meant to land."
    },
    "landerGroundBoost": {
      "speaker": "Jay",
      "channel": "LIFT REFRESH",
      "view": "lander",
      "tone": "logistics",
      "message": "Hey, you got Jay, back in your ear. First two seconds off the deck, SPACE punches four times normal thrust and SHIFT triples — half that boost on slopes. Hold SPACE to pop off, or SHIFT + SPACE if you're climbing out of a hole. Good news for impatient pilots, which is most pilots."
    },
    "landerObjectiveExfil": {
      "speaker": "Jay",
      "channel": "EXFIL ROUTE",
      "view": "lander",
      "tone": "logistics",
      "message": "Hey, you got Jay. Job's done — but the job ain't paid till you exfil. Fly into the shuttle's recovery cone and tap F when EXFILTRATE lights up. Has to come from the cockpit. Walk-on extraction is something you do in the movies."
    },
    "gatherRocketScience": {
      "speaker": "Jay",
      "channel": "HAULER RELAY",
      "view": "fps",
      "tone": "science",
      "message": "Hey, you got Jay. If the rocks are hiding from you, press 3 for SCIENCE and put a bolt into the delivery rocket. The can pings a waypoint on the nearest unmined rock that matches your haul list. Trick I picked up from a guy who never paid me back. Trick still works."
    },
    "oxygenLow": {
      "speaker": "SuitSys",
      "channel": "O2 CAUTION",
      "view": "fps",
      "tone": "rescue",
      "message": "Suit oxygen below half. At zero, hypoxia bleeds 12 HP per second; consciousness window approximately ten seconds. Return to lander, or recover an O2 cell if one is in range."
    },
    "rtgLow": {
      "speaker": "SuitSys",
      "channel": "RTG CAUTION",
      "view": "fps",
      "tone": "science",
      "message": "Multitool RTG below half. Cell regeneration is stochastic; instant refill not guaranteed. Reduce trigger discipline. Monitor charge bars. RTG pickups available in the field."
    },
    "drillWalking": {
      "speaker": "Jay",
      "channel": "DRL INTERLOCK",
      "view": "fps",
      "tone": "mining",
      "message": "Hey, you got Jay. DRL won't cut while you're moving — interlock kicks in at about a half-step of speed. Plant your boots, hold still, then burn the face. Rock's not going anywhere. Probably."
    },
    "landerHullRepair": {
      "speaker": "Jay",
      "channel": "HULL PATCH",
      "view": "fps",
      "tone": "logistics",
      "message": "Hey, you got Jay. Lander hull's taken a hit. Outside the cockpit, press 3 for SCIENCE and shoot the hull — each bolt patches 25 HP. A full SCI charge buys you a few shots. Weird trick. Worked the first time, kept doing it."
    }
  },
```

- [ ] **Step 2: Replace the `objectiveTips` block**

Replace the existing `objectiveTips` block (lines 74-138) with:

```json
  "objectiveTips": {
    "gather": {
      "speaker": "Jay",
      "channel": "HAULER RELAY",
      "view": "fps",
      "tone": "mining",
      "message": "Hey, you got Jay. Mining run. Press 1 for DRILL and cut surface rocks; press 3 for SCIENCE to prospect first — keep hits on a rock until the wireframe locks, then drill it for a guaranteed bonus mineral. Deposit the haul at the delivery rocket when you're full. Easy money, assuming you don't trip over your own boots."
    },
    "survey": {
      "speaker": "Jay",
      "channel": "SURVEY RELAY",
      "view": "lander",
      "tone": "science",
      "message": "Hey, you got Jay. Survey run. E at the terminal launches the probes, then fly the lander through each waypoint before the timer expires. Back to the terminal, tap E to deliver. Glorified mining, but the science folks like to feel important."
    },
    "exterminate": {
      "speaker": "Colonial Guard",
      "channel": "PEST CONTROL NET",
      "view": "fps",
      "tone": "combat",
      "message": "Colonial Guard dispatch. Eliminate defenders around the nest. Approach within sixteen meters. E to plant charges. Sprint clear inside the five-second countdown. Blast radius twenty-four meters — collateral lethal to pilot and lander."
    },
    "rescue": {
      "speaker": "Frontier Rescue",
      "channel": "RESCUE BAND",
      "view": "fps",
      "tone": "rescue",
      "message": "Frontier Rescue, pilot. Five steps: land, defend the hostages from incoming hostiles, heal them, cut their tethers loose, then walk under the floating virus and press E to plant charges before evacuating. Survivors die when their oxygen runs out. Move fast."
    },
    "photometry": {
      "speaker": "Vance",
      "channel": "ASSET TELEMETRY",
      "view": "lander",
      "tone": "science",
      "message": "Vance Holroyd, Senior Asset Officer. I'm told the survey window is open. Open the terminal to launch the probe, fly the lander to the standoff marker, and hold inside the seventy-meter envelope under eighty meters per second for the eight-second exposure. Return to the terminal at completion. The Society appreciates clean telemetry."
    },
    "dan": {
      "speaker": "Vance",
      "channel": "SUBSURFACE TELEMETRY",
      "view": "fps",
      "tone": "science",
      "message": "Vance Holroyd. DAN attunement at the terminal — E to start, lander within fifty meters. Press 3 for SCIENCE and collect twenty-five returning neutrons inside forty-five seconds. Sensor cross-talk may appear after a nine-second grace; the instrumentation handles it. Return to the terminal to deliver."
    },
    "bunker": {
      "speaker": "Mission Control",
      "channel": "DESCENT RELAY",
      "view": "fps",
      "tone": "combat",
      "message": "Mission Control. Surface hatch is your entry. Descend, clear each interior wave, then hold E at the data terminal within five meters to extract. Walk back to the hatch and E to leave when the room is secure. Confirm clear before exfil."
    },
    "collect": {
      "speaker": "Consortium Dispatch",
      "channel": "PACKAGE TRACKER",
      "view": "fps",
      "tone": "logistics",
      "message": "Consortium dispatch. Locate the marked package. Approach. E to collect. Cargo retrieval — no haul-back required."
    },
    "prospectus-terminal": {
      "speaker": "Vance",
      "channel": "ASSET REVIEW",
      "view": "fps",
      "tone": "science",
      "message": "Vance Holroyd. The surface kiosk holds the compiled prospectus. Approach, open the report, resolve the transmission choice. The Society requires a recorded decision either way."
    }
  },
```

- [ ] **Step 3: Patch the three mechanically-wrong giver tips**

Inside the existing `giverTips` block, replace **only** these three entries — leave every other giver tip intact.

`giverTips.frontier-rescue.rescue`:

```json
      "rescue": {
        "speaker": "Frontier Rescue",
        "channel": "RESCUE BAND",
        "view": "fps",
        "tone": "rescue",
        "message": "Frontier Rescue to pilot. Five steps: land, defend the hostages, heal them, free their tethers, then walk under the floating virus and press E to plant charges before the evacuation timer expires. Survivors die when their O2 hits zero. Don't sightsee. Move."
      }
```

`giverTips.jay.gather`:

```json
      "gather": {
        "speaker": "Jay",
        "channel": "HAULER RELAY",
        "view": "fps",
        "tone": "mining",
        "message": "Hey, you got Jay. Mining gig — press 1 for DRILL and cut rock, press 3 for SCIENCE to prospect first. Keep SCI hits on a rock until the wireframe locks for a guaranteed bonus mineral. Deposit at the delivery rocket when you're full. Brought to you by people who've been doing this since before you owned a wrench."
      }
```

`giverTips.mr-finch.gather` — Finch is Halloran's working alias per the voice bible (long, em-dashes, *young pilot*, slightly archaic, signs as Finch):

```json
      "gather": {
        "speaker": "Finch",
        "channel": "SATURN HANDLER",
        "view": "fps",
        "tone": "mining",
        "message": "Young pilot. A standard haul cycle — but farther out, and farther tends to be where the price is. Press 1 for DRILL, fill the hold, deposit at the delivery rocket. If you have a moment for the SCIENCE side of the tool — that is 3 — prospect a rock first; the locked ones pay a guaranteed bonus mineral. A modest favor, a real return. — Finch"
      }
```

- [ ] **Step 4: Validate JSON parses and the schema is intact**

Run: `bun run type-check`
Expected: 0 errors. (`mission-tips.json` is consumed by `missionTips.ts` via a typed import; a structural break would surface here.)

Run: `bun test:unit src/lib/level/__tests__/missionTips.spec.ts`
Expected: PASS — existing resolver tests assert speaker/channel/view shape only, so copy edits are safe.

- [ ] **Step 5: Smoke-test the new copy**

Run: `bun dev`. Start a fresh-profile rescue mission and confirm the new objective tip text fires. Trigger the runtime hull-repair tip by taking a hull hit and confirm the new wording shows. No need to exhaustively validate every tip — the JSON schema is unchanged, so this is a sanity check that the strings render.

- [ ] **Step 6: Commit**

```bash
git add src/data/level/mission-tips.json
git commit -m "feat(level): rewrite mission tip copy for accuracy and tone"
```

---

## Task 1: Persisted runtime tip show counts on profile

**Files:**
- Modify: `src/lib/player/types.ts:18-41`
- Modify: `src/lib/player/profile.ts:84-138`
- Test: `src/lib/player/__tests__/profile.spec.ts`

- [ ] **Step 1: Write the failing test for the default field**

Append to `src/lib/player/__tests__/profile.spec.ts`:

```ts
describe('runtimeTipsShownCount field', () => {
  it('defaults to an empty map on a fresh profile', () => {
    const profile = createProfile('Pilot')
    expect(profile.achievementStats.runtimeTipsShownCount).toEqual({})
  })

  it('seeds an empty map when loading legacy stats without the field', () => {
    localStorage.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({
        name: 'Pilot',
        credits: 0,
        achievementStats: { lifetimeCreditsEarned: 0 },
      }),
    )
    const loaded = loadProfile()
    expect(loaded?.achievementStats.runtimeTipsShownCount).toEqual({})
  })

  it('round-trips show counts through save/load', () => {
    const profile = {
      ...createProfile('Pilot'),
      achievementStats: {
        ...createProfile('Pilot').achievementStats,
        runtimeTipsShownCount: { oxygenLow: 1, drillWalking: 2 },
      },
    }
    saveProfile(profile)
    const loaded = loadProfile()
    expect(loaded?.achievementStats.runtimeTipsShownCount).toEqual({
      oxygenLow: 1,
      drillWalking: 2,
    })
  })
})
```

The existing test file already imports `createProfile`, `loadProfile`, `saveProfile`, and `PROFILE_STORAGE_KEY` from earlier suites — confirm those imports are present (they are; see existing `describe('credits')`).

- [ ] **Step 2: Run the test to confirm it fails**

Run: `bun test:unit src/lib/player/__tests__/profile.spec.ts -t "runtimeTipsShownCount"`
Expected: FAIL with `runtimeTipsShownCount` undefined / not a property of stats.

- [ ] **Step 3: Add the field to the type**

In `src/lib/player/types.ts`, inside `interface PlayerAchievementStats` (after `missionObjectivesCompletedByType`), insert:

```ts
  /**
   * Runtime mission-tip id → number of completed missions in which this tip was shown,
   * for example `{ oxygenLow: 1 }` after one completed mission where O2 dipped below half.
   * Used to retire each runtime tip after a fixed completed-mission budget.
   */
  runtimeTipsShownCount: Record<string, number>
```

- [ ] **Step 4: Default and normalize the field on profile load**

In `src/lib/player/profile.ts`:

1. In `createDefaultAchievementStats()` (around line 85), add the field:

```ts
    missionObjectivesCompletedByType: {},
    runtimeTipsShownCount: {},
    slingshotLaunches: 0,
```

2. In `normalizeAchievementStats(raw)` (around line 121), add a normalization line alongside the existing `missionObjectivesCompletedByType` line:

```ts
    missionObjectivesCompletedByType: normalizeNumericMap(
      stats['missionObjectivesCompletedByType'],
    ),
    runtimeTipsShownCount: normalizeNumericMap(stats['runtimeTipsShownCount']),
    slingshotLaunches:
```

`normalizeNumericMap` already drops malformed values and returns `{}` for missing input — no new helper needed.

- [ ] **Step 5: Run the test to confirm it passes**

Run: `bun test:unit src/lib/player/__tests__/profile.spec.ts -t "runtimeTipsShownCount"`
Expected: PASS.

- [ ] **Step 6: Run the whole profile suite to confirm no regressions**

Run: `bun test:unit src/lib/player/__tests__/profile.spec.ts`
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/player/types.ts src/lib/player/profile.ts src/lib/player/__tests__/profile.spec.ts
git commit -m "feat(profile): track per-id runtime tip show counts"
```

---

## Task 2: Recorder — `recordRuntimeTipsShown`

**Files:**
- Modify: `src/lib/player/profile.ts` (append after `recordMissionObjectiveComplete`, around line 645)
- Test: `src/lib/player/__tests__/profile.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/player/__tests__/profile.spec.ts`:

```ts
describe('recordRuntimeTipsShown', () => {
  it('increments each id by one', () => {
    const profile = createProfile('Pilot')
    const updated = recordRuntimeTipsShown(profile, ['oxygenLow', 'drillWalking'])
    expect(updated.achievementStats.runtimeTipsShownCount).toEqual({
      oxygenLow: 1,
      drillWalking: 1,
    })
  })

  it('accumulates across calls', () => {
    let profile = createProfile('Pilot')
    profile = recordRuntimeTipsShown(profile, ['oxygenLow'])
    profile = recordRuntimeTipsShown(profile, ['oxygenLow', 'rtgLow'])
    expect(profile.achievementStats.runtimeTipsShownCount).toEqual({
      oxygenLow: 2,
      rtgLow: 1,
    })
  })

  it('returns the same profile reference when ids is empty', () => {
    const profile = createProfile('Pilot')
    expect(recordRuntimeTipsShown(profile, [])).toBe(profile)
  })

  it('skips blank or non-string ids', () => {
    const profile = createProfile('Pilot')
    const updated = recordRuntimeTipsShown(profile, ['', '  '])
    expect(updated.achievementStats.runtimeTipsShownCount).toEqual({})
  })
})
```

Add `recordRuntimeTipsShown` to the existing import block at the top of the file.

- [ ] **Step 2: Run tests to confirm they fail**

Run: `bun test:unit src/lib/player/__tests__/profile.spec.ts -t "recordRuntimeTipsShown"`
Expected: FAIL — `recordRuntimeTipsShown` is not exported.

- [ ] **Step 3: Implement the recorder**

In `src/lib/player/profile.ts`, after `recordMissionObjectiveComplete` (around line 645), add:

```ts
/**
 * Record a batch of runtime mission-tip ids that fired during one completed mission.
 * Each id increments the tip's lifetime show count; blank ids are ignored.
 *
 * @param profile - Current profile.
 * @param ids - Runtime tip ids dispatched in the just-completed mission.
 * @returns Updated profile, or the same profile when nothing valid was passed.
 */
export function recordRuntimeTipsShown(
  profile: PlayerProfile,
  ids: readonly string[],
): PlayerProfile {
  const valid = ids.filter((id) => typeof id === 'string' && id.trim().length > 0)
  if (valid.length === 0) return profile
  const achievementStats = getAchievementStats(profile)
  let runtimeTipsShownCount = achievementStats.runtimeTipsShownCount
  for (const id of valid) {
    runtimeTipsShownCount = incrementCountMap(runtimeTipsShownCount, id)
  }
  return {
    ...profile,
    achievementStats: {
      ...achievementStats,
      runtimeTipsShownCount,
    },
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `bun test:unit src/lib/player/__tests__/profile.spec.ts -t "recordRuntimeTipsShown"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/player/profile.ts src/lib/player/__tests__/profile.spec.ts
git commit -m "feat(profile): add recordRuntimeTipsShown mutator"
```

---

## Task 3: `isRuntimeTipShowable` helper + budget constant

**Files:**
- Modify: `src/lib/level/missionTips.ts` (add at the bottom)
- Test: `src/lib/level/__tests__/missionTips.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/level/__tests__/missionTips.spec.ts`:

```ts
describe('isRuntimeTipShowable', () => {
  function profileWithCounts(counts: Record<string, number>): PlayerProfile {
    return {
      ...basePlayerProfile(),
      achievementStats: {
        ...basePlayerProfile().achievementStats,
        runtimeTipsShownCount: counts,
      },
    }
  }

  it('allows a tip with no recorded shows', () => {
    expect(isRuntimeTipShowable(profileWithCounts({}), 'oxygenLow')).toBe(true)
  })

  it('allows a tip below the limit', () => {
    expect(
      isRuntimeTipShowable(profileWithCounts({ oxygenLow: 1 }), 'oxygenLow'),
    ).toBe(true)
  })

  it('blocks a tip that has reached the limit', () => {
    expect(
      isRuntimeTipShowable(
        profileWithCounts({ oxygenLow: MISSION_TIP_RUNTIME_SHOW_LIMIT }),
        'oxygenLow',
      ),
    ).toBe(false)
  })

  it('treats a null profile as showable (fresh save)', () => {
    expect(isRuntimeTipShowable(null, 'oxygenLow')).toBe(true)
  })
})
```

If `basePlayerProfile()` is not already a helper in this spec file, inline a minimal builder for the test fixture (use `createProfile('Pilot')` from `@/lib/player/profile`). Add `MISSION_TIP_RUNTIME_SHOW_LIMIT`, `isRuntimeTipShowable`, and `PlayerProfile` to the imports.

- [ ] **Step 2: Run tests to confirm they fail**

Run: `bun test:unit src/lib/level/__tests__/missionTips.spec.ts -t "isRuntimeTipShowable"`
Expected: FAIL — exports not found.

- [ ] **Step 3: Implement the helper**

Append to `src/lib/level/missionTips.ts`:

```ts
/** Maximum number of completed missions that may show the same runtime tip before it retires. */
export const MISSION_TIP_RUNTIME_SHOW_LIMIT = 2

/**
 * Check if a runtime tip can still be shown given persisted profile counts.
 *
 * @param profile - Current player profile, or `null` for a fresh save.
 * @param id - Runtime tip id, for example `oxygenLow`.
 * @returns True when the tip has appeared in fewer than the budget of completed missions.
 */
export function isRuntimeTipShowable(profile: PlayerProfile | null, id: string): boolean {
  const shown = profile?.achievementStats.runtimeTipsShownCount[id] ?? 0
  return shown < MISSION_TIP_RUNTIME_SHOW_LIMIT
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `bun test:unit src/lib/level/__tests__/missionTips.spec.ts -t "isRuntimeTipShowable"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/level/missionTips.ts src/lib/level/__tests__/missionTips.spec.ts
git commit -m "feat(level): add runtime tip show-budget helper"
```

---

## Task 4: Sort runtime ids ahead of mission tips in the visor queue

**Files:**
- Modify: `src/lib/level/missionTipQueue.ts:42-64`
- Test: `src/lib/level/__tests__/missionTipQueue.spec.ts`

The runtime resolver already prefixes ids with `runtime:` (`missionTips.ts:166`). Objective tips use `objective:<type>` and the lander first-run uses `first-run-lander`. We sort `runtime:*` first inside the existing visible window without changing the canonical insertion order (which the dedupe / dismiss logic depends on).

- [ ] **Step 1: Write failing tests**

Append to `src/lib/level/__tests__/missionTipQueue.spec.ts`:

```ts
describe('priority ordering', () => {
  function tipWith(id: string, view: MissionTipView = 'fps'): MissionTipTransmission {
    return {
      id,
      speaker: 'Test',
      channel: 'TEST',
      view,
      tone: 'mining',
      message: '...',
      objectiveType: 'gather',
    }
  }

  it('places runtime ids ahead of objective ids in the visible window', () => {
    const queue = [tipWith('objective:gather'), tipWith('runtime:landerHullRepair')]
    const visible = getVisibleMissionTipsForView(queue, 'fps')
    expect(visible.map((t) => t.id)).toEqual(['runtime:landerHullRepair', 'objective:gather'])
  })

  it('places runtime ids ahead of the first-run lander tip', () => {
    const queue = [tipWith('first-run-lander', 'lander'), tipWith('runtime:landerDescentWarning', 'lander')]
    const visible = getVisibleMissionTipsForView(queue, 'lander')
    expect(visible[0]?.id).toBe('runtime:landerDescentWarning')
  })

  it('preserves insertion order among runtime ids', () => {
    const queue = [tipWith('runtime:oxygenLow'), tipWith('runtime:rtgLow')]
    const visible = getVisibleMissionTipsForView(queue, 'fps')
    expect(visible.map((t) => t.id)).toEqual(['runtime:oxygenLow', 'runtime:rtgLow'])
  })

  it('preserves insertion order among non-runtime ids', () => {
    const queue = [tipWith('objective:gather'), tipWith('first-run-lander', 'fps')]
    const visible = getVisibleMissionTipsForView(queue, 'fps')
    expect(visible.map((t) => t.id)).toEqual(['objective:gather', 'first-run-lander'])
  })
})
```

Ensure `MissionTipTransmission` and `MissionTipView` are imported in this spec file (they likely already are — check the top of the existing file).

- [ ] **Step 2: Run tests to confirm they fail**

Run: `bun test:unit src/lib/level/__tests__/missionTipQueue.spec.ts -t "priority ordering"`
Expected: FAIL — current `getVisibleMissionTipsForView` returns insertion order, so the runtime tip stays in slot 2.

- [ ] **Step 3: Implement priority sort**

Replace `getVisibleMissionTipsForView` in `src/lib/level/missionTipQueue.ts` with:

```ts
/** Prefix used by the runtime resolver to mark reactive guidance ids. */
const RUNTIME_TIP_ID_PREFIX = 'runtime:'

/**
 * Return whether a transmission id was produced by the runtime resolver.
 *
 * @param id - Tip id, for example `runtime:oxygenLow` or `objective:gather`.
 * @returns True when the id starts with the runtime prefix.
 */
function isRuntimeTipId(id: string): boolean {
  return id.startsWith(RUNTIME_TIP_ID_PREFIX)
}

/**
 * Return visible transmissions for the current gameplay view, with runtime tips
 * promoted ahead of objective/first-run tips so reactive guidance always wins
 * the top slot. Order is otherwise stable (insertion order within each tier).
 *
 * @param queue - Full queue ordered oldest to newest.
 * @param view - Current gameplay view, for example `fps` during EVA.
 * @returns At most two visible transmissions matching the current view.
 */
export function getVisibleMissionTipsForView(
  queue: readonly MissionTipTransmission[],
  view: MissionTipView,
): MissionTipTransmission[] {
  const matching = queue.filter((entry) => entry.view === view)
  const runtimeTips = matching.filter((entry) => isRuntimeTipId(entry.id))
  const otherTips = matching.filter((entry) => !isRuntimeTipId(entry.id))
  return [...runtimeTips, ...otherTips].slice(0, MISSION_TIP_VISIBLE_COUNT)
}
```

`getVisibleMissionTips` (the unfiltered helper) should keep insertion order — it is used only in tests and for dismiss accounting; do not modify it.

- [ ] **Step 4: Run tests to confirm they pass**

Run: `bun test:unit src/lib/level/__tests__/missionTipQueue.spec.ts`
Expected: PASS, including the existing FIFO/dedupe cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/level/missionTipQueue.ts src/lib/level/__tests__/missionTipQueue.spec.ts
git commit -m "feat(level): runtime tips outrank objective tips in visor"
```

---

## Task 5: Wire the show-count gate into LevelView

**Files:**
- Modify: `src/views/LevelView.vue:43, 405-417`

- [ ] **Step 1: Add the helper to the import block**

Find the existing import block from `@/lib/level/missionTips` near the top of the `<script setup>` block (currently around lines 36-47) and add `isRuntimeTipShowable`:

```ts
import {
  getMissionTipObjectiveType,
  isRuntimeTipShowable,
  resolveFirstRunLanderTipTransmission,
  resolveMissionTipTransmission,
  resolveRuntimeMissionTipTransmission,
  // ...existing imports preserved
} from '@/lib/level/missionTips'
```

- [ ] **Step 2: Gate `pushRuntimeMissionTip` on the persisted budget**

In `src/views/LevelView.vue`, replace the existing `pushRuntimeMissionTip` (currently lines 405-417) with:

```ts
function pushRuntimeMissionTip(id: string): void {
  if (dispatchedRuntimeTipIds.has(id)) return
  if (!isRuntimeTipShowable(loadProfile(), id)) return
  const objectiveType = activeMissionObjectiveType.value
  if (!objectiveType) return
  const tip = resolveRuntimeMissionTipTransmission(id, objectiveType)
  if (!tip) return

  dispatchedRuntimeTipIds.add(id)
  if (id === 'gatherRocketScience') {
    missionTipQueue.value = removeMissionTipQueueEntry(missionTipQueue.value, 'objective:gather')
  }
  pushMissionTip(tip)
}
```

`loadProfile` is already imported in this file (verify by searching `loadProfile` in `LevelView.vue`); if not, add it to the existing `@/lib/player/profile` import block.

- [ ] **Step 3: Type-check and lint**

Run: `bun run type-check && bun lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 4: Run unit tests**

Run: `bun test:unit`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/views/LevelView.vue
git commit -m "feat(level): gate runtime tips on persisted show budget"
```

---

## Task 6: Persist dispatched ids on mission completion

**Files:**
- Modify: `src/views/LevelView.vue:680-682`

- [ ] **Step 1: Add `recordRuntimeTipsShown` to the player profile import**

Locate the existing `import { ... } from '@/lib/player/profile'` block in `LevelView.vue` and add `recordRuntimeTipsShown` and `saveProfile`:

```ts
import {
  loadProfile,
  recordRuntimeTipsShown,
  saveProfile,
  // ...existing imports preserved
} from '@/lib/player/profile'
```

- [ ] **Step 2: Flush the dispatched set in `onMissionComplete`**

Replace the existing `onMissionComplete` handler (currently lines 680-682):

```ts
viewController.onMissionComplete = () => {
  missionCompleteVisible.value = true
}
```

with:

```ts
viewController.onMissionComplete = () => {
  if (dispatchedRuntimeTipIds.size > 0) {
    const existing = loadProfile()
    if (existing !== null) {
      saveProfile(recordRuntimeTipsShown(existing, [...dispatchedRuntimeTipIds]))
    }
  }
  missionCompleteVisible.value = true
}
```

`persistCompletedAsteroidMissionRewards` runs from `LevelViewController.enterComplete` *before* this callback fires (see `LevelViewController.ts:2300`), so `loadProfile()` here observes the post-reward state and our increment is layered on top.

- [ ] **Step 3: Type-check, lint, and run unit tests**

Run: `bun run type-check && bun lint && bun test:unit`
Expected: 0 errors, 0 warnings, all tests pass.

- [ ] **Step 4: Manual smoke test**

Run: `bun dev`

In the browser, start a mining mission:

1. Trigger an oxygen-low tip (let O2 fall under 50%) and a drill-walking tip (try to fire DRL while moving).
2. Refresh the page mid-mission — both tips should fire again on the next eligible state.
3. Complete the mission.
4. Start a second mining mission, repeat both triggers — they should fire again (count is now `1`, still under the limit of `2`).
5. Complete that mission too. Start a third mining mission and trigger both conditions — neither tip should appear.

Note any deviation; if found, debug before committing.

- [ ] **Step 5: Commit**

```bash
git add src/views/LevelView.vue
git commit -m "feat(level): persist runtime tip show counts on mission complete"
```

---

## Task 7: Wrap-up and acceptance gate

- [ ] **Step 1: Run the merge gate**

Run: `bun run type-check && bun lint && bun test:unit`
Expected: TypeScript 0 errors; oxlint 0 errors; ESLint 0 errors / 0 warnings; all Vitest specs green.

- [ ] **Step 2: Confirm acceptance criteria**

Verify by inspection that:

- `PlayerAchievementStats.runtimeTipsShownCount` defaults to `{}` on fresh and legacy saves.
- `recordRuntimeTipsShown` is called only from `LevelView.vue#onMissionComplete`, with the dispatched-set contents as input.
- `pushRuntimeMissionTip` skips when `isRuntimeTipShowable` returns false.
- `getVisibleMissionTipsForView` places `runtime:*` ids ahead of others.
- No code path increments `runtimeTipsShownCount` outside mission completion (so a refresh mid-mission does not burn budget).

- [ ] **Step 3: Final commit gate**

If any cleanup edits were needed during Step 2, commit them with `chore(level): post-review tidy for mission tip budget`. Otherwise this task closes the plan.

---

## Self-review notes

- **Spec coverage:** copy revision (Task 0), show-count budget (Tasks 1-3, 5), persist-only-on-completion (Task 6), runtime priority (Task 4). All four explicit requirements covered.
- **Type consistency:** `runtimeTipsShownCount: Record<string, number>` is named identically across `types.ts`, `profile.ts`, the recorder, and `isRuntimeTipShowable`. Tip ids passed through `dispatchedRuntimeTipIds` are bare ids (e.g. `oxygenLow`), matching the keys used by `MISSION_TIPS.runtimeTips` and the persisted map. The priority sort keys off the `runtime:` prefix that `resolveRuntimeMissionTipTransmission` already produces (`missionTips.ts:166`), so no plumbing change is needed there.
- **No placeholders:** every code step shows the literal code; every test step shows the assertions.
